// Shared "create one fully-populated student row set" logic -- used by
// scripts/seed.js (demo accounts, password auth) and the OAuth signup routes
// (src/routes/auth.js, blank-slate accounts, no password). Extracted from
// scripts/seed.js so both paths insert into the same set of tables the same
// way instead of drifting.
//
// `seed.auth` is exactly one of:
//   { passwordHash }                          -- username/password account
//   { oauthProvider, oauthId }                 -- social-login account
async function insertStudent(client, seed) {
  const s = seed.student;
  const auth = seed.auth;
  const { rows } = await client.query(
    `INSERT INTO students
       (username, password_hash, oauth_provider, oauth_id, name, grade_level, wake_up_time, bed_time,
        preferred_study_start_time, max_self_study_minutes, max_concentration_minutes,
        condition, condition_memo)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [
      seed.username,
      auth.passwordHash ?? null,
      auth.oauthProvider ?? null,
      auth.oauthId ?? null,
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

module.exports = { insertStudent };