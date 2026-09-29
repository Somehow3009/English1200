"use strict";
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const express = require("express");
const path = require("path");
const { pool, migrate, seedSentences, cleanSessions } = require("./db");
const auth = require("./auth");
const { sanitizeProgress, getProgress, saveProgress } = require("./progress");
const { gradeHandler, statusHandler, saveKeyHandler, deleteKeyHandler } = require("./ai");

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1); // chạy sau proxy của Render/Railway (lấy đúng IP client cho rate-limit)
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "same-origin");
  next();
});
app.use(express.json({ limit: "256kb" }));

// Rate-limit nhẹ cho auth (chống brute-force / spam acc), theo IP
const rlMap = new Map();
function hitRate(key, limit, windowMs) {
  const now = Date.now();
  const arr = (rlMap.get(key) || []).filter(t => now - t < windowMs);
  arr.push(now);
  rlMap.set(key, arr);
  return arr.length > limit;
}
setInterval(() => { // dọn entry rate-limit hết hạn
  const now = Date.now();
  for (const [k, v] of rlMap) if (!v.some(t => now - t < 15 * 60e3)) rlMap.delete(k);
}, 15 * 60e3).unref();
function authLimit(req, res, next) {
  if (hitRate("auth:" + req.ip, 30, 15 * 60e3))
    return res.status(429).json({ error: "RATE_LIMIT" });
  next();
}

// Đính user (nếu có session hợp lệ) cho mọi request /api
app.use("/api", async (req, res, next) => {
  try { req.user = await auth.getSessionUser(req); } catch { req.user = null; }
  next();
});

app.get("/api/health", async (req, res) => {
  try { await pool.query("SELECT 1"); res.json({ ok: true }); }
  catch { res.status(500).json({ ok: false }); }
});

app.get("/api/sentences", async (req, res) => {
  try {
    const { rows } = await pool.query(
      "SELECT id, en, vi, category, topic, level FROM sentences ORDER BY id");
    res.json(rows);
  } catch { res.status(500).json({ error: "DB_ERROR" }); }
});

// ---- Auth ----
const DUMMY_HASH = "scrypt:" + "0".repeat(32) + ":" + "0".repeat(128); // chống đoán user qua timing
app.post("/api/auth/register", authLimit, async (req, res) => {
  const { username, password } = req.body || {};
  if (!auth.validUsername(username) || !auth.validPassword(password))
    return res.status(400).json({ error: "BAD_INPUT" });
  try {
    const exists = await pool.query("SELECT id FROM users WHERE username = $1", [username]);
    if (exists.rows[0]) return res.status(409).json({ error: "USER_EXISTS" });
    const r = await pool.query(
      "INSERT INTO users (username, pass_hash, created_at) VALUES ($1, $2, $3) RETURNING id",
      [username, auth.hashPassword(password), Date.now()]);
    const id = r.rows[0].id;
    auth.setSessionCookie(res, await auth.createSession(id));
    res.json({ id, username });
  } catch { res.status(500).json({ error: "DB_ERROR" }); }
});

app.post("/api/auth/login", authLimit, async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== "string" || typeof password !== "string")
    return res.status(400).json({ error: "BAD_INPUT" });
  if (hitRate(`login:${req.ip}:${username.slice(0, 20)}`, 10, 15 * 60e3))
    return res.status(429).json({ error: "RATE_LIMIT" });
  try {
    const { rows } = await pool.query(
      "SELECT id, username, pass_hash FROM users WHERE username = $1", [username]);
    const u = rows[0];
    if (!u) { auth.verifyPassword(password, DUMMY_HASH); return res.status(401).json({ error: "WRONG_LOGIN" }); }
    if (!auth.verifyPassword(password, u.pass_hash))
      return res.status(401).json({ error: "WRONG_LOGIN" });
    auth.setSessionCookie(res, await auth.createSession(u.id));
    res.json({ id: u.id, username: u.username });
  } catch { res.status(500).json({ error: "DB_ERROR" }); }
});

app.post("/api/auth/logout", async (req, res) => {
  await auth.destroySession(req);
  auth.clearSessionCookie(res);
  res.json({ ok: true });
});

app.get("/api/auth/me", (req, res) => {
  res.json({ user: req.user });
});

// ---- Progress (đồng bộ tiến độ) ----
app.get("/api/progress", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "LOGIN_REQUIRED" });
  try { res.json({ progress: await getProgress(req.user.id) }); }
  catch { res.status(500).json({ error: "DB_ERROR" }); }
});

app.put("/api/progress", async (req, res) => {
  if (!req.user) return res.status(401).json({ error: "LOGIN_REQUIRED" });
  const clean = sanitizeProgress(req.body);
  if (!clean) return res.status(400).json({ error: "BAD_INPUT" });
  try { await saveProgress(req.user.id, clean); res.json({ ok: true }); }
  catch { res.status(500).json({ error: "DB_ERROR" }); }
});

// ---- AI (Gemini: key RIÊNG từng user, mã hóa; key chung server là dự phòng) ----
app.get("/api/ai/status", statusHandler);
app.put("/api/ai/key", saveKeyHandler);
app.delete("/api/ai/key", deleteKeyHandler);
app.post("/api/ai/grade", gradeHandler);

app.use("/api", (req, res) => res.status(404).json({ error: "NOT_FOUND" }));

// ---- Frontend tĩnh (no-cache để user luôn nhận bản mới sau mỗi lần update) ----
const PUBLIC = path.join(__dirname, "..", "..", "public");
app.use(express.static(PUBLIC, { dotfiles: "deny", index: "index.html", maxAge: 0,
  setHeaders: res => res.setHeader("Cache-Control", "no-cache") }));

const ready = (async () => {
  await migrate();
  return seedSentences();
})();
setInterval(async () => { try { await cleanSessions(); } catch {} }, 3600e3).unref();

if (require.main === module) {
  const PORT = parseInt(process.env.PORT, 10) || 3000;
  ready.then(n => {
    console.log(`DB ready, sentences: ${n}`);
    app.listen(PORT, () => console.log(`English1200 server on http://localhost:${PORT}`));
  }).catch(e => { console.error("[fatal] DB boot failed:", e.message); process.exit(1); });
}
module.exports = { app, ready };
