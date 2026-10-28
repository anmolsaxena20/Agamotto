# Agamotto

Next-generation, high-performance distributed observability and telemetry platform designed for deep trace analysis, metrics aggregation, log streaming, and AI-driven automated root-cause diagnostics.

---

## Architecture Overview

Agamotto is structured as a distributed microservices platform built for high throughput and sub-millisecond telemetry ingestion:

```mermaid
flowchart TD
    ClientApps[Client Applications / Node SDK] -->|OTLP gRPC :4317| IngestGateway[Ingestion Gateway :4317 / :4318]
    IngestGateway -->|ClickHouse Protocol| ClickHouse[(ClickHouse Columnar DB)]

    WebBrowser[Web Dashboard / UI] -->|HTTPS :3000| Server[Core API Server :3000]
    Server -->|gRPC :5000| EmailService[Email Service :5000]
    Server -->|ORM Builder| NeonDB[(Neon PostgreSQL)]
    Server -->|Internal HTTP Analytics Proxy| IngestGateway

    EmailService -->|REST API| Resend[Resend Email Provider]

    WebBrowser -->|HTTP :8000| AIService[AI Service :8000]
    AIService -->|Read-Only SQL| ClickHouse
    AIService -->|Local Embeddings| DuckDB[(DuckDB Local Store)]
    AIService -->|LLM API| LLMProvider[LLM Provider]
    AIService -->|MCP Protocol| MCPServer[Eye of Agamotto MCP Server]
```

---

## Microservices & Observability Core

All microservices (`server`, `email-service`, `ingestion-gateway`) are natively instrumented with OpenTelemetry SDK v3, featuring:

### 1. System & Runtime Observable Gauges
Scraped every 60 seconds via `PeriodicExportingMetricReader` and written to ClickHouse's `metric_samples` table:
* `process.memory.usage` (Bytes): Labeled with `memory.type` (`heap_used`, `heap_total`, `rss`, `system_used`, `system_total`).
* `process.cpu.utilization` (Percent): Delta CPU usage normalized across total machine cores (`0.00%` - `100.00%`).

### 2. Auto-Instrumentation & Application Metrics
* **Auto-Instrumentation**: Configured with `@opentelemetry/auto-instrumentations-node` for automatic Express, HTTP, and gRPC tracking.
* **Request Counters & Latencies**:
  * `http.server.request.count` & `http.server.request.duration` (ms) on all incoming HTTP endpoints.
  * `rpc.server.request.count` & `rpc.server.duration` (ms) on all incoming gRPC endpoints.
  * `rpc.client.request.count` & `rpc.client.duration` (ms) on outbound gRPC calls.
  * `email.sent.count` & `email.failure.count` on transactional email dispatch.

### 3. Correlated Structured Logging
* **Automatic Trace Context Correlation**: Active trace context (`trace_id`, `span_id`) is automatically injected into all log entries.
* **Console Interception**: `startTelemetry()` hooks global `console.log`, `console.info`, `console.warn`, and `console.error` to stream all console outputs directly to ClickHouse's `telemetry_logs` table while preserving stdout.
* **Structured Logger**: `logger(serviceName)` provides custom structured attributes for domain events.

---

## AI Service (`ai_service`)

The AI Service is a standalone **FastAPI** microservice (Python) that powers all AI and ML features of Agamotto. It runs at `:8000` and connects to both **ClickHouse** (production telemetry) and **DuckDB** (local analytics store) with strict multi-tenant isolation — every query is scoped to the caller's `org_id` extracted from a verified JWT.

### Tech Stack

| Component | Technology |
|---|---|
| Web Framework | FastAPI + Uvicorn |
| Local Analytics Store | DuckDB |
| Production Telemetry Store | ClickHouse |
| AI Agent | LLM tool-calling (via `LLMClient`) |
| MCP Protocol | `mcp >= 2.3.0` — Streamable HTTP/SSE + stdio |
| Auth | PyJWT — Bearer token / cookie |
| HTTP Client | HTTPX (async) |
| Background Scheduler | asyncio task loop (30s tick) |

