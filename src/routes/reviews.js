const { Router } = require('express');

const router = Router();

// POST /api/reviews/daily
// TODO: port the scoring/messaging logic from
// lib/services/mock/review_logic.dart (spec §15/16): achievement stats,
// subject breakdown, no-blame messaging, sticker/allowance calc.
// rewardResult.parentApprovalRequired must always be true (spec §9).
router.post('/daily', (req, res) => {
  res.status(501).json({ error: 'POST /api/reviews/daily not implemented yet — see docs/API_CONTRACT.md' });
});

module.exports = router;