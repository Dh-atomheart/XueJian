use super::Mvp0DocumentChunk;

pub fn rag_embeddable_chunks(chunks: Vec<Mvp0DocumentChunk>) -> Vec<Mvp0DocumentChunk> {
    let child_chunks = chunks
        .iter()
        .filter(|chunk| is_child_chunk(chunk) && !chunk.text.trim().is_empty())
        .cloned()
        .collect::<Vec<_>>();

    if !child_chunks.is_empty() {
        return child_chunks;
    }

    chunks
        .into_iter()
        .filter(|chunk| !chunk.text.trim().is_empty())
        .collect()
}

pub fn rag_required_chunk_count(chunks: Vec<Mvp0DocumentChunk>) -> usize {
    rag_embeddable_chunks(chunks).len()
}

pub fn rag_embedding_readiness_status(
    document_status: &str,
    required_chunks: usize,
    embedded_chunks: i64,
) -> &'static str {
    if required_chunks == 0 {
        return "embedding_missing";
    }
    if embedded_chunks >= required_chunks as i64 {
        return "ready";
    }
    if document_status == "embedding_stale" {
        return "embedding_stale";
    }
    "embedding_missing"
}

fn is_child_chunk(chunk: &Mvp0DocumentChunk) -> bool {
    decode_chunk_kind(&chunk.parser) == "child"
}

fn decode_chunk_kind(parser: &str) -> &str {
    parser
        .split("::")
        .nth(1)
        .filter(|value| !value.is_empty())
        .unwrap_or("semantic")
}

#[cfg(test)]
mod tests {
    use super::*;

    fn chunk(id: &str, parser: &str, text: &str) -> Mvp0DocumentChunk {
        Mvp0DocumentChunk {
            id: id.to_string(),
            document_id: "doc".to_string(),
            page_start: 1,
            page_end: 1,
            chunk_index: 0,
            text: text.to_string(),
            char_count: text.len() as i32,
            parser: parser.to_string(),
            created_at: "2026-05-07T00:00:00Z".to_string(),
        }
    }

    #[test]
    fn rag_required_chunk_count_prefers_child_chunks() {
        let chunks = vec![
            chunk("parent", "pymupdf::parent", "parent text"),
            chunk("child-a", "pymupdf::child", "child text"),
            chunk("child-empty", "pymupdf::child", "  "),
        ];

        assert_eq!(rag_required_chunk_count(chunks), 1);
    }

    #[test]
    fn rag_readiness_treats_complete_stale_document_as_ready() {
        assert_eq!(
            rag_embedding_readiness_status("embedding_stale", 2, 2),
            "ready"
        );
    }

    #[test]
    fn rag_readiness_keeps_incomplete_stale_document_stale() {
        assert_eq!(
            rag_embedding_readiness_status("embedding_stale", 2, 1),
            "embedding_stale"
        );
    }
}
