const { Router } = require('express');
const requireAuth = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const studentRepository = require('../data/studentRepository');

const router = Router();
router.use(requireAuth);

// GET /api/parent/settings
router.get(
  '/settings',
  asyncHandler(async (req, res) => {
    const dataset = await studentRepository.loadDataset(req.studentId);
    res.json(dataset.parentSettings);
  }),
);

module.exports = router;
