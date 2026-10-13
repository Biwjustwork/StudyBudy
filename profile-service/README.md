# Study Buddy Profile & Subject Service

Profile API owned by member 2. It stores each user's basic profile and subject interests, supports subject search, validates changes, and protects profile reads/updates with the shared Auth Service JWT.

## Run locally

```powershell
Copy-Item .env.example .env
npm install
npm run dev
```

Set `AUTH_TOKEN_SECRET` to the same secret used by Auth Service. The service expects HS256 tokens with a `userId` claim. Do not commit `.env` or use a real secret in it. `PROFILE_DATA_FILE` defaults to `./data/profiles.json`; the JSON array is atomically updated and excluded from Git.

The service does not create accounts. Auth/user provisioning must add records to the profile data file (shape: `{ "id": "...", "name": "...", "email": "optional", "subjects": [] }`) when a user is created. Coordinate this ownership/initialization contract with member 1 before integration.

## API

All `/api` routes require `Authorization: Bearer <token>`. Profile GET/PUT only allow the authenticated user's own ID; the service never trusts a user ID in the request body. Errors use `{ "error": "...", "message": "..." }`.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/health` | Liveness check |
| GET | `/api/users/:id` | Read own profile and subjects; 404 if absent |
| PUT | `/api/users/:id` | Replace own subject list, e.g. `{ "subjects": ["Biology", "Calculus"] }` |
| GET | `/api/users/search?subject=Biology` | Find profiles interested in a subject; returns `[]` when none match |

Subject names are trimmed, must be non-empty strings, and may not repeat (case-insensitive). Status codes: 400 invalid input, 401 missing/invalid/expired token, 403 another user's profile, 404 unknown user, 200 success.

## Commands

```sh
npm run typecheck
npm run build
npm test
docker build -t study-buddy-profile:local .
```
