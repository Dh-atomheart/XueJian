"""Offline Ragas evaluation for XueJian Knowledge Q&A RAG.

This module intentionally avoids writing workflow runs or answer messages. It
uses the local host gateway for document chunks, retrieval, BYOK model config,
and embeddings, then writes diagnostic reports under test-results/ragas.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import os
import sys
import warnings
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable, Sequence

from langchain_core.embeddings import Embeddings

from ..clients.host_gateway import HostGatewayClient
from ..providers.embedding_runtime import embed_texts
from ..providers.runtime import build_langchain_chat_model
from ..workflows import knowledge_qa as qa

DEFAULT_SIZE = 200
DEFAULT_MAX_CHUNK_CHARS = 1_800
DEFAULT_LOW_SCORE_THRESHOLD = 0.70
DEFAULT_OUTPUT_ROOT = Path("test-results/ragas")


@dataclass(frozen=True)
class EvalQuestion:
    id: str
    question: str
    source: str = "ragas"
    metadata: dict[str, Any] | None = None


@dataclass(frozen=True)
class EvalRecord:
    question_id: str
    question: str
    answer: str
    answer_mode: str | None
    retrieval_mode: str | None
    retrieval_status: str | None
    retrieved_contexts: list[str]
    citations: list[dict[str, Any]]
    retrieval_metadata: list[dict[str, Any]]
    scores: dict[str, float | None]


class XueJianLangchainEmbeddings(Embeddings):
    """LangChain embeddings adapter backed by XueJian's active embedding profile."""

    def __init__(self, host: HostGatewayClient, profile: dict[str, Any]) -> None:
        self.host = host
        self.profile = profile

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return embed_texts(
            self.host,
            self.profile,
            texts,
            task_type="RETRIEVAL_DOCUMENT",
        )

    def embed_query(self, text: str) -> list[float]:
        return embed_texts(
            self.host,
            self.profile,
            [text],
            task_type="RETRIEVAL_QUERY",
        )[0]


def install_ragas_import_compat() -> None:
    """Patch optional dependency namespace quirks before importing Ragas.

    Ragas 0.4.x imports instructor, and instructor imports ``Mistral`` from the
    top-level ``mistralai`` package. Some mistralai 2.x installs expose the
    class at ``mistralai.client.sdk.Mistral`` without re-exporting it. Assigning
    the attribute keeps the dependency usable without affecting XueJian runtime
    code outside this offline eval process.
    """

    try:
        import mistralai  # type: ignore

        if not hasattr(mistralai, "Mistral"):
            from mistralai.client.sdk import Mistral  # type: ignore

            setattr(mistralai, "Mistral", Mistral)
    except Exception:
        return


def parse_document_ids(value: str | Sequence[str]) -> list[str]:
    if isinstance(value, str):
        raw_items = value.split(",")
    else:
        raw_items = []
        for item in value:
            raw_items.extend(str(item).split(","))
    document_ids = [item.strip() for item in raw_items if item.strip()]
    if not document_ids:
        raise ValueError("--document-ids must include at least one document id")
    return document_ids


def chunk_id(chunk: dict[str, Any]) -> str | None:
    value = chunk.get("chunkId") or chunk.get("id")
    return value if isinstance(value, str) and value else None


def chunk_page(chunk: dict[str, Any]) -> Any:
    return chunk.get("page") if chunk.get("page") is not None else chunk.get("pageStart")


def chunk_content(chunk: dict[str, Any]) -> str:
    return str(chunk.get("content") or chunk.get("snippet") or "").strip()


def collect_ragas_documents(
    host: HostGatewayClient,
    document_ids: Sequence[str],
    *,
    max_chunk_chars: int = DEFAULT_MAX_CHUNK_CHARS,
) -> list[dict[str, Any]]:
    documents: list[dict[str, Any]] = []
    for document_id in document_ids:
        for chunk in host.list_chunks(document_id):
            content = chunk_content(chunk)
            cid = chunk_id(chunk)
            if not content or not cid:
                continue
            documents.append(
                {
                    "page_content": content[:max_chunk_chars],
                    "metadata": {
                        "chunkId": cid,
                        "documentId": chunk.get("documentId") or document_id,
                        "page": chunk_page(chunk),
                        "pageStart": chunk.get("pageStart"),
                        "pageEnd": chunk.get("pageEnd"),
                        "chunkIndex": chunk.get("chunkIndex"),
                    },
                }
            )
    if not documents:
        raise RuntimeError("No usable chunks found for the provided document ids")
    return documents


