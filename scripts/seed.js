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
const { insertStudent } = require('../src/data/studentInserter');

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
        seed.auth = { passwordHash: await bcrypt.hash(seed.password, 10) };
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
