const { Router } = require('express');
const requireAuth = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const studentRepository = require('../data/studentRepository');
const planStore = require('../data/planStore');
const review = require('../logic/review');

const router = Router();
router.use(requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// POST /api/reviews/daily
// Ported from the frontend's lib/services/mock/review_logic.dart (spec
// §15/16): achievement stats, subject breakdown, no-blame messaging,
// sticker/allowance calc. rewardResult.parentApprovalRequired always true
// (spec §9). Scores against whichever plan POST /api/plans/daily generated
// for this student+date (see src/data/planStore.js); an unknown date
// scores an empty plan, same as before. Persists the review and rolls the
// result into recent_performance so future plan generation actually
// reflects real history (see studentRepository.updateRecentPerformanceAfterReview).
router.post(
  '/daily',
  asyncHandler(async (req, res) => {
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

    const dataset = await studentRepository.loadDataset(req.studentId);
    const planItems = await planStore.getPlanItems(req.studentId, date);

    const response = review.compute({ dataset, dateStr: date, planItems, completions });
    await studentRepository.saveDailyReview(req.studentId, date, response);
    await studentRepository.updateRecentPerformanceAfterReview(req.studentId, response);
    res.json(response);
  }),
);

module.exports = router;
