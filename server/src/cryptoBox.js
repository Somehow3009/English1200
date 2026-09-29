"use strict";
// Mã hóa key Gemini của từng user (AES-256-GCM). Chìa khóa nằm ở MASTER_SECRET trong .env.
const crypto = require("crypto");

let MASTER = process.env.MASTER_SECRET || "";
if (!/^[0-9a-fA-F]{64}$/.test(MASTER)) {
  MASTER = crypto.randomBytes(32).toString("hex");
  console.warn("[warn] MASTER_SECRET chưa cấu hình — dùng khóa tạm, key user sẽ MẤT khi restart. " +
    "Hãy tạo bằng: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" rồi cho vào .env");
}
const KEY = Buffer.from(MASTER, "hex");

function encryptKey(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const ct = Buffer.concat([c.update(String(plain), "utf8"), c.final()]);
  return `gcm:${iv.toString("hex")}:${ct.toString("hex")}:${c.getAuthTag().toString("hex")}`;
}

function decryptKey(s) {
  const parts = String(s).split(":");
  if (parts.length !== 4 || parts[0] !== "gcm") throw new Error("BAD_ENC");
  const d = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(parts[1], "hex"));
  d.setAuthTag(Buffer.from(parts[3], "hex"));
  return d.update(Buffer.from(parts[2], "hex"), null, "utf8") + d.final("utf8");
}

module.exports = { encryptKey, decryptKey };
