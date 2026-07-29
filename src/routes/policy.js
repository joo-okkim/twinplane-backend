const { Router } = require('express');
const requireAuth = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const studentRepository = require('../data/studentRepository');

const router = Router();
router.use(requireAuth);

// GET /api/policy/sticker
router.get(
  '/sticker',
  asyncHandler(async (req, res) => {
    const dataset = await studentRepository.loadDataset(req.studentId);
    res.json(dataset.stickerPolicy);
  }),
);

// GET /api/policy/allowance
router.get(
  '/allowance',
  asyncHandler(async (req, res) => {
    const dataset = await studentRepository.loadDataset(req.studentId);
    res.json(dataset.allowancePolicy);
  }),
);

module.exports = router;
