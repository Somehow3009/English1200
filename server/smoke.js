"use strict";
// Smoke test (Postgres/Supabase). Cần DATABASE_URL. Chạy: npm run smoke
// Tự dọn user test trước/sau khi chạy để không làm bẩn DB.
if (!process.env.DATABASE_URL) {
  console.error("SKIP smoke: thiếu DATABASE_URL (cho connection string Supabase vào server/.env)");
  process.exit(2);
}
process.env.MASTER_SECRET = process.env.MASTER_SECRET ||
  require("crypto").randomBytes(32).toString("hex");
process.env.ADMIN_USERNAMES = "testuser";
const assert = require("assert");
const { app, ready } = require("./src/index");
const { pool } = require("./src/db");

ready.then(() => {
  const server = app.listen(0, "127.0.0.1", async () => {
    const base = `http://127.0.0.1:${server.address().port}`;
    let cookie = "";
    const call = async (method, p, body) => {
      const r = await fetch(base + p, {
        method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
        body: body ? JSON.stringify(body) : undefined });
      const sc = r.headers.get("set-cookie");
      if (sc) cookie = sc.split(";")[0];
      let j = null; try { j = await r.json(); } catch {}
      return { status: r.status, body: j };
    };
    const clean = () => pool.query("DELETE FROM users WHERE username = 'testuser'");
    try {
      await clean();
      let r = await call("GET", "/api/health");
      assert.equal(r.status, 200); assert.equal(r.body.ok, true); console.log("ok health");

      r = await call("GET", "/api/sentences");
      assert.equal(r.status, 200); assert.equal(r.body.length, 2000, "sentences=" + r.body.length);
      console.log("ok sentences x2000");

      r = await call("POST", "/api/auth/register", { username: "te st", password: "123" });
      assert.equal(r.status, 400); console.log("ok reject bad input");

      r = await call("POST", "/api/auth/register", { username: "testuser", password: "secret123" });
      assert.equal(r.status, 200); assert.equal(r.body.username, "testuser"); console.log("ok register");

      r = await call("POST", "/api/auth/register", { username: "testuser", password: "secret123" });
      assert.equal(r.status, 409); console.log("ok duplicate rejected");

      r = await call("POST", "/api/auth/logout");
      r = await call("POST", "/api/auth/login", { username: "testuser", password: "wrong" });
      assert.equal(r.status, 401); console.log("ok wrong password rejected");

      r = await call("POST", "/api/auth/login", { username: "testuser", password: "secret123" });
      assert.equal(r.status, 200); console.log("ok login");

      r = await call("GET", "/api/auth/me");
      assert.equal(r.body.user.username, "testuser");
      assert.equal(r.body.user.is_admin, true); console.log("ok me (admin)");

      const prog = { mastered: [1, 2, 3], fav: [5], srs: { 1: { e: 2.5, iv: 1, rp: 1, due: 123 } },
        xp: 50, streak: 2, lastDay: "2026-09-29", today: { date: "2026-09-29", count: 5 }, goal: 20 };
      r = await call("PUT", "/api/progress", prog);
      assert.equal(r.status, 200); console.log("ok progress save");

      r = await call("GET", "/api/progress");
      assert.deepEqual(r.body.progress.mastered, [1, 2, 3]); console.log("ok progress load");

      r = await call("GET", "/api/ai/status");
      assert.equal(r.body.server, false); assert.equal(r.body.mine, false);
      console.log("ok ai status (no key)");

      r = await call("POST", "/api/ai/grade", { source: "Hi", reference: "Chào", userText: "Chào", srcLang: "en" });
      assert.equal(r.status, 501); assert.equal(r.body.error, "NO_KEY");
      console.log("ok ai grade without key -> 501 NO_KEY");

      r = await call("PUT", "/api/ai/key", { key: "abc" });
      assert.equal(r.status, 400); assert.equal(r.body.error, "BAD_KEY_FORMAT");
      console.log("ok reject malformed key");

      r = await call("PUT", "/api/ai/key", { key: "AIzaSyFakeKeyForTestPurposesOnly123456" });
      assert.equal(r.status, 400); assert.equal(r.body.error, "INVALID_KEY");
      console.log("ok reject Google-invalid key");

      const { encryptKey, decryptKey } = require("./src/cryptoBox");
      assert.equal(decryptKey(encryptKey("AIzaSyFakeKeyForTestPurposesOnly123456")), "AIzaSyFakeKeyForTestPurposesOnly123456");
      console.log("ok AES-256 key roundtrip");
      const me = (await pool.query("SELECT id FROM users WHERE username = 'testuser'")).rows[0];
      await pool.query(`INSERT INTO user_keys (user_id, enc, updated_at) VALUES ($1, $2, $3)
        ON CONFLICT(user_id) DO UPDATE SET enc = excluded.enc`,
        [me.id, encryptKey("AIzaSyFakeKeyForTestPurposesOnly123456"), Date.now()]);
      r = await call("GET", "/api/ai/status");
      assert.equal(r.body.mine, true); assert.equal(r.body.masked, "••••3456");
      console.log("ok key status masked (never full key)");

      r = await call("POST", "/api/ai/grade", { source: "Hi", reference: "Chào", userText: "Chào", srcLang: "en" });
      assert.equal(r.status, 502); assert.equal(r.body.error, "AI_ERROR");
      console.log("ok grade uses user key (Google rejects fake -> 502, not NO_KEY)");

      r = await call("DELETE", "/api/ai/key");
      assert.equal(r.status, 200);
      r = await call("GET", "/api/ai/status");
      assert.equal(r.body.mine, false);
      console.log("ok key delete");

      cookie = "";
      r = await call("POST", "/api/ai/grade", { source: "Hi", userText: "Chào" });
      assert.equal(r.status, 401); console.log("ok ai grade requires login");

      r = await call("GET", "/");
      assert.equal(r.status, 200); console.log("ok frontend served");

      // admin: giao bài, học viên xem, xóa bài, chặn người thường
      r = await call("POST", "/api/auth/login", { username: "testuser", password: "secret123" });
      assert.equal(r.status, 200);
      r = await call("POST", "/api/admin/assignments",
        { title: "Ôn Du lịch", topic: "Du lịch", ids: [], due_date: "2026-12-31" });
      assert.equal(r.status, 200); const asId = r.body.id; console.log("ok admin create assignment");
      r = await call("GET", "/api/assignments");
      assert.ok(r.body.some(a => a.id === asId && a.title === "Ôn Du lịch"));
      console.log("ok assignment listed");
      r = await call("GET", "/api/admin/users");
      assert.ok(r.body.some(u => u.username === "testuser"));
      console.log("ok admin users list");

      await call("POST", "/api/auth/logout"); cookie = "";
      r = await call("POST", "/api/auth/register", { username: "pupil", password: "secret123" });
      assert.equal(r.status, 200);
      r = await call("POST", "/api/admin/assignments", { title: "X", topic: "", ids: [] });
      assert.equal(r.status, 403); console.log("ok non-admin blocked");
      r = await call("GET", "/api/assignments");
      assert.ok(r.body.some(a => a.id === asId)); console.log("ok pupil sees assignment");
      r = await call("DELETE", "/api/admin/assignments/" + asId);
      assert.equal(r.status, 403); console.log("ok pupil cannot delete");
      await call("POST", "/api/auth/logout"); cookie = "";
      await call("POST", "/api/auth/login", { username: "testuser", password: "secret123" });
      r = await call("DELETE", "/api/admin/assignments/" + asId);
      assert.equal(r.status, 200);
      r = await call("GET", "/api/assignments");
      assert.ok(!r.body.some(a => a.id === asId)); console.log("ok admin delete assignment");
      await pool.query("DELETE FROM users WHERE username = 'pupil'");
      console.log("ALL SMOKE TESTS PASSED");
    } catch (e) { console.error("SMOKE FAILED:", e.message); process.exitCode = 1; }
    finally { try { await clean(); } catch {} server.close(); pool.end(); }
  });
}).catch(e => { console.error("[fatal] DB boot failed:", e.message); process.exit(1); });
