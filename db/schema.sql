-- twinplane-backend schema. Apply once via:
--   psql "$DATABASE_URL" -f db/schema.sql
--
-- Every date-shaped column is TEXT ("YYYY-MM-DD"), not DATE: node-postgres
-- returns DATE as a JS Date object, which would silently break the pure
-- logic functions in src/logic/ (e.g. planGeneration.js's
-- `a.dueDate === dateStr` string equality) since those are ported 1:1 from
-- the frontend mock and assume plain wire-format date strings.

CREATE TABLE students (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  -- Exactly one auth method per account: password_hash for username/password
  -- accounts, oauth_provider+oauth_id for Kakao/Google signup -- see
  -- src/routes/auth.js and src/data/newAccountDefaults.js.
  password_hash TEXT,
  oauth_provider TEXT, -- 'kakao' | 'google' | NULL
  oauth_id TEXT, -- provider's user id, NULL for password accounts
  name TEXT NOT NULL,
  grade_level TEXT NOT NULL,
  wake_up_time TEXT NOT NULL,
  bed_time TEXT NOT NULL,
  preferred_study_start_time TEXT NOT NULL,
  max_self_study_minutes INT NOT NULL,
  max_concentration_minutes INT NOT NULL,
  condition TEXT NOT NULL DEFAULT 'normal',
  condition_memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT students_exactly_one_auth_method CHECK (
    (password_hash IS NOT NULL AND oauth_provider IS NULL AND oauth_id IS NULL) OR
    (password_hash IS NULL AND oauth_provider IS NOT NULL AND oauth_id IS NOT NULL)
  )
);
CREATE UNIQUE INDEX students_oauth_identity_uidx ON students (oauth_provider, oauth_id) WHERE oauth_provider IS NOT NULL;

CREATE TABLE subject_levels (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  level TEXT NOT NULL,
  recent_achievement_rate NUMERIC NOT NULL,
  average_delay_minutes INT NOT NULL,
  average_actual_minutes INT NOT NULL,
  recent_incomplete_count INT NOT NULL,
  UNIQUE (student_id, subject)
);

CREATE TABLE fixed_schedules (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  type TEXT NOT NULL
);

CREATE TABLE assignments (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  title TEXT NOT NULL,
  due_date TEXT NOT NULL,
  estimated_minutes INT NOT NULL,
  priority TEXT NOT NULL,
  required BOOLEAN NOT NULL,
  evidence_required BOOLEAN NOT NULL,
  scope TEXT
);

CREATE TABLE incomplete_plans (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  title TEXT NOT NULL,
  original_date TEXT NOT NULL,
  estimated_minutes INT NOT NULL,
  completion_rate NUMERIC NOT NULL,
  reason TEXT NOT NULL,
  priority TEXT NOT NULL
);

CREATE TABLE exams (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  exam_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  exam_date TEXT NOT NULL,
  scope TEXT,
  importance TEXT NOT NULL
);

CREATE TABLE recent_performance (
  student_id INT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  daily_achievement_rate_7days NUMERIC NOT NULL,
  weekly_achievement_rate NUMERIC NOT NULL,
  consecutive_completion_days INT NOT NULL,
  most_completed_subject TEXT NOT NULL,
  least_completed_subject TEXT NOT NULL,
  average_start_delay_minutes INT NOT NULL
);

CREATE TABLE parent_settings (
  student_id INT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  plan_approval_mode TEXT NOT NULL,
  max_daily_study_minutes INT NOT NULL,
  allow_plan_auto_adjustment BOOLEAN NOT NULL,
  allow_student_time_change BOOLEAN NOT NULL,
  allow_student_quantity_change BOOLEAN NOT NULL,
  require_parent_approval_for_required_plan_deletion BOOLEAN NOT NULL
);

CREATE TABLE sticker_policies (
  student_id INT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  required_plan_completion INT NOT NULL,
  recommended_plan_completion INT NOT NULL,
  on_time_bonus INT NOT NULL,
  daily_achievement_80_bonus INT NOT NULL,
  all_required_completion_bonus INT NOT NULL
);

