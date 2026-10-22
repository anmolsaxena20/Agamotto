import crypto from 'node:crypto';
import { createClient } from '@clickhouse/client';

const DATABASE = process.env.CLICKHOUSE_DATABASE || 'agamotto_telemetry';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required ClickHouse configuration: ${name}`);
  return value;
}

export function createTelemetryStore() {
  const client = createClient({
    url: required('CLICKHOUSE_URL'),
    username: required('CLICKHOUSE_USER'),
    password: required('CLICKHOUSE_PASSWORD'),
    // Bootstrap from an existing database so initialize() can create DATABASE.
    // All application tables and queries below use an explicit database name.
    database: 'default',
    request_timeout: Number.parseInt(process.env.CLICKHOUSE_REQUEST_TIMEOUT_MS || '10000', 10),
  });

  return {
    async initialize() {
      await client.command({ query: `CREATE DATABASE IF NOT EXISTS ${DATABASE}` });
      await client.command({ query: `
        CREATE TABLE IF NOT EXISTS ${DATABASE}.ingestion_batches (
          received_at DateTime64(3, 'UTC'),
          organization_id UUID,
          signal LowCardinality(String),
          payload_sha256 FixedString(64),
          payload_bytes UInt64,
          otlp_export_request String CODEC(ZSTD(3))
        ) ENGINE = MergeTree
        PARTITION BY toYYYYMM(received_at)
        ORDER BY (organization_id, signal, received_at, payload_sha256)
        TTL received_at + INTERVAL 30 DAY
      ` });
      await client.command({ query: `CREATE TABLE IF NOT EXISTS ${DATABASE}.telemetry_logs (organization_id UUID, service_name LowCardinality(String), time DateTime64(9, 'UTC'), observed_time DateTime64(9, 'UTC'), trace_id FixedString(32), span_id FixedString(16), severity_number UInt8, severity_text LowCardinality(String), body String CODEC(ZSTD(3)), attributes_json String CODEC(ZSTD(3))) ENGINE = MergeTree PARTITION BY toYYYYMM(time) ORDER BY (organization_id, service_name, time, severity_number)` });
      await client.command({ query: `CREATE TABLE IF NOT EXISTS ${DATABASE}.metric_samples (organization_id UUID, service_name LowCardinality(String), metric_name LowCardinality(String), metric_type LowCardinality(String), time DateTime64(9, 'UTC'), value Float64, attributes_json String CODEC(ZSTD(3))) ENGINE = MergeTree PARTITION BY toYYYYMM(time) ORDER BY (organization_id, service_name, metric_name, time)` });
      await client.command({ query: `
        CREATE TABLE IF NOT EXISTS ${DATABASE}.trace_spans (
          organization_id UUID, trace_id FixedString(32), span_id FixedString(16), parent_span_id FixedString(16),
          service_name LowCardinality(String), name LowCardinality(String), kind UInt8,
          start_time DateTime64(9, 'UTC'), duration_ns UInt64, status_code UInt8
        ) ENGINE = MergeTree PARTITION BY toYYYYMM(start_time)
        ORDER BY (organization_id, service_name, start_time, trace_id, span_id)
      ` });
    },
    async writeTraceSpans(organizationId, spans) {
      if (!spans.length) return;
      await client.insert({ table: `${DATABASE}.trace_spans`, format: 'JSONEachRow', values: spans.map(span => ({ organization_id: organizationId, ...span })) });
    },
    async writeLogs(organizationId, records) { if (records.length) await client.insert({ table: `${DATABASE}.telemetry_logs`, format: 'JSONEachRow', values: records.map(row => ({ organization_id: organizationId, ...row })) }); },
    async writeMetricSamples(organizationId, samples) { if (samples.length) await client.insert({ table: `${DATABASE}.metric_samples`, format: 'JSONEachRow', values: samples.map(row => ({ organization_id: organizationId, ...row })) }); },
    query(query, query_params) { return client.query({ query, query_params, format: 'JSONEachRow' }); },
    async writeBatch({ organizationId, signal, payload }) {
      const payloadBytes = Buffer.from(payload);
      await client.insert({
        table: `${DATABASE}.ingestion_batches`,
        format: 'JSONEachRow',
        values: [{
          received_at: new Date().toISOString(),
          organization_id: organizationId,
          signal,
          payload_sha256: crypto.createHash('sha256').update(payloadBytes).digest('hex'),
          payload_bytes: payloadBytes.length,
          // Base64 keeps protobuf bytes opaque and lossless in JSONEachRow.
          otlp_export_request: payloadBytes.toString('base64'),
        }],
      });
    },
    close() { return client.close(); },
  };
}
