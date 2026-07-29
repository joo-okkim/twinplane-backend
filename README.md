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

All 9 contract endpoints are implemented, backed by Postgres, with
username/password login gating everything except `POST /api/auth/login`.
The 3 `POST` endpoints run the same rule engine as the frontend mock,
ported line-for-line from the reference implementation:

| Endpoint | Ported from |
|---|---|
| `POST /api/plans/daily` | `lib/services/mock/plan_generation_logic.dart` → `src/logic/planGeneration.js` |
| `POST /api/plans/modify` | `lib/services/mock/modification_logic.dart` → `src/logic/modification.js` |
| `POST /api/reviews/daily` | `lib/services/mock/review_logic.dart` → `src/logic/review.js` |

Multiple students are supported, each with their own real, persisted data
(profile, subjects, assignments, exams, fixed schedules, policies, plan/
review history) — see `db/schema.sql`. `recent_performance` is updated
after every review, so plan generation actually adapts to a student's real
history over time, not just a frozen snapshot. Not yet built: self-serve
registration (`scripts/seed.js` is the only way to create an account today)
and the "AI generates & grades practice problems for a registered
homework/exam scope" idea — `assignments`/`exams` already have a `scope`
column reserved for that.

## Getting started

```bash
npm install
cp .env.example .env   # fill in DATABASE_URL / JWT_SECRET
psql "$DATABASE_URL" -f db/schema.sql
node scripts/seed.js   # creates jiyoon/jiho/jia demo accounts
npm run dev
```

Server starts on `http://localhost:4000` (override with `PORT`, see
`.env.example`).

## Project structure

```
src/
  index.js                  Express app entry: dotenv, cors, route mounting
  db/pool.js                pg.Pool from DATABASE_URL
  middleware/auth.js        Verifies Authorization: Bearer <token>, sets req.studentId
  middleware/asyncHandler.js Wraps async route handlers so rejections reach the error handler
  routes/                   One file per resource (auth, student, parent, policy, plans, reviews)
  logic/                    Rule engine ported from the frontend mock (planGeneration, modification, review, messageBank) -- pure functions, untouched by the DB migration
  data/studentRepository.js Loads a per-student dataset shaped exactly like the old hardcoded constant; updates recent_performance after each review
  data/planStore.js         Postgres-backed daily_plans/plan_items persistence + modify-by-id lookup
  data/studentDataset.js    Now only a seed-data source (see scripts/seed.js), not read at runtime
  data/stubs.js             Same -- seed-data source only
db/schema.sql                Postgres schema, apply once via psql -f
scripts/seed.js               Creates the 3 demo accounts (safe to re-run, skips existing usernames)
```

## Connecting the Flutter app

Point the frontend at this server and log in as one of the seeded accounts
(`jiyoon`/`jiho`/`jia`, password `5447`):

```bash
flutter run --dart-define=USE_MOCK=false --dart-define=API_BASE_URL=http://localhost:4000
```

See the frontend's API_CONTRACT.md "Switching the app to the real backend"
section.