def dataset_cache_key(
    document_ids: Sequence[str],
    documents: Sequence[dict[str, Any]],
    size: int,
    *,
    max_chunk_chars: int = DEFAULT_MAX_CHUNK_CHARS,
) -> str:
    digest = hashlib.sha256()
    digest.update(json.dumps(sorted(document_ids), ensure_ascii=False).encode("utf-8"))
    digest.update(str(size).encode("ascii"))
    digest.update(str(max_chunk_chars).encode("ascii"))
    for doc in documents:
        metadata = doc.get("metadata") or {}
        digest.update(str(metadata.get("documentId") or "").encode("utf-8"))
        digest.update(str(metadata.get("chunkId") or "").encode("utf-8"))
        digest.update(hashlib.sha256(str(doc.get("page_content") or "").encode("utf-8")).digest())
    return digest.hexdigest()[:16]


def write_jsonl(path: Path, rows: Iterable[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True))
            handle.write("\n")


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    with path.open("r", encoding="utf-8") as handle:
        return [json.loads(line) for line in handle if line.strip()]


def save_questions(path: Path, questions: Sequence[EvalQuestion]) -> None:
    write_jsonl(
        path,
        [
            {
                "id": question.id,
                "question": question.question,
                "source": question.source,
                "metadata": question.metadata or {},
            }
            for question in questions
        ],
    )


def load_questions(path: Path) -> list[EvalQuestion]:
    rows = read_jsonl(path)
    questions: list[EvalQuestion] = []
    for index, row in enumerate(rows):
        text = str(row.get("question") or row.get("user_input") or row.get("query") or "").strip()
        if not text:
            continue
        questions.append(
            EvalQuestion(
                id=str(row.get("id") or f"q-{index + 1:04d}"),
                question=text,
                source=str(row.get("source") or "cache"),
                metadata=row.get("metadata") if isinstance(row.get("metadata"), dict) else {},
            )
        )
    if not questions:
        raise RuntimeError(f"No questions found in cached dataset: {path}")
    return questions


def _to_langchain_documents(documents: Sequence[dict[str, Any]]) -> list[Any]:
    from langchain_core.documents import Document

    return [
        Document(
            page_content=str(item.get("page_content") or ""),
            metadata=dict(item.get("metadata") or {}),
        )
        for item in documents
        if str(item.get("page_content") or "").strip()
    ]


def _testset_rows(testset: Any) -> list[dict[str, Any]]:
    if hasattr(testset, "to_pandas"):
        return testset.to_pandas().to_dict(orient="records")
    if hasattr(testset, "to_list"):
        return list(testset.to_list())
    if hasattr(testset, "samples"):
        rows: list[dict[str, Any]] = []
        for sample in testset.samples:
            if hasattr(sample, "model_dump"):
                rows.append(sample.model_dump())
            elif hasattr(sample, "dict"):
                rows.append(sample.dict())
            else:
                rows.append(dict(sample))
        return rows
    if isinstance(testset, list):
        return [dict(row) for row in testset]
    raise TypeError(f"Unsupported Ragas testset type: {type(testset)!r}")


def _extract_question_text(row: dict[str, Any]) -> str:
    for key in ("user_input", "question", "query", "eval_sample", "input"):
        value = row.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
        if isinstance(value, dict):
            nested = _extract_question_text(value)
            if nested:
                return nested
    return ""


