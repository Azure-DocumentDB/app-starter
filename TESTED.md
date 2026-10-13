# Verification record — 2026-10-12

**Release status: HOLD. Private review only; not an all-gates-pass release.**
Local HTTP and real managed Azure DocumentDB checks passed. **Real browser:
NOT VERIFIED. App Service / cloud managed identity / off-IP rejection: BLOCKED.**
No rendered UI, cloud deployment, Easy Auth or production authorization is claimed.

## Exact revision and evidence boundary

- Tested application source: `0406c28b67161baab20a4263fb30554cf393f056`.
- Base implementation: `1aa17093ef62f8c56da64f61e214755af64be855`;
  tested revision includes the strict non-string enum rejection fix.
- Independent source follow-up: ready at the tested source revision, **not**
  approval of the outstanding browser/cloud/publication gates.
- This record and the README status are documentation-only changes after that
  source revision. CI on the PR checks its actual head separately; CI cannot
  turn these blocked live gates into passes.
- Verification date is 2026-10-12 America/Los_Angeles (some timestamps are
  2026-10-13 UTC). Local toolchain: Node 24.21.0, npm 11.19.0.

## Passed: offline source checks

Rerun against the source revision above, without cloud/model calls:

```sh
npm test
./node_modules/.bin/tsc --noEmit
git diff --check
```

- **17 tests passed; 0 failed/skipped.** Includes unit, direct HTTP, DOM,
  ownership/configuration boundaries, CSRF, revisions, strict enum validation
  and POST/PUT no-mutation regressions.
- Type checking and whitespace checks passed.
- HTTP tests use a MemoryStore; DOM tests do not run a real browser.
- Saved dependency audit reported **0 vulnerabilities** (94 total dependencies).
  That is the saved audit result, not an independent fresh advisory check by
  the documentation reviewer. The GitHub workflow performs a fresh audit.

## Passed: actual managed Azure, local process with Azure CLI OIDC

The operator ran `npm run test:live` with explicit disposable-database consent:
**1 integration test passed; 0 failed/skipped**, exit 0. The wrapper recorded
1.73 seconds including the build. This exercised real managed Azure DocumentDB
CRUD, indexing and optimistic conflicts. Authentication was **Azure CLI OIDC,
not App Service managed identity**.

A separate real local HTTP probe reported PASS for:

- operator session, managed readiness and seeded task reads;
- CSRF rejection and strict enum rejection;
- creation of a synthetic persistent task and a stale-revision conflict;
- an actual server process restart (different recorded process IDs), after which
  the created task survived both restart and reseeding;
- preservation of an edit to an existing synthetic seed task during reseeding;
- restoration of that synthetic edit and deletion of the probe-created task.

The seed wrapper also exited 0 at the same source revision. These results are
API/database evidence, not evidence of rendered UI behavior, App Service ingress
semantics or a cloud managed-identity credential exchange. They do not prove
all negative ownership cases against the live service.

## Package and infrastructure evidence

The previously built `artifacts/app-starter.zip` had SHA-256:

```text
94e36ec4479bde9f9bf955dc81856dbe2ed0f362676785e8bbc99a0b2d8c1636
```

The independent follow-up verified all 15 compiled/UI files against the current
local source output, with 0 mismatches. Earlier archive inspection found no
`.env`, test/evidence/.git paths or native `.node` modules. This is local artifact
verification, not successful Linux/App Service deployment. ZIPs rebuilt by CI
may have a different byte hash.

Saved Bicep compilation produced ARM output, with **BCP081 warnings** for the
2026-06-01 cluster/user resource types whose type schemas were unavailable.
Compilation is **not** Azure what-if, cloud schema validation or deployment proof.

## Explicitly incomplete release gates

1. **Browser — NOT VERIFIED.** The supported browser navigation policy blocked
   access to the local application. Approval for `127.0.0.1` was requested; no
   bypass was attempted. Real rendering, keyboard/focus, narrow viewport,
   accessibility, console/network behavior and interactive failure/recovery
   remain unverified. HTTP/DOM passes are not substitutes.
2. **Cloud deployment / managed identity / allowed-IP HTTPS / off-IP 403 —
   BLOCKED by App Service allocation quota 0.** Recorded attempts: westus2 B1,
   westus2 P0V4 (despite a usage API limit of 10), eastus2 P0V4. **0 plans were
   created.** No alternative subscription mutation was made. No App Service
   endpoint, live managed-identity success or distinct nonallowlisted-client
   denial is claimed. Resolve quota through an authorized path rather than
   repeating speculative provisioning.
3. Final publication and owned-resource cleanup remain operator-controlled.
   Probe-row cleanup is not a claim that all Azure resources were deleted.

The operator-trusted-network and broad cluster-role limitations in
[README.md](README.md#security) still apply.

## Retained evidence

Sanitized operator records are retained outside this repository under the
2026-10-12 sample verification workspace: `starter-gate.json` / `.log`,
`starter-seed.json`, `starter-http.json`, `hosting-blocker.json`, saved offline
and package logs, and the independent app/follow-up review reports. This document
summarizes those records; no credentials, environment files or tokens are
included. Do not interpret private review/CI success as authorization to publish
while the gates above are incomplete.
