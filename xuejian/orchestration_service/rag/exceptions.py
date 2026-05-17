"""Shared exception classes for Knowledge QA RAG pipeline."""
from __future__ import annotations


class WorkflowCancelled(Exception):
    """Raised when the host marks a Knowledge Q&A run as cancelled."""


class KnowledgeQaJsonError(ValueError):
    """Raised when the model does not return the required JSON object."""
