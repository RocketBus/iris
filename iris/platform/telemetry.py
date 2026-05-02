"""Iris CLI telemetry — OpenTelemetry traces and metrics.

When OTel packages are installed and OTEL_EXPORTER_OTLP_ENDPOINT is set,
emits traces and metrics via OTLP. Otherwise, silently no-ops.

Install: pip install opentelemetry-api opentelemetry-sdk opentelemetry-exporter-otlp-proto-http
"""

from __future__ import annotations

import os
import time
from contextlib import contextmanager
from typing import Generator

# Try to import OTel — graceful fallback if not installed
_OTEL_AVAILABLE = False
_tracer = None
_meter = None

try:
    from opentelemetry import trace, metrics
    from opentelemetry.sdk.trace import TracerProvider
    from opentelemetry.sdk.trace.export import BatchSpanProcessor, ConsoleSpanExporter
    from opentelemetry.sdk.metrics import MeterProvider
    from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader, ConsoleMetricExporter
    from opentelemetry.sdk.resources import Resource
    from opentelemetry.semconv.resource import ResourceAttributes

    _OTEL_AVAILABLE = True
except ImportError:
    pass


def _init_otel(service_name: str = "iris-cli", version: str = "0.5") -> None:
    """Initialize OTel if packages are available and endpoint is configured."""
    global _tracer, _meter

    if not _OTEL_AVAILABLE:
        return

    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT")

    resource = Resource.create({
        ResourceAttributes.SERVICE_NAME: service_name,
        ResourceAttributes.SERVICE_VERSION: version,
    })

    # Traces
    provider = TracerProvider(resource=resource)

    if endpoint:
        try:
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
            provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter()))
        except ImportError:
            provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))
    elif os.environ.get("IRIS_OTEL_DEBUG"):
        provider.add_span_processor(BatchSpanProcessor(ConsoleSpanExporter()))

    trace.set_tracer_provider(provider)
    _tracer = trace.get_tracer(service_name, version)

    # Metrics
    if endpoint:
        try:
            from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
            reader = PeriodicExportingMetricReader(OTLPMetricExporter())
        except ImportError:
            reader = PeriodicExportingMetricReader(ConsoleMetricExporter())
    elif os.environ.get("IRIS_OTEL_DEBUG"):
        reader = PeriodicExportingMetricReader(ConsoleMetricExporter())
    else:
        reader = None

    if reader:
        meter_provider = MeterProvider(resource=resource, metric_readers=[reader])
        metrics.set_meter_provider(meter_provider)
        _meter = metrics.get_meter(service_name, version)


def _ensure_init() -> None:
    """Lazy init — called on first telemetry use."""
    global _tracer, _meter
    if _tracer is None and _OTEL_AVAILABLE:
        _init_otel()


# --- Public API ---

@contextmanager
def span(name: str, attributes: dict | None = None) -> Generator:
    """Create a trace span. No-ops if OTel is not available."""
    _ensure_init()

    if _tracer is None:
        yield None
        return

    with _tracer.start_as_current_span(name, attributes=attributes or {}) as s:
        try:
            yield s
        except Exception as e:
            s.set_status(trace.StatusCode.ERROR, str(e))
            s.record_exception(e)
            raise


def record_metric(name: str, value: float, attributes: dict | None = None) -> None:
    """Record a gauge metric. No-ops if OTel is not available."""
    _ensure_init()

    if _meter is None:
        return

    gauge = _meter.create_gauge(name)
    gauge.set(value, attributes=attributes or {})


def record_counter(name: str, value: int = 1, attributes: dict | None = None) -> None:
    """Increment a counter. No-ops if OTel is not available."""
    _ensure_init()

    if _meter is None:
        return

    counter = _meter.create_counter(name)
    counter.add(value, attributes=attributes or {})


def record_duration(name: str, start_time: float, attributes: dict | None = None) -> None:
    """Record a duration histogram from start_time (time.time()). No-ops if OTel is not available."""
    _ensure_init()

    if _meter is None:
        return

    histogram = _meter.create_histogram(name, unit="s")
    histogram.record(time.time() - start_time, attributes=attributes or {})


def flush() -> None:
    """Force flush all pending telemetry data."""
    if not _OTEL_AVAILABLE:
        return

    try:
        provider = trace.get_tracer_provider()
        if hasattr(provider, "force_flush"):
            provider.force_flush()

        meter_provider = metrics.get_meter_provider()
        if hasattr(meter_provider, "force_flush"):
            meter_provider.force_flush()
    except Exception:
        pass
