// Assembles the exact same `dataset` shape src/data/studentDataset.js used
// to export as a hardcoded constant, now queried per-student from Postgres.
// src/logic/{planGeneration,modification,review}.js are untouched and take
// this shape as-is -- keep every field name identical to what they expect.
const pool = require('../db/pool');

function mapStudent(row) {
  return {
    studentId: row.id,
    name: row.name,
    gradeLevel: row.grade_level,
    wakeUpTime: row.wake_up_time,
    bedTime: row.bed_time,
    preferredStudyStartTime: row.preferred_study_start_time,
    maxSelfStudyMinutes: row.max_self_study_minutes,
    maxConcentrationMinutes: row.max_concentration_minutes,
    condition: row.condition,
    conditionMemo: row.condition_memo,
  };
}

function mapSubjectLevel(row) {
  return {
    subject: row.subject,
    level: row.level,
    recentAchievementRate: Number(row.recent_achievement_rate),
    averageDelayMinutes: row.average_delay_minutes,
    averageActualMinutes: row.average_actual_minutes,
    recentIncompleteCount: row.recent_incomplete_count,
  };
}

function mapFixedSchedule(row) {
  return { title: row.title, startTime: row.start_time, endTime: row.end_time, type: row.type };
}

function mapAssignment(row) {
  return {
    assignmentId: row.id,
    subject: row.subject,
    title: row.title,
    dueDate: row.due_date,
    estimatedMinutes: row.estimated_minutes,
    priority: row.priority,
    required: row.required,
    evidenceRequired: row.evidence_required,
  };
}

function mapIncompletePlan(row) {
  return {
    planItemId: row.id,
    subject: row.subject,
    title: row.title,
    originalDate: row.original_date,
    estimatedMinutes: row.estimated_minutes,
    completionRate: Number(row.completion_rate),
    reason: row.reason,
    priority: row.priority,
  };
}

function mapExam(row) {
  return { examName: row.exam_name, subject: row.subject, examDate: row.exam_date, scope: row.scope, importance: row.importance };
}

function mapRecentPerformance(row) {
  return {
    dailyAchievementRate7Days: Number(row.daily_achievement_rate_7days),
    weeklyAchievementRate: Number(row.weekly_achievement_rate),
    consecutiveCompletionDays: row.consecutive_completion_days,
    mostCompletedSubject: row.most_completed_subject,
    leastCompletedSubject: row.least_completed_subject,
    averageStartDelayMinutes: row.average_start_delay_minutes,
  };
}

function mapParentSettings(row) {
  return {
    planApprovalMode: row.plan_approval_mode,
    maxDailyStudyMinutes: row.max_daily_study_minutes,
    allowPlanAutoAdjustment: row.allow_plan_auto_adjustment,
    allowStudentTimeChange: row.allow_student_time_change,
    allowStudentQuantityChange: row.allow_student_quantity_change,
    requireParentApprovalForRequiredPlanDeletion: row.require_parent_approval_for_required_plan_deletion,
  };
}

function mapStickerPolicy(row) {
  return {
    requiredPlanCompletion: row.required_plan_completion,
    recommendedPlanCompletion: row.recommended_plan_completion,
    onTimeBonus: row.on_time_bonus,
    dailyAchievement80Bonus: row.daily_achievement_80_bonus,
    allRequiredCompletionBonus: row.all_required_completion_bonus,
  };
}

function mapAllowanceCondition(row) {
  return { achievementRate: Number(row.achievement_rate), amount: row.amount };
}

