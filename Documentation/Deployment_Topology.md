# Deployment Topology

## Local Development Machine (macOS — Current Deployment)

All services run as macOS launchd user agents with `RunAtLoad: true` and `KeepAlive: true`, meaning they start automatically on login and restart if they crash.

### Service Topology

| Agent Label | Service | Port | Binary |
|---|---|---|---|
| `com.m4.openclaw-gateway` | OpenClaw Gateway | 18789 | `openclaw-gateway` |
| `com.m4.proofui` | ProofUI Server | 18791 | `python -m proof_ui.server` |
| `com.m4.session-watcher` | Session Watcher | — | `python -m swarm.bridge.session_watcher` |
| `com.m4.acds-api` | ACDS REST API | 3100 | `node dist/main.js` |
| `com.m4.acds-admin-web` | Admin Web (Vite Preview) | 4173 | `vite preview` |
| `com.m4.apple-intelligence-bridge` | Apple Intelligence Bridge | 11435 | `.build/debug/AppleIntelligenceBridge` |
| `homebrew.mxcl.postgresql@16` | PostgreSQL 16 | 5432 | Homebrew-managed |

**Note**: The `com.m4.image-playground-service` agent was removed — Apple's `ImageCreator` API requires a visible foreground app and cannot run from any background/agent context.

### Plist Locations

All custom agents: `~/Library/LaunchAgents/com.m4.*.plist`

PostgreSQL: Managed by `brew services` at `~/Library/LaunchAgents/homebrew.mxcl.postgresql@16.plist`

### Environment Configuration

The ACDS API loads environment from `apps/api/.env` via a custom `loadDotEnvFile()` function. Required variables:

| Variable | Value | Notes |
|---|---|---|
| `DATABASE_URL` | `postgresql://acds:acds_dev@localhost:5432/acds` | Local PostgreSQL |
| `MASTER_KEY_PATH` | `/Users/m4/.acds/master.key` | 32-byte AES-256-GCM key |
| `ADMIN_SESSION_SECRET` | (generated) | 64-char base64 token |
| `PORT` | `3100` | Also set in plist |
| `NODE_ENV` | `production` | Also set in plist |

### File System Dependencies

- `apps/api/infra` symlink to `../../infra` (required for `loadJson()` config resolution)
- `/Users/m4/.acds/master.key` — 32-byte encryption key, mode 600
- `apps/api/.env` — not committed, must be provisioned per machine

### Network Layout (Local)

```
  localhost:18789  ←  OpenClaw Gateway
  localhost:18791  ←  ProofUI
  localhost:4173   ←  Admin Web
  localhost:3100   ←  ACDS API  →  localhost:5432 (PostgreSQL)
```

### Operations

```bash
# Check all services
launchctl list | grep -E "m4\.|homebrew"

# Restart a service
launchctl stop com.m4.acds-api && launchctl start com.m4.acds-api

# Full reset (after fixing crash loops)
launchctl unload ~/Library/LaunchAgents/com.m4.acds-api.plist
launchctl load ~/Library/LaunchAgents/com.m4.acds-api.plist

# Health check
curl http://localhost:3100/health

# View logs
tail -f ~/Library/Logs/acds-api.error.log
```

---

## Recommended Production Architecture

### Service Topology

| Component   | Replicas | Placement           | Notes                                                |
|-------------|----------|---------------------|------------------------------------------------------|
| API         | 2+       | Private subnet      | Behind an L7 load balancer (ALB / Cloud Load Balancer) |
| Worker      | 1        | Private subnet      | Leader-elected if scaled beyond one instance          |
| Admin Web   | Static   | Public (CDN-backed) | Built as static assets, served from S3/GCS + CDN     |
| PostgreSQL  | 1 primary + read replica | Private subnet | Managed service (RDS / Cloud SQL)          |

### API Service

- Deploy at least **2 replicas** behind an application load balancer.
- Health check endpoint: `GET /health` (returns 200 when ready).
- Horizontal scaling based on CPU and request latency metrics.
- Graceful shutdown: the API drains in-flight requests before terminating.

### Worker Service

- Run as a **single instance** by default.
- If scaled to multiple instances, enable leader election so that only one instance runs scheduled jobs (adaptation recommendations, plateau detection, execution scoring, family aggregation).
- Connect to the same PostgreSQL database as the API.

### Admin Web

- Build produces static files (HTML, CSS, JS).
- Serve from an object store (S3 / GCS) fronted by a CDN (CloudFront / Cloud CDN).
- The nginx configuration proxies `/api` requests to the API service for local development; in production, configure the CDN or load balancer to route `/api` to the API service directly.

### PostgreSQL

- Use a **managed database service** (Amazon RDS, Google Cloud SQL, or equivalent).
- Enable connection pooling via **PgBouncer** (either as a sidecar or managed proxy).
  - Recommended pool size: 20 connections per API replica, 5 per Worker instance.
- Automated backups with point-in-time recovery enabled.
- Read replicas for dashboard/reporting queries if needed.

### Network Layout

```
                  Internet
                     |
              [ Load Balancer ]
                /          \
          [ CDN ]       [ API x2+ ]
          (Admin)           |
                       [ Worker ]
                           |
                    [ PgBouncer ]
                           |
                    [ PostgreSQL ]
```

- **Public subnet**: Load balancer, CDN endpoint.
- **Private subnet**: API instances, Worker instance, PgBouncer, PostgreSQL.
- No direct internet access from private subnet; use NAT gateway for outbound calls to external AI providers.

### Environment Variables

| Variable        | Service     | Description                                     |
|-----------------|-------------|-------------------------------------------------|
| `DATABASE_URL`  | API, Worker | PostgreSQL connection string (via PgBouncer)    |
| `NODE_ENV`      | API, Worker | `production`                                    |
| `PORT`          | API         | Listening port (default 3000)                   |
| `LOG_LEVEL`     | API, Worker | `info` in production, `debug` in staging        |

### Scaling Guidelines

- **API**: scale horizontally; each replica is stateless.
- **Worker**: scale vertically first; horizontal scaling requires leader election for job deduplication.
- **PostgreSQL**: scale reads via read replicas; scale writes via vertical scaling of the primary.
