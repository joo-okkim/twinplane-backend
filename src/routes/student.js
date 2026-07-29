const { Router } = require('express');
const requireAuth = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const studentRepository = require('../data/studentRepository');

const router = Router();
router.use(requireAuth);

// GET /api/student/profile
router.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const dataset = await studentRepository.loadDataset(req.studentId);
    res.json(dataset.student);
  }),
);

// GET /api/student/subject-levels
router.get(
  '/subject-levels',
  asyncHandler(async (req, res) => {
    const dataset = await studentRepository.loadDataset(req.studentId);
    res.json(dataset.subjectLevels);
  }),
);

// GET /api/student/exams
router.get(
  '/exams',
  asyncHandler(async (req, res) => {
    const dataset = await studentRepository.loadDataset(req.studentId);
    res.json(dataset.exams);
  }),
);

// GET /api/student/performance
router.get(
  '/performance',
  asyncHandler(async (req, res) => {
    const dataset = await studentRepository.loadDataset(req.studentId);
    res.json(dataset.recentPerformance);
  }),
);

module.exports = router;
