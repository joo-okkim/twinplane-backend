const { Router } = require('express');
const { parentSettings } = require('../data/stubs');

const router = Router();

// GET /api/parent/settings
router.get('/settings', (req, res) => {
  res.json(parentSettings);
});

module.exports = router;