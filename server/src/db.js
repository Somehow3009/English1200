"use strict";
// Postgres (Supabase) qua node-postgres (thuần JS). Một đường code duy nhất cho local + deploy.
// Cần biến môi trường DATABASE_URL (Supabase → Project Settings → Database → Connection string URI,
// nên dùng cổng pooled 6543, kèm ?sslmode=require).
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DATABASE_URL = process.env.DATABASE_URL || "";
if (!DATABASE_URL) {
  console.error("[fatal] Thiếu DATABASE_URL. Tạo project miễn phí ở supabase.com rồi cho " +
    "connection string vào server/.env (xem server/.env.example).");
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: /sslmode=disable/.test(DATABASE_URL) ? false : { rejectUnauthorized: false },
  max: 5
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  pass_hash TEXT NOT NULL,
  created_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS progress (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS user_keys (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enc TEXT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS sentences (
  id INTEGER PRIMARY KEY,
  en TEXT NOT NULL,
  vi TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT 'A2'
);
CREATE TABLE IF NOT EXISTS assignments (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  topic TEXT NOT NULL DEFAULT '',
  ids TEXT NOT NULL DEFAULT '[]',
  due_date TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id) ON DELETE CASCADE,
  created_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`;

async function migrate() {
  await pool.query(SCHEMA);
}

function loadSentenceRows() {
  const dir = path.join(__dirname, "..", "..", "public", "data");
  const files = fs.readdirSync(dir)
    .filter(f => /^d\d+\.js$/.test(f))
    .sort((a, b) => parseInt(a.slice(1), 10) - parseInt(b.slice(1), 10));
  const rows = [];
  for (const f of files) {
    const code = fs.readFileSync(path.join(dir, f), "utf8");
    const box = { C: "", T: "" };
    box.D = (en, vi, level) => rows.push({
      en: String(en), vi: String(vi),
      category: box.C, topic: box.T, level: level || "A2"
    });
    vm.runInNewContext(code, box, { filename: f });
  }
  return rows;
}

async function seedSentences() {
  // Luôn chạy: ON CONFLICT DO NOTHING nên an toàn, tự nạp thêm câu mới khi thêm file data
  const data = loadSentenceRows();
  let id = 0;
  for (let i = 0; i < data.length; i += 200) { // chèn theo lô cho nhanh
    const chunk = data.slice(i, i + 200);
    const vals = [];
    const ph = chunk.map(r => {
      id++;
      vals.push(id, r.en, r.vi, r.category, r.topic, r.level);
      const b = vals.length - 6;
      return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}, $${b + 6})`;
    }).join(", ");
    await pool.query(
      `INSERT INTO sentences (id, en, vi, category, topic, level) VALUES ${ph} ON CONFLICT DO NOTHING`,
      vals);
  }
  return id;
}

async function cleanSessions() {
  await pool.query("DELETE FROM sessions WHERE expires_at < $1", [Date.now()]);
}

module.exports = { pool, migrate, seedSentences, cleanSessions };
