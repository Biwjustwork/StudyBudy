# Task 2 report — Internal member endpoint with X-Service-Token

- Status: DONE (local commit only, not pushed, no PR)
- Commit: feat(group): internal member reservation with X-Service-Token
- Branch: Biw-dev (base: Task 1 commit 6876b1f)

## What changed (4 files only)

1. `group-service/src/app.ts`
   - `createApp(store, tokenSecret, serviceToken)` — third param added.
   - DELETED `POST /api/groups/:id/members` (owner Bearer) entirely.
   - ADDED `POST /internal/groups/:id/members`: `x-service-token !== serviceToken`
     (covers missing/empty/wrong in one comparison) → `401 { "error": "unauthorized",
     "message": "Service token is invalid" }`; then same body/group logic and
     messages as the deleted handler (`400` empty `userId`, `404` unknown group,
     `409` duplicate, `422` closed-or-full, `200` + updated group).
     `GroupStore.addMember` reused unchanged.
2. `group-service/src/server.ts` — reads `process.env.SERVICE_TOKEN`,
   throws `SERVICE_TOKEN must be set` when absent (same style as
   `AUTH_TOKEN_SECRET`); passes it to `createApp`.
3. `group-service/.env.example` — line 4 appended:
   `SERVICE_TOKEN=replace-with-shared-service-token` (placeholder only).
4. `group-service/src/app.test.ts` — `const serviceToken = "test-only-secret"`
   beside `secret`; `createApp(store, secret, serviceToken)` in `beforeEach`;
   `postMember` rewritten to `/internal/groups/...` with `x-service-token` header;
   old non-owner-`403` test deleted; added missing/empty→`401`, wrong→`401`,
   Auth-JWT-as-service-token→`401`, unknown-group→`404`, old-route→`404` pin;
   kept `200`/`409`/`422`-full/`422`-closed/`400`-empty.

## TDD + gate (workdir `group-service/`)

- RED after test rewrite: `npm test` → pass 11 / fail 7 (all member tests;
  observed as 401s from the Bearer middleware on the not-yet-existing route,
  plus old route still answering — NOT the 404 the brief predicted; see concern 1).
- GREEN after impl: `npm ci && npm run typecheck && npm run build && npm test`
  → exit 0, **pass 18 / fail 0**.
- Smoke on built output (`node dist/server.js`): without `SERVICE_TOKEN` →
  throws `SERVICE_TOKEN must be set`; with it → boots, `GET /health` → `ok`.
- Stray run logs (`red.*`, `green.log`, `gate.log`) deleted; commit stages only
  the 4 briefed files.

## Concerns (read before Task 3 / member-4 handoff)

1. **Placement deviates from one word of the brief — deliberately.** The brief says
   "placed AFTER the Bearer-auth middleware", but every testable expectation in
   the same brief (helper sends ONLY `x-service-token`, RED = 404, `200`s with the
   service token alone) plus the spec (§112: Membership calls with X-Service-Token,
   no user JWT mentioned) requires the internal route to work WITHOUT a user
   Bearer. Placing it after `app.use(auth)` would force member 4 to also hold a
   valid user JWT (service-to-service breakage) and made RED come out 401, not 404
   (verified empirically). So the route sits between `/health` and the Bearer
   middleware: service-token-only gate, Bearer middleware byte-for-byte untouched,
   all `/api` reads/writes still need user JWT. If the team truly wants BOTH
   tokens on the internal route, say so — it is a one-block move, but it changes
   the member-4 contract and 6 tests.
2. **CORS `Access-Control-Allow-Headers` still lists only `Authorization,
   Content-Type`** (handler untouched per constraints). Service-to-service calls
   don't need CORS, but any browser-based caller of the internal route would fail
   preflight — Task 3 should keep documenting it as server-to-server only.
3. Minor test authoring trap hit during RED→GREEN: passing explicit `undefined`
   to the `postMember` helper triggers its default parameter (sent the real
   token, got 200 instead of 401). The missing-header case now uses a raw
   header-less `fetch`; empty-string goes through the helper. No impl impact.
