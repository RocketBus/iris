import { type Instrumentation } from "next";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

    // Only init if endpoint is configured or debug mode
    if (!endpoint && !process.env.IRIS_OTEL_DEBUG) {
      return;
    }

    const { NodeSDK } = await import("@opentelemetry/sdk-node");
    const { HttpInstrumentation } = await import(
      "@opentelemetry/instrumentation-http"
    );

    // Set service name via env var (standard OTel convention)
    process.env.OTEL_SERVICE_NAME ??= "iris-platform";

    const sdk = new NodeSDK({
      instrumentations: [new HttpInstrumentation()],
    });

    sdk.start();
  }
}

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context
) => {
  const error = err as Error & { digest?: string };
  console.error("[Iris Error]", {
    message: error.message,
    digest: error.digest,
    path: request.path,
    method: request.method,
    routerKind: context.routerKind,
    routePath: context.routePath,
    routeType: context.routeType,
  });
};
