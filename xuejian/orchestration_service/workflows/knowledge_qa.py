"""Knowledge Q&A workflow — FTS5 search + LLM-based or excerpt-based answers."""
from __future__ import annotations

import json
import logging
import re
from typing import TYPE_CHECKING

from ..providers.embedding_runtime import embed_texts
from ..providers.runtime import build_langchain_chat_model

if TYPE_CHECKING:
    from ..clients.host_gateway import HostGatewayClient

logger = logging.getLogger(__name__)

KNOWLEDGE_QA_SYSTEM_PROMPT = """\
You are a knowledge Q&A assistant for a learning app. Given a user's question and
retrieved text passages from their documents, provide a concise, accurate answer.

Rules:
- Base your answer ONLY on the provided passages. If the passages don't contain
  enough information, say so clearly.
- After your answer, list the citations used: for each one, output a JSON object
    with keys "chunkId" (string), "documentId" (string), optional "sectionId"
    (string), and "snippet" (string, the relevant excerpt from that passage,
    max 120 chars).
- Output your response in this JSON format:
    {"answer": "...", "citations": [{"chunkId": "...", "documentId": "...", "sectionId": "...", "snippet": "..."}]}
"""

KNOWLEDGE_QA_USER_TEMPLATE = """\
Question: {question}

Retrieved passages:
{passages}

Provide an answer based on these passages, with citations. Output JSON only.
"""


def _try_langchain_qa(
    config: dict, api_key: str, question: str, passages_text: str, chunks: list[dict],
) -> dict:
    """Attempt LangChain-based Q&A. Returns dict with answer + citations."""
    from langchain_core.messages import HumanMessage, SystemMessage

    llm = build_langchain_chat_model(config, api_key, 0.3)

    prompt = KNOWLEDGE_QA_USER_TEMPLATE.format(question=question, passages=passages_text)
    response = llm.invoke([
        SystemMessage(content=KNOWLEDGE_QA_SYSTEM_PROMPT),
        HumanMessage(content=prompt),
    ])
    raw = response.content

    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if match:
        result = json.loads(match.group())
        valid_chunk_ids = {c.get("id") for c in chunks}
        citations = []
        for cit in result.get("citations", []):
            chunk_id = cit.get("chunkId", "")
            if chunk_id in valid_chunk_ids:
                citations.append(cit)
        result["citations"] = citations
        return result

    return {"answer": raw.strip(), "citations": []}


def run_knowledge_qa_workflow(
    run_id: str, question: str, document_ids: list[str],
    host: HostGatewayClient,
) -> dict:
    """Execute the knowledge_qa preset workflow using hybrid retrieval + LLM."""
    retrieval_mode = "fts5"
    chunks: list[dict] = []

    active_profile = host.get_active_embedding_profile()
    if active_profile is not None:
        try:
            query_embedding = embed_texts(host, active_profile, [question])[0]
            chunks = host.search_hybrid(
                question,
                query_embedding=query_embedding,
                document_ids=document_ids if document_ids else None,
                limit=8,
            )
            retrieval_mode = "hybrid_rrf"
        except Exception as exc:
            logger.warning("Hybrid retrieval unavailable, falling back to FTS5: %s", exc)

    if not chunks:
        chunks = host.search_chunks(question, document_ids if document_ids else None, limit=8)
        retrieval_mode = "fts5"

    if not chunks:
        return {
            "status": "completed",
            "answer": {
                "answer": "在当前选定文档里，没有检索到足够相关的内容来回答这个问题。你可以换一个问法、扩大文档范围，或先确认文档已经完成解析。",
                "answerMode": "no_relevant_content",
                "retrievalMode": retrieval_mode,
                "citations": [],
            },
        }

    # Step 2: Build context from chunks
    passages = []
    for i, chunk in enumerate(chunks):
        snippet = (chunk.get("snippet") or chunk.get("content", ""))[:500]
        passages.append(
            f"[Passage {i + 1}] (doc={chunk.get('documentId', '?')[:8]}, "
            f"chunk={chunk.get('id', '?')[:8]}, "
            f"pages={chunk.get('pageStart', '?')}-{chunk.get('pageEnd', '?')})\n{snippet}"
        )
    passages_text = "\n\n".join(passages)

    # Step 3: Try LLM-based Q&A
    config_with_key = host.get_default_config_with_key()
    if config_with_key:
        config, api_key = config_with_key
        try:
            answer_data = _try_langchain_qa(config, api_key, question, passages_text, chunks)
            return {
                "status": "completed",
                "answer": {
                    "answer": answer_data.get("answer", ""),
                    "answerMode": "grounded",
                    "retrievalMode": retrieval_mode,
                    "citations": answer_data.get("citations", []),
                },
            }
        except Exception as exc:
            logger.error("LLM Q&A failed, falling back to excerpt-based answer: %s", exc)

    # Step 4: Fallback — return top chunks as the answer
    top_chunk = chunks[0]
    excerpt = (top_chunk.get("snippet") or top_chunk.get("content", ""))[:300]
    fallback_intro = "当前未能生成归纳后的模型回答，先展示最相关的原文摘录："
    if not config_with_key:
        fallback_intro = "当前还没有可用的模型凭证，先展示最相关的原文摘录："
    return {
        "status": "completed",
        "answer": {
            "answer": f"{fallback_intro}\n\n{excerpt}",
            "answerMode": "excerpt_fallback",
            "retrievalMode": retrieval_mode,
            "citations": [{
                "chunkId": top_chunk.get("id", ""),
                "documentId": top_chunk.get("documentId", ""),
                "sectionId": top_chunk.get("sectionId"),
                "page": top_chunk.get("pageStart"),
                "snippet": excerpt[:120],
            }],
        },
    }