### Directory Structure

```
ai_service/
├── app/
│   ├── main.py                  # FastAPI app, lifespan, CORS, router registration
│   ├── config.py                # Pydantic settings (env vars)
│   ├── auth.py                  # JWT verification, org_id extraction
│   ├── database.py              # DuckDB + ClickHouse-in-DuckDB federated queries
│   ├── clickhouse.py            # ClickHouse client, schema init
│   ├── llm.py                   # LLMClient — tool-calling wrapper
│   ├── mcp_client.py            # In-process MCP tool caller
│   ├── nl_search.py             # Natural-language search engine (Feature 20)
│   ├── cache.py                 # Answer caching layer
│   ├── schemas.py               # Pydantic models (AiAnswer, Filter, AnomalyOut, …)
│   ├── validator.py             # Evidence validator (Feature 19)
│   ├── agent/
│   │   ├── loop.py              # AI agent execution loop (Feature 9)
│   │   └── prompts/
│   │       ├── system.md        # System prompt for investigation assistant
│   │       └── nl_search.md     # System prompt for NL search
│   ├── anomaly/
│   │   ├── detector.py          # Core anomaly detection state machine (Feature 7)
│   │   ├── baseline.py          # Baseline metrics computation from ClickHouse
│   │   └── suspects.py          # Root-cause suspect span ranking
│   ├── mcp/
│   │   ├── server.py            # MCP server — 8 telemetry tools (Feature 8)
│   │   ├── context.py           # Auth context vars for MCP tool calls
│   │   ├── schemas.py           # MCP-specific Pydantic models
│   │   ├── store_client.py      # DuckDB/ClickHouse read helpers for MCP tools
│   │   └── tools/
│   │       ├── get_service_stats.py
│   │       ├── find_slow_spans.py
│   │       ├── get_error_groups.py
│   │       ├── get_trace.py
│   │       ├── search_logs.py
│   │       ├── compare_traces.py
│   │       ├── get_topology.py
│   │       └── get_anomalies.py
│   ├── jobs/
│   │   └── scheduler.py         # 30-second background anomaly detector loop
│   └── routers/
│       ├── anomalies.py         # GET /anomalies (Feature 7)
│       ├── assistant.py         # POST /ask, POST /ask/sync (Features 9 & 19)
│       ├── evidence.py          # POST /evidence/validate (Feature 19)
│       ├── search.py            # POST /parse-filter, POST /search/execute (Feature 20)
│       ├── telemetry.py         # POST /db/* — federated DuckDB+ClickHouse queries
│       └── mcp.py               # MCP server HTTP mount
├── evals/
│   ├── run_evals.py             # Evaluation harness for NL search accuracy
│   └── datasets/nl_search.jsonl # Ground-truth NL search test cases
├── tests/
│   ├── test_anomaly.py
│   ├── test_assistant.py
│   ├── test_feature_19.py
│   ├── test_feature_20.py
│   └── test_mcp_server.py
├── requirements.txt
└── pyproject.toml
```

---

### Feature 7 — Automated Root-Cause Correlation

**Endpoint:** `GET /anomalies`

A **30-second background scheduler** (`jobs/scheduler.py`) continuously runs a detection cycle across all `(org_id, service_name)` pairs. The detector implements a lifecycle **state machine**:

```
┌─────────┐   threshold met        ┌──────┐
│  normal  │──────────────────────▶│ open │
└─────────┘                        └──┬───┘
     ▲                                │  threshold NOT met
     │  recovery_count >= 2           ▼
     │                         recovery_count++
     └─────────────────────────(closed)
```

**Detection conditions** (both must hold):
- `current_p99 > K × baseline_p99`
- `current_error_rate > baseline_error_rate + MARGIN`
- `span_count >= MIN_SPANS`
- `baseline_p99 > 0` (guard)

