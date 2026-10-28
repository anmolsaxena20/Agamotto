"""
observability.py – OpenTelemetry instrumentation and telemetry transmission for ai-service.

Transmits:
1. Distributed Traces: Auto-instruments FastAPI requests, child spans, and W3C trace context extraction/injection.
2. Runtime Metrics: Observable gauges for process CPU ('process.cpu.utilization') and memory ('process.memory.usage' rss/heap).
3. Structured Telemetry Logs: Pipes Python logger records directly to the Agamotto Ingestion Gateway via OTLP.
"""

from __future__ import annotations

import logging
import os
import sys
from typing import Optional

logger = logging.getLogger("ai_service.observability")

_telemetry_initialized = False


def setup_observability(app=None, service_name: str = "ai-service"):
    """
    Initializes OpenTelemetry tracing, metrics, and log exporting.
    Gracefully handles missing packages or offline endpoints.
    """
    global _telemetry_initialized
    if _telemetry_initialized:
        return

    endpoint = os.environ.get("OTEL_EXPORTER_OTLP_ENDPOINT", "http://localhost:4317")
    api_key = os.environ.get("AGAMOTTO_API_KEY", "")

    try:
        from opentelemetry import trace, metrics
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.sdk.metrics import MeterProvider
        from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
        from opentelemetry.sdk.resources import Resource
        from opentelemetry._logs import set_logger_provider
        from opentelemetry.sdk._logs import LoggerProvider, LoggingHandler
        from opentelemetry.sdk._logs.export import BatchLogRecordProcessor

        # Determine exporter protocol (gRPC vs HTTP)
        metadata = ()
        headers = {}
        if api_key:
            metadata = (("x-api-key", api_key),)
            headers = {"x-api-key": api_key}

        resource = Resource.create({
            "service.name": service_name,
            "service.version": "0.1.0",
            "deployment.environment": os.environ.get("ENV", "production"),
        })

        # ----------------------------------------------------------------------
        # 1. Traces Setup
        # ----------------------------------------------------------------------
        tracer_provider = TracerProvider(resource=resource)
        if "4317" in endpoint or endpoint.startswith("grpc://"):
            from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
            clean_endpoint = endpoint.replace("http://", "").replace("https://", "").replace("grpc://", "")
            span_exporter = OTLPSpanExporter(
                endpoint=clean_endpoint,
                insecure=True,
                headers=metadata,
            )
        else:
            from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
            http_endpoint = endpoint if endpoint.endswith("/v1/traces") else f"{endpoint.rstrip('/')}/v1/traces"
            span_exporter = OTLPSpanExporter(endpoint=http_endpoint, headers=headers)

        tracer_provider.add_span_processor(BatchSpanProcessor(span_exporter))
        trace.set_tracer_provider(tracer_provider)

        # ----------------------------------------------------------------------
        # 2. Metrics Setup (Runtime Gauges)
        # ----------------------------------------------------------------------
        if "4317" in endpoint or endpoint.startswith("grpc://"):
            from opentelemetry.exporter.otlp.proto.grpc.metric_exporter import OTLPMetricExporter
            clean_endpoint = endpoint.replace("http://", "").replace("https://", "").replace("grpc://", "")
            metric_exporter = OTLPMetricExporter(
                endpoint=clean_endpoint,
                insecure=True,
                headers=metadata,
            )
        else:
            from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter
            http_endpoint = endpoint if endpoint.endswith("/v1/metrics") else f"{endpoint.rstrip('/')}/v1/metrics"
            metric_exporter = OTLPMetricExporter(endpoint=http_endpoint, headers=headers)

        metric_reader = PeriodicExportingMetricReader(metric_exporter, export_interval_millis=60000)
        meter_provider = MeterProvider(resource=resource, metric_readers=[metric_reader])
        metrics.set_meter_provider(meter_provider)

        meter = metrics.get_meter(f"{service_name}.runtime")

        # Register Process CPU & Memory Gauges
        try:
            import psutil
            process = psutil.Process()

            def observe_cpu(options):
                cpu_pct = process.cpu_percent(interval=None)
                return [metrics.Observation(cpu_pct, {"service.name": service_name})]

            def observe_memory(options):
                mem = process.memory_info()
                return [
                    metrics.Observation(mem.rss, {"memory.type": "rss"}),
                    metrics.Observation(mem.vms, {"memory.type": "heap_total"}),
                ]

            meter.create_observable_gauge("process.cpu.utilization", callbacks=[observe_cpu], unit="percent")
            meter.create_observable_gauge("process.memory.usage", callbacks=[observe_memory], unit="By")
        except ImportError:
            logger.info("psutil not available; skipping CPU/RAM observable gauges")

        # ----------------------------------------------------------------------
        # 3. Logs Setup (Stream Python logs to Ingestion Gateway)
        # ----------------------------------------------------------------------
        logger_provider = LoggerProvider(resource=resource)
        if "4317" in endpoint or endpoint.startswith("grpc://"):
            from opentelemetry.exporter.otlp.proto.grpc._log_exporter import OTLPLogExporter
            clean_endpoint = endpoint.replace("http://", "").replace("https://", "").replace("grpc://", "")
            log_exporter = OTLPLogExporter(
                endpoint=clean_endpoint,
                insecure=True,
                headers=metadata,
            )
        else:
            from opentelemetry.exporter.otlp.proto.http._log_exporter import OTLPLogExporter
            http_endpoint = endpoint if endpoint.endswith("/v1/logs") else f"{endpoint.rstrip('/')}/v1/logs"
            log_exporter = OTLPLogExporter(endpoint=http_endpoint, headers=headers)

        logger_provider.add_log_record_processor(BatchLogRecordProcessor(log_exporter))
        set_logger_provider(logger_provider)

        # Attach handler to root logger
        handler = LoggingHandler(level=logging.INFO, logger_provider=logger_provider)
        logging.getLogger().addHandler(handler)

        # ----------------------------------------------------------------------
        # 4. Instrument FastAPI App
        # ----------------------------------------------------------------------
        if app:
            from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
            FastAPIInstrumentor.instrument_app(app, tracer_provider=tracer_provider, meter_provider=meter_provider)

        _telemetry_initialized = True
        logger.info("OpenTelemetry successfully initialized for %s -> %s", service_name, endpoint)

    except ImportError as e:
        logger.warning("OpenTelemetry packages not installed (%s). Telemetry transmission inactive.", e)
    except Exception as e:
        logger.warning("Failed to initialize OpenTelemetry: %s", e)
