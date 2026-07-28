const { Router } = require('express');
const { stickerPolicy, allowancePolicy } = require('../data/stubs');

const router = Router();

// GET /api/policy/sticker
router.get('/sticker', (req, res) => {
  res.json(stickerPolicy);
});

// GET /api/policy/allowance
router.get('/allowance', (req, res) => {
  res.json(allowancePolicy);
});

module.exports = router;