**Key properties:**
- **Idempotent upserts** — a stable `anomaly_id` is generated on first detection and reused across ticks; DuckDB serializes writes so concurrent ticks are safe.
- **Suspect ranking** — `anomaly/suspects.py` ranks the slowest contributing spans inside the anomaly window, exposing `span_id`, `span_name`, `service_name`, `duration_ns`, `self_time_ns`, and `is_error`.
- **Baseline computation** — `anomaly/baseline.py` computes rolling baselines from the past 7 days of ClickHouse `canonical_spans`, falling back gracefully when data is sparse.

**Response shape:**
```json
{
  "anomalies": [
    {
      "anomaly_id": "uuid",
      "service_name": "payment",
      "window_start": "2026-10-28T10:00:00Z",
      "window_end": "2026-10-28T10:01:00Z",
      "p99_ns": 4500000000,
      "baseline_p99_ns": 900000000,
      "ratio": 5.0,
      "error_rate": 0.34,
      "baseline_error_rate": 0.02,
      "status": "open",
      "summary": "payment p99 is 5.0× its baseline (4500 ms vs 900 ms baseline) and errors are at 34.0%",
      "suspects": [...]
    }
  ],
  "total": 1
}
```

---

### Feature 8 — Eye of Agamotto MCP Server

**Mount:** `/mcp` (Streamable HTTP/SSE) and `stdio` transport

A **Model Context Protocol (MCP)** server named `eye-of-agamotto-mcp` exposes **8 read-only telemetry tools** to LLMs and external AI clients. All tools enforce strict multi-tenant isolation — `org_id` and `visible_services` are read from the verified JWT; raw SQL access is never exposed.

| Tool | Description |
|---|---|
| `get_service_stats` | P50/P99 latency, request rate, error rate for one or all services in a time window |
| `find_slow_spans` | Top N slowest spans matching a service / operation name filter |
| `get_error_groups` | Error groups by exception type and operation, with occurrence counts |
| `get_trace` | Full trace tree with all child spans for a given `trace_id` |
| `search_logs` | Full-text and regex search across telemetry logs with severity filter |
| `compare_traces` | Side-by-side comparison of two traces highlighting latency and status differences |
| `get_topology` | Service dependency graph as a list of directed `(source → destination)` edges with call counts |
| `get_anomalies` | Active anomalies from the detector for the authenticated organization |

**Security features:**
- Admin kill-switch per tool via `settings.mcp_tools_disabled`
- Prevents write operations and raw SQL passthrough
- All tool results capped at 6,000 characters to prevent context overflow

---

### Features 9 & 19 — AI Investigation Assistant with Clickable Evidence

**Endpoints:**
- `POST /ask` — Streaming SSE response
- `POST /ask/sync` — Non-streaming direct response (for API clients & tests)
- `POST /investigations/share` — Stores a shareable investigation snapshot
- `POST /evidence/validate` — Validates AI answer evidence against live telemetry stores
- `GET /evidence/check/{kind}/{item_id}` — Verifies a single span, log, or trace ID
- `GET /evidence/health` — Checks DuckDB and ClickHouse connectivity

The **AI Investigation Assistant** (`agent/loop.py`) lets users ask natural-language questions about their telemetry — e.g. _"Why is the payment service slow?"_ The agent:

1. **Pre-loads context** cheaply from the provided `anomaly_id`, `trace_id`, or `span_id`.
2. **Calls MCP tools** iteratively (up to 8 calls, 45-second timeout) to gather real telemetry evidence.
3. **Streams SSE events** to the client in real time:

| Event | Payload |
|---|---|
| `tool_start` | Tool name and arguments being dispatched |
| `tool_result` | Tool response data (capped to 6,000 chars) |
| `answer` | Final `AiAnswer` JSON conforming to Pydantic schema |
| `error` | Unrecoverable failure description |

