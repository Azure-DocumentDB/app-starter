# Fieldwork — Azure DocumentDB app starter

A small, complete task workspace: create, edit, delete, search, filter and page through your own tasks. A TypeScript API, a dependency-light vanilla browser UI, and **managed Azure DocumentDB** with passwordless Microsoft Entra ID authentication. No React scaffolding, local database, password connection string, invented live data, or hidden fallback.

> **Security scope:** this is an **operator-trusted-network demo**, not a production multi-user service. Local access is loopback-only. Azure access is restricted to one explicit operator IPv4 address, including SCM. Sessions and CSRF prevent cross-site writes; **they do not authenticate a human**. Everyone behind the permitted public/NAT IP is trusted. Do not publish unrestricted access or store real/sensitive data. The database identity currently receives a broad cluster role; see [Security](#security).

## What you get

- Responsive task cards, keyboard-accessible dialogs, search, status filters, deterministic pagination, optimistic edit/delete conflicts, and honest loading/empty/error states.
- MongoDB Node driver **7.7.0**, Azure Identity **4.13.3**, Node **24.21.0**, strict TypeScript and a lockfile.
- Azure CLI identity locally; **system-assigned managed identity** on Linux App Service. Tokens stay server-side; the OIDC audience is fixed and token expiry is honored.
- Bounded writes to an explicitly acknowledged `app_starter_*` database, ownership preflight, unique task IDs and indexes, optional idempotent eight-row synthetic seed. No collection/database drops.
- Permanent offline unit, HTTP API and browser-DOM tests; separate real-database integration tests with explicit opt-in.
- Pinned Bicep API versions, read-only SHA-pinned GitHub Actions, and a ZIP-ready deployment artifact including production dependencies.

## Local quickstart — against a real managed database

Prerequisites: Node 24.21.0, npm, Azure CLI; an existing **managed Azure DocumentDB** cluster (not the DocumentDB open-source project, Atlas or Cosmos DB RU), Entra authentication enabled, your signed-in identity registered as a cluster data-plane user, and a cluster firewall rule allowing only your current public IPv4. Ask the cluster administrator to complete those steps; Azure subscription Contributor alone does not grant database access.

```bash
npm ci --ignore-scripts
cp .env.example .env
# Edit .env with the actual cluster hostname and a NEW disposable database name.
# DOCUMENTDB_DATABASE and ALLOW_SAMPLE_WRITES must match exactly.
az login
npm run build
npm run seed                 # optional: 8 clearly synthetic rows, idempotent
npm start
# Open exactly http://127.0.0.1:3000 (not localhost).
```

The hostname accepts `<cluster>.mongocluster.cosmos.azure.com` and the corresponding `.global.` endpoint. Supply a hostname **only**, never a URI, username, password or access token. Only Azure public-cloud endpoints are supported. Readiness may take a few seconds while identity/role changes propagate. The app remains live while the database is unreachable and shows an error rather than fake records.

| Variable | Local | Azure App Service |
|---|---|---|
| `DOCUMENTDB_HOST` | Real cluster hostname | Same |
| `DOCUMENTDB_DATABASE` | `app_starter_<6–40 lowercase letters/digits/underscores>` | Same |
| `ALLOW_SAMPLE_WRITES` | Exact database name | Same; deliberate write acknowledgment |
| `AZURE_AUTH_MODE` | `cli` | `managed-identity` |
| `AZURE_TOKEN_CREDENTIALS` | Not needed | `ManagedIdentityCredential` (required) |
| `APP_ORIGIN` | `http://127.0.0.1:3000` | Exact `https://<app>.azurewebsites.net` |
| `PORT` | `3000` default | Platform port or default |
| `OPERATOR_IPV4` | Not used | Required explicit IPv4, no CIDR |

Managed mode refuses startup outside the App Service identity boundary, without an operator IP, with a credential-chain fallback, or with a user-assigned client ID/client secret. Custom domains require an intentional code and infrastructure review; this starter does not silently accept them.

### Tests

```bash
npm test                      # no Azure calls; unit, direct HTTP, browser DOM
npm audit --audit-level=low
RUN_LIVE_TESTS=I_OWN_THIS_DISPOSABLE_DATABASE npm run test:live
```

`test:live` **fails**, rather than skips or succeeds, if opt-in/config/identity/DB connectivity is absent. It creates a uniquely named synthetic row, proves read/update/conflict/delete and removes only its own row in `finally`. It never drops a collection/database. The normal test double is confined to `test/`; runtime only instantiates `MongoStore`. DOM tests execute the real browser module but are not a substitute for a real-browser accessibility and deployment review.

## Deploy to Azure App Service

See **[the exact operator deployment runbook](infra/DEPLOY.md)**. Deploy into a **new, owned disposable resource group**. The main template creates only an App Service and optional plan; it never creates, changes or deletes the existing cluster. The separate cluster-user template is an explicit administrative operation.

```bash
npm run bundle
# artifact: artifacts/app-starter.zip
# startup command inside ZIP: node dist/server.js
```

The ZIP contains compiled JS, the real UI, production-only `node_modules`, package manifests and license. It excludes `.env`, test fixtures, evidence and credentials. No Oryx/npm install is required at startup. `zip` must be installed. There are no native production modules, so packaging on macOS is portable to Linux Node 24. App Service chooses the currently supported Node 24 LTS patch; local/CI use 24.21.0.

Default plan is Linux **B1**, if the subscription and region support it. You may provide an existing Linux plan in the same region or explicitly choose `S1`/`P0V4` after quota/cost approval. A listed SKU does **not** prove allocation quota. Do not repeatedly provision plans to guess around quota failures.

## API contract

- `GET /health/live` → `200 {status:"alive"}` without database access/config details.
- `GET /health/ready` → 200 only after DB ping and ownership/index preflight; otherwise sanitized 503. Operator boundary applies.
- `GET /api/session` → one-hour HttpOnly/SameSite Strict session and CSRF nonce. Cloud cookie is Secure and `__Host-` prefixed. **Not a login.**
- `GET /api/tasks?q=&status=&page=1&limit=8` → `{items,total,page,limit}`. Page ≥1, limit 1–50, title search ≤100 chars, literal case-insensitive matching. Stable order `createdAt DESC, id ASC`. Separate count/list queries are not a transactional snapshot under concurrent edits.
- `POST /api/tasks` → 201. Body `{title,notes,status,priority}`; title 1–120 chars, notes ≤2000, status `planned|in-progress|done`, priority `low|medium|high`.
- `PUT /api/tasks/:id` → 200. Same fields plus integer `revision`.
- `DELETE /api/tasks/:id` → 200. Body `{revision}`. Stale versions return 409; refresh before retrying.

All task endpoints require a server session; writes additionally require exact Origin and `X-CSRF-Token`. Invalid input is 400, unsupported content type 415, body >8 KiB 413, missing session 401, disallowed network/origin/CSRF 403. No CORS is enabled. Only a fixed allowlist of static assets is served. Driver selection/connect/socket/operation timeouts are bounded; HTTP header/request timeouts protect slow uploads. Errors do not echo raw SDK exceptions or credentials.

## Security

**Database passwordless is not application user authentication.** The OIDC scope is fixed to `https://ossrdbms-aad.database.windows.net/.default`; the callback cannot request an audience suggested by a remote server. Strict TLS certificate/hostname validation remains on. `ALLOWED_HOSTS` allows only the configured host and `*.mongocluster.cosmos.azure.com` (SRV node hosts), never `*.azure.com` or `*`.

The pinned **2026-06-01** `Microsoft.DocumentDB/mongoClusters/users` schema exposes **`root` on `admin`**. The provided identity grant is **cluster-wide administrative data-plane access**, not least privilege for the chosen database. Ownership checks and write guards reduce accidental sample writes; they are **not a database authorization boundary**. Use only a disposable sample cluster, or a cluster whose owner explicitly accepts that risk. Do not misrepresent an Azure control-plane role assignment as database access.

The App Service access restriction is the trusted ingress boundary; forwarded headers alone are not authentication. The app additionally checks the final forwarded IP, HTTPS, exact Host/Origin, sessions and CSRF. Never expose the app server around App Service or remove its restriction. The Bicep template restricts SCM to the same IP, disables basic publishing credentials/FTP, enforces TLS/HTTPS, and never defaults to all addresses. Liveness is intentionally nonsecret, and still subject to platform IP restrictions.

For a production multi-user service, first register an Entra application through your tenant-approved process, configure **App Service Authentication (Easy Auth)** to require authentication for **all** requests with correct issuer/audience, and enforce application authorization/tenant isolation. Do not merely trust caller-supplied `X-MS-CLIENT-PRINCIPAL` headers on an unprotected origin. This repository does **not** claim Easy Auth or production end-user authorization is configured or verified. Also add database least privilege when supported, private networking, rate limiting, audit/monitoring, backups and a reviewed multi-instance session store. The current in-memory sessions reset on restart and are intended for one operator/demo instance.

## Cost and cleanup

Existing cluster compute/storage continue billing independently. App Service B1 (or approved larger SKU) is billed while allocated; stopping the web app does **not** remove plan charges. Prices and quota vary by region/subscription; check the [Azure pricing calculator](https://azure.microsoft.com/pricing/calculator/) before deploying. This is not a free-tier guarantee. Shared plan charges and capacity belong to its owner.

No script deletes Azure resources. Follow the runbook inventory/ownership checks before manually removing the new web app/owned plan/resource group. Never delete the existing cluster or shared plan. Remove only the identity user and narrow firewall rules you created after checking no other app uses them. Delete individual sample rows in the UI; database/collection drops are deliberately not provided.

## References

- [Azure DocumentDB Entra connection guide](https://learn.microsoft.com/azure/documentdb/how-to-connect-role-based-access-control)
- [Pinned 2026-06-01 cluster users schema](https://learn.microsoft.com/azure/templates/microsoft.documentdb/2026-06-01/mongoclusters/users)
- [App Service access restrictions](https://learn.microsoft.com/azure/app-service/app-service-ip-restrictions)
- [App Service Linux Node runtime](https://learn.microsoft.com/azure/app-service/configure-language-nodejs)

MIT licensed. Azure deployment and actual managed-identity data-plane verification must be performed in your subscription; offline tests alone do not prove cloud connectivity.