def generate_questions_with_ragas(
    documents: Sequence[dict[str, Any]],
    *,
    size: int,
    llm: Any,
    embeddings: Embeddings,
) -> list[EvalQuestion]:
    install_ragas_import_compat()
    from ragas.testset import TestsetGenerator

    try:
        generator = TestsetGenerator.from_langchain(llm, embeddings)
    except TypeError:
        generator = TestsetGenerator.from_langchain(llm)
    langchain_documents = _to_langchain_documents(documents)
    testset = generator.generate_with_langchain_docs(
        langchain_documents,
        testset_size=size,
        raise_exceptions=False,
    )
    questions: list[EvalQuestion] = []
    seen: set[str] = set()
    for row in _testset_rows(testset):
        text = _extract_question_text(row)
        if not text or text in seen:
            continue
        seen.add(text)
        questions.append(
            EvalQuestion(
                id=f"q-{len(questions) + 1:04d}",
                question=text,
                source="ragas",
                metadata={k: v for k, v in row.items() if k not in {"question", "query", "user_input"}},
            )
        )
    if not questions:
        raise RuntimeError("Ragas did not generate any usable questions")
    return questions[:size]


def load_or_generate_questions(
    *,
    cache_path: Path,
    documents: Sequence[dict[str, Any]],
    size: int,
    llm: Any,
    embeddings: Embeddings,
    refresh: bool = False,
) -> list[EvalQuestion]:
    if cache_path.exists() and not refresh:
        return load_questions(cache_path)
    questions = generate_questions_with_ragas(documents, size=size, llm=llm, embeddings=embeddings)
    save_questions(cache_path, questions)
    return questions


def build_runtime_from_host(host: HostGatewayClient) -> tuple[dict[str, Any], Any, Embeddings]:
    active_profile = host.get_active_embedding_profile()
    if active_profile is None:
        raise RuntimeError("No active embedding profile is configured")

    config_with_key = host.get_config_for_workflow("knowledge_qa")
    if not config_with_key:
        raise RuntimeError("Knowledge Q&A model is not configured")
    config, api_key = config_with_key
    llm = build_langchain_chat_model(
        config,
        api_key,
        0.2,
        timeout=qa.MODEL_TIMEOUT_SECONDS,
        max_tokens=qa.MODEL_MAX_TOKENS,
    )
    embeddings = XueJianLangchainEmbeddings(host, active_profile)
    return config, llm, embeddings


def run_qa_target(
    host: HostGatewayClient,
    question: str,
    document_ids: Sequence[str],
) -> dict[str, Any]:
    active_profile = host.get_active_embedding_profile()
    if active_profile is None:
        return {
            "answer": "No active embedding profile is configured.",
            "answerMode": "no_relevant_content",
            "retrievalMode": "hybrid",
            "retrievalStatus": "embedding_missing",
            "citations": [],
            "retrieved_contexts": [],
            "retrieval_metadata": [],
        }

    query_embedding = embed_texts(
        host,
        active_profile,
        [question],
        task_type="RETRIEVAL_QUERY",
    )[0]
    chunks = host.search_hybrid(
        question,
        query_embedding=query_embedding,
        document_ids=list(document_ids),
        limit=qa.RETRIEVAL_CANDIDATE_LIMIT,
    )
    retrieval_mode = "hybrid"
    packed_chunks = qa._dedupe_and_pack_chunks(qa._vector_backed_chunks(chunks))
    if not packed_chunks:
        lexical_chunks = qa._dedupe_and_pack_chunks(chunks)
        if lexical_chunks:
            packed_chunks = lexical_chunks
            retrieval_mode = "fts5"
    if not packed_chunks:
        return {
            "answer": "当前资料中没有检索到足够相关的内容，无法基于文档回答。",
            "answerMode": "no_relevant_content",
            "retrievalMode": retrieval_mode,
            "retrievalStatus": "no_hits",
            "citations": [],
            "retrieved_contexts": [],
            "retrieval_metadata": [],
        }

    config_with_key = host.get_config_for_workflow("knowledge_qa")
    if not config_with_key:
        raise RuntimeError("Knowledge Q&A model is not configured")
    config, api_key = config_with_key
    answer_data = qa._try_langchain_qa(config, api_key, question, qa._build_passages(packed_chunks))
    citations = qa._normalize_citations(answer_data.get("citations", []), packed_chunks)
    answer_mode = str(answer_data.get("answerMode") or "")
    if answer_mode == "no_relevant_content" or not citations:
        normalized_mode = "no_relevant_content"
        retrieval_status = "no_hits"
        citations = []
    else:
        normalized_mode = "grounded"
        retrieval_status = "ready"

    return {
        "answer": str(answer_data.get("answer") or "").strip(),
        "answerMode": normalized_mode,
        "retrievalMode": retrieval_mode,
        "retrievalStatus": retrieval_status,
        "citations": citations,
        "retrieved_contexts": [qa._chunk_content(chunk) for chunk in packed_chunks],
        "retrieval_metadata": [
            {
                "chunkId": qa._chunk_id(chunk),
                "documentId": chunk.get("documentId"),
                "page": qa._chunk_page(chunk),
                "score": qa._chunk_score(chunk),
                "vectorRank": chunk.get("vectorRank"),
                "distance": chunk.get("distance"),
            }
            for chunk in packed_chunks
        ],
    }


