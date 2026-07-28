# twinplane-backend

Node.js backend for [twinplane](https://github.com/joo-okkim/twinplane), the
AI Teacher Flutter app. Implements the API contract the frontend already
consumes through `HttpAiTeacherRepository`.

**The contract lives in the frontend repo, not here:**
[twinplane/docs/API_CONTRACT.md](https://github.com/joo-okkim/twinplane/blob/main/docs/API_CONTRACT.md)
— every endpoint, JSON shape, and business rule to replicate (load tiers,
modification priority ladder, no-blame review messaging) is documented
there, generated from the real Dart models. Read
[twinplane/docs/PROGRESS.md](https://github.com/joo-okkim/twinplane/blob/main/docs/PROGRESS.md)
for the current handoff status.

## Status

Scaffolding only. The 6 `GET` endpoints return static stub data matching
the contract's example payloads. The 3 `POST` endpoints (plan generation,
plan modification, daily review) return `501` — they need the actual rule
engine, ported from the frontend's reference implementation:

| Endpoint | Reference logic to port |
|---|---|
| `POST /api/plans/daily` | `lib/services/mock/plan_generation_logic.dart` |
| `POST /api/plans/modify` | `lib/services/mock/modification_logic.dart` |
| `POST /api/reviews/daily` | `lib/services/mock/review_logic.dart` |

## Getting started

```bash
npm install
npm run dev
```

Server starts on `http://localhost:4000` (override with `PORT`, see
`.env.example`).

## Project structure

```
src/
  index.js       Express app entry, route mounting
  routes/        One file per resource (student, parent, policy, plans, reviews)
  data/stubs.js  Static example payloads for the GET endpoints
```

## Connecting the Flutter app

Once an endpoint here is real, point the frontend at this server:

```bash
flutter run --dart-define=USE_MOCK=false --dart-define=API_BASE_URL=http://localhost:4000
```

No Flutter code changes needed — see the frontend's API_CONTRACT.md
"Switching the app to the real backend" section.