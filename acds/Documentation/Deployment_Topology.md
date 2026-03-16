# Deployment Topology

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