async function loadDataset(studentId) {
  const [
    studentRes,
    subjectLevelsRes,
    fixedSchedulesRes,
    assignmentsRes,
    incompletePlansRes,
    examsRes,
    recentPerformanceRes,
    parentSettingsRes,
    stickerPolicyRes,
    allowancePolicyRes,
    allowanceConditionsRes,
  ] = await Promise.all([
    pool.query('SELECT * FROM students WHERE id = $1', [studentId]),
    pool.query('SELECT * FROM subject_levels WHERE student_id = $1 ORDER BY id', [studentId]),
    pool.query('SELECT * FROM fixed_schedules WHERE student_id = $1 ORDER BY start_time', [studentId]),
    pool.query('SELECT * FROM assignments WHERE student_id = $1 ORDER BY id', [studentId]),
    pool.query('SELECT * FROM incomplete_plans WHERE student_id = $1 ORDER BY id', [studentId]),
    pool.query('SELECT * FROM exams WHERE student_id = $1 ORDER BY id', [studentId]),
    pool.query('SELECT * FROM recent_performance WHERE student_id = $1', [studentId]),
    pool.query('SELECT * FROM parent_settings WHERE student_id = $1', [studentId]),
    pool.query('SELECT * FROM sticker_policies WHERE student_id = $1', [studentId]),
    pool.query('SELECT * FROM allowance_policies WHERE student_id = $1', [studentId]),
    pool.query('SELECT * FROM allowance_conditions WHERE student_id = $1 ORDER BY sort_order', [studentId]),
  ]);

  if (studentRes.rows.length === 0) return null;

  const dataset = {
    student: mapStudent(studentRes.rows[0]),
    subjectLevels: subjectLevelsRes.rows.map(mapSubjectLevel),
    fixedSchedules: fixedSchedulesRes.rows.map(mapFixedSchedule),
    assignments: assignmentsRes.rows.map(mapAssignment),
    incompletePlans: incompletePlansRes.rows.map(mapIncompletePlan),
    exams: examsRes.rows.map(mapExam),
    recentPerformance: mapRecentPerformance(recentPerformanceRes.rows[0]),
    parentSettings: mapParentSettings(parentSettingsRes.rows[0]),
    stickerPolicy: mapStickerPolicy(stickerPolicyRes.rows[0]),
    allowancePolicy: {
      enabled: allowancePolicyRes.rows[0].enabled,
      period: allowancePolicyRes.rows[0].period,
      parentApprovalRequired: allowancePolicyRes.rows[0].parent_approval_required,
      conditions: allowanceConditionsRes.rows.map(mapAllowanceCondition),
    },
  };
  dataset.subjectLevelFor = (subject) => dataset.subjectLevels.find((s) => s.subject === subject) || null;
  return dataset;
}

// Keeps recentPerformance meaningful across sessions: applies the same
// rolling-average formula src/logic/review.js already uses for
// weeklyAchievementRate to dailyAchievementRate7Days too. Without this,
// planGeneration.js's resolveLoadTier() (which reads
// dailyAchievementRate7Days, not weeklyAchievementRate) would never adapt
// to a student's real history.
async function updateRecentPerformanceAfterReview(studentId, reviewResponse) {
  const overallRate = reviewResponse.achievement.overallAchievementRate;
  const weeklyRate = reviewResponse.rewardResult.weeklyAchievementRate;
  await pool.query(
    `UPDATE recent_performance
        SET daily_achievement_rate_7days = ROUND((daily_achievement_rate_7days * 6 + $2) / 7),
            weekly_achievement_rate = $3
      WHERE student_id = $1`,
    [studentId, overallRate, weeklyRate],
  );
}

async function saveDailyReview(studentId, dateStr, reviewResponse) {
  await pool.query(
    `INSERT INTO daily_reviews
       (student_id, review_date, achievement, subject_results, completed_well,
        improvement_points, student_message, parent_message, reward_result)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (student_id, review_date) DO UPDATE SET
       achievement = EXCLUDED.achievement,
       subject_results = EXCLUDED.subject_results,
       completed_well = EXCLUDED.completed_well,
       improvement_points = EXCLUDED.improvement_points,
       student_message = EXCLUDED.student_message,
       parent_message = EXCLUDED.parent_message,
       reward_result = EXCLUDED.reward_result,
       created_at = now()`,
    [
      studentId,
      dateStr,
      JSON.stringify(reviewResponse.achievement),
      JSON.stringify(reviewResponse.subjectResults),
      JSON.stringify(reviewResponse.completedWell),
      JSON.stringify(reviewResponse.improvementPoints),
      reviewResponse.studentMessage,
      reviewResponse.parentMessage,
      JSON.stringify(reviewResponse.rewardResult),
    ],
  );
}

module.exports = { loadDataset, updateRecentPerformanceAfterReview, saveDailyReview };
