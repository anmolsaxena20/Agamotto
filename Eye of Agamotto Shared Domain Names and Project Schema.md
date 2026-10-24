# Eye of Agamotto: Shared Domain Names and Project Schema and Folder Structure

Oct 20, 2026 · @raj

This is the single source of truth for names and data shapes: every teammate uses the terms, table names, collection names, field names and API paths below, so the services fit together without translation.

It is derived from the Design Document and the Complete Feature List (Team Vortex, WEBSTER 2026, Problem Statement 08). Anything marked **proposed** is a default the team can change; change it here first, then in code.

**Ground rules**

- One name per concept. If a word is in the glossary, no other word is used for it in code, UI text, docs or commit messages.
- Every telemetry row and every Mongo document carries `org_id`. The value always comes from the signed-in user's token or the ingest key, never from a request parameter.
- Wire format and storage use `snake_case`. TypeScript and Python code use their usual local style (`camelCase` variables, `snake_case` Python) and convert only at the boundary.

## Common domain names

These are the shared words of the project. The third column is the exact identifier to use in code and data; the last column lists words to avoid.

| Term | Meaning | Canonical identifier | Do not call it |
| --- | --- | --- | --- |
| Organization | The tenant: a team that owns data, members, groups and a plan | `org`, `org_id` | workspace, account, tenant, company |
| Member | A user inside one organization | `membership` | teammate, seat |
| Group | A named set of permissions plus the services it may see | `group`, `group_id` | role, team |
| Permission | One allowed action, written `resource:action` | `traces:read` | privilege, scope, right |
| Plan | The tier of an organization (free or paid) with its limits | `plan`, `plan_id` | subscription, package |
| Ingest key | Secret sent by exporters to tag telemetry to an organization | `ingest_key` | api key, token |
| Token | Short-lived login credential (JWT) for a signed-in user | `access_token` | session key |
| Service | One microservice that emits telemetry, named by `service.name` | `service_name` | app, microservice, component |
| Trace | The full journey of one request across services | `trace_id` | transaction, request |
| Span | One timed operation inside a trace | `span_id`, `parent_span_id` | segment, step |
| Root span | The span with no parent; its operation names the trace | `root_span` | entry span |
| Log | One log record, optionally linked to a span | `log_id`, `trace_id`, `span_id` | event, line |
| Event | A marker on charts: fault, deploy or config change | `event_id`, `event_type` | annotation, marker |
| Error fingerprint | Hash of the normalized error message, service and span name | `error_fingerprint` | error hash, signature |
| Error group | All errors that share a fingerprint | `error_group` | issue, incident |
| Critical path | The chain of spans that decided total trace time | `critical_path` | hot path, longest path |
| Self time | Span duration minus time covered by its children | `self_time_ns` | exclusive time |
| Baseline | Median p99 of the previous window for a service | `baseline_p99_ns` | normal, average |
| Anomaly | A window where p99 and errors exceed baseline | `anomaly`, `anomaly_id` | incident, spike |
| Topology edge | A caller-to-callee pair with call count, p95 and error rate | `edge`, `caller`, `callee` | link, dependency |
| Filter | The structured query object (range, services, text, and so on) | `filter` | query params |
| Saved query | A named filter the user can reopen | `saved_query` | bookmark, favorite |
| Investigation | A saved AI question, answer and evidence IDs, shareable by link | `investigation_id` | chat, session |
| Evidence | A span or log ID cited by an AI answer and verified to exist | `evidence` | source, citation |
| Hypothesis | An unverified AI explanation with a confidence label | `hypothesis` | conclusion, cause |
| Alert rule | Condition on a service metric versus baseline for a duration | `alert_rule` | monitor, trigger |
| Deployment | An uploaded zipped Node.js app built and run by the platform | `deployment_id` | release, app |
| Demo | The built-in load generator and its fault story | `demo`, `loadgen` | simulation, sandbox |
| Store service | The only process that writes the telemetry database | `store-service` | db service |
| Gateway | The OTLP entry point that validates, queues and batches | `gateway` | collector, ingester |
| Support API | Node.js and MongoDB service for orgs, auth, saved items | `support-api` | backend, main api |

