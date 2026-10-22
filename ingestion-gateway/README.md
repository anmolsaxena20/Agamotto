# Temporary telemetry receiver

The gRPC receiver implements the exact custom `AgamottoIngestion` contract
used by the three services. It requires `x-api-key` metadata and validates it
through the control plane before it writes a batch.

`CLICKHOUSE_CLOUD_API_KEY` and `CLICKHOUSE_CLOUD_API_SECRET` are Cloud control
plane credentials, not ClickHouse data-plane credentials. Configure
`CLICKHOUSE_URL`, `CLICKHOUSE_USER`, and `CLICKHOUSE_PASSWORD` for the service
database user; grant that user only `CREATE`, `INSERT`, and `SELECT` on the
`agamotto_telemetry` database during initial setup, then remove `CREATE`.

The landing table stores the original OTLP protobuf request byte-for-byte,
encoded as base64 for JSONEachRow. This preserves all data while the temporary
transport exists. `schema/clickhouse.sql` defines the normalized logical
dimensions and decoder output tables for trace, metric, and log analytics.
ClickHouse does not enforce foreign keys, and high-volume fact tables are
intentionally denormalized at query time; organization ownership is always a
leading sort key and must be included in every query.
