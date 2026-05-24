import type { ZodIssue } from "zod";

export class LlmError extends Error {
  override readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "LlmError";
    if (cause !== undefined) this.cause = cause;
  }
}

export class ContextLengthError extends LlmError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "ContextLengthError";
  }
}

export class UnknownModelError extends LlmError {
  readonly model: string;
  constructor(model: string, cause?: unknown, provider?: string) {
    const service = provider === "ollama" ? "Ollama" : "OpenRouter";
    super(`model not available on ${service}: ${model}`, cause);
    this.name = "UnknownModelError";
    this.model = model;
  }
}

export class InvalidJsonError extends LlmError {
  readonly rawResponse: string;
  readonly parseError: string;
  constructor(rawResponse: string, parseError: string, cause?: unknown) {
    super(`LLM response was not valid JSON: ${parseError}`, cause);
    this.name = "InvalidJsonError";
    this.rawResponse = rawResponse;
    this.parseError = parseError;
  }
}

export class SchemaValidationError extends LlmError {
  readonly rawResponse: string;
  readonly issues: readonly ZodIssue[];
  constructor(rawResponse: string, issues: readonly ZodIssue[], cause?: unknown) {
    const summary = issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".") || "<root>"}: ${i.message}`)
      .join("; ");
    super(`LLM response failed schema validation (${issues.length} issues): ${summary}`, cause);
    this.name = "SchemaValidationError";
    this.rawResponse = rawResponse;
    this.issues = issues;
  }
}

export class RateLimitError extends LlmError {
  readonly retryAfterMs: number | null;
  constructor(retryAfterMs: number | null, cause?: unknown, provider?: string) {
    const service = provider === "ollama" ? "local server" : "OpenRouter";
    super(`rate limited by ${service}`, cause);
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

export class NetworkError extends LlmError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = "NetworkError";
  }
}
