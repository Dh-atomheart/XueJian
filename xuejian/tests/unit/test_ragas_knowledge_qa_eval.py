import argparse
import json
from pathlib import Path

from orchestration_service.evals import ragas_knowledge_qa_eval as evals


class FakeHost:
    def __init__(self):
        self.profile = {"id": "profile-1", "dimensions": 2}
        self.config = ({"id": "config-1", "provider": "custom_openai", "model": "qa-model"}, "key")
        self.chunks = [
            {
                "id": "chunk-1",
                "documentId": "doc-1",
                "pageStart": 2,
                "pageEnd": 2,
                "chunkIndex": 0,
                "content": "Retrieval practice improves long-term retention by forcing recall.",
                "score": 0.9,
                "vectorRank": 1,
            }
        ]

    def list_chunks(self, document_id):
        return self.chunks

    def get_active_embedding_profile(self):
        return self.profile

    def get_config_for_workflow(self, workflow_type):
        return self.config

    def search_hybrid(self, *args, **kwargs):
        return self.chunks


def test_collect_ragas_documents_builds_chunk_metadata():
    host = FakeHost()

    documents = evals.collect_ragas_documents(host, ["doc-1"], max_chunk_chars=18)

    assert documents == [
        {
            "page_content": "Retrieval practice",
            "metadata": {
                "chunkId": "chunk-1",
                "documentId": "doc-1",
                "page": 2,
                "pageStart": 2,
                "pageEnd": 2,
                "chunkIndex": 0,
            },
        }
    ]


def test_dataset_cache_key_is_stable_for_same_inputs():
    host = FakeHost()
    documents = evals.collect_ragas_documents(host, ["doc-1"])

    first = evals.dataset_cache_key(["doc-1"], documents, 60)
    second = evals.dataset_cache_key(["doc-1"], documents, 60)

    assert first == second
    assert len(first) == 16


def test_load_or_generate_questions_uses_jsonl_cache(tmp_path):
    cache_path = tmp_path / "dataset.jsonl"
    evals.save_questions(
        cache_path,
        [evals.EvalQuestion(id="q-0001", question="What is retrieval practice?", source="test")],
    )

    questions = evals.load_or_generate_questions(
        cache_path=cache_path,
        documents=[],
        size=1,
        llm=object(),
        embeddings=object(),
    )

    assert [question.question for question in questions] == ["What is retrieval practice?"]


def test_collect_eval_records_target_shape(monkeypatch):
    host = FakeHost()

    monkeypatch.setattr(
        evals,
        "run_qa_target",
        lambda host, question, document_ids: {
            "answer": "Retrieval practice strengthens memory.",
            "answerMode": "grounded",
            "retrievalMode": "hybrid",
            "retrievalStatus": "ready",
            "retrieved_contexts": ["Retrieval practice improves long-term retention."],
            "citations": [{"chunkId": "chunk-1", "documentId": "doc-1"}],
            "retrieval_metadata": [{"chunkId": "chunk-1", "documentId": "doc-1"}],
        },
    )

    records = evals.collect_eval_records(
        host,
        [evals.EvalQuestion(id="q-0001", question="What is retrieval practice?")],
        ["doc-1"],
    )

    assert records[0].question == "What is retrieval practice?"
    assert records[0].answer == "Retrieval practice strengthens memory."
    assert records[0].retrieved_contexts == ["Retrieval practice improves long-term retention."]
    assert records[0].citations[0]["chunkId"] == "chunk-1"


def test_write_reports_creates_json_csv_markdown(tmp_path):
    output_dir = tmp_path / "report"
    cache_path = tmp_path / "datasets" / "cache.jsonl"
    question = evals.EvalQuestion(id="q-0001", question="What is retrieval practice?")
    record = evals.EvalRecord(
        question_id="q-0001",
        question="What is retrieval practice?",
        answer="It improves retention by forcing recall.",
        answer_mode="grounded",
        retrieval_mode="hybrid",
        retrieval_status="ready",
        retrieved_contexts=["Retrieval practice improves long-term retention."],
        citations=[{"chunkId": "chunk-1"}],
        retrieval_metadata=[{"chunkId": "chunk-1"}],
        scores={"faithfulness": 0.42, "answer_relevancy": 0.81},
    )

    evals.write_reports(
        output_dir,
        questions=[question],
        records=[record],
        score_columns=["faithfulness", "answer_relevancy"],
        document_ids=["doc-1"],
        dataset_cache_path=cache_path,
    )

    assert (output_dir / "dataset.jsonl").exists()
    assert (output_dir / "scores.csv").exists()
    assert "Lowest faithfulness" in (output_dir / "summary.md").read_text(encoding="utf-8")
    payload = json.loads((output_dir / "raw_results.json").read_text(encoding="utf-8"))
    assert payload["records"][0]["scores"]["faithfulness"] == 0.42


def test_run_wires_cache_and_report_generation(monkeypatch, tmp_path):
    host = FakeHost()
    output_dir = tmp_path / "out"
    cache_dir = tmp_path / "cache"

    monkeypatch.setattr(evals, "HostGatewayClient", lambda url: host)
    monkeypatch.setattr(evals, "build_runtime_from_host", lambda host: ({}, object(), object()))
    monkeypatch.setattr(
        evals,
        "generate_questions_with_ragas",
        lambda documents, size, llm, embeddings: [
            evals.EvalQuestion(id="q-0001", question="What is retrieval practice?")
        ],
    )
    monkeypatch.setattr(
        evals,
        "collect_eval_records",
        lambda host, questions, document_ids: [
            evals.EvalRecord(
                question_id=questions[0].id,
                question=questions[0].question,
                answer="Answer",
                answer_mode="grounded",
                retrieval_mode="hybrid",
                retrieval_status="ready",
                retrieved_contexts=["Context"],
                citations=[],
                retrieval_metadata=[],
                scores={},
            )
        ],
    )
    monkeypatch.setattr(
        evals,
        "evaluate_records_with_ragas",
        lambda records, llm, embeddings: (
            [
                evals.EvalRecord(
                    question_id=records[0].question_id,
                    question=records[0].question,
                    answer=records[0].answer,
                    answer_mode=records[0].answer_mode,
                    retrieval_mode=records[0].retrieval_mode,
                    retrieval_status=records[0].retrieval_status,
                    retrieved_contexts=records[0].retrieved_contexts,
                    citations=records[0].citations,
                    retrieval_metadata=records[0].retrieval_metadata,
                    scores={"faithfulness": 0.9},
                )
            ],
            ["faithfulness"],
        ),
    )

    result = evals.run(
        argparse.Namespace(
            document_ids="doc-1",
            size=1,
            out=str(output_dir),
            cache_dir=str(cache_dir),
            refresh_dataset=False,
            max_chunk_chars=120,
            gateway_url="http://localhost:1234",
        )
    )

    assert result == output_dir
    assert (output_dir / "summary.md").exists()
    assert list(Path(cache_dir).glob("*.jsonl"))


def test_main_check_ragas_prints_json(monkeypatch, capsys):
    monkeypatch.setattr(
        evals,
        "check_ragas_installation",
        lambda: {
            "ragasVersion": "test",
            "metrics": ["faithfulness"],
            "sampleCount": 1,
            "datasetType": "EvaluationDataset",
            "ok": True,
        },
    )

    evals.main(["--check-ragas"])

    payload = json.loads(capsys.readouterr().out)
    assert payload["ok"] is True
    assert payload["metrics"] == ["faithfulness"]