def collect_eval_records(
    host: HostGatewayClient,
    questions: Sequence[EvalQuestion],
    document_ids: Sequence[str],
) -> list[EvalRecord]:
    records: list[EvalRecord] = []
    for question in questions:
        result = run_qa_target(host, question.question, document_ids)
        records.append(
            EvalRecord(
                question_id=question.id,
                question=question.question,
                answer=str(result.get("answer") or ""),
                answer_mode=result.get("answerMode"),
                retrieval_mode=result.get("retrievalMode"),
                retrieval_status=result.get("retrievalStatus"),
                retrieved_contexts=list(result.get("retrieved_contexts") or []),
                citations=list(result.get("citations") or []),
                retrieval_metadata=list(result.get("retrieval_metadata") or []),
                scores={},
            )
        )
    return records


def _new_ragas_rows(records: Sequence[EvalRecord]) -> list[dict[str, Any]]:
    return [
        {
            "user_input": record.question,
            "response": record.answer,
            "retrieved_contexts": record.retrieved_contexts,
        }
        for record in records
    ]


def _legacy_ragas_rows(records: Sequence[EvalRecord]) -> list[dict[str, Any]]:
    return [
        {
            "question": record.question,
            "answer": record.answer,
            "contexts": record.retrieved_contexts,
        }
        for record in records
    ]


def _build_ragas_metrics() -> list[Any]:
    install_ragas_import_compat()
    try:
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", category=DeprecationWarning, message=r"Importing .* from 'ragas\.metrics'.*")
            from ragas.metrics import AnswerRelevancy, Faithfulness, LLMContextPrecisionWithoutReference

        return [Faithfulness(), AnswerRelevancy(), LLMContextPrecisionWithoutReference()]
    except Exception:
        pass

    try:
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", category=DeprecationWarning, message=r"Importing .* from 'ragas\.metrics'.*")
            from ragas.metrics import AnswerRelevancy, ContextPrecisionWithoutReference, Faithfulness

        return [Faithfulness(), AnswerRelevancy(), ContextPrecisionWithoutReference()]
    except Exception:
        pass

    try:
        with warnings.catch_warnings():
            warnings.filterwarnings("ignore", category=DeprecationWarning, message=r"Importing .* from 'ragas\.metrics'.*")
            from ragas.metrics import AnswerRelevancy, ContextPrecisionWithoutReference, Faithfulness

        return [Faithfulness(), AnswerRelevancy(), ContextPrecisionWithoutReference()]
    except Exception:
        pass

    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", category=DeprecationWarning, message=r"Importing .* from 'ragas\.metrics'.*")
        from ragas.metrics import answer_relevancy, faithfulness

    metrics = [faithfulness, answer_relevancy]
    for name in (
        "context_precision_without_reference",
        "llm_context_precision_without_reference",
        "context_utilization",
        "context_relevance",
    ):
        try:
            module = __import__("ragas.metrics", fromlist=[name])
            metric = getattr(module, name)
        except Exception:
            continue
        metrics.append(metric)
        break
    return metrics


def _wrap_ragas_llm(llm: Any) -> Any:
    install_ragas_import_compat()
    try:
        from ragas.llms import LangchainLLMWrapper

        return LangchainLLMWrapper(llm)
    except Exception:
        return llm


def _wrap_ragas_embeddings(embeddings: Embeddings) -> Any:
    install_ragas_import_compat()
    try:
        from ragas.embeddings import LangchainEmbeddingsWrapper

        return LangchainEmbeddingsWrapper(embeddings)
    except Exception:
        return embeddings


