# Study Buddy Profile & Subject Service

Profile API owned by member 2. It stores each user's basic profile and subject interests, supports subject search, validates changes, and protects profile reads/updates with the shared Auth Service JWT.

## Run locally

```powershell
Copy-Item .env.example .env
npm ci
npm run dev
```

Set `AUTH_TOKEN_SECRET` to the same secret used by Auth Service. The service expects HS256 tokens with a `userId` claim. Do not commit `.env` or use a real secret in it. `PROFILE_DATA_FILE` defaults to `./data/profiles.json`; the JSON array is atomically updated and excluded from Git.

Auth Service provisions a profile after registration through `POST /internal/users` with `X-Service-Token`. The service creates a record with the same ID as Auth's `userId` and `subjects: []`. Set `PROFILE_SERVICE_TOKEN` to the shared service-to-service secret in both services' runtime environments; never put it in browser code, source files, or `.env.example`. The JSON file is owned and written only by Profile Service; Auth must call the endpoint instead of editing that file.

## API

All `/api` routes require `Authorization: Bearer <token>`. Profile GET/PUT only allow the authenticated user's own ID; the service never trusts a user ID in the request body. Errors use `{ "error": "...", "message": "..." }`.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/health` | Liveness check |
| POST | `/internal/users` | Provision a profile from Auth; requires `X-Service-Token` and `{ "id": "user-123", "name": "Aun", "email": "student@example.com" }` |
| GET | `/api/users/:id` | Read own profile and subjects; 404 if absent |
| PUT | `/api/users/:id` | Replace own subject list, e.g. `{ "subjects": ["Biology", "Calculus"] }` |
| GET | `/api/users/search?subject=Biology` | Find profiles interested in a subject; returns `[]` when none match |

Subject names are trimmed, must be non-empty strings, and may not repeat (case-insensitive). Status codes: 400 invalid input, 401 missing/invalid/expired token, 403 another user's profile, 404 unknown user, 200 success.

For `POST /internal/users`, a new profile returns 201, an identical retry returns 200 with the existing profile, and a reused ID with a different name or email returns 409 without changing the stored profile. Missing/incorrect service token returns 401; invalid fields return 400.

## Commands

```sh
npm run typecheck
npm run build
npm test
docker build -t study-buddy-profile:local .
```

## GitHub Actions CI

The workflow in [profile-service.yml](../../.github/workflows/profile-service.yml) runs on pushes and pull requests that change `services/profile-service/**` or the workflow itself. You can also run **Profile Service CI** manually from the repository's **Actions** tab once the workflow is on the default branch.

Using Node.js 22, it runs `npm ci` → `npm run typecheck` → `npm run build` → `npm test` → `docker build`. A failed step stops the remaining steps. Dependencies are installed from the committed `package-lock.json`, with npm downloads cached between runs. Docker builds use the same lockfile.

No GitHub Secrets are required: tests use temporary fixtures and a test-only JWT secret. The workflow builds a local image named `study-buddy-profile:ci` on the runner; it does not publish an image or deploy the service. Keep `.github/workflows` at the repository root so GitHub can discover it.

Action configuration references: [checkout](https://github.com/actions/checkout) and [setup-node](https://github.com/actions/setup-node).
