// One-time seed for the 3 demo student accounts. Re-running is safe --
// each student is skipped (not duplicated) if its username already exists.
//
//   node scripts/seed.js
//
// Reuses the existing mock dataset's subject/schedule/assignment/exam/
// policy values (src/data/studentDataset.js + src/data/stubs.js) so seeded
// behavior stays directly comparable to what was already verified against
// the mock and the old in-memory backend. Assignment/exam/incomplete-plan
// dates are computed relative to "today" (whenever this script actually
// runs) instead of reusing the mock's hardcoded 2026-07-2x strings, so
// "due today" / exam-proximity logic in planGeneration.js stays meaningful
// no matter when someone logs in and actually uses the app.
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../src/db/pool');
const { dataset } = require('../src/data/studentDataset');

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function buildStudentSeed({ username, password, name, gradeLevel }) {
  return {
    username,
    password,
    student: {
      name,
      gradeLevel,
      wakeUpTime: dataset.student.wakeUpTime,
      bedTime: dataset.student.bedTime,
      preferredStudyStartTime: dataset.student.preferredStudyStartTime,
      maxSelfStudyMinutes: dataset.student.maxSelfStudyMinutes,
      maxConcentrationMinutes: dataset.student.maxConcentrationMinutes,
      condition: dataset.student.condition,
      conditionMemo: dataset.student.conditionMemo,
    },
    subjectLevels: dataset.subjectLevels,
    fixedSchedules: dataset.fixedSchedules,
    assignments: [
      { subject: '영어', title: '영어 단어 25개', dueDate: addDays(0), estimatedMinutes: 25, priority: 'high', required: true, evidenceRequired: false },
      { subject: '수학', title: '유형 문제집 42~45쪽', dueDate: addDays(1), estimatedMinutes: 45, priority: 'high', required: true, evidenceRequired: true },
      { subject: '과학', title: '수행평가 자료 조사', dueDate: addDays(2), estimatedMinutes: 30, priority: 'high', required: true, evidenceRequired: false },
    ],
    incompletePlans: [
      { subject: '수학', title: '오답 10문제 복습', originalDate: addDays(-1), estimatedMinutes: 30, completionRate: 0, reason: '피곤해서 시작하지 못함', priority: 'normal' },
    ],
    exams: [
      { examName: '2학기 수학 단원평가', subject: '수학', examDate: addDays(8), scope: '일차함수', importance: 'high' },
    ],
    recentPerformance: dataset.recentPerformance,
    parentSettings: dataset.parentSettings,
    stickerPolicy: dataset.stickerPolicy,
    allowancePolicy: dataset.allowancePolicy,
  };
}

const SEEDS = [
  buildStudentSeed({ username: 'jiyoon', password: '5447', name: '지윤', gradeLevel: 'MIDDLE_2' }),
  buildStudentSeed({ username: 'jiho', password: '5447', name: '김지호', gradeLevel: 'ELEMENTARY_6' }),
  buildStudentSeed({ username: 'jia', password: '5447', name: '김지아', gradeLevel: 'ELEMENTARY_6' }),
];

