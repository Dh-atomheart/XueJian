from orchestration_service.workflows import document_embedding as workflow


class FakeHost:
    def __init__(self, *, profile, document, chunks, states=None):
        self.profile = profile
        self.document = document
        self.chunks = chunks
        self.states = states or []
        self.saved_embeddings = []
        self.lock_requests = []
        self.status_updates = []
        self.progress_updates = []

    def get_active_embedding_profile(self):
        return self.profile

    def get_document(self, document_id):
        return self.document

    def list_chunks(self, document_id):
        return self.chunks

    def list_chunk_embedding_states(self, document_id, profile_id):
        return self.states

    def update_document_status(self, document_id, status):
        self.status_updates.append((document_id, status))
        return {"ok": True, "status": status}

    def update_background_job_progress(self, job_id, **kwargs):
        self.progress_updates.append((job_id, kwargs))
        return {}

    def save_chunk_embeddings(self, profile_id, embeddings):
        self.saved_embeddings.append((profile_id, embeddings))
        return {"storedCount": len(embeddings)}

    def lock_embedding_dimensions(self, profile_id, dimensions):
        self.lock_requests.append((profile_id, dimensions))
        self.profile = {
            **self.profile,
            "dimensions": dimensions,
            "revision": int(self.profile.get("revision", 0)) + 1,
        }
        return self.profile


def test_workflow_skips_unchanged_child_chunks(monkeypatch):
    chunk = {
        "id": "chunk-1",
        "chunkKind": "child",
        "content": "机器学习用于分类与回归。",
    }
    content_hash = workflow._chunk_content_hash(chunk["content"])
    host = FakeHost(
        profile={"id": "profile-1", "dimensions": 3, "revision": 2, "model": "embedder"},
        document={"id": "doc-1", "chunkingProfileRevision": 4},
        chunks=[chunk],
        states=[
            {
                "chunkId": "chunk-1",
                "contentHash": content_hash,
                "chunkingProfileRevision": 4,
                "embeddingProfileRevision": 2,
                "embeddingDimensions": 3,
            }
        ],
    )

    def fail_embed(*args, **kwargs):
        raise AssertionError("embed_texts should not be called for unchanged chunks")

    monkeypatch.setattr(workflow, "embed_texts", fail_embed)

    result = workflow.run_document_embedding_workflow("job-1", "doc-1", host)

    assert result["status"] == "completed"
    assert result["embeddedChunkCount"] == 0
    assert result["sourceChunkCount"] == 1
    assert result["skippedChunkCount"] == 1
    assert host.saved_embeddings == []
    assert host.lock_requests == []
    assert host.status_updates[-1] == ("doc-1", "ready")


def test_workflow_locks_dimensions_and_persists_embedding_state(monkeypatch):
    chunk = {
        "id": "chunk-1",
        "chunkKind": "child",
        "content": "Retrieval practice improves long-term retention.",
    }
    host = FakeHost(
        profile={"id": "profile-1", "dimensions": 0, "revision": 1, "model": "embedder"},
        document={"id": "doc-1", "chunkingProfileRevision": 3},
        chunks=[chunk],
    )

    monkeypatch.setattr(
        workflow,
        "embed_texts",
        lambda *args, **kwargs: [[0.1, 0.2, 0.3]],
    )

    result = workflow.run_document_embedding_workflow("job-2", "doc-1", host)

    assert result["status"] == "completed"
    assert result["embeddedChunkCount"] == 1
    assert result["skippedChunkCount"] == 0
    assert host.lock_requests == [("profile-1", 3)]
    assert len(host.saved_embeddings) == 1

    profile_id, payload = host.saved_embeddings[0]
    assert profile_id == "profile-1"
    assert payload[0]["chunkId"] == "chunk-1"
    assert payload[0]["chunkingProfileRevision"] == 3
    assert payload[0]["embeddingProfileRevision"] == 2
    assert payload[0]["embeddingDimensions"] == 3
    assert payload[0]["contentHash"] == workflow._chunk_content_hash(chunk["content"])