# Study Buddy Frontend

Single-page frontend for registration/login and the member 2 profile/subject flow. It uses the Auth and Profile API URLs from Vite environment variables and stores the access token only in the current browser tab's `sessionStorage`. The service-to-service `PROFILE_SERVICE_TOKEN` must never be added here.

## Local development

```sh
Copy-Item .env.example .env
npm install
npm run dev
```

Set `VITE_AUTH_URL` and `VITE_PROFILE_URL` in `.env` to the local service URLs. Vite serves the UI at `http://localhost:5173` by default. Auth endpoints currently used are `POST /api/register`, `POST /api/login`, and `GET /api/me`; Profile endpoints are `GET /api/users/:id`, `PUT /api/users/:id`, and `GET /api/users/search?subject=...`.

## Service Endpoints (Host Ports)

- Auth: `http://localhost:3001`
- Profile: `http://localhost:3002`
- Group: `http://localhost:3003`
- Membership: `http://localhost:3004`
- Notification: `http://localhost:3005`

The API contract is still coordinated by the team. If Auth uses different request or response field names, update `src/main.ts` to match the shared `API_CONTRACT.md` before integrating. Group, membership, and notification pages should be added when their API contracts are ready.
