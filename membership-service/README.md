# Study Buddy Membership Service

Membership API owned by member 4. It stores join requests, permits only the group owner to list or decide them, and reserves seats through the Group Service rather than editing Group data locally.

## API

All `/api` endpoints require an Auth Service JWT with an HS256 `userId` claim.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/health` | Liveness check |
| POST | `/api/requests` | Body `{ "groupId": "..." }`; creates a `pending` request from the token user; `201` |
| GET | `/api/requests?groupId=...` | Group owner only; returns requests in creation order |
| POST | `/api/requests/:id/approve` | Owner only; reserves a Group seat before marking the request `approved` |
| POST | `/api/requests/:id/reject` | Owner only; marks a pending request `rejected` |

Requests are unique per `(groupId, requesterId)`, including after a decision. A full or closed group returns `422`; repeated requests or decisions return `409`. If Group Service rejects or cannot complete a reservation, the request remains pending. Concurrent decisions in one Membership Service process are locked so they cannot reserve the same request twice.

## Cross-service dependencies and handoff

- **Group Service (member 3):** `GROUP_URL` is configured for the delivered service. This branch currently supports `GET /api/groups/:id` and owner-authorized `POST /api/groups/:id/members`, forwarding the requesting owner's bearer token. Membership never writes `members[]`.
- **Contract mismatch to resolve before merge:** The API contract draft on `feature/auth-service` instead specifies `POST /internal/groups/:id/members` with `X-Service-Token`. The delivered Group Service on `Biw-dev` does not implement that internal endpoint. This branch follows the delivered Group API; the service owners should reconcile the endpoint/auth contract before merging the branches.
- **Notification Service (member 5):** No Notification Service is present on this base branch. `NOTIFY_URL` and `NOTIFY_SERVICE_TOKEN` are intentionally blank, and notification dispatch/retry code is intentionally not implemented. A decided request stores `notificationStatus: "pending"` so the event can be reconstructed after the notification contract is delivered. Member 5 should provide endpoint, auth header, event schema, and retry/duplicate semantics before this dependency is filled in.

The absent Notification integration is a known handoff item, not a successful notification delivery. The membership API reports the saved request decision and leaves the event pending until that dependency is implemented.

## Run locally

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

Set `AUTH_TOKEN_SECRET` to the Auth Service secret and `GROUP_URL` to the Group Service base URL. Do not commit `.env` or real tokens. Request data is stored in `MEMBERSHIP_DATA_FILE` (default `./data/requests.json`).

Open `membership.html` in a browser to submit a request or manage requests as the group owner. Enter the Membership API URL and a bearer token; the page does not save the token. Error responses are shown to the user.

## Tests and build

```powershell
npm run typecheck
npm run build
npm test
docker build -t study-buddy-membership:local .
```
