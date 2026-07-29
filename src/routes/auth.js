const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const asyncHandler = require('../middleware/asyncHandler');

const router = Router();

// POST /api/auth/login
// Mounted unprotected (no requireAuth) -- this is how a token is obtained
// in the first place. 30-day expiry: there's no register/refresh flow this
// round, so a short-lived token would just lock a student out with no
// self-recovery path. The real access control lever for this small,
// closed user set is the GCP firewall rule, not token lifetime.
router.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'username and password are required' });
    }

    const { rows } = await pool.query('SELECT id, password_hash, name FROM students WHERE username = $1', [username]);
    const student = rows[0];
    if (!student || !(await bcrypt.compare(password, student.password_hash))) {
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const token = jwt.sign({ studentId: student.id, username }, process.env.JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, studentId: student.id, name: student.name });
  }),
);

module.exports = router;
