"use strict";
// Auth: scrypt hash + session token ngẫu nhiên (lưu hash trong Postgres, cookie httpOnly).
const crypto = require("crypto");
const { pool } = require("./db");

const SESSION_DAYS = 30;

function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  const h = crypto.scryptSync(pw, salt, 64).toString("hex");
  return `scrypt:${salt}:${h}`;
}

function verifyPassword(pw, stored) {
  try {
    const parts = String(stored).split(":");
    if (parts.length !== 3 || parts[0] !== "scrypt") return false;
    const hh = crypto.scryptSync(pw, parts[1], 64);
    return crypto.timingSafeEqual(Buffer.from(parts[2], "hex"), hh);
  } catch { return false; }
}

function parseCookies(req) {
  const out = {};
  const h = req.headers.cookie;
  if (!h) return out;
  for (const part of h.split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

async function createSession(userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const th = crypto.createHash("sha256").update(token).digest("hex");
  await pool.query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
    [th, userId, Date.now() + SESSION_DAYS * 864e5]);
  return token;
}

async function getSessionUser(req) {
  const token = parseCookies(req).sid;
  if (!token || typeof token !== "string" || token.length > 128) return null;
  const th = crypto.createHash("sha256").update(token).digest("hex");
  const { rows } = await pool.query(
    "SELECT user_id, expires_at FROM sessions WHERE token_hash = $1", [th]).catch(() => ({ rows: [] }));
  const s = rows[0];
  if (!s || s.expires_at < Date.now()) return null;
  const u = await pool.query("SELECT id, username FROM users WHERE id = $1", [s.user_id])
    .catch(() => ({ rows: [] }));
  return u.rows[0] || null;
}

async function destroySession(req) {
  const token = parseCookies(req).sid;
  if (!token) return;
  const th = crypto.createHash("sha256").update(token).digest("hex");
  await pool.query("DELETE FROM sessions WHERE token_hash = $1", [th]).catch(() => {});
}

function setSessionCookie(res, token) {
  const secure = process.env.COOKIE_SECURE === "1" ? "; Secure" : "";
  res.setHeader("Set-Cookie",
    `sid=${token}; HttpOnly; Path=/; Max-Age=${SESSION_DAYS * 86400}; SameSite=Lax${secure}`);
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "sid=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax");
}

function validUsername(u) {
  return typeof u === "string" && /^[a-zA-Z0-9_.]{3,20}$/.test(u);
}

function validPassword(p) {
  return typeof p === "string" && p.length >= 6 && p.length <= 72;
}

module.exports = {
  hashPassword, verifyPassword, createSession, getSessionUser,
  destroySession, setSessionCookie, clearSessionCookie,
  validUsername, validPassword
};