## Naming conventions

| Area | Convention | Example |
| --- | --- | --- |
| DuckDB tables and columns | `snake_case`, plural table names | `spans`, `service_name` |
| Mongo collections | `snake_case`, plural | `alert_rules` |
| Mongo and JSON fields | `snake_case` | `created_at` |
| Time columns | Timestamps in UTC; nanosecond integers for OTel times, suffix `_ns`; durations suffix `_ns`; Mongo dates as ISO 8601 UTC | `start_time_ns`, `duration_ns` |
| IDs | OTel IDs as lowercase hex strings (trace 32 chars, span 16); app IDs as ULID strings with a prefix | `org_01J…`, `inv_01J…` |
| Permissions | `resource:action`, lowercase | `logs:read` |
| REST paths | Lowercase, plural nouns, versioned | `/api/v1/traces/:trace_id` |
| Query parameters | `snake_case` | `from`, `to`, `service`, `limit`, `cursor` |
| Env variables | `UPPER_SNAKE_CASE`, prefix `EOA_` | `EOA_INGEST_KEY` |
| Services and packages | `kebab-case` | `store-service`, `@eye-of-agamotto/sdk` |
| TypeScript | Types `PascalCase`, files `kebab-case.ts` | `TraceSpan`, `trace-tree.ts` |
| Python | PEP 8, Pydantic models `PascalCase` | `AiAnswer` |
| Git branches | `feat/<feature-number>-<short-name>` | `feat/13-critical-path` |
| Commits | Conventional Commits, feature number in scope | `feat(13): add self time column` |

**Units.** Latency in the UI is shown in milliseconds, but stored and sent in nanoseconds. Percentiles are written `p50`, `p95`, `p99`. Error rate is a fraction from 0 to 1 in the API and a percentage only in the UI.

