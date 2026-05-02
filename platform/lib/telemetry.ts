/**
 * Server-side telemetry helpers for API routes.
 * Wraps OTel API with graceful fallback.
 */

import { trace, SpanStatusCode, type Span } from "@opentelemetry/api";

const tracer = trace.getTracer("iris-platform", "0.1.0");

/** Create a span wrapping an async function. */
export async function withSpan<T>(
  name: string,
  attributes: Record<string, string | number>,
  fn: (span: Span) => Promise<T>
): Promise<T> {
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      if (error instanceof Error) {
        span.recordException(error);
      }
      throw error;
    } finally {
      span.end();
    }
  });
}

/** Record an error event on the current span. */
export function recordError(error: Error, attributes?: Record<string, string>): void {
  const span = trace.getActiveSpan();
  if (span) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
    if (attributes) {
      span.setAttributes(attributes);
    }
  }
}
