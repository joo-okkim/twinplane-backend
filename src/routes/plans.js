const { Router } = require('express');
const { dataset } = require('../data/studentDataset');
const planGeneration = require('../logic/planGeneration');

const router = Router();

const VALID_CONDITIONS = ['very_good', 'good', 'normal', 'tired', 'very_tired', 'stressed', 'sick'];
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
  res.json(response);
});

// POST /api/plans/modify
// TODO: port the priority ladder from
// lib/services/mock/modification_logic.dart (spec §14): remove bonus ->
// remove optional -> shrink recommended -> shrink required -> split,
// blocking required-item removal behind PARENT_APPROVAL_REQUIRED.
router.post('/modify', (req, res) => {
  res.status(501).json({ error: 'POST /api/plans/modify not implemented yet — see docs/API_CONTRACT.md' });
});

module.exports = router;