"""Structured Answer Chain — LangChain Runnable with with_structured_output + JSON repair fallback."""
from __future__ import annotations

import json
import logging
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableSerializable
from pydantic import BaseModel, Field

from .prompts import JSON_REPAIR_PROMPT, KNOWLEDGE_QA_SYSTEM_PROMPT, KNOWLEDGE_QA_USER_TEMPLATE

logger = logging.getLogger(__name__)


class CitationItem(BaseModel):
    chunkId: str = Field(description="Chunk ID referenced by this citation")
    snippet: str = Field(description="Short exact excerpt from the chunk")


class GroundedAnswer(BaseModel):
    answer: str = Field(description="The answer text, grounded in retrieved passages")
    answerMode: str = Field(description="Either 'grounded' or 'no_relevant_content'")
    citations: list[CitationItem] = Field(default_factory=list, description="Citations referencing passage chunks")


class StructuredAnswerChain(RunnableSerializable):
    """LangChain Runnable that generates a structured grounded answer.

    Uses with_structured_output when available, with JSON repair fallback.
    """

    llm: BaseChatModel = Field(description="Chat model for answer generation")

    class Config:
        arbitrary_types_allowed = True

    def _try_structured_output(self, question: str, passages: str) -> GroundedAnswer:
        """Try using with_structured_output for direct structured generation."""
        structured_llm = self.llm.with_structured_output(GroundedAnswer)
        messages = [
            SystemMessage(content=KNOWLEDGE_QA_SYSTEM_PROMPT),
            HumanMessage(
                content=KNOWLEDGE_QA_USER_TEMPLATE.format(question=question, passages=passages)
            ),
        ]
        return structured_llm.invoke(messages)

    def _try_json_parse(self, question: str, passages: str) -> GroundedAnswer:
        """Fallback: invoke the model and parse JSON manually, with repair attempt."""
        messages = [
            SystemMessage(content=KNOWLEDGE_QA_SYSTEM_PROMPT),
            HumanMessage(
                content=KNOWLEDGE_QA_USER_TEMPLATE.format(question=question, passages=passages)
            ),
        ]
        raw = self.llm.invoke(messages)
        text = raw.content if isinstance(raw.content, str) else str(raw.content)

        try:
            return self._parse_answer_json(text)
        except (json.JSONDecodeError, ValueError):
            # JSON repair attempt
            repair_messages = [
                *messages,
                HumanMessage(content=f"{JSON_REPAIR_PROMPT}\nPrevious response:\n{text[:2000]}"),
            ]
            repaired_raw = self.llm.invoke(repair_messages)
            repaired_text = repaired_raw.content if isinstance(repaired_raw.content, str) else str(repaired_raw.content)
            return self._parse_answer_json(repaired_text)

    def _parse_answer_json(self, text: str) -> GroundedAnswer:
        """Parse raw model text into GroundedAnswer, stripping code fences."""
        stripped = text.strip()
        if stripped.startswith("```"):
            lines = stripped.splitlines()
            if lines and lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].strip().startswith("```"):
                lines = lines[:-1]
            stripped = "\n".join(lines).strip()

        start = stripped.find("{")
        if start < 0:
            raise ValueError("No JSON object found in model output")

        decoder = json.JSONDecoder()
        value, _ = decoder.raw_decode(stripped[start:])

        if not isinstance(value, dict):
            raise ValueError("Top-level JSON must be an object")

        answer = value.get("answer", "")
        answer_mode = value.get("answerMode", "grounded")
        if answer_mode not in ("grounded", "no_relevant_content"):
            answer_mode = "grounded" if value.get("citations") else "no_relevant_content"

        citations = []
        for raw_cite in (value.get("citations") or []):
            if isinstance(raw_cite, dict):
                citations.append(
                    CitationItem(
                        chunkId=str(raw_cite.get("chunkId", "")),
                        snippet=str(raw_cite.get("snippet", "")),
                    )
                )

        return GroundedAnswer(
            answer=answer.strip(),
            answerMode=answer_mode,
            citations=citations,
        )

    def invoke(
        self,
        input: dict[str, Any],
        config: Any = None,
        **kwargs: Any,
    ) -> GroundedAnswer:
        question = input.get("question", "")
        passages = input.get("passages", "")

        try:
            return self._try_structured_output(question, passages)
        except NotImplementedError:
            # Model doesn't support with_structured_output
            return self._try_json_parse(question, passages)
        except Exception as exc:
            logger.warning("Structured output failed, falling back to JSON parse: %s", exc)
            return self._try_json_parse(question, passages)
