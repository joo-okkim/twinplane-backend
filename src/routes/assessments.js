const { Router } = require('express');
const requireAuth = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const pool = require('../db/pool');
const planStore = require('../data/planStore');
const llm = require('../llm');

const router = Router();
router.use(requireAuth);

// Resolves what the generated questions should be about, in order of
// preference (see db/schema.sql / planGeneration.js for why each step
// exists): the assignment's own registered scope, then a same-subject
// exam's scope, then the plan item's own (always non-empty) description.
async function resolveScope(studentId, item) {
  if (item.sourceType === 'ASSIGNMENT' && item.sourceId) {
    const { rows } = await pool.query('SELECT scope FROM assignments WHERE id = $1 AND student_id = $2', [
      Number(item.sourceId),
      studentId,
    ]);
    if (rows[0] && rows[0].scope) return rows[0].scope;
  }

  if (item.subject) {
    const { rows } = await pool.query(
      `SELECT scope FROM exams
        WHERE student_id = $1 AND subject = $2 AND scope IS NOT NULL
        ORDER BY id ASC LIMIT 1`,
      [studentId, item.subject],
    );
    if (rows[0] && rows[0].scope) return rows[0].scope;
  }

  return item.description;
}

function mapQuestionForClient(row) {
  return {
    id: row.id,
    sequence: row.sequence,
    type: row.question_type,
    question: row.question_text,
    choices: row.choices,
  };
}

function mapQuestionResult(questionRow, answerRow) {
  return {
    id: questionRow.id,
    sequence: questionRow.sequence,
    type: questionRow.question_type,
    question: questionRow.question_text,
    choices: questionRow.choices,
    studentAnswer: answerRow.student_answer,
    isCorrect: answerRow.is_correct,
    correctAnswer: questionRow.correct_answer,
    explanation: questionRow.explanation,
    feedback: answerRow.feedback,
  };
}

