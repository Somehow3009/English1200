"use strict";
// SQLite (built-in node:sqlite) + seed 1200 câu từ public/data/d*.js
const { DatabaseSync } = require("node:sqlite");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DB_PATH = process.env.DB_PATH || path.join(__dirname, "..", "app.db");
const db = new DatabaseSync(DB_PATH);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  pass_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS progress (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_keys (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  enc TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sentences (
  id INTEGER PRIMARY KEY,
  en TEXT NOT NULL,
  vi TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  topic TEXT NOT NULL DEFAULT '',
  level TEXT NOT NULL DEFAULT 'A2'
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
`);

function seedSentences() {
  const row = db.prepare("SELECT COUNT(*) AS c FROM sentences").get();
  if (row.c > 0) return row.c;
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
  const ins = db.prepare(
    "INSERT INTO sentences (id, en, vi, category, topic, level) VALUES (?, ?, ?, ?, ?, ?)");
  let id = 0;
  for (const r of rows) { id++; ins.run(id, r.en, r.vi, r.category, r.topic, r.level); }
  return id;
}

function cleanSessions() {
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
}

module.exports = { db, seedSentences, cleanSessions };
