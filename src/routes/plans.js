const { Router } = require('express');

const router = Router();

// POST /api/plans/daily
// TODO: port the rule engine from the frontend's
// lib/services/mock/plan_generation_logic.dart (achievement-rate load
// tiers, exam/deadline prioritization, condition adjustment — spec §6/§12).
router.post('/daily', (req, res) => {
  res.status(501).json({ error: 'POST /api/plans/daily not implemented yet — see docs/API_CONTRACT.md' });
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