4. **Validates every citation** (Feature 19) — the `validator.py` module checks every `span_id`, `log_id`, and `trace_id` in the answer against DuckDB and ClickHouse:
   - Drops **hallucinated** evidence items (IDs that don't exist in the store).
   - Drops **cross-tenant** evidence (IDs belonging to a different `org_id`).
   - Enriches verified items with real attributes (latency, error flag, deep-link URL).
   - Downgrades or removes hypotheses with no valid evidence left.
   - Sets `insufficient_evidence: true` if nothing valid remains after filtering.

5. **Retries once** on Pydantic validation failure before returning an error event.

**Answer schema (`AiAnswer`):**
```json
{
  "summary": "The payment service is experiencing a 5× latency spike...",
  "hypotheses": [
    {
      "title": "Database connection pool exhaustion",
      "confidence": 0.85,
      "evidence": [
        {
          "kind": "span",
          "item_id": "abc123",
          "label": "db.query took 4.2s",
          "url": "/traces/abc123"
        }
      ]
    }
  ],
  "insufficient_evidence": false
}
```

---

### Feature 20 — Natural-Language Search

**Endpoints:**
- `POST /parse-filter` — Converts a natural-language query into a structured `Filter` object and UI chips
- `POST /search/execute` — Executes a `Filter` directly against DuckDB and ClickHouse
- `GET /search/services` — Lists known service names for the tenant
- `GET /search/events/latest-deploy` — Returns the latest deployment event timestamp

The NL Search engine (`nl_search.py`) lets users type free-form queries into the Logs or Traces search bar — e.g. _"errors in the payment service in the last 15 minutes"_ — and converts them into structured filters.

**Pipeline:**

```
User query
    │
    ├─► Security gate: SQL injection + prompt injection detection (rejects or neutralizes)
    │
    ├─► Service discovery: Queries DuckDB & ClickHouse for known org services
    │
    ├─► Relative time resolution:
    │     "last 15 minutes" → from/to timestamps
    │     "since the deploy" → looks up latest deploy event from events table
    │     "today", "yesterday", "last 7 days" → exact UTC ranges
    │
    ├─► LLM tool-calling parser (primary) with deterministic rule-based parser (fallback)
    │
    ├─► Filter validation & sanitization:
    │     • Only known services allowed
    │     • Valid OTel severities (TRACE, DEBUG, INFO, WARN, ERROR, FATAL)
    │     • Regex ≤ 200 chars and must compile
    │     • Time range ≤ plan retention limit
    │     • Result limit ≤ 1,000
    │
    └─► ParseFilterResponse: structured Filter + editable UI chips ("Interpreted as" row)
```

**Security protections built-in:**
- SQL injection pattern detection (DROP, DELETE, UNION SELECT, etc.)
- Prompt injection detection (`ignore all previous instructions`, `system prompt override`, etc.)
- Dangerous inputs are treated as literal text — never executed as SQL

**Example:**
```
Input:  "show me ERROR logs from the checkout service since the last deploy"

Output Filter:
{
  "services": ["checkout"],
  "severities": ["ERROR"],
  "from_time": "2026-10-28T05:30:00Z",   ← resolved from latest deploy event
  "to_time":   "2026-10-28T22:12:44Z",
  "limit": 100
}

Chips: ["Service: checkout", "Severity: ERROR", "Since: last deploy (Oct 28 05:30 UTC)"]
```

---

### Federated Database Layer (`/db`)

**Endpoints:**
- `POST /db/clickhouse/query` — Execute a parameterized ClickHouse SELECT
- `POST /db/duckdb/query` — Execute a DuckDB SQL query against the local store
- `POST /db/federated` — Run a ClickHouse query as a virtual DuckDB table, then apply DuckDB SQL on top
- `POST /db/sync` — Sync a ClickHouse table slice into DuckDB for offline analytics
- `GET /db/health` — DuckDB + ClickHouse connectivity check

The database layer enables **federated analytics** — ClickHouse data is registered as a virtual Arrow table inside DuckDB, allowing complex cross-store joins and aggregations without data movement.

---

## AI Service API Reference

### Anomalies
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/anomalies` | List active anomalies for the authenticated org with suspect spans |

### AI Investigation Assistant
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/ask` | Stream SSE investigation events (`tool_start`, `tool_result`, `answer`, `error`) |
| `POST` | `/ask/sync` | Non-streaming investigation response |
| `POST` | `/investigations/share` | Save a shareable investigation snapshot |

### Evidence Validation
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/evidence/validate` | Validate all span/log/trace citations in an `AiAnswer` |
| `GET` | `/evidence/check/{kind}/{item_id}` | Verify a single evidence item (`span`, `log`, `trace`) |
| `GET` | `/evidence/health` | Check DuckDB + ClickHouse readiness |

### Natural-Language Search
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/parse-filter` | Convert NL query to structured `Filter` + UI chips |
| `POST` | `/search/execute` | Execute a `Filter` against DuckDB and ClickHouse |
| `GET` | `/search/services` | Discover known service names for the tenant |
| `GET` | `/search/events/latest-deploy` | Fetch latest deployment event timestamp |

### MCP Server
| Method | Endpoint | Description |
|---|---|---|
| `GET/POST` | `/mcp` | Eye of Agamotto MCP server (Streamable HTTP/SSE) |

### Database
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/db/clickhouse/query` | Execute a ClickHouse SELECT query |
| `POST` | `/db/duckdb/query` | Execute a DuckDB SQL query |
| `POST` | `/db/federated` | Federated ClickHouse + DuckDB query |
| `POST` | `/db/sync` | Sync ClickHouse table slice into DuckDB |
| `GET` | `/db/health` | Database health check |

---

## Core API Reference

### Authentication (`/auth`)
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/signup` | Register new account and trigger OTP email |
| `POST` | `/auth/verify-email` | Verify OTP code and activate account |
| `POST` | `/auth/login` | Authenticate user with password |
| `POST` | `/auth/refresh` | Rotate refresh token and issue new access token |
| `POST` | `/auth/logout` | Revoke session and clear authentication cookies |
| `GET` | `/auth/me` | Fetch currently authenticated user profile |
| `GET` | `/auth/google` | Initiate Google OAuth 2.0 flow |
| `GET` | `/auth/github` | Initiate GitHub OAuth 2.0 flow |

### Permissions Catalog (`/permissions`)
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/permissions` | List all 15 master platform permissions |

### Organizations (`/orgs`)
| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `POST` | `/orgs` | Authenticated | Create a new organization & provision default groups |
| `GET` | `/orgs` | Authenticated | List all organizations current user belongs to |
| `GET` | `/orgs/:orgId` | `org:read` | Get organization details |
| `PATCH` | `/orgs/:orgId` | `org:update` | Update organization name or slug |
| `DELETE` | `/orgs/:orgId` | `org:delete` | Delete organization and all associated resources |

### Organization Members (`/orgs/:orgId/members`)
| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `GET` | `/orgs/:orgId/members` | `org:read` | List all members of an organization |

---

## Getting Started

### AI Service Setup

**Prerequisites:** Python 3.11+, ClickHouse instance, LLM API key

```bash
cd ai_service
pip install -r requirements.txt

# Copy and configure environment variables
cp .env.example .env
# Edit .env with your ClickHouse host, LLM API key, JWT secret, etc.

# Run the service
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Key environment variables:**

| Variable | Description |
|---|---|
| `CLICKHOUSE_HOST` | ClickHouse server hostname |
| `CLICKHOUSE_PORT` | ClickHouse HTTP port (default: 8123) |
| `DUCKDB_PATH` | Path to local DuckDB file |
| `JWT_SECRET` | Shared JWT secret with the core API server |
| `LLM_API_KEY` | API key for the LLM provider |
| `LLM_MODEL` | Model identifier (e.g. `gemini-2.0-flash`) |
| `EOA_AGENT_TIMEOUT_S` | Agent loop timeout in seconds (default: 45) |
| `EOA_AGENT_MAX_TOOL_CALLS` | Max MCP tool calls per agent run (default: 8) |

### Running Tests

```bash
cd ai_service
pip install pytest pytest-asyncio
pytest tests/ -v
```