async function insertStudent(client, seed) {
  const passwordHash = await bcrypt.hash(seed.password, 10);
  const s = seed.student;
  const { rows } = await client.query(
    `INSERT INTO students
       (username, password_hash, name, grade_level, wake_up_time, bed_time,
        preferred_study_start_time, max_self_study_minutes, max_concentration_minutes,
        condition, condition_memo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     RETURNING id`,
    [
      seed.username,
      passwordHash,
      s.name,
      s.gradeLevel,
      s.wakeUpTime,
      s.bedTime,
      s.preferredStudyStartTime,
      s.maxSelfStudyMinutes,
      s.maxConcentrationMinutes,
      s.condition,
      s.conditionMemo,
    ],
  );
  const studentId = rows[0].id;

  for (const sl of seed.subjectLevels) {
    await client.query(
      `INSERT INTO subject_levels (student_id, subject, level, recent_achievement_rate, average_delay_minutes, average_actual_minutes, recent_incomplete_count)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [studentId, sl.subject, sl.level, sl.recentAchievementRate, sl.averageDelayMinutes, sl.averageActualMinutes, sl.recentIncompleteCount],
    );
  }

  for (const fs of seed.fixedSchedules) {
    await client.query(
      `INSERT INTO fixed_schedules (student_id, title, start_time, end_time, type) VALUES ($1,$2,$3,$4,$5)`,
      [studentId, fs.title, fs.startTime, fs.endTime, fs.type],
    );
  }

  for (const a of seed.assignments) {
    await client.query(
      `INSERT INTO assignments (student_id, subject, title, due_date, estimated_minutes, priority, required, evidence_required)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [studentId, a.subject, a.title, a.dueDate, a.estimatedMinutes, a.priority, a.required, a.evidenceRequired],
    );
  }

  for (const ip of seed.incompletePlans) {
    await client.query(
      `INSERT INTO incomplete_plans (student_id, subject, title, original_date, estimated_minutes, completion_rate, reason, priority)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [studentId, ip.subject, ip.title, ip.originalDate, ip.estimatedMinutes, ip.completionRate, ip.reason, ip.priority],
    );
  }

  for (const e of seed.exams) {
    await client.query(
      `INSERT INTO exams (student_id, exam_name, subject, exam_date, scope, importance) VALUES ($1,$2,$3,$4,$5,$6)`,
      [studentId, e.examName, e.subject, e.examDate, e.scope, e.importance],
    );
  }

  const rp = seed.recentPerformance;
  await client.query(
    `INSERT INTO recent_performance (student_id, daily_achievement_rate_7days, weekly_achievement_rate, consecutive_completion_days, most_completed_subject, least_completed_subject, average_start_delay_minutes)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [studentId, rp.dailyAchievementRate7Days, rp.weeklyAchievementRate, rp.consecutiveCompletionDays, rp.mostCompletedSubject, rp.leastCompletedSubject, rp.averageStartDelayMinutes],
  );

  const ps = seed.parentSettings;
  await client.query(
    `INSERT INTO parent_settings (student_id, plan_approval_mode, max_daily_study_minutes, allow_plan_auto_adjustment, allow_student_time_change, allow_student_quantity_change, require_parent_approval_for_required_plan_deletion)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [studentId, ps.planApprovalMode, ps.maxDailyStudyMinutes, ps.allowPlanAutoAdjustment, ps.allowStudentTimeChange, ps.allowStudentQuantityChange, ps.requireParentApprovalForRequiredPlanDeletion],
  );

  const sp = seed.stickerPolicy;
  await client.query(
    `INSERT INTO sticker_policies (student_id, required_plan_completion, recommended_plan_completion, on_time_bonus, daily_achievement_80_bonus, all_required_completion_bonus)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [studentId, sp.requiredPlanCompletion, sp.recommendedPlanCompletion, sp.onTimeBonus, sp.dailyAchievement80Bonus, sp.allRequiredCompletionBonus],
  );

  const ap = seed.allowancePolicy;
  await client.query(
    `INSERT INTO allowance_policies (student_id, enabled, period, parent_approval_required) VALUES ($1,$2,$3,$4)`,
    [studentId, ap.enabled, ap.period, ap.parentApprovalRequired],
  );
  for (let i = 0; i < ap.conditions.length; i++) {
    const c = ap.conditions[i];
    await client.query(
      `INSERT INTO allowance_conditions (student_id, achievement_rate, amount, sort_order) VALUES ($1,$2,$3,$4)`,
      [studentId, c.achievementRate, c.amount, i],
    );
  }

  return studentId;
}

async function main() {
  const client = await pool.connect();
  try {
    for (const seed of SEEDS) {
      const existing = await client.query('SELECT id FROM students WHERE username = $1', [seed.username]);
      if (existing.rows.length > 0) {
        console.log(`skip: ${seed.username} already exists (id=${existing.rows[0].id})`);
        continue;
      }
      await client.query('BEGIN');
      try {
        const id = await insertStudent(client, seed);
        await client.query('COMMIT');
        console.log(`created: ${seed.username} (${seed.student.name}) -> id=${id}`);
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
