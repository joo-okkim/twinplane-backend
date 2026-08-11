const { Router } = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const pool = require('../db/pool');
const asyncHandler = require('../middleware/asyncHandler');
const { insertStudent } = require('../data/studentInserter');
const { blankStudentSeed } = require('../data/newAccountDefaults');

const router = Router();

function signToken(student) {
  return jwt.sign({ studentId: student.id, username: student.username }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

// Shared by both OAuth providers: looks up an existing account by
// (provider, providerId); creates a blank-slate one on first login (this
// *is* signup -- there's no separate registration step for social login).
// Everything runs in one transaction so a crash mid-insert (studentInserter
// touches ~9 tables) can never leave an orphaned students row.
async function findOrCreateOAuthStudent({ provider, providerId, name }) {
  const existing = await pool.query('SELECT id, username, name FROM students WHERE oauth_provider = $1 AND oauth_id = $2', [
    provider,
    providerId,
  ]);
  if (existing.rows.length > 0) return existing.rows[0];

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const username = `${provider}_${providerId}`;
    const seed = blankStudentSeed({ username, name: name || '새로운 학생', oauthProvider: provider, oauthId: providerId });
    const id = await insertStudent(client, seed);
    await client.query('COMMIT');
    return { id, username, name: seed.student.name };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

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
    // password_hash is NULL for OAuth-only accounts (see students_exactly_one_auth_method)
    // -- bcrypt.compare throws on a null hash, so that case must short-circuit here rather
    // than reach bcrypt, but still fall through to the same generic 401 (never reveal which
    // half of a username/password pair was wrong, and never hint "this account uses Google").
    if (!student || !student.password_hash || !(await bcrypt.compare(password, student.password_hash))) {
      return res.status(401).json({ error: 'invalid credentials' });
    }

    res.json({ token: signToken({ id: student.id, username }), studentId: student.id, name: student.name });
  }),
);

// POST /api/auth/oauth/kakao
// Body: { accessToken } -- the OAuth access token Kakao's Flutter SDK
// (kakao_flutter_sdk_user) returns to the client after login. Verified by
// asking Kakao who it belongs to; kapi.kakao.com validates the token itself
// (it was issued by Kakao to our app), so no server-side app secret is
// needed for this call -- only the Flutter client needs the native app key
// (see twinplane's android/gradle.properties / KAKAO_NATIVE_APP_KEY).
router.post(
  '/oauth/kakao',
  asyncHandler(async (req, res) => {
    const { accessToken } = req.body || {};
    if (!accessToken) return res.status(400).json({ error: 'accessToken is required' });

    const kakaoRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!kakaoRes.ok) {
      return res.status(401).json({ error: 'invalid Kakao access token' });
    }
    const kakaoUser = await kakaoRes.json();
    const providerId = String(kakaoUser.id);
    const name = kakaoUser.kakao_account?.profile?.nickname || kakaoUser.properties?.nickname || null;

    const student = await findOrCreateOAuthStudent({ provider: 'kakao', providerId, name });
    res.json({ token: signToken(student), studentId: student.id, name: student.name });
  }),
);

// POST /api/auth/oauth/google
// Body: { idToken } -- the ID token google_sign_in returns to the client.
// Verified locally against Google's public keys (no network call to Google
// needed beyond the library's cached key fetch); GOOGLE_CLIENT_ID is the
// *audience* check, not a secret -- same value the Flutter client passes as
// serverClientId. Not configured yet, so this fails loudly with 501 instead
// of silently accepting unverifiable tokens.
router.post(
  '/oauth/google',
  asyncHandler(async (req, res) => {
    if (!process.env.GOOGLE_CLIENT_ID) {
      return res.status(501).json({ error: 'Google login is not configured on this server yet' });
    }
    const { idToken } = req.body || {};
    if (!idToken) return res.status(400).json({ error: 'idToken is required' });

    const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({ idToken, audience: process.env.GOOGLE_CLIENT_ID });
      payload = ticket.getPayload();
    } catch {
      return res.status(401).json({ error: 'invalid Google ID token' });
    }

    const student = await findOrCreateOAuthStudent({ provider: 'google', providerId: payload.sub, name: payload.name });
    res.json({ token: signToken(student), studentId: student.id, name: student.name });
  }),
);

module.exports = router;
