"use strict";
// Key Gemini RIÊNG từng user: lưu mã hóa AES-256, chỉ giải mã trong RAM lúc gọi Google.
// Không bao giờ trả key về client (chỉ trả 4 ký tự cuối để nhận diện).
// Thứ tự dùng khi chấm bài: key của user → key chung của server (.env) → báo thiếu.
const { db } = require("./db");
const { encryptKey, decryptKey } = require("./cryptoBox");

const MODELS = new Set(["gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"]);
const gradeHits = new Map();
const verifyHits = new Map();

function limited(map, id, limit, windowMs) {
  const now = Date.now();
  const arr = (map.get(id) || []).filter(t => now - t < windowMs);
  arr.push(now);
  map.set(id, arr);
  return arr.length > limit;
}

function validKeyFormat(k) {
  return typeof k === "string" && /^AIza[0-9A-Za-z\-_]{10,60}$/.test(k.trim());
}

function mask(k) {
  return "••••" + String(k).slice(-4);
}

function str(v, max) {
  return typeof v === "string" ? v.slice(0, max) : "";
}

async function googleGenerate(prompt, model, key, timeoutMs) {
  const m = MODELS.has(model) ? model : "gemini-2.0-flash";
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), timeoutMs || 30000);
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${encodeURIComponent(key)}`,
      { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        signal: ctl.signal });
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch {}
    return { ok: res.ok, status: res.status, data, raw: text.slice(0, 300) };
  } finally { clearTimeout(to); }
}

function getUserKey(userId) {
  const r = db.prepare("SELECT enc FROM user_keys WHERE user_id = ?").get(userId);
  if (!r) return null;
  try { return decryptKey(r.enc); } catch { return null; }
}

// GET /api/ai/status -> {server, mine, masked} (không đăng nhập: mine=false)
function statusHandler(req, res) {
  let mine = false, masked = null;
  if (req.user) {
    const k = getUserKey(req.user.id);
    if (k) { mine = true; masked = mask(k); }
  }
  res.json({ server: !!(process.env.GEMINI_KEY || ""), mine, masked });
}

// PUT /api/ai/key {key} — kiểm tra key THẬT với Google rồi mới lưu mã hóa
async function saveKeyHandler(req, res) {
  if (!req.user) return res.status(401).json({ error: "LOGIN_REQUIRED" });
  if (limited(verifyHits, req.user.id, 10, 3600e3)) return res.status(429).json({ error: "RATE_LIMIT" });
  const key = str(req.body.key, 100).trim();
  if (!validKeyFormat(key)) return res.status(400).json({ error: "BAD_KEY_FORMAT" });
  try {
    const r = await googleGenerate("Reply with exactly: OK", "gemini-2.0-flash", key, 20000);
    if (!r.ok) {
      const msg = JSON.stringify(r.data || r.raw).toLowerCase();
      if (r.status === 400 && msg.includes("api key not valid"))
        return res.status(400).json({ error: "INVALID_KEY" });
      return res.status(502).json({ error: "VERIFY_FAILED" });
    }
  } catch (e) {
    if (e && e.status) return res.status(502).json({ error: "VERIFY_FAILED" });
    return res.status(502).json({ error: "VERIFY_FAILED" });
  }
  db.prepare(`INSERT INTO user_keys (user_id, enc, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET enc = excluded.enc, updated_at = excluded.updated_at`)
    .run(req.user.id, encryptKey(key), Date.now());
  res.json({ ok: true, masked: mask(key) });
}

// DELETE /api/ai/key — xóa key khỏi server
function deleteKeyHandler(req, res) {
  if (!req.user) return res.status(401).json({ error: "LOGIN_REQUIRED" });
  db.prepare("DELETE FROM user_keys WHERE user_id = ?").run(req.user.id);
  res.json({ ok: true });
}

// POST /api/ai/grade {source, reference, userText, srcLang, model?}
async function gradeHandler(req, res) {
  const user = req.user;
  if (!user) return res.status(401).json({ error: "LOGIN_REQUIRED" });
  if (limited(gradeHits, user.id, 30, 3600e3)) return res.status(429).json({ error: "RATE_LIMIT" });
  const source = str(req.body.source, 500);
  const reference = str(req.body.reference, 500);
  const userText = str(req.body.userText, 500);
  const srcLang = req.body.srcLang === "en" ? "tiếng Anh" : "tiếng Việt";
  if (!source || !userText) return res.status(400).json({ error: "BAD_INPUT" });
  const userKey = getUserKey(user.id);
  const key = userKey || process.env.GEMINI_KEY || "";
  if (!key) return res.status(501).json({ error: "NO_KEY" });
  const prompt = `Bạn là giáo viên tiếng Anh cho người Việt (giao tiếp + công nghệ).
Câu gốc (${srcLang}): "${source}"
Đáp án chuẩn: "${reference}"
Học viên dịch: "${userText}"
Hãy trả lời NGẮN GỌN bằng tiếng Việt: 1) Điểm /10, 2) Đúng/sai ở đâu, 3) Cách nói tự nhiên hơn (1-2 gợi ý).`;
  try {
    const r = await googleGenerate(prompt, req.body.model, key, 30000);
    if (!r.ok) return res.status(502).json({ error: "AI_ERROR" });
    const fb = ((r.data || {}).candidates?.[0]?.content?.parts || [])
      .map(p => p.text || "").join("");
    res.json({ feedback: fb, quota: userKey ? "mine" : "shared" });
  } catch {
    return res.status(502).json({ error: "AI_ERROR" });
  }
}

module.exports = { gradeHandler, statusHandler, saveKeyHandler, deleteKeyHandler };
