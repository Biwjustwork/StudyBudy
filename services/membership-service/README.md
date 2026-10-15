# Study Buddy Membership Service

Membership API owned by member 4. It stores join requests, permits only the group owner to list or decide them, and reserves seats through the Group Service rather than editing Group data locally.

When someone submits a join request, Membership persists a `request_received` notification for the group owner, including the group ID so the frontend can open that group's request list. Failed delivery remains queued in Membership and is retried when the service starts again.

## API

All `/api` endpoints require an Auth Service JWT signed with HS256 and containing a non-empty `userId` and an unexpired `exp` claim. Auth Service currently issues expiring tokens (default `JWT_EXPIRES_IN=1h`); Membership rejects tokens with no expiration.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/health` | Liveness check |
| POST | `/api/requests` | Body `{ "groupId": "..." }`; creates a `pending` request from the token user; `201` |
| GET | `/api/requests?groupId=...` | Group owner only; returns requests in creation order |
| GET | `/api/groups/:id/members` | Authenticated group display-name list with owner flag; does not return email or user ID |
| POST | `/api/requests/:id/approve` | Owner only; reserves a Group seat before marking the request `approved` |
| POST | `/api/requests/:id/reject` | Owner only; marks a pending request `rejected` |
| DELETE | `/api/groups/:id` | Owner only; deletes a group only when the owner is its sole member and no request is pending (`204`; otherwise `409`) |
| DELETE | `/api/groups/:id/leave` | A non-owner member leaves a group (`204`); owners must delete their group instead |
| DELETE | `/api/groups/:id/members/:memberId` | Group owner removes a non-owner member (`204`); non-owners receive `403` |

Only one pending request is allowed per `(groupId, requesterId)`; after rejection, the requester may apply again. Owner request lists include `requesterName` and `requesterEmail`, resolved from Profile Service; the requester ID remains available as a technical field. A full or closed group returns `422`; repeated pending requests or decisions return `409`. A decision response includes `notificationStatus` (`sent` or `pending`) and, if pending, a `notificationLastError` to make an undelivered event visible.

## Cross-service behavior and recovery

- **Group Service:** Membership reads group details with the owner’s bearer token, then reserves a seat with `POST /internal/groups/:id/members` and `X-Service-Token: SERVICE_TOKEN`. The token value must match Group Service’s `SERVICE_TOKEN`. Membership never edits Group data directly.
- **Profile Service:** Membership resolves requester display names and email addresses through `POST /internal/users/lookup` only after confirming the caller is the group owner. For the group member list, it uses `POST /internal/users/display-names` and returns names only; the service token stays between backend services.
- **Recoverable approval:** Before calling Group, Membership durably records `approvalState: "reserving"`. After Group confirms the reservation, it durably records `approvalState: "reserved"` before changing the request to `approved`. If writing the final request decision fails after Group added the member, retry checks the authoritative group membership and finalizes the same request without adding the member again.
- **Notification Service:** On request creation, Membership saves a `request_received` event addressed to the group owner with `groupId`; on approval/rejection it saves the result event addressed to the requester. A `201` or idempotent `200` marks each event sent. Errors remain pending with their last error recorded; a startup and 30-second retry worker resends the same payload, which Notification deduplicates.
- JSON-file persistence is designed for one process/replica per service, as specified in the shared contract. Give Membership, Group, and Notification separate persistent data volumes when running in containers.

## Contract compatibility

The service is wired to the current Group and Notification contracts in the repository. Group reads use the owner’s JWT; seat reservation uses `POST /internal/groups/:id/members` with Group’s `SERVICE_TOKEN`. Notification delivery uses `POST /internal/notifications` with the shared `NOTIFY_SERVICE_TOKEN`. Notification accepts idempotent `200` retries as well as first-delivery `201` responses.

## Run locally

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

Set `AUTH_TOKEN_SECRET` to the same secret as Auth Service (at least 32 characters), `GROUP_URL`, `PROFILE_URL`, and `NOTIFY_URL` to the peer service base URLs, `SERVICE_TOKEN` to Group’s `SERVICE_TOKEN`, `PROFILE_SERVICE_TOKEN` to Profile’s shared service token, and `NOTIFY_SERVICE_TOKEN` to Notification’s shared service token. Do not commit `.env` or real tokens. Request data is stored in `MEMBERSHIP_DATA_FILE` (default `./data/requests.json`).

For containers, use service DNS names on the shared Docker network rather than `localhost` for `GROUP_URL` and `NOTIFY_URL`.

Open `membership.html` in a browser to submit a request or manage requests as the group owner. Enter the Membership API URL and a bearer token; the page does not save the token. Error responses are shown to the user.

## Tests and build

```powershell
npm run typecheck
npm run build
npm test
docker build -t study-buddy-membership:local .
```
