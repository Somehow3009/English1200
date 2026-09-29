"use strict";
// Validate + chuẩn hóa progress từ client (chống spam/phá DB).
const { db } = require("./db");

function int(v, dflt, min, max) {
  const n = Number.isInteger(v) ? v : parseInt(v, 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}
function num(v, dflt, min, max) {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.min(max, Math.max(min, n));
}
function idList(v) {
  if (!Array.isArray(v)) return [];
  return v.filter(Number.isInteger).filter(n => n > 0).slice(0, 20000);
}

function sanitizeProgress(p) {
  if (!p || typeof p !== "object") return null;
  const out = {};
  out.mastered = idList(p.mastered);
  out.fav = idList(p.fav);
  out.srs = {};
  if (p.srs && typeof p.srs === "object") {
    for (const k of Object.keys(p.srs).slice(0, 20000)) {
      if (!/^\d+$/.test(k)) continue;
      const r = p.srs[k];
      if (!r || typeof r !== "object") continue;
      out.srs[k] = {
        e: num(r.e, 2.5, 1.3, 5),
        iv: num(r.iv, 0, 0, 3650),
        rp: int(r.rp, 0, 0, 1000000),
        due: int(r.due, 0, 0, Number.MAX_SAFE_INTEGER)
      };
    }
  }
  out.xp = int(p.xp, 0, 0, 1e9);
  out.streak = int(p.streak, 0, 0, 100000);
  out.lastDay = typeof p.lastDay === "string" ? p.lastDay.slice(0, 10) : "";
  out.goal = int(p.goal, 20, 1, 500);
  const t = (p.today && typeof p.today === "object") ? p.today : {};
  const date = /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : "";
  out.today = { date, count: int(t.count, 0, 0, 100000) };
  return out;
}

function getProgress(userId) {
  const r = db.prepare("SELECT data FROM progress WHERE user_id = ?").get(userId);
  if (!r) return null;
  try { return JSON.parse(r.data); } catch { return null; }
}

function saveProgress(userId, data) {
  db.prepare(`INSERT INTO progress (user_id, data, updated_at) VALUES (?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`)
    .run(userId, JSON.stringify(data), Date.now());
}

module.exports = { sanitizeProgress, getProgress, saveProgress };
