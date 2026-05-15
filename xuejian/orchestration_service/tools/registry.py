from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Literal, Mapping

from pydantic import BaseModel, ValidationError


ToolSideEffect = Literal[
    "none",
    "event_only",
    "checkpoint_only",
    "candidate_only",
    "persistent_via_rust",
]

ToolHandler = Callable[[BaseModel], BaseModel | dict[str, Any]]


class ToolRegistryError(ValueError):
    """Base class for registry errors."""


class ToolNotRegisteredError(ToolRegistryError):
    """Raised when a tool key is not present in the registry."""

    def __init__(self, tool_key: str):
        super().__init__(f"tool not registered: {tool_key}")
        self.tool_key = tool_key
        self.error_category = "tool_not_registered"


class ToolInputValidationError(ToolRegistryError):
    """Raised when incoming data does not satisfy the tool input schema."""

    def __init__(self, tool_key: str, exc: ValidationError):
        super().__init__(f"tool input invalid for {tool_key}: {exc}")
        self.tool_key = tool_key
        self.original = exc
        self.error_category = "tool_input_invalid"


class ToolCallerNotAllowedError(ToolRegistryError):
    """Raised when a caller is not permitted to invoke a tool."""

    def __init__(self, tool_key: str, caller: str | None):
        caller_label = caller or "<unspecified>"
        super().__init__(f"caller '{caller_label}' not in allowed_callers for {tool_key}")
        self.tool_key = tool_key
        self.caller = caller
        self.error_category = "caller_not_allowed"


@dataclass(frozen=True)
class ToolDefinition:
    tool_key: str
    description: str
    input_schema: type[BaseModel]
    output_schema: type[BaseModel]
    handler: ToolHandler
    side_effect: ToolSideEffect = "none"
    error_categories: tuple[str, ...] = ()
    retryable: bool = False
    allowed_callers: tuple[str, ...] = (
        "langgraph_rag",
        "langgraph_card",
        "langgraph_study",
        "langgraph_multi_agent",
    )


class ToolRegistry:
    def __init__(self) -> None:
        self._definitions: dict[str, ToolDefinition] = {}

    def register(self, definition: ToolDefinition) -> ToolDefinition:
        self._definitions[definition.tool_key] = definition
        return definition

    def lookup(self, tool_key: str) -> ToolDefinition:
        definition = self._definitions.get(tool_key)
        if definition is None:
            raise ToolNotRegisteredError(tool_key)
        return definition

    def list_tools(self) -> list[str]:
        return list(self._definitions.keys())

    def validate_input(self, tool_key: str, data: Mapping[str, Any] | BaseModel) -> BaseModel:
        definition = self.lookup(tool_key)
        if isinstance(data, definition.input_schema):
            return data
        try:
            return definition.input_schema.model_validate(data)
        except ValidationError as exc:
            raise ToolInputValidationError(tool_key, exc) from exc

    def invoke(
        self,
        tool_key: str,
        data: Mapping[str, Any] | BaseModel,
        *,
        caller: str | None = None,
    ) -> dict[str, Any]:
        definition = self.lookup(tool_key)
        if definition.allowed_callers and caller not in definition.allowed_callers:
            raise ToolCallerNotAllowedError(tool_key, caller)
        validated_input = self.validate_input(tool_key, data)
        raw_output = definition.handler(validated_input)
        if isinstance(raw_output, definition.output_schema):
            validated_output = raw_output
        elif isinstance(raw_output, BaseModel):
            validated_output = definition.output_schema.model_validate(
                raw_output.model_dump(mode="python")
            )
        else:
            validated_output = definition.output_schema.model_validate(raw_output)
        return validated_output.model_dump(mode="python")