**Severity.** Use the OTel severity text in upper case: `TRACE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, `FATAL`.

**Span status.** `UNSET`, `OK`, `ERROR`, as in OTel. A span is an error when status is `ERROR` or `http_status` is 500 or higher.

## Repository and service layout

One monorepo, one folder per deployable part. Ports are **proposed**. Ownership of the gateway and store service is still an open decision.

| Folder | Service name | Stack | Port | Owns | Features |
| --- | --- | --- | --- | --- | --- |
| `apps/web` | `web` | React, TypeScript, Recharts, React Flow, Zustand, TanStack Query | 5173 | Dashboard, all pages | 2, 3, 4, 10, 13 to 20, 22 to 26 |
| `services/gateway` | `gateway` | Node.js, Fastify, OTLP | 4318 HTTP, 4317 gRPC | Ingest, queue, batching, quota 429, fingerprints | 1, 15 |
| `services/store` | `store-service` | Python, FastAPI, DuckDB (or ClickHouse) | 8001 | Telemetry tables, query API, anomaly detector, retention job | 6, 7, 17 |
| `services/ai` | `ai-service` | Python, FastAPI, Pydantic, MCP client | 8002 | Agent loop, answer validation, natural-language search | 9, 19, 20 |
| `services/mcp` | `mcp-server` | Python, MCP SDK | 8003 | Read-only tools | 8 |
| `services/support` | `support-api` | Node.js, Fastify or Express, MongoDB, Mongoose | 8004 | Auth, orgs, groups, plans, saved items, alerts, deployments | 11, 22, 23, 26, 27, 28 |
| `packages/sdk` | `@eye-of-agamotto/sdk` | TypeScript, tsup, OTel JS | none | Node SDK plugin | 29 |
| `tools/loadgen` | `loadgen` | Node.js or Python, OTel SDKs, k6 or Locust | 9000 control | Fake services, fault injection, benchmark | 5, 21 |
| `packages/contracts` | `contracts` | JSON Schema, generated TS and Pydantic types | none | Shared API types and the filter schema | all |
| `docs` | none | Markdown | none | README, benchmark report, tool disclosure | deliverables |

**Data flow in one line.** Exporter or SDK sends OTLP to `gateway` with an ingest key; the gateway resolves the key to an `org_id` through `support-api`, batches rows to `store-service`; `web`, `ai-service` and `mcp-server` read from `store-service`; `ai-service` reaches data only through `mcp-server`.

**Rules that follow from it**

- Only `store-service` opens the DuckDB file (one writer process).
- `mcp-server` has read-only tools and no raw SQL tool.
- Shared request and response shapes live in `packages/contracts`; nobody redefines them locally.

## Folder structure

One monorepo named `eye-of-agamotto`, using npm workspaces for the Node and TypeScript parts and a separate `pyproject.toml` per Python service. Top-level folders match the service names above.

```text
eye-of-agamotto/
├── README.md                    # storage strategy, query performance, architecture
├── package.json                 # npm workspaces: apps/*, packages/*, services/gateway, services/support, tools/loadgen
├── docker-compose.yml           # runs everything locally: gateway, store, ai, mcp, support, mongo, web
├── .env.example                 # every EOA_* variable, no secrets
├── .gitignore
├── .github/
│   └── workflows/ci.yml         # lint, type check, tests on pull requests
│
├── apps/
│   └── web/                     # React dashboard (features 2-4, 10, 13-20, 22-26)
│       ├── index.html
│       ├── package.json
│       ├── vite.config.ts
│       └── src/
│           ├── main.tsx
│           ├── app/             # router, layout, providers, sidebar, top bar
│           ├── pages/           # one folder per page
│           │   ├── overview/
│           │   ├── traces/      # trace list + trace-detail
│           │   ├── logs/
│           │   ├── topology/
│           │   ├── errors/
│           │   ├── alerts/
│           │   ├── deployments/
│           │   ├── setup/
│           │   ├── settings/    # members, groups, billing, integrations, data
│           │   └── auth/        # signup, login, invite-accept
│           ├── features/        # reusable feature code shared by pages
│           │   ├── waterfall/   # canvas renderer, trace-tree.ts, critical-path.ts, compare.ts
│           │   ├── ai-drawer/   # chat, evidence chips
│           │   ├── command-palette/
│           │   ├── anomaly-panel/
│           │   ├── share-dialog/
│           │   └── demo-controls/
│           ├── components/      # buttons, chips, status badge, tables, drawers, toasts, locked state
│           ├── charts/          # latency chart, heatmap, sparkline, event markers
│           ├── state/           # Zustand store: time range, services, live toggle, URL sync
│           ├── api/             # typed clients: store.ts, ai.ts, support.ts
│           ├── hooks/           # TanStack Query hooks, permission hook
│           ├── styles/          # tokens.css (colors, spacing), global.css
│           └── lib/             # formatters (ns to ms), date helpers
│
├── services/
│   ├── gateway/                 # Node.js, Fastify (features 1, 15)
│   │   ├── package.json
│   │   └── src/
│   │       ├── server.ts        # HTTP 4318 and gRPC 4317 startup
│   │       ├── otlp/            # protobuf definitions, decoders, flatten to rows
│   │       ├── auth/            # ingest key lookup + cache
│   │       ├── queue/           # bounded queue, 429 logic, batch worker
│   │       ├── quota/           # daily ingest counter
│   │       ├── fingerprint.ts   # normalize + sha1
│   │       └── client/          # store-service client
│   │
│   ├── store/                   # Python, FastAPI, DuckDB (features 6, 7, 17)
│   │   ├── pyproject.toml
│   │   ├── app/
│   │   │   ├── main.py
│   │   │   ├── db/              # connection (single writer), schema.sql, views.sql, migrations/
│   │   │   ├── routers/         # traces.py, logs.py, topology.py, metrics.py, errors.py, anomalies.py, events.py, stats.py
│   │   │   ├── queries/         # SQL builders; every query starts with org_id and time range
│   │   │   ├── ingest.py        # batch insert, ON CONFLICT DO NOTHING
│   │   │   ├── anomaly/         # detector.py, baseline.py, suspects.py
│   │   │   ├── jobs/            # retention.py, scheduler.py
│   │   │   └── auth.py          # verify token signed by support-api
│   │   └── tests/
│   │
│   ├── ai/                      # Python, FastAPI (features 9, 19, 20)
│   │   ├── pyproject.toml
│   │   ├── app/
│   │   │   ├── main.py
│   │   │   ├── agent/           # loop.py, prompts/, limits.py
│   │   │   ├── mcp_client.py
│   │   │   ├── schemas.py       # AiAnswer, Filter (generated from contracts)
│   │   │   ├── validator.py     # checks every evidence ID exists
│   │   │   └── nl_search.py     # sentence to filter object
│   │   └── tests/
│   │
│   ├── mcp/                     # Python, MCP SDK (feature 8)
│   │   ├── pyproject.toml
│   │   ├── app/
│   │   │   ├── server.py
│   │   │   ├── tools/           # one file per tool: get_service_stats.py, find_slow_spans.py, ...
│   │   │   └── store_client.py
│   │   └── tests/
│   │
│   └── support/                 # Node.js, MongoDB (features 11, 22, 23, 26, 27, 28)
│       ├── package.json
│       └── src/
│           ├── server.ts
│           ├── models/          # Mongoose: user, organization, membership, group, plan, ...
│           ├── routes/          # auth, orgs, invites, groups, ingest-keys, billing, saved-queries,
│           │                    #   investigations, alert-rules, deployments
│           ├── middleware/      # auth (JWT), requirePermission, orgScope
│           ├── billing/         # checkout + webhook (Stripe or Razorpay)
│           ├── deploy/          # unzip.ts, dockerfile-template.ts, docker.ts (dockerode), sse.ts
│           ├── jobs/            # alert evaluator (every minute), usage rollup
│           └── seed/            # default plans, demo organization
│
├── packages/
│   ├── contracts/               # single source of shared shapes
│   │   ├── schemas/             # filter.json, ai-answer.json, error.json, permissions.json
│   │   ├── generated/           # ts/ and python/ (do not edit by hand)
│   │   └── package.json
│   └── sdk/                     # @eye-of-agamotto/sdk (feature 29)
│       ├── package.json
│       ├── tsup.config.ts
│       ├── src/                 # index.ts (init), register.ts (preload), logs.ts (pino, winston, console)
│       └── test/                # vitest + sample Express app
│
├── tools/
│   └── loadgen/                 # features 5, 21
│       ├── services/            # gateway-api, order, payment, inventory, notification
│       ├── control/             # demo start/stop, fault config endpoint
│       ├── k6/                  # load scripts
│       └── benchmark/           # scripts + results for throughput and query speed
│
├── deploy/
│   ├── nginx.conf               # one origin for web, support-api and store-service
│   └── docker/                  # one Dockerfile per service
│
└── docs/
    ├── schema-and-naming.md     # export of this document
    ├── design/                  # design document, wireframes
    ├── benchmark-report.md      # DuckDB vs ClickHouse, ingestion throughput
    ├── tool-disclosure.md       # AI tools and libraries used
    └── api/                     # generated OpenAPI per service