// POST /api/assessments/generate
// Body: { planItemId }. subject/scope are deliberately NOT accepted from
// the client -- everything is resolved server-side from the authenticated
// student's own plan item, same pattern as /api/plans/modify.
router.post(
  '/generate',
  asyncHandler(async (req, res) => {
    const { planItemId } = req.body || {};
    if (!planItemId || typeof planItemId !== 'string') {
      return res.status(400).json({ error: 'planItemId is required' });
    }

    const found = await planStore.findItemByClientId(req.studentId, planItemId);
    if (!found) {
      return res.status(404).json({ error: '해당 계획 항목을 찾을 수 없어요.' });
    }

    const item = found.item;
    if (!item.evidenceRequired) {
      return res.status(400).json({ error: '이해도 확인이 필요한 항목이 아니에요.' });
    }
    if (!item.subject) {
      return res.status(400).json({ error: '과목 정보가 없는 항목이에요.' });
    }

    const scope = await resolveScope(req.studentId, item);

    const studentRes = await pool.query('SELECT grade_level FROM students WHERE id = $1', [req.studentId]);
    const gradeLevel = studentRes.rows[0] ? studentRes.rows[0].grade_level : null;

    let questions;
    try {
      questions = await llm.generateQuestions({ subject: item.subject, scope, gradeLevel });
    } catch (err) {
      if (err instanceof llm.LlmRefusalError) {
        return res.status(502).json({ error: 'AI가 문제를 생성하지 못했어요. 잠시 후 다시 시도해주세요.' });
      }
      throw err;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO assessments (student_id, plan_item_client_id, subject, scope, status)
         VALUES ($1, $2, $3, $4, 'generated')
         RETURNING id`,
        [req.studentId, planItemId, item.subject, scope],
      );
      const assessmentId = rows[0].id;

      const questionRows = [];
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const inserted = await client.query(
          `INSERT INTO assessment_questions
             (assessment_id, sequence, question_type, question_text, choices, correct_answer, explanation)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, sequence, question_type, question_text, choices`,
          [assessmentId, i + 1, q.type, q.question, JSON.stringify(q.choices || []), q.correctAnswer, q.explanation],
        );
        questionRows.push(inserted.rows[0]);
      }

      await client.query('COMMIT');

      res.json({
        assessmentId,
        subject: item.subject,
        scope,
        questions: questionRows.map(mapQuestionForClient),
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }),
);

// GET /api/assessments/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'invalid assessment id' });
    }

    const assessmentRes = await pool.query('SELECT * FROM assessments WHERE id = $1 AND student_id = $2', [
      id,
      req.studentId,
    ]);
    if (assessmentRes.rows.length === 0) {
      return res.status(404).json({ error: 'assessment not found' });
    }
    const assessment = assessmentRes.rows[0];

    const questionsRes = await pool.query(
      'SELECT * FROM assessment_questions WHERE assessment_id = $1 ORDER BY sequence',
      [id],
    );

    if (assessment.status !== 'submitted') {
      return res.json({
        assessmentId: id,
        subject: assessment.subject,
        scope: assessment.scope,
        questions: questionsRes.rows.map(mapQuestionForClient),
      });
    }

    const answersRes = await pool.query('SELECT * FROM assessment_answers WHERE assessment_id = $1', [id]);
    const answerByQuestionId = new Map(answersRes.rows.map((a) => [a.question_id, a]));

    res.json({
      assessmentId: id,
      score: assessment.score,
      totalQuestions: questionsRes.rows.length,
      results: questionsRes.rows.map((q) => mapQuestionResult(q, answerByQuestionId.get(q.id))),
    });
  }),
);

// POST /api/assessments/:id/submit
// Body: { answers: [{ questionId, answer }] }. multiple_choice is graded by
// direct string comparison; short_answer items are batched into a single
// llm.gradeShortAnswers call (never one call per question).
router.post(
  '/:id/submit',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { answers } = req.body || {};
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: 'invalid assessment id' });
    }
    if (!Array.isArray(answers)) {
      return res.status(400).json({ error: 'answers must be an array' });
    }

    const assessmentRes = await pool.query('SELECT * FROM assessments WHERE id = $1 AND student_id = $2', [
      id,
      req.studentId,
    ]);
    if (assessmentRes.rows.length === 0) {
      return res.status(404).json({ error: 'assessment not found' });
    }

    const questionsRes = await pool.query(
      'SELECT * FROM assessment_questions WHERE assessment_id = $1 ORDER BY sequence',
      [id],
    );
    const questions = questionsRes.rows;

    const answerByQuestionId = new Map(answers.map((a) => [a.questionId, a.answer]));

    const graded = []; // { questionId, studentAnswer, isCorrect, feedback }
    const shortAnswerBatch = [];

    for (const q of questions) {
      const studentAnswer = answerByQuestionId.get(q.id) || '';
      if (q.question_type === 'multiple_choice') {
        const isCorrect = studentAnswer.trim() === q.correct_answer.trim();
        graded.push({
          questionId: q.id,
          studentAnswer,
          isCorrect,
          feedback: isCorrect ? '정답이에요!' : `아쉬워요. 정답은 "${q.correct_answer}"예요. ${q.explanation}`,
        });
      } else {
        shortAnswerBatch.push({
          questionId: q.id,
          question: q.question_text,
          correctAnswer: q.correct_answer,
          studentAnswer,
        });
      }
    }

    if (shortAnswerBatch.length > 0) {
      let results;
      try {
        results = await llm.gradeShortAnswers({ items: shortAnswerBatch });
      } catch (err) {
        if (err instanceof llm.LlmRefusalError) {
          return res.status(502).json({ error: 'AI가 채점을 완료하지 못했어요. 잠시 후 다시 시도해주세요.' });
        }
        throw err;
      }
      const resultByQuestionId = new Map(results.map((r) => [r.questionId, r]));
      for (const item of shortAnswerBatch) {
        const result = resultByQuestionId.get(item.questionId);
        graded.push({
          questionId: item.questionId,
          studentAnswer: item.studentAnswer,
          isCorrect: !!(result && result.isCorrect),
          feedback: result ? result.feedback : '채점 결과를 받지 못했어요.',
        });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const g of graded) {
        await client.query(
          `INSERT INTO assessment_answers (assessment_id, question_id, student_answer, is_correct, feedback)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (question_id) DO UPDATE SET
             student_answer = EXCLUDED.student_answer,
             is_correct = EXCLUDED.is_correct,
             feedback = EXCLUDED.feedback`,
          [id, g.questionId, g.studentAnswer, g.isCorrect, g.feedback],
        );
      }

      const correctCount = graded.filter((g) => g.isCorrect).length;
      const score = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;

      await client.query(
        `UPDATE assessments SET status = 'submitted', score = $1, submitted_at = now() WHERE id = $2`,
        [score, id],
      );

      await client.query('COMMIT');

      const answerByQuestion = new Map(graded.map((g) => [g.questionId, g]));
      res.json({
        assessmentId: id,
        score,
        totalQuestions: questions.length,
        results: questions.map((q) => mapQuestionResult(q, answerByQuestion.get(q.id))),
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }),
);

module.exports = router;