def _result_rows(result: Any, count: int) -> list[dict[str, Any]]:
    if hasattr(result, "to_pandas"):
        return result.to_pandas().to_dict(orient="records")
    if hasattr(result, "to_dict"):
        raw = result.to_dict()
        if isinstance(raw, dict):
            rows = [dict() for _ in range(count)]
            for key, values in raw.items():
                if isinstance(values, list):
                    for index, value in enumerate(values[:count]):
                        rows[index][key] = value
                else:
                    for row in rows:
                        row[key] = values
            return rows
    if isinstance(result, dict):
        rows = [dict() for _ in range(count)]
        for key, value in result.items():
            if isinstance(value, list):
                for index, item in enumerate(value[:count]):
                    rows[index][key] = item
            else:
                for row in rows:
                    row[key] = value
        return rows
    return [dict() for _ in range(count)]


def _is_score_value(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(float(value))


def _score_columns(rows: Sequence[dict[str, Any]]) -> list[str]:
    ignored = {
        "user_input",
        "question",
        "response",
        "answer",
        "retrieved_contexts",
        "contexts",
        "reference",
    }
    columns: list[str] = []
    for row in rows:
        for key, value in row.items():
            if key in ignored or key in columns:
                continue
            if _is_score_value(value):
                columns.append(key)
    return columns


def evaluate_records_with_ragas(
    records: Sequence[EvalRecord],
    *,
    llm: Any,
    embeddings: Embeddings,
) -> tuple[list[EvalRecord], list[str]]:
    install_ragas_import_compat()
    from ragas import evaluate

    metrics = _build_ragas_metrics()
    ragas_llm = _wrap_ragas_llm(llm)
    ragas_embeddings = _wrap_ragas_embeddings(embeddings)
    try:
        from ragas import EvaluationDataset

        dataset = EvaluationDataset.from_list(_new_ragas_rows(records))
        result = evaluate(
            dataset=dataset,
            metrics=metrics,
            llm=ragas_llm,
            embeddings=ragas_embeddings,
            raise_exceptions=False,
        )
    except TypeError:
        from datasets import Dataset

        dataset = Dataset.from_list(_legacy_ragas_rows(records))
        result = evaluate(
            dataset,
            metrics=metrics,
            llm=ragas_llm,
            embeddings=ragas_embeddings,
        )

    rows = _result_rows(result, len(records))
    score_columns = _score_columns(rows)
    evaluated: list[EvalRecord] = []
    for index, record in enumerate(records):
        row = rows[index] if index < len(rows) else {}
        scores = {
            key: float(row[key]) if _is_score_value(row.get(key)) else None
            for key in score_columns
        }
        evaluated.append(
            EvalRecord(
                question_id=record.question_id,
                question=record.question,
                answer=record.answer,
                answer_mode=record.answer_mode,
                retrieval_mode=record.retrieval_mode,
                retrieval_status=record.retrieval_status,
                retrieved_contexts=record.retrieved_contexts,
                citations=record.citations,
                retrieval_metadata=record.retrieval_metadata,
                scores=scores,
            )
        )
    return evaluated, score_columns


def _record_to_dict(record: EvalRecord) -> dict[str, Any]:
    return {
        "questionId": record.question_id,
        "question": record.question,
        "answer": record.answer,
        "answerMode": record.answer_mode,
        "retrievalMode": record.retrieval_mode,
        "retrievalStatus": record.retrieval_status,
        "retrievedContexts": record.retrieved_contexts,
        "citations": record.citations,
        "retrievalMetadata": record.retrieval_metadata,
        "scores": record.scores,
    }


def _percentile(values: Sequence[float], ratio: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    position = (len(ordered) - 1) * ratio
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def summarize_scores(records: Sequence[EvalRecord], score_columns: Sequence[str]) -> dict[str, dict[str, float | int | None]]:
    summary: dict[str, dict[str, float | int | None]] = {}
    for column in score_columns:
        values = [
            float(record.scores[column])
            for record in records
            if record.scores.get(column) is not None and math.isfinite(float(record.scores[column]))
        ]
        summary[column] = {
            "count": len(values),
            "mean": round(sum(values) / len(values), 4) if values else None,
            "p25": round(_percentile(values, 0.25), 4) if values else None,
            "p50": round(_percentile(values, 0.50), 4) if values else None,
            "p75": round(_percentile(values, 0.75), 4) if values else None,
        }
    return summary


def _truncate(text: str, limit: int = 260) -> str:
    compact = " ".join(str(text or "").split())
    if len(compact) <= limit:
        return compact
    return f"{compact[: limit - 3]}..."


def _lowest_records(records: Sequence[EvalRecord], metric: str, limit: int = 10) -> list[EvalRecord]:
    candidates = [record for record in records if record.scores.get(metric) is not None]
    return sorted(candidates, key=lambda record: float(record.scores[metric] or 0.0))[:limit]


def _check_citation_audit(record: EvalRecord) -> bool:
    """Return True if the record passes the citation audit for a grounded answer."""
    if record.answer_mode != "grounded":
        return True
    citations = record.citations or []
    if not citations:
        return False
    # All citations must reference a chunk present in retrieved_contexts
    context_ids = {
        str(c.get("chunkId") or c.get("id") or ""): True
        for c in record.retrieval_metadata
        if isinstance(c, dict)
    }
    for citation in citations:
        cid = str(citation.get("chunkId") or citation.get("id") or "")
        if not cid or cid not in context_ids:
            return False
    return True


def compute_rag_regression_metrics(records: Sequence[EvalRecord]) -> dict[str, Any]:
    grounded = [r for r in records if r.answer_mode == "grounded"]
    no_relevant = [r for r in records if r.answer_mode == "no_relevant_content"]
    fts_only = [r for r in records if r.retrieval_mode == "fts5"]

    # Citation audit pass rate for grounded answers
    audit_passed = sum(1 for r in grounded if _check_citation_audit(r))
    citation_audit_pass_rate = audit_passed / len(grounded) if grounded else 1.0

    # False grounded: records where retrieval says no_relevant/fts-only but answer is grounded
    false_grounded_no_relevant = sum(
        1 for r in records
        if r.retrieval_mode == "no_relevant" and r.answer_mode == "grounded"
    )
    false_grounded_fts_only = sum(
        1 for r in records
        if r.retrieval_mode == "fts5" and r.answer_mode == "grounded"
    )

    # Confidence median for grounded answers (using faithfulness as proxy)
    confidences = [
        float(r.scores["faithfulness"])
        for r in grounded
        if r.scores.get("faithfulness") is not None
    ]
    confidence_median = (
        sorted(confidences)[len(confidences) // 2] if confidences else None
    )

    return {
        "total_samples": len(records),
        "grounded_count": len(grounded),
        "no_relevant_count": len(no_relevant),
        "fts_only_count": len(fts_only),
        "citation_audit_pass_rate": round(citation_audit_pass_rate, 4),
        "false_grounded_no_relevant_count": false_grounded_no_relevant,
        "false_grounded_fts_only_count": false_grounded_fts_only,
        "grounded_confidence_median": round(confidence_median, 4) if confidence_median is not None else None,
    }


def check_rag_regression_thresholds(metrics: dict[str, Any]) -> tuple[list[str], list[str]]:
    """Evaluate RAG-specific blocking and warning thresholds.

    Returns (blocking_reasons, warning_reasons).
    """
    from .eval_base import check_threshold

    blocking: list[str] = []
    warnings: list[str] = []

    # Blocking
    passed, reason = check_threshold(
        "rag_grounded_citation_audit_pass_rate",
        metrics.get("citation_audit_pass_rate"),
        "ge",
        0.95,
    )
    if not passed:
        blocking.append(reason)

    passed, reason = check_threshold(
        "rag_false_grounded_no_relevant_count",
        metrics.get("false_grounded_no_relevant_count"),
        "eq",
        0.0,
    )
    if not passed:
        blocking.append(reason)

    passed, reason = check_threshold(
        "rag_false_grounded_fts_only_count",
        metrics.get("false_grounded_fts_only_count"),
        "eq",
        0.0,
    )
    if not passed:
        blocking.append(reason)

    # Warning
    if metrics.get("grounded_confidence_median") is not None:
        passed, reason = check_threshold(
            "rag_grounded_confidence_median",
            metrics["grounded_confidence_median"],
            "lt",
            0.70,
        )
        if not passed:
            warnings.append(reason)

    return blocking, warnings


def write_regression_json(
    output_dir: Path,
    *,
    records: Sequence[EvalRecord],
    graph_version: str = "knowledge-graph-v1",
    runtime: str = "langgraph_rag",
) -> dict[str, Any]:
    metrics = compute_rag_regression_metrics(records)
    blocking, warnings = check_rag_regression_thresholds(metrics)
    payload = {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "runtime": runtime,
        "graphVersion": graph_version,
        "totalSamples": metrics["total_samples"],
        "metrics": metrics,
        "blockingFailures": blocking,
        "warnings": warnings,
        "shouldBlock": bool(blocking),
    }
    (output_dir / "regression.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return payload


def write_reports(
    output_dir: Path,
    *,
    questions: Sequence[EvalQuestion],
    records: Sequence[EvalRecord],
    score_columns: Sequence[str],
    document_ids: Sequence[str],
    dataset_cache_path: Path,
    low_score_threshold: float = DEFAULT_LOW_SCORE_THRESHOLD,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    save_questions(output_dir / "dataset.jsonl", questions)

    raw_payload = {
        "createdAt": datetime.now(timezone.utc).isoformat(),
        "documentIds": list(document_ids),
        "datasetCachePath": str(dataset_cache_path),
        "scoreColumns": list(score_columns),
        "records": [_record_to_dict(record) for record in records],
    }
    (output_dir / "raw_results.json").write_text(
        json.dumps(raw_payload, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    csv_columns = [
        "questionId",
        "question",
        "answerMode",
        "retrievalMode",
        "retrievalStatus",
        *score_columns,
    ]
    with (output_dir / "scores.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=csv_columns)
        writer.writeheader()
        for record in records:
            writer.writerow(
                {
                    "questionId": record.question_id,
                    "question": record.question,
                    "answerMode": record.answer_mode,
                    "retrievalMode": record.retrieval_mode,
                    "retrievalStatus": record.retrieval_status,
                    **{column: record.scores.get(column) for column in score_columns},
                }
            )

    summary = summarize_scores(records, score_columns)
    lines: list[str] = [
        "# Ragas Knowledge Q&A Evaluation",
        "",
        f"- Created at: {raw_payload['createdAt']}",
        f"- Document ids: {', '.join(document_ids)}",
        f"- Samples: {len(records)}",
        f"- Dataset cache: `{dataset_cache_path}`",
        "",
        "## Score Summary",
        "",
    ]
    if not score_columns:
        lines.append("- No numeric Ragas score columns were returned.")
    else:
        lines.append("| Metric | Count | Mean | P25 | P50 | P75 |")
        lines.append("| --- | ---: | ---: | ---: | ---: | ---: |")
        for metric in score_columns:
            item = summary[metric]
            lines.append(
                f"| {metric} | {item['count']} | {item['mean']} | {item['p25']} | {item['p50']} | {item['p75']} |"
            )

    for metric in score_columns:
        low = _lowest_records(records, metric)
        if not low:
            continue
        lines.extend(["", f"## Lowest {metric}", ""])
        for record in low:
            score = record.scores.get(metric)
            marker = "LOW" if score is not None and float(score) < low_score_threshold else "WATCH"
            lines.extend(
                [
                    f"### {record.question_id} · {metric}={score} · {marker}",
                    "",
                    f"- Question: {_truncate(record.question, 400)}",
                    f"- Answer mode: {record.answer_mode} / {record.retrieval_status}",
                    f"- Answer: {_truncate(record.answer, 500)}",
                    f"- Top context: {_truncate(record.retrieved_contexts[0] if record.retrieved_contexts else '', 500)}",
                    "",
                ]
            )

    (output_dir / "summary.md").write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")


def timestamped_output_dir(root: Path) -> Path:
    return root / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Run offline Ragas evaluation for XueJian Knowledge Q&A.")
    parser.add_argument("--document-ids", default="", help="Comma-separated XueJian document ids to evaluate.")
    parser.add_argument("--size", type=int, default=DEFAULT_SIZE, help="Number of Ragas-generated questions.")
    parser.add_argument("--out", default=None, help="Output directory. Defaults to test-results/ragas/<timestamp>.")
    parser.add_argument("--cache-dir", default=str(DEFAULT_OUTPUT_ROOT / "datasets"), help="Question cache directory.")
    parser.add_argument("--refresh-dataset", action="store_true", help="Regenerate questions even if cache exists.")
    parser.add_argument("--max-chunk-chars", type=int, default=DEFAULT_MAX_CHUNK_CHARS)
    parser.add_argument(
        "--check-ragas",
        action="store_true",
        help="Validate the local Ragas install and exit without connecting to the host gateway.",
    )
    parser.add_argument(
        "--gateway-url",
        default=os.environ.get("XUEJIAN_HOST_GATEWAY_URL", ""),
        help="Host gateway URL. Defaults to XUEJIAN_HOST_GATEWAY_URL.",
    )
    return parser


def check_ragas_installation() -> dict[str, Any]:
    install_ragas_import_compat()
    import ragas
    from ragas import EvaluationDataset

    metrics = _build_ragas_metrics()
    dataset = EvaluationDataset.from_list(
        [
            {
                "user_input": "What does retrieval practice improve?",
                "response": "It improves long-term retention by forcing recall.",
                "retrieved_contexts": [
                    "Retrieval practice improves long-term retention by forcing recall."
                ],
            }
        ]
    )
    metric_names = [str(getattr(metric, "name", type(metric).__name__)) for metric in metrics]
    return {
        "ragasVersion": getattr(ragas, "__version__", "unknown"),
        "metrics": metric_names,
        "sampleCount": len(getattr(dataset, "samples", []) or []),
        "datasetType": type(dataset).__name__,
        "ok": bool(metric_names) and len(getattr(dataset, "samples", []) or []) == 1,
    }


def run(args: argparse.Namespace) -> Path:
    document_ids = parse_document_ids(args.document_ids)
    if args.size <= 0:
        raise ValueError("--size must be greater than zero")
    if not args.gateway_url:
        raise RuntimeError("Host gateway URL is required via --gateway-url or XUEJIAN_HOST_GATEWAY_URL")

    host = HostGatewayClient(args.gateway_url)
    return run_with_host(host, args)


def run_with_host(host: HostGatewayClient, args: argparse.Namespace) -> Path:
    document_ids = parse_document_ids(args.document_ids)
    if args.size <= 0:
        raise ValueError("--size must be greater than zero")

    _config, llm, embeddings = build_runtime_from_host(host)
    documents = collect_ragas_documents(host, document_ids, max_chunk_chars=args.max_chunk_chars)
    cache_key = dataset_cache_key(
        document_ids,
        documents,
        args.size,
        max_chunk_chars=args.max_chunk_chars,
    )
    cache_path = Path(args.cache_dir) / f"{cache_key}.jsonl"
    questions = load_or_generate_questions(
        cache_path=cache_path,
        documents=documents,
        size=args.size,
        llm=llm,
        embeddings=embeddings,
        refresh=args.refresh_dataset,
    )
    records = collect_eval_records(host, questions, document_ids)
    evaluated_records, score_columns = evaluate_records_with_ragas(records, llm=llm, embeddings=embeddings)

    output_dir = Path(args.out) if args.out else timestamped_output_dir(DEFAULT_OUTPUT_ROOT)
    write_reports(
        output_dir,
        questions=questions,
        records=evaluated_records,
        score_columns=score_columns,
        document_ids=document_ids,
        dataset_cache_path=cache_path,
    )
    write_regression_json(output_dir, records=evaluated_records)
    return output_dir


def main(argv: Sequence[str] | None = None) -> None:
    parser = build_arg_parser()
    args = parser.parse_args(argv)
    if args.check_ragas:
        print(json.dumps(check_ragas_installation(), ensure_ascii=False, indent=2))
        return
    try:
        output_dir = run(args)
    except Exception as exc:
        print(f"Ragas evaluation failed: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
    print(f"Ragas evaluation report written to {output_dir}")


if __name__ == "__main__":
    main()