CREATE TABLE allowance_policies (
  student_id INT PRIMARY KEY REFERENCES students(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL,
  period TEXT NOT NULL,
  parent_approval_required BOOLEAN NOT NULL
);

CREATE TABLE allowance_conditions (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  achievement_rate NUMERIC NOT NULL,
  amount INT NOT NULL,
  sort_order INT NOT NULL
);

-- One row per student+date. JSONB holds the envelope only (everything
-- except dailyPlans[] itself) -- plan_items is the single source of truth
-- for items, so modifying an item never risks drifting from a duplicate
-- copy embedded here.
CREATE TABLE daily_plans (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  plan_date TEXT NOT NULL,
  plan_summary JSONB NOT NULL,
  generation_reasons JSONB NOT NULL,
  student_message JSONB NOT NULL,
  parent_message JSONB NOT NULL,
  reward_forecast JSONB NOT NULL,
  carry_over_decisions JSONB NOT NULL,
  warnings JSONB NOT NULL,
  validation JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, plan_date)
);

-- student_id/plan_date are denormalized (not just reachable via
-- daily_plan_id) so POST /api/plans/modify can resolve a client-supplied
-- item id with a single indexed lookup scoped to the authenticated
-- student, instead of a join. UNIQUE is per (daily_plan_id, client_id),
-- NOT globally on client_id -- ids like "plan-2" are reused every day by
-- design (see planGeneration.js), so global uniqueness would be wrong.
CREATE TABLE plan_items (
  id SERIAL PRIMARY KEY,
  daily_plan_id INT NOT NULL REFERENCES daily_plans(id) ON DELETE CASCADE,
  student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  plan_date TEXT NOT NULL,
  client_id TEXT NOT NULL,
  sequence INT NOT NULL,
  item JSONB NOT NULL,
  UNIQUE (daily_plan_id, client_id)
);
CREATE INDEX plan_items_student_client_idx ON plan_items (student_id, client_id, plan_date DESC);

CREATE TABLE daily_reviews (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  review_date TEXT NOT NULL,
  achievement JSONB NOT NULL,
  subject_results JSONB NOT NULL,
  completed_well JSONB NOT NULL,
  improvement_points JSONB NOT NULL,
  student_message TEXT NOT NULL,
  parent_message TEXT NOT NULL,
  reward_result JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, review_date)
);

-- One row per generated comprehension-check attempt. plan_item_client_id is
-- the PlanItem.id ("plan-7" etc.) that triggered generation, stored for
-- traceability only -- not FK'd from anywhere else, same reasoning as why
-- plan_items.client_id isn't globally unique. No uniqueness constraint on
-- (student_id, plan_item_client_id): re-takes are unlimited by design.
CREATE TABLE assessments (
  id SERIAL PRIMARY KEY,
  student_id INT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  plan_item_client_id TEXT NOT NULL,
  subject TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'generated', -- 'generated' | 'submitted'
  score INT,
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX assessments_student_idx ON assessments (student_id, created_at DESC);

-- correct_answer/explanation are read here but only ever serialized into a
-- response once the assessment is submitted -- see src/routes/assessments.js.
CREATE TABLE assessment_questions (
  id SERIAL PRIMARY KEY,
  assessment_id INT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  sequence INT NOT NULL,
  question_type TEXT NOT NULL, -- 'multiple_choice' | 'short_answer'
  question_text TEXT NOT NULL,
  choices JSONB NOT NULL DEFAULT '[]',
  correct_answer TEXT NOT NULL,
  explanation TEXT NOT NULL,
  UNIQUE (assessment_id, sequence)
);

-- UNIQUE(question_id) makes the submit handler idempotent (ON CONFLICT),
-- safe to retry/resubmit.
CREATE TABLE assessment_answers (
  id SERIAL PRIMARY KEY,
  assessment_id INT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  question_id INT NOT NULL REFERENCES assessment_questions(id) ON DELETE CASCADE,
  student_answer TEXT NOT NULL,
  is_correct BOOLEAN NOT NULL,
  feedback TEXT NOT NULL,
  UNIQUE (question_id)
);