```

**Rules for everyone**

- A feature lives in the folder of the service that owns it (see the layout table). A page folder in `apps/web` holds only that page; code used by two pages moves to `features/` or `components/`.
- Shared request and response shapes are edited only in `packages/contracts/schemas`, then regenerated. Never edit `generated/`.
- Database schema changes go in `services/store/app/db/migrations/` or `services/support/src/models/`, together with an update to the schema sections of this document.
- Each service has its own `tests/` folder and a README with how to run it. Secrets stay in `.env`, never in git.
- Work on a branch named `feat/<feature-number>-<short-name>`; one pull request per feature, reviewed by the other teammate.
- Run `docker compose up` from the repo root to start the full system with the demo organization seeded.

**Suggested split of ownership** (open decision, change as needed): one teammate takes `services/gateway`, `services/store`, `services/ai`, `services/mcp` and `tools/loadgen`; the other takes `apps/web`, `services/support` and `packages/sdk`.

## Telemetry store schema (DuckDB)

Owned by `store-service`. Written in time-ordered batches with `INSERT ... ON CONFLICT DO NOTHING`, so retries never duplicate rows. If the benchmark picks ClickHouse, the same columns apply with `ORDER BY (org_id, start_time_ns)`. Every query filters `org_id` first, then the time range.

### Table `spans`

Primary key `(org_id, trace_id, span_id)`.

| Column | Type | Notes |
| --- | --- | --- |
| `org_id` | VARCHAR | Tenant, from the ingest key |
| `trace_id` | VARCHAR | 32 hex chars |
| `span_id` | VARCHAR | 16 hex chars |
| `parent_span_id` | VARCHAR | Null for a root span |
| `service_name` | VARCHAR | From resource `service.name` |
| `span_name` | VARCHAR | Operation, for example `POST /checkout` |
| `span_kind` | VARCHAR | `INTERNAL`, `SERVER`, `CLIENT`, `PRODUCER`, `CONSUMER` |
| `start_time_ns` | BIGINT | Unix epoch nanoseconds |
| `start_ts` | TIMESTAMP | Same instant, used for time buckets and filters |
| `duration_ns` | BIGINT | End minus start |
| `status_code` | VARCHAR | `UNSET`, `OK`, `ERROR` |
| `status_message` | VARCHAR | Optional |
| `http_method` | VARCHAR | Extracted from attributes |
| `http_route` | VARCHAR | Extracted from attributes |
| `http_status` | SMALLINT | Extracted from attributes |
| `is_error` | BOOLEAN | Status `ERROR` or `http_status` at least 500 |
| `error_fingerprint` | VARCHAR | sha1 hex, set only when `is_error` |
| `attributes` | JSON | Span attributes |
| `resource_attributes` | JSON | Resource attributes |
| `ingested_at` | TIMESTAMP | Set by the store service |

Self time, depth and critical path are computed at query time or in the browser, not stored.

### Table `logs`

Primary key `(org_id, log_id)`, where `log_id` is a hash of trace, span, timestamp and body so a retried batch dedupes.

| Column | Type | Notes |
| --- | --- | --- |
| `org_id` | VARCHAR | Tenant |
| `log_id` | VARCHAR | Deterministic hash |
| `time_ns` | BIGINT | Unix epoch nanoseconds |
| `ts` | TIMESTAMP | Same instant |
| `trace_id` | VARCHAR | Null if the log has no trace |
| `span_id` | VARCHAR | Null if the log has no span |
| `service_name` | VARCHAR | From resource |
| `severity_text` | VARCHAR | `TRACE` to `FATAL` |
| `severity_number` | SMALLINT | OTel number 1 to 24 |
| `body` | VARCHAR | Message text; searched with `ILIKE` and `regexp_matches` |
| `error_fingerprint` | VARCHAR | Set for `ERROR` and `FATAL` logs |
| `attributes` | JSON | Log attributes |

### Table `events`

Primary key `(org_id, event_id)`. Feature 24 chart markers.

| Column | Type | Notes |
| --- | --- | --- |
| `org_id` | VARCHAR | Tenant |
| `event_id` | VARCHAR | `evt_` plus ULID |
| `ts` | TIMESTAMP | When it happened |
| `event_type` | VARCHAR | `fault`, `deploy`, `config` |
| `service_name` | VARCHAR | Null if it affects all services |
| `label` | VARCHAR | Short text shown on the chart |
| `details` | JSON | Extra data, for example fault latency and error rate |

### Table `anomalies`

Primary key `(org_id, anomaly_id)`. Written by the detector in `store-service` (feature 7).

| Column | Type | Notes |
| --- | --- | --- |
| `org_id` | VARCHAR | Tenant |
| `anomaly_id` | VARCHAR | `anm_` plus ULID |
| `service_name` | VARCHAR | Affected service |
| `window_start`, `window_end` | TIMESTAMP | The flagged window |
| `p99_ns` | BIGINT | Window p99 |
| `baseline_p99_ns` | BIGINT | Median p99 of the previous window |
| `ratio` | DOUBLE | `p99_ns` divided by `baseline_p99_ns` |
| `error_rate` | DOUBLE | Fraction 0 to 1 |
| `baseline_error_rate` | DOUBLE | Fraction 0 to 1 |
| `status` | VARCHAR | `open`, `closed` |
| `suspects` | JSON | Top spans ranked by self time: `[{span_name, service_name, self_time_ns, sample_trace_id}]` |
| `detected_at` | TIMESTAMP | First detection |

### Derived views (no separate storage)

| View | Built from | Columns |
| --- | --- | --- |
| `v_trace_summary` | `spans` | `org_id`, `trace_id`, `root_span_name`, `start_ts`, `duration_ns`, `service_count`, `span_count`, `has_error` |
| `v_topology_edges` | `spans` joined to parent spans in a different service | `org_id`, `caller`, `callee`, `call_count`, `p95_ns`, `error_rate`, time window |
| `v_error_groups` | `spans` and `logs` | `org_id`, `error_fingerprint`, `service_name`, `pattern`, `count`, `first_seen`, `last_seen`, `sample_trace_id` |
| `v_latency_buckets` | `spans` | `org_id`, `service_name`, `bucket_start`, `p50_ns`, `p95_ns`, `p99_ns`, `request_count`, `error_count` |

**Fingerprint rule.** `sha1(service_name + "|" + span_name + "|" + normalized_message)`. Normalizing replaces numbers, UUIDs, hex strings and quoted strings with `<num>`, `<uuid>`, `<hex>` and `<str>`. The gateway computes it once at ingest.

**Retention.** A daily job deletes rows older than the organization's plan retention. Row counts and the oldest row are shown in Settings > Data.

## Support database schema (MongoDB)

Owned by `support-api`. Every collection except `users`, `plans` and `billing_events` has `org_id`. All documents have `_id`, `created_at` and `updated_at`. Fields below are in addition to those.

| Collection | Fields | Indexes | Feature |
| --- | --- | --- | --- |
| `users` | `email`, `password_hash` (argon2), `name`, `email_verified` | unique `email` | 27 |
| `organizations` | `name`, `slug`, `plan_id`, `owner_user_id`, `billing_customer_id`, `plan_status` | unique `slug` | 27 |
| `memberships` | `org_id`, `user_id`, `group_ids[]`, `is_owner` | unique `(org_id, user_id)` | 27 |
| `invites` | `org_id`, `email`, `group_ids[]`, `token_hash`, `expires_at`, `accepted_at` | `token_hash`, `(org_id, email)` | 27 |
| `groups` | `org_id`, `name`, `permissions[]`, `visible_services[]` (empty means all) | unique `(org_id, name)` | 27 |
| `plans` | `plan_id` (`free`, `pro`), `retention_days`, `max_members`, `daily_ingest_limit`, `max_deployments`, `features[]` | unique `plan_id` | 27 |
| `ingest_keys` | `org_id`, `key_hash`, `key_prefix`, `label`, `revoked_at`, `last_used_at` | unique `key_hash` | 1, 27 |
| `usage_daily` | `org_id`, `date`, `ingested_rows`, `rejected_rows` | unique `(org_id, date)` | 27 |
| `billing_events` | `provider_event_id`, `type`, `org_id`, `processed_at` | unique `provider_event_id` (webhook idempotency) | 27 |
| `saved_queries` | `org_id`, `user_id`, `name`, `target` (`logs` or `traces`), `filter` (the filter object) | `(org_id, user_id)` | 26 |
| `investigations` | `org_id`, `user_id`, `question`, `context` (filter, trace and span), `answer` (the answer schema below), `evidence_ids[]`, `tool_calls[]` | `(org_id, created_at)` | 9, 22 |
| `alert_rules` | `org_id`, `name`, `service_name`, `metric` (`p99` or `error_rate`), `multiplier`, `duration_minutes`, `enabled` | `(org_id, enabled)` | 23 |
| `alert_events` | `org_id`, `rule_id`, `service_name`, `fired_at`, `resolved_at`, `observed_value`, `baseline_value` | `(org_id, fired_at)` | 23 |
| `deployments` | `org_id`, `user_id`, `name`, `environment`, `status`, `stage`, `image_tag`, `container_id`, `build_log_ref`, `service_name` | `(org_id, status)` | 28 |
| `settings` | `org_id`, `mcp_tools_disabled[]`, `demo_running` | unique `org_id` | 8, 21 |

**Deployment status values:** `uploading`, `building`, `starting`, `running`, `stopped`, `failed`. Build stages: `upload`, `unpack`, `build`, `start`, `first_data`.

**Secrets.** Ingest keys and invite tokens are shown once and stored only as hashes. Only `key_prefix` (first 8 characters) is shown afterwards.

## API, MCP tool and permission contracts

### The filter object

One shape is used by every query endpoint, saved queries, natural-language search and shareable links. The LLM fills it by tool calling and never writes SQL.

```json
{
  "from": "2026-10-20T06:00:00Z",
  "to": "2026-10-20T06:15:00Z",
  "services": ["payment"],
  "severity": ["ERROR", "FATAL"],
  "text": "timeout",
  "regex": null,
  "status": "ERROR",
  "trace_id": null,
  "limit": 100,
  "cursor": null
}
```

`org_id` is never in the filter. The server adds it from the token and also intersects `services` with the user's group `visible_services`.

### Permissions

| Permission | Allows | Pages and actions |
| --- | --- | --- |
| `traces:read` | Read spans, traces, topology | Overview, Traces, Topology |
| `logs:read` | Read logs and error groups | Logs, Errors |
| `ai:use` | Use the AI drawer and natural-language search | Ask AI |
| `alerts:manage` | Create, edit, delete alert rules | Alerts |
| `deploy:run` | Deploy, stop, restart, delete | Deployments |
| `members:manage` | Invite members, edit groups | Settings > Members, Groups |
| `billing:manage` | Change plan, see invoices | Settings > Billing |

Owner is the only role that can delete the organization. Locked actions stay visible with a reason; pages the user cannot open are hidden.

### REST endpoints (proposed)

All paths start with `/api/v1`. Responses are JSON. Errors use `{ "error": { "code", "message", "details" } }`.

| Service | Method and path | Purpose | Permission |
| --- | --- | --- | --- |
| `gateway` | `POST /v1/traces`, `POST /v1/logs` (OTLP, port 4318) | Ingest, header `x-eoa-ingest-key`; 429 when queue or quota is full | ingest key |
| `store-service` | `GET /traces` | Trace list from `v_trace_summary` | `traces:read` |
| `store-service` | `GET /traces/:trace_id` | All spans of a trace | `traces:read` |
| `store-service` | `GET /traces/:trace_id/compare?baseline=` | Median or chosen baseline, with span deltas | `traces:read` |
| `store-service` | `GET /logs`, `GET /logs/:log_id` | Search and detail | `logs:read` |
| `store-service` | `GET /topology` | Edges from `v_topology_edges` | `traces:read` |
| `store-service` | `GET /services`, `GET /metrics/latency`, `GET /metrics/heatmap` | Health cards, percentiles, heatmap | `traces:read` |
| `store-service` | `GET /errors`, `GET /errors/:error_fingerprint` | Error groups and samples | `logs:read` |
| `store-service` | `GET /anomalies` | Open and past anomalies | `traces:read` |
| `store-service` | `GET/POST /events` | Chart markers | `traces:read` |
| `store-service` | `GET /stats/storage` | Row counts, oldest data (Settings > Data) | `members:manage` |
| `ai-service` | `POST /ask` (streams progress), `POST /parse-filter` | AI answer and natural-language search | `ai:use` |
| `support-api` | `POST /auth/signup`, `/auth/login`, `/auth/logout`, `GET /auth/me` | Authentication; token in an httpOnly cookie | public |
| `support-api` | `/orgs`, `/orgs/:org_id/members`, `/invites`, `/groups`, `/ingest-keys` | Organization admin | `members:manage` |
| `support-api` | `/billing/checkout`, `/billing/webhook` | Plan change | `billing:manage` |
| `support-api` | `/saved-queries`, `/investigations`, `/alert-rules`, `/alert-events` | Saved items | role per page |
| `support-api` | `/deployments`, `/deployments/:deployment_id/logs` (SSE) | Deployments | `deploy:run` |
| `loadgen` | `POST /demo/start`, `/demo/stop`, `PUT /demo/faults/:service_name` | Demo and fault injection | member, demo running |

List endpoints use cursor paging: `limit` (default 100, maximum 1000) and `cursor`. The browser calls `support-api` and `store-service` through one reverse-proxy origin so the cookie works for both; `store-service` trusts only tokens signed by `support-api`.

### MCP tools (read-only)

Each tool calls the same query API as the dashboard, returns a small capped result and always carries the caller's `org_id` from the token. There is no raw SQL tool.

| Tool | Input | Returns |
| --- | --- | --- |
| `get_service_stats` | `filter` | Per-service request count, error rate, p50, p95, p99 |
| `find_slow_spans` | `filter`, `limit` | Spans ranked by duration or self time |
| `get_error_groups` | `filter`, `limit` | Error groups with counts and sample IDs |
| `get_trace` | `trace_id` | Spans with depth, self time, critical path flag |
| `search_logs` | `filter` | Capped log rows |
| `compare_traces` | `trace_id`, `baseline_trace_id?` | Span deltas, added and missing spans |
| `get_topology` | `filter` | Edges with call count, p95, error rate |
| `get_anomalies` | `filter` | Anomalies with suspects |

### AI answer schema

The `ai-service` must return exactly this shape (Pydantic model `AiAnswer`). A validator checks every ID in `evidence` against the store and removes or flags any that do not exist.

```json
{
  "summary": "string",
  "insufficient_evidence": false,
  "evidence": [
    { "evidence_id": "ev1", "kind": "span", "trace_id": "...", "span_id": "...", "label": "payment POST /charge 2.1s" },
    { "evidence_id": "ev2", "kind": "log", "log_id": "...", "label": "Connection pool exhausted" }
  ],
  "hypotheses": [
    { "text": "string", "confidence": "low", "evidence_ids": ["ev1", "ev2"] }
  ],
  "next_steps": ["string"]
}
```

`confidence` is `low`, `medium` or `high`. The agent loop has a tool-call limit and a timeout; when the limit hits, the answer sets `insufficient_evidence` to true.

### Token and ingest key

- `access_token`: JWT in an httpOnly cookie, short-lived. Claims: `sub` (user id), `org_id`, `group_ids`, `permissions[]`, `visible_services[]`, `exp`.
- `ingest_key`: random string with prefix `eoa_`, sent in the `x-eoa-ingest-key` header. The gateway looks up its hash, gets the `org_id` and plan limits, and tags every row.

## Feature to schema mapping and open decisions

Use this to find which tables and services a feature touches. Feature 12 was replaced by 27 and 28.

| Features | Reads or writes | Service |
| --- | --- | --- |
| 1, 29 | `spans`, `logs`, `ingest_keys`, `usage_daily` | `gateway`, SDK |
| 2, 13, 14, 16 | `spans`, `logs` | `store-service`, `web` |
| 3, 20 | `logs`, filter object | `store-service`, `ai-service` |
| 4 | `v_topology_edges` | `store-service` |
| 5, 21 | emits spans and logs, writes `events` | `loadgen` |
| 6 | all telemetry tables | `store-service` |
| 7, 23 | `anomalies`, `alert_rules`, `alert_events` | `store-service`, `support-api` |
| 8, 9, 19 | all reads via MCP; `investigations` | `mcp-server`, `ai-service` |
| 10, 17, 18 | `v_latency_buckets`, URL state | `web`, `store-service` |
| 11, 22, 26 | `saved_queries`, `investigations`, `settings` | `support-api` |
| 15 | `error_fingerprint`, `v_error_groups` | `gateway`, `store-service` |
| 24 | `events` | `store-service` |
| 25 | none (frontend only) | `web` |
| 27 | `users`, `organizations`, `memberships`, `groups`, `plans`, `invites`, `billing_events`, `org_id` in every table | `support-api`, all |
| 28 | `deployments`, logs from containers | `support-api` |

**Schema change process.** Edit this doc first, tell the group chat, then change code. A new column or collection needs its owner, type and feature number in the tables above.

**Open decisions that affect the schema**

- Who owns `gateway` and `store-service`. Affects who approves changes to `spans` and `logs`.
- DuckDB or ClickHouse, decided by the benchmark. Column names stay the same either way.
- Whether organizations are built from the start. This doc assumes yes, because adding `org_id` later touches every table and query.
- What drag-and-drop deployment runs. This doc assumes a zipped Node.js app.
- Payment provider (Stripe or Razorpay, test mode). Only `billing_customer_id` and `billing_events` are provider-specific.
