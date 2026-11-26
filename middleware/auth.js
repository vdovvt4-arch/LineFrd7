const crypto = require('crypto');
const { ADMIN_PASSWORD, SESSION_TTL_MS } = require('../config');
const { db } = require('../db/database');
const { AppError } = require('../utils/http');

const sessions = new Map(); // token -> expiry timestamp

function getActivePassword() {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key='admin_password'").get();
    if (row && row.value) return row.value;
  } catch {}
  return ADMIN_PASSWORD;
}

function setAdminPassword(newPassword) {
  const clean = String(newPassword || '').trim();
  if (clean.length < 4) throw new AppError(400, 'كلمة المرور يجب أن تكون 4 أحرف على الأقل');
  db.prepare(`
    INSERT INTO settings(key, value) VALUES('admin_password', ?)
    ON CONFLICT(key) DO UPDATE SET value=excluded.value
  `).run(clean);
}

function extractToken(req) {
  return (req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
}

function createSession(password) {
  const expected = Buffer.from(getActivePassword());
  const actual = Buffer.from(String(password || ''));
  const valid = expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  if (!valid) throw new AppError(401, 'كلمة المرور غير صحيحة');

  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function isAdmin(req) {
  const token = extractToken(req);
  const exp = sessions.get(token);
  if (!exp) return false;
  if (exp <= Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function requireAdmin(req) {
  if (!isAdmin(req)) throw new AppError(401, 'غير مصرح، سجّل الدخول أولاً');
}

function revokeSession(req) {
  const token = extractToken(req);
  if (token) sessions.delete(token);
}

module.exports = { createSession, isAdmin, requireAdmin, revokeSession, setAdminPassword };
