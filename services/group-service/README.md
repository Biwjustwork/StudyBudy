# Study Buddy Group Service

Group API owned by member 3. It stores each study group's subject, topic, meeting time, capacity, and member list, supports subject search with an open-seats filter, lets only the group owner edit groups, reserves seats for the Membership Service via a service-token internal route, and protects all `/api` routes with the shared Auth Service JWT.

```
services/group-service/
  src/
    server.ts       # env wiring only (PORT, AUTH_TOKEN_SECRET, SERVICE_TOKEN, GROUP_DATA_FILE)
    app.ts          # HTTP/auth/validation/status; createApp(store, tokenSecret, serviceToken)
    group-store.ts  # Group type + Map store + atomic JSON persist + atomic addMember
    app.test.ts     # 18 endpoint tests (fetch + ephemeral port)
  groups.html       # Real UI: full CRUD against the live Group API
  groups-mock.html  # Mock UI: in-memory demo groups + live Profile API lookup
  Dockerfile        # node:22-alpine, EXPOSE 3003
  .env.example      # PORT, AUTH_TOKEN_SECRET, SERVICE_TOKEN, GROUP_DATA_FILE (no real secrets)
```

A group looks like `{ "id": "...", "subject": "Calculus", "topic": "Limits", "startsAt": "2026-11-01T10:00:00+07:00", "maxMembers": 5, "location": "Library 3F", "ownerId": "user-1", "members": ["user-1"], "isOpen": true, "createdAt": "...", "updatedAt": "..." }`.

## API

All `/api` routes require `Authorization: Bearer <token>`. The owner is always taken from the token's `userId` claim; the service never trusts `ownerId`/`userId` in the request body. Errors use `{ "error": "...", "message": "..." }` where `error` is one of `validation_error|unauthorized|forbidden|not_found|conflict|capacity_exceeded`.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/health` | Liveness check, no token needed |
| POST | `/api/groups` | Create a group; owner/member seeded from token; `201` on success |
| GET | `/api/groups?subject=Calculus&openOnly=true` | List groups sorted by `startsAt` ascending; `subject` matches case-insensitively after trimming (omit/blank = all groups); `openOnly=true` keeps only `isOpen` groups with free seats |
| GET | `/api/groups/:id` | Read one group; 404 if absent |
| PATCH | `/api/groups/:id` | Owner-only partial update of `subject/topic/startsAt/location/maxMembers/isOpen`; 403 for non-owners |
| DELETE | `/internal/groups/:id` | Membership Service only, via `x-service-token`; deletes a group only when the owner is its sole member; `204` on success and `409` if other members remain |
| DELETE | `/internal/groups/:id/members` | Membership Service only, via `x-service-token`; removes the specified non-owner member using `{ "userId": "..." }`; `204` on success |
| POST | `/internal/groups/:id/members` | Server-to-server seat reservation with header `x-service-token: $SERVICE_TOKEN` ONLY (no Bearer); see member-4 contract below |

```powershell
$token = "<token from Auth Service>"
$headers = @{ Authorization = "Bearer $token" }

# Create (201)
Invoke-RestMethod http://localhost:3003/api/groups -Method POST -ContentType "application/json" `
  -Headers $headers -Body '{"subject":"Calculus","topic":"Limits","startsAt":"2026-11-01T10:00:00+07:00","maxMembers":5,"location":"Library 3F"}'

# Search open Calculus groups
Invoke-RestMethod "http://localhost:3003/api/groups?subject=Calculus&openOnly=true" -Headers $headers

# Owner edits topic
Invoke-RestMethod http://localhost:3003/api/groups/<id> -Method PATCH -ContentType "application/json" `
  -Headers $headers -Body '{"topic":"Derivatives"}'

# Owner reserves a seat (member-4 approve flow, server-to-server — no Bearer)
Invoke-RestMethod http://localhost:3003/internal/groups/<id>/members -Method POST -ContentType "application/json" `
  -Headers @{ "x-service-token" = $env:SERVICE_TOKEN } -Body '{"userId":"user-2"}'
```

```sh
# curl equivalents
curl -X POST localhost:3003/api/groups -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"subject":"Calculus","topic":"Limits","startsAt":"2026-11-01T10:00:00+07:00","maxMembers":5,"location":"Library 3F"}'
curl "localhost:3003/api/groups?subject=Calculus&openOnly=true" -H "Authorization: Bearer $TOKEN"
curl -X PATCH localhost:3003/api/groups/<id> -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"topic":"Derivatives"}'
# Server-to-server seat reservation (no Bearer — x-service-token only)
curl -X POST localhost:3003/internal/groups/<id>/members -H "x-service-token: $SERVICE_TOKEN" -H "Content-Type: application/json" \
  -d '{"userId":"user-2"}'
