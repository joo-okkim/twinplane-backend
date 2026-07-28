const { Router } = require('express');
const { dataset } = require('../data/studentDataset');
const planStore = require('../data/planStore');
const review = require('../logic/review');

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// POST /api/reviews/daily
// Ported from the frontend's lib/services/mock/review_logic.dart (spec
// §15/16): achievement stats, subject breakdown, no-blame messaging,
// sticker/allowance calc. rewardResult.parentApprovalRequired always true
// (spec §9). Scores against whichever plan POST /api/plans/daily generated
// for this date (see src/data/planStore.js); an unknown date scores an
// empty plan, same as the mock.
router.post('/daily', (req, res) => {
  const { date, completions } = req.body || {};

  if (!date || !DATE_RE.test(date)) {
    return res.status(400).json({ error: 'date is required as an "YYYY-MM-DD" string' });
  }
  if (!Array.isArray(completions)) {
    return res.status(400).json({ error: 'completions must be an array' });
  }
  for (const c of completions) {
    if (!c || typeof c.planItemId !== 'string' || typeof c.completed !== 'boolean') {
      return res.status(400).json({ error: 'each completion needs planItemId (string) and completed (boolean)' });
    }
  }

  const plan = planStore.get(date);
  const planItems = plan ? plan.dailyPlans : [];

  const response = review.compute({ dataset, dateStr: date, planItems, completions });
  res.json(response);
});

module.exports = router;