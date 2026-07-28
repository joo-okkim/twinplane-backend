// Stand-in payloads copied from twinplane's docs/API_CONTRACT.md so every
// route returns a shape the Flutter app already understands. Replace each
// piece with real DB/LLM-backed logic incrementally — see that doc's
// reference implementations under lib/services/mock/ in the frontend repo.

const studentProfile = {
  studentId: 1001,
  name: '지윤',
  gradeLevel: 'MIDDLE_2',
  wakeUpTime: '07:00',
  bedTime: '22:30',
  preferredStudyStartTime: '16:30',
  maxSelfStudyMinutes: 150,
  maxConcentrationMinutes: 40,
  condition: 'normal',
  conditionMemo: '학교 체육활동이 있었음',
};

const subjectLevels = [
  { subject: '수학', level: 'normal', recentAchievementRate: 68.0, averageDelayMinutes: 15, averageActualMinutes: 42, recentIncompleteCount: 2 },
  { subject: '영어', level: 'good', recentAchievementRate: 85.0, averageDelayMinutes: 5, averageActualMinutes: 28, recentIncompleteCount: 0 },
  { subject: '과학', level: 'normal', recentAchievementRate: 76.0, averageDelayMinutes: 10, averageActualMinutes: 30, recentIncompleteCount: 1 },
];

const exams = [
  { examName: '2학기 수학 단원평가', subject: '수학', examDate: '2026-08-05', scope: '일차함수', importance: 'high' },
];

const recentPerformance = {
  dailyAchievementRate7Days: 72.0,
  weeklyAchievementRate: 75.0,
  consecutiveCompletionDays: 2,
  mostCompletedSubject: '영어',
  leastCompletedSubject: '수학',
  averageStartDelayMinutes: 12,
};

const parentSettings = {
  planApprovalMode: 'STUDENT_CONFIRM',
  maxDailyStudyMinutes: 150,
  allowPlanAutoAdjustment: true,
  allowStudentTimeChange: true,
  allowStudentQuantityChange: true,
  requireParentApprovalForRequiredPlanDeletion: true,
};

const stickerPolicy = {
  requiredPlanCompletion: 2,
  recommendedPlanCompletion: 1,
  onTimeBonus: 1,
  dailyAchievement80Bonus: 3,
  allRequiredCompletionBonus: 2,
};

const allowancePolicy = {
  enabled: true,
  period: 'WEEKLY',
  conditions: [
    { achievementRate: 80.0, amount: 5000 },
    { achievementRate: 90.0, amount: 10000 },
  ],
  parentApprovalRequired: true,
};

module.exports = {
  studentProfile,
  subjectLevels,
  exams,
  recentPerformance,
  parentSettings,
  stickerPolicy,
  allowancePolicy,
};