const { Router } = require('express');
const { studentProfile, subjectLevels, exams, recentPerformance } = require('../data/stubs');

const router = Router();

// GET /api/student/profile
router.get('/profile', (req, res) => {
  res.json(studentProfile);
});

// GET /api/student/subject-levels
router.get('/subject-levels', (req, res) => {
  res.json(subjectLevels);
});

// GET /api/student/exams
router.get('/exams', (req, res) => {
  res.json(exams);
});

// GET /api/student/performance
router.get('/performance', (req, res) => {
  res.json(recentPerformance);
});

module.exports = router;