const { Router } = require('express');
const { dataset } = require('../data/studentDataset');
const planStore = require('../data/planStore');
const planGeneration = require('../logic/planGeneration');
const modification = require('../logic/modification');

const router = Router();

const VALID_CONDITIONS = ['very_good', 'good', 'normal', 'tired', 'very_tired', 'stressed', 'sick'];
const VALID_REASONS = ['TIRED', 'TOO_MUCH', 'WRONG_TIME', 'DONT_WANT'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// POST /api/plans/daily
// Ported from the frontend's lib/services/mock/plan_generation_logic.dart
// (achievement-rate load tiers, exam/deadline prioritization, condition
// adjustment — spec §6/§12). See src/logic/planGeneration.js.
router.post('/daily', (req, res) => {
  const { date, condition } = req.body || {};

  if (!date || !DATE_RE.test(date)) {
    return res.status(400).json({ error: 'date is required as an "YYYY-MM-DD" string' });
  }
  if (condition !== undefined && condition !== null && !VALID_CONDITIONS.includes(condition)) {
    return res.status(400).json({ error: `condition must be one of ${VALID_CONDITIONS.join(', ')}` });
  }

  const response = planGeneration.generate({
    dataset,
    dateStr: date,
    condition: condition || null,
  });
  planStore.set(date, response);
  res.json(response);
});

// POST /api/plans/modify
// Ported from the frontend's lib/services/mock/modification_logic.dart
// (spec §14): the priority ladder is remove bonus -> remove optional ->
// shrink recommended -> shrink required -> split, blocking required-item
// removal behind PARENT_APPROVAL_REQUIRED per parentSettings. Looks up the
// item in whichever day's plan (from POST /api/plans/daily) contains it —
// see src/data/planStore.js.
router.post('/modify', (req, res) => {
  const { planItemId, reason } = req.body || {};

  if (!planItemId || typeof planItemId !== 'string') {
    return res.status(400).json({ error: 'planItemId is required' });
  }
  if (!VALID_REASONS.includes(reason)) {
    return res.status(400).json({ error: `reason must be one of ${VALID_REASONS.join(', ')}` });
  }

  const found = planStore.findByItemId(planItemId);
  if (!found) {
    return res.json({
      modificationStatus: 'PARENT_APPROVAL_REQUIRED',
      updatedItem: null,
      message: '해당 계획을 찾을 수 없어요.',
      reason: '오늘 생성된 계획이 아니에요.',
    });
  }

  const { dateStr, plan } = found;
  const item = plan.dailyPlans.find((p) => p.id === planItemId);
  const result = modification.decide({ item, reason, parentSettings: dataset.parentSettings });

  if (result.modificationStatus === 'APPLIED' && result.updatedItem) {
    const updatedPlans = plan.dailyPlans.map((p) => (p.id === planItemId ? result.updatedItem : p));
    planStore.set(dateStr, { ...plan, dailyPlans: updatedPlans });
  } else if (result.modificationStatus === 'REMOVED') {
    const updatedPlans = plan.dailyPlans.filter((p) => p.id !== planItemId);
    planStore.set(dateStr, { ...plan, dailyPlans: updatedPlans });
  }

  res.json(result);
});

module.exports = router;