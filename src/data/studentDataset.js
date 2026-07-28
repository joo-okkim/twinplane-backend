// The single fixed dummy dataset the plan-generation logic reasons over.
// Ported 1:1 from the frontend's lib/services/mock/mock_student_data.dart
// (same 지윤/MIDDLE_2 example student) so responses are deterministic and
// directly comparable against the mock while a real DB isn't wired up yet.
const {
  studentProfile,
  subjectLevels,
  exams,
  recentPerformance,
  parentSettings,
  stickerPolicy,
  allowancePolicy,
} = require('./stubs');

const fixedSchedules = [
  { title: '학교', startTime: '08:00', endTime: '15:30', type: 'school' },
  { title: '영어학원', startTime: '17:30', endTime: '19:00', type: 'academy' },
  { title: '저녁식사', startTime: '19:20', endTime: '20:00', type: 'meal' },
];

const assignments = [
  {
    assignmentId: 501,
    subject: '수학',
    title: '유형 문제집 42~45쪽',
    dueDate: '2026-07-29',
    estimatedMinutes: 45,
    priority: 'high',
    required: true,
    evidenceRequired: true,
  },
  {
    assignmentId: 502,
    subject: '과학',
    title: '수행평가 자료 조사',
    dueDate: '2026-07-30',
    estimatedMinutes: 30,
    priority: 'high',
    required: true,
    evidenceRequired: false,
  },
  {
    assignmentId: 503,
    subject: '영어',
    title: '영어 단어 25개',
    dueDate: '2026-07-28',
    estimatedMinutes: 25,
    priority: 'high',
    required: true,
    evidenceRequired: false,
  },
];

const incompletePlans = [
  {
    planItemId: 801,
    subject: '수학',
    title: '오답 10문제 복습',
    originalDate: '2026-07-27',
    estimatedMinutes: 30,
    completionRate: 0,
    reason: '피곤해서 시작하지 못함',
    priority: 'normal',
  },
];

function subjectLevelFor(subject) {
  return subjectLevels.find((s) => s.subject === subject) || null;
}

const dataset = {
  student: studentProfile,
  subjectLevels,
  fixedSchedules,
  assignments,
  incompletePlans,
  exams,
  recentPerformance,
  parentSettings,
  stickerPolicy,
  allowancePolicy,
  subjectLevelFor,
};

module.exports = { dataset };