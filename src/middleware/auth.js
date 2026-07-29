const jwt = require('jsonwebtoken');

module.exports = function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'missing bearer token' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.studentId = payload.studentId;
    next();
  } catch {
    res.status(401).json({ error: 'invalid or expired token' });
  }
};
