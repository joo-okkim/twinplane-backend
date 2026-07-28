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

All 9 contract endpoints are implemented. The 6 `GET` endpoints return
static stub data matching the contract's example payloads. The 3 `POST`
endpoints run the same rule engine as the frontend mock, ported line-for-
line from the reference implementation, and verified to match
`API_CONTRACT.md`'s example payloads:

| Endpoint | Ported from |
|---|---|
| `POST /api/plans/daily` | `lib/services/mock/plan_generation_logic.dart` → `src/logic/planGeneration.js` |
| `POST /api/plans/modify` | `lib/services/mock/modification_logic.dart` → `src/logic/modification.js` |
| `POST /api/reviews/daily` | `lib/services/mock/review_logic.dart` → `src/logic/review.js` |

State is an in-memory per-date plan cache (`src/data/planStore.js`,
mirrors `MockAiTeacherRepository._plansByDate`) — fine for local dev
against a single running process, not for production. Not yet built: real
persistence/DB, auth, and the single hardcoded student dataset
(`src/data/studentDataset.js`) staying in sync with a real data source.

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
  index.js              Express app entry, route mounting
  routes/                One file per resource (student, parent, policy, plans, reviews)
  logic/                 Rule engine ported from the frontend mock (planGeneration, modification, review, messageBank)
  data/stubs.js          Static example payloads for the GET endpoints
  data/studentDataset.js The single fixed dummy student dataset the rule engine reasons over
  data/planStore.js      In-memory per-date generated-plan cache
```

## Connecting the Flutter app

Point the frontend at this server:

```bash
flutter run --dart-define=USE_MOCK=false --dart-define=API_BASE_URL=http://localhost:4000
```

No Flutter code changes needed — see the frontend's API_CONTRACT.md
"Switching the app to the real backend" section.