// Blank-slate seed data for a brand-new account created on first
// Kakao/Google login (src/routes/auth.js) -- unlike scripts/seed.js's demo
// accounts, this has no assignments/exams/incomplete-plans (a real new user
// hasn't told the app anything yet), just enough defaults for
// planGeneration.js to run without special-casing an empty dataset.
function blankStudentSeed({ username, name, oauthProvider, oauthId }) {
  return {
    username,
    auth: { oauthProvider, oauthId },
    student: {
      name,
      gradeLevel: 'MIDDLE_2',
      wakeUpTime: '07:00',
      bedTime: '23:00',
      preferredStudyStartTime: '16:30',
      maxSelfStudyMinutes: 120,
      maxConcentrationMinutes: 40,
      condition: 'normal',
      conditionMemo: null,
    },
    subjectLevels: [],
    fixedSchedules: [],
    assignments: [],
    incompletePlans: [],
    exams: [],
    recentPerformance: {
      dailyAchievementRate7Days: 75,
      weeklyAchievementRate: 75,
      consecutiveCompletionDays: 0,
      mostCompletedSubject: '-',
      leastCompletedSubject: '-',
      averageStartDelayMinutes: 0,
    },
    parentSettings: {
      planApprovalMode: 'STUDENT_CONFIRM',
      maxDailyStudyMinutes: 120,
      allowPlanAutoAdjustment: true,
      allowStudentTimeChange: true,
      allowStudentQuantityChange: true,
      requireParentApprovalForRequiredPlanDeletion: true,
    },
    stickerPolicy: {
      requiredPlanCompletion: 2,
      recommendedPlanCompletion: 1,
      onTimeBonus: 1,
      dailyAchievement80Bonus: 3,
      allRequiredCompletionBonus: 2,
    },
    allowancePolicy: {
      enabled: false,
      period: 'WEEKLY',
      parentApprovalRequired: true,
      conditions: [],
    },
  };
}

module.exports = { blankStudentSeed };