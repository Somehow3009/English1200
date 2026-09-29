"use strict";
// Smoke test: boot app trên port ngẫu nhiên, kiểm tra API chính. Chạy: npm run smoke
process.env.DB_PATH = require("os").tmpdir() + "/eng1200-smoke.db";
try { require("fs").unlinkSync(process.env.DB_PATH); } catch {}
const assert = require("assert");
const app = require("./src/index");

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
  try {
    let r = await call("GET", "/api/health");
    assert.equal(r.status, 200); assert.equal(r.body.ok, true); console.log("ok health");

    r = await call("GET", "/api/sentences");
    assert.equal(r.status, 200); assert.equal(r.body.length, 1200, "sentences=" + r.body.length);
    console.log("ok sentences x1200");

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
    assert.equal(r.body.user.username, "testuser"); console.log("ok me");

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

    // chèn key mã hóa trực tiếp để test đường dùng key user (Google sẽ từ chối fake key này)
    const { encryptKey, decryptKey } = require("./src/cryptoBox");
    assert.equal(decryptKey(encryptKey("AIzaSyFakeKeyForTestPurposesOnly123456")), "AIzaSyFakeKeyForTestPurposesOnly123456");
    console.log("ok AES-256 key roundtrip");
    const { db } = require("./src/db");
    const me = db.prepare("SELECT id FROM users WHERE username = 'testuser'").get();
    db.prepare("INSERT INTO user_keys (user_id, enc, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET enc=excluded.enc")
      .run(me.id, encryptKey("AIzaSyFakeKeyForTestPurposesOnly123456"), Date.now());
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
    console.log("ALL SMOKE TESTS PASSED");
  } catch (e) { console.error("SMOKE FAILED:", e.message); process.exitCode = 1; }
  finally { server.close(); }
});