```

## Validation and status codes

`subject/topic/startsAt/location` are trimmed and must be non-empty strings. `startsAt` must be a valid ISO 8601 string with an explicit timezone suffix (`Z` in either case, or `±hh` / `±hhmm` / `±hh:mm`), so `2026-11-01T10:00:00` without a suffix is rejected, as are `2026-13-99` and `tomorrow` and must be in the future — past dates return 400. `maxMembers` must be a positive integer (`0`, negatives, `2.5`, and `"5"` are all rejected) on both POST and PATCH, and PATCH may not shrink `maxMembers` below the current `members.length`. `isOpen` is optional (defaults `true`) and must be a boolean when present. PATCH requires at least one updatable field and can never change `id/ownerId/members/createdAt`. `POST /internal/groups/:id/members` requires a non-empty string `userId` and header `x-service-token: $SERVICE_TOKEN` (no Bearer).

| Status | Meaning |
| --- | --- |
| 200 | GET/PATCH/member-add success |
| 201 | POST create success |
| 400 | Invalid input (`validation_error`), including bad/non-future `startsAt` and bad `maxMembers` |
| 401 | Missing/invalid/expired token, or token without a `userId` claim (`unauthorized`) |
| 403 | Authenticated but not the group owner (`forbidden`) |
| 404 | Unknown group id (`not_found`) |
| 409 | `userId` already a member (`conflict`) |
| 422 | Group full or closed for new members (`capacity_exceeded`) |

## Run locally

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

Set `AUTH_TOKEN_SECRET` to the same secret used by Auth Service. The service expects HS256 tokens with a `userId` claim. Do not commit `.env` or use a real secret in it. `GROUP_DATA_FILE` defaults to `./data/groups.json`; the JSON array is atomically updated (write-queue + rename) and excluded from Git. The service listens on `PORT` (default `3003`).

Frontend URLs are never hardcoded: both HTML pages take the API base URL from an input field (defaulting to `http://localhost:3003` / `http://localhost:3002`), and no token or secret is stored in code.

## UI guide: real vs mock

Use `groups.html` (real) when the Group backend is running: it does the full project flow — create group, search by subject + `openOnly`, list with `seats n/m` and `เปิดรับ/เต็ม/ปิดรับ` status, view details by id, and PATCH topic/location. Enter the Group API URL and a Bearer token, then work top to bottom.

Use `groups-mock.html` (mock) when the Group backend is not running or for a quick demo: it never calls the Group API. It fetches real interested users from the Profile Service (`GET {PROFILE_URL}/api/users/search?subject=`, port 3002) with your token, filters three in-memory demo groups (open / full / closed) with the same case-insensitive + `openOnly` logic as the real `GET /api/groups`, and offers "copy seed JSON" — stripped create payloads you can `POST` to the real API later. A banner states `MOCK — ไม่เขียน backend จริง`.

| Situation | Page to open |
| --- | --- |
| Group service running on :3003, do the real flow | `groups.html` |
| Group service down, demo the flow or prepare seed data | `groups-mock.html` (+ Profile service on :3002 for the people list) |
| Verify mock filter matches real filter | Compare `filterGroups` in `groups-mock.html` with `GET /api/groups` in `src/app.ts` — same trim/lowercase/openOnly/sort rules |

## Contract for member 4 (Membership Service)

The Group Store owns `members[]`. When member 4 approves a join request, the Membership Service must reserve the seat via this server-to-server endpoint — never by editing members directly, and never with a Bearer token:

`POST /internal/groups/:id/members` with `{ "userId": "<approved-user>" }`, called with header `x-service-token: $SERVICE_TOKEN` ONLY (no Bearer). The reservation is atomic (read-check-mutate in one tick, no `await` in between), so two concurrent approvals for the last seat yield exactly one `200` and one `422`. The shared secret lives in env `SERVICE_TOKEN` (see `.env.example` line 4).

| Approval outcome | Group API response | Member 4 must reply to the request with |
| --- | --- | --- |
| Seat reserved | `200` + updated group | approve success |
| User already a member | `409 { "error": "conflict" }` | 409 (duplicate request) |
| Group full (`members.length >= maxMembers`) or closed (`isOpen: false`) | `422 { "error": "capacity_exceeded" }` | 422 (group full-or-closed) |
| Unknown group | `404 { "error": "not_found" }` | 404 |
| Missing/wrong service token | `401 { "error": "unauthorized" }` | 401 (bad service token) |

```sh
curl -X POST localhost:3003/internal/groups/<groupId>/members \
  -H "x-service-token: $SERVICE_TOKEN" -H "Content-Type: application/json" \
  -d '{"userId":"user-2"}'
# 200 → { ..., "members": ["owner","user-2"] }
# 409 → { "error": "conflict", "message": "User is already a member of this group" }
# 422 → { "error": "capacity_exceeded", "message": "Group is full" } (or "Group is closed for new members")
```

## Commands

```sh
npm run typecheck
npm run build
npm test
docker build -t study-buddy-group:local .
```

Tests live in `src/app.test.ts` (18 tests: health, auth shape, create + owner-from-token, create 400s incl. no-timezone + legacy-field, search openOnly, get-by-id, owner PATCH + deleted-route 404, shrink/bad-startsAt 400s, internal add 200/duplicate-409/full-422/closed-422, service-token 401s incl. missing/empty/wrong/JWT-as-token, unknown-group 404, empty-userId 400, persist-recovery). CI should run install → typecheck → build → unit test → `docker build` on every pull request. Release images use tag `v1.0.0`, e.g. `docker build -t study-buddy-group:v1.0.0 .`.
