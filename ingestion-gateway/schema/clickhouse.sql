-- ClickHouse does not enforce foreign keys. These logical relationships are
-- documented by UUID columns and are used by the decoder/writer service.
CREATE DATABASE IF NOT EXISTS agamotto_telemetry;

CREATE TABLE IF NOT EXISTS agamotto_telemetry.organizations (
  organization_id UUID,
  created_at DateTime64(3, 'UTC')
) ENGINE = ReplacingMergeTree(created_at) ORDER BY organization_id;

CREATE TABLE IF NOT EXISTS agamotto_telemetry.services (
  organization_id UUID,
  service_id UUID,
  service_name LowCardinality(String),
  service_version String,
  first_seen_at DateTime64(3, 'UTC'),
  last_seen_at DateTime64(3, 'UTC')
) ENGINE = ReplacingMergeTree(last_seen_at) ORDER BY (organization_id, service_id);

CREATE TABLE IF NOT EXISTS agamotto_telemetry.resources (
  organization_id UUID,
  resource_id UUID,
  attributes_json String CODEC(ZSTD(3)),
  first_seen_at DateTime64(3, 'UTC')
) ENGINE = ReplacingMergeTree(first_seen_at) ORDER BY (organization_id, resource_id);

CREATE TABLE IF NOT EXISTS agamotto_telemetry.instrumentation_scopes (
  organization_id UUID,
  scope_id UUID,
  scope_name LowCardinality(String),
  scope_version String,
  attributes_json String CODEC(ZSTD(3))
) ENGINE = ReplacingMergeTree ORDER BY (organization_id, scope_id);

-- Durable landing table used immediately by the temporary custom transport.
CREATE TABLE IF NOT EXISTS agamotto_telemetry.ingestion_batches (
  received_at DateTime64(3, 'UTC'),
  organization_id UUID,
  signal LowCardinality(String),
  payload_sha256 FixedString(64),
  payload_bytes UInt64,
  otlp_export_request String CODEC(ZSTD(3))
) ENGINE = MergeTree
PARTITION BY toYYYYMM(received_at)
ORDER BY (organization_id, signal, received_at, payload_sha256)
TTL received_at + INTERVAL 30 DAY;

-- Decoder output tables. Populate these only after decoding official OTLP
-- Export*ServiceRequest protobuf data from ingestion_batches.
CREATE TABLE IF NOT EXISTS agamotto_telemetry.spans (
  organization_id UUID, trace_id FixedString(32), span_id FixedString(16),
  parent_span_id FixedString(16), resource_id UUID, scope_id UUID,
  service_id UUID, name String, kind UInt8, start_time DateTime64(9, 'UTC'),
  end_time DateTime64(9, 'UTC'), status_code UInt8, status_message String,
  attributes_json String CODEC(ZSTD(3)), events_json String CODEC(ZSTD(3))
) ENGINE = MergeTree PARTITION BY toYYYYMM(start_time)
ORDER BY (organization_id, service_id, trace_id, start_time, span_id);

CREATE TABLE IF NOT EXISTS agamotto_telemetry.metric_points (
  organization_id UUID, resource_id UUID, scope_id UUID, service_id UUID,
  metric_name LowCardinality(String), metric_type LowCardinality(String),
  unit LowCardinality(String), time_unix_nano DateTime64(9, 'UTC'),
  start_time_unix_nano DateTime64(9, 'UTC'), value Float64,
  attributes_json String CODEC(ZSTD(3)), histogram_json String CODEC(ZSTD(3))
) ENGINE = MergeTree PARTITION BY toYYYYMM(time_unix_nano)
ORDER BY (organization_id, service_id, metric_name, time_unix_nano);

CREATE TABLE IF NOT EXISTS agamotto_telemetry.log_records (
  organization_id UUID, resource_id UUID, scope_id UUID, service_id UUID,
  time_unix_nano DateTime64(9, 'UTC'), observed_time_unix_nano DateTime64(9, 'UTC'),
  trace_id FixedString(32), span_id FixedString(16), severity_number UInt8,
  severity_text LowCardinality(String), body String CODEC(ZSTD(3)),
  attributes_json String CODEC(ZSTD(3))
) ENGINE = MergeTree PARTITION BY toYYYYMM(time_unix_nano)
ORDER BY (organization_id, service_id, time_unix_nano, trace_id);
