// English 1000 — app logic (vanilla JS, offline-first, Gemini optional)
const S = window.DB || [];
const $ = id => document.getElementById(id);
const store = {
  load() { try { return JSON.parse(localStorage.getItem("eng1000") || "{}"); } catch { return {}; } },
  save(d) { localStorage.setItem("eng1000", JSON.stringify(d)); }
};
const todayStr = () => new Date().toISOString().slice(0, 10);
let st = Object.assign({ mastered: [], fav: [], xp: 0, streak: 0, lastDay: "",
  today: { date: todayStr(), count: 0, ids: [] }, goal: 20, key: "", model: "gemini-2.0-flash",
  rate: 0.9, theme: "light", srs: {} }, store.load());
if (st.today.date !== todayStr()) st.today = { date: todayStr(), count: 0, ids: [] };
st.srs = st.srs || {};
function persist() { store.save(st); scheduleSync(); }
function touchDay(n, id) { // mỗi câu chỉ tính điểm 1 lần/ngày (chống cày điểm bằng câu cũ)
  if (st.lastDay !== todayStr()) {
    const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
    st.streak = (st.lastDay === y) ? st.streak + 1 : 1;
    st.lastDay = todayStr();
  }
  if (n > 0 && id != null) {
    st.today.ids = st.today.ids || [];
    if (st.today.ids.includes(id)) { persist(); renderHeader(); return; }
    st.today.ids.push(id);
    if (st.today.ids.length > 5000) st.today.ids = st.today.ids.slice(-5000);
  }
  st.today.count += n; st.xp += n * 10; persist(); renderHeader();
}
const masteredSet = new Set(st.mastered), favSet = new Set(st.fav);
function markMastered(id, on) { on ? masteredSet.add(id) : masteredSet.delete(id);
  st.mastered = [...masteredSet]; persist(); renderHeader(); }
function toggleFav(id) { favSet.has(id) ? favSet.delete(id) : favSet.add(id);
  st.fav = [...favSet]; persist(); return favSet.has(id); }
const TOTAL = S.length;
$("st-total").textContent = TOTAL; $("tab-list-n").textContent = TOTAL;

// ---------- SRS (lặp lại ngắt quãng, SM-2 rút gọn) ----------
// Mỗi câu có {e: độ dễ, iv: khoảng cách (ngày), rp: số lần nhớ liên tiếp, due: hạn ôn}.
// Trả lời đúng → hạn ôn giãn dần (1 → 6 → 15 → 40... ngày). Sai → ôn lại sau ~1 giờ.
const DAY = 864e5;
function srsGet(id) { return st.srs[id] || null; }
function isDue(id) { const r = srsGet(id); return !r || r.due <= Date.now(); }
function dueCount() { let n = 0; for (const x of S) if (isDue(x.id)) n++; return n; }
function srsUpdate(id, q) { // q: 0..5 (5 = nhớ hoàn hảo)
  let r = srsGet(id) || { e: 2.5, iv: 0, rp: 0, due: 0 };
  if (q < 3) { r.rp = 0; r.iv = 0.05; }
  else { r.rp++; r.iv = r.rp === 1 ? 1 : r.rp === 2 ? 6 : Math.round(r.iv * r.e);
    r.e = Math.max(1.3, r.e + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))); }
  r.due = Date.now() + r.iv * DAY;
  st.srs[id] = r; persist(); refreshDue();
}
function refreshDue() { const el = $("due-n"); if (el) el.textContent = dueCount(); }

// ---------- header / theme / toast ----------
function renderHeader() {
  $("st-mastered").textContent = masteredSet.size;
  $("st-xp").textContent = st.xp;
  $("st-streak").textContent = st.streak;
  const g = Math.min(100, Math.round(st.today.count / st.goal * 100));
  $("goal-fill").style.width = g + "%";
  $("goal-text").textContent = `Hôm nay: ${st.today.count}/${st.goal} câu (${g}%) — thuộc ${masteredSet.size}/${TOTAL}`;
}
let toastT;
function toast(m) { const t = $("toast"); t.textContent = m; t.classList.remove("hidden");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.add("hidden"), 2200); }
function applyTheme() { document.body.classList.toggle("dark", st.theme === "dark");
  $("btn-theme").textContent = st.theme === "dark" ? "☀️" : "🌙"; }
$("btn-theme").onclick = () => { st.theme = st.theme === "dark" ? "light" : "dark"; persist(); applyTheme(); };

// ---------- tabs ----------
document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => {
  document.querySelectorAll(".tabs button").forEach(x => x.classList.remove("active"));
  document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
  b.classList.add("active"); $(`tab-${b.dataset.tab}`).classList.add("active");
  if (b.dataset.tab === "stats") renderStats();
  if (b.dataset.tab === "list") renderList();
});

// ---------- topics ----------
let topics = [...new Set(S.map(x => x.topic))];
function fillTopics(sel, extra) {
  sel.innerHTML = (extra || "") + `<option value="">Tất cả chủ đề</option>` +
    topics.map(t => `<option>${t}</option>`).join("");
}
function rebuildTopics() {
  topics = [...new Set(S.map(x => x.topic))];
  const keep = {};
  ["fc-topic", "tr-topic", "dc-topic", "sp-topic", "qz-topic", "li-topic"].forEach(id => { keep[id] = $(id).value; });
  fillTopics($("fc-topic")); fillTopics($("tr-topic")); fillTopics($("dc-topic"));
  fillTopics($("sp-topic")); fillTopics($("qz-topic")); fillTopics($("li-topic"));
  Object.keys(keep).forEach(id => { const s = $(id); if ([...s.options].some(o => o.value === keep[id])) s.value = keep[id]; });
}
rebuildTopics();
function pool(topicSel, onlyUn, onlyFav, onlyDue) {
  let p = S.filter(x => !topicSel.value || x.topic === topicSel.value);
  if (onlyUn) p = p.filter(x => !masteredSet.has(x.id));
  if (onlyFav) p = p.filter(x => favSet.has(x.id));
  if (onlyDue) p = p.filter(x => isDue(x.id));
  return (p.length || onlyDue) ? p : S;
}

// ---------- TTS (đọc to — chống treo/sập trình duyệt mobile) ----------
// Nguyên nhân sập thường gặp: bấm Nghe dồn dập (cancel+speak liên tục treo engine),
// thiếu voice đúng ngôn ngữ, hoặc trình duyệt không hỗ trợ TTS.
let lastSpeakAt = 0, cachedVoices = null;
function ttsVoices() {
  try {
    const vs = speechSynthesis.getVoices();
    if (vs && vs.length) cachedVoices = vs;
  } catch {}
  return cachedVoices || [];
}
try {
  if ("speechSynthesis" in window) {
    ttsVoices();
    if (speechSynthesis.onvoiceschanged !== undefined)
      speechSynthesis.onvoiceschanged = () => { cachedVoices = null; ttsVoices(); };
  }
} catch {}
function pickVoice(lang) {
  const vs = ttsVoices(), L = String(lang || "en-US").toLowerCase();
  return vs.find(v => (v.lang || "").toLowerCase() === L)
    || vs.find(v => (v.lang || "").toLowerCase().startsWith(L.split("-")[0]))
    || null;
}
function speak(text, lang, rate) {
  if (!("speechSynthesis" in window)) { toast("Trình duyệt/bản này không hỗ trợ đọc to."); return; }
  try {
    const now = Date.now();
    if (now - lastSpeakAt < 500) return; // bấm dồn = treo engine TTS trên điện thoại
    lastSpeakAt = now;
    const say = String(text || "").slice(0, 500);
    if (!say.trim()) return;
    if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(say);
    u.lang = lang || "en-US";
    const v = pickVoice(u.lang); if (v) u.voice = v;
    let r = rate != null ? rate : parseFloat(st.rate);
    if (!isFinite(r)) r = 0.9;
    u.rate = Math.min(2, Math.max(0.5, r));
    u.volume = 1; u.pitch = 1;
    u.onend = u.onerror = () => {};
    speechSynthesis.speak(u);
  } catch (e) { toast("Không đọc được trên trình duyệt này."); }
}
// Hiện lỗi JS ra màn hình thay vì chết lặng (giúp báo lỗi chính xác hơn)
window.addEventListener("error", e => {
  try {
    const m = String((e && e.message) || "");
    if (m && !/Script error/i.test(m)) toast("Lỗi: " + m.slice(0, 90));
  } catch {}
});

// ---------- FLASHCARD ----------
let fcList = [], fcIdx = 0, fcFlipped = false;
function fcMode() { return $("fc-mode").value; }
function fcRefresh() {
  const due = $("fc-due").checked;
  fcList = pool($("fc-topic"), $("fc-unlearned").checked, $("fc-fav").checked, due);
  if (!fcList.length) { toast("🎉 Không còn câu đến hạn. Tuyệt vời!");
    $("fc-due").checked = false;
    fcList = pool($("fc-topic"), $("fc-unlearned").checked, $("fc-fav").checked, false); }
  fcIdx = 0; fcShow();
}
function fcDir(s) { const m = fcMode(); const dir = m === "mixed" ? (Math.random() < .5 ? "en-vi" : "vi-en") : m;
  s._dir = dir; return dir; }
function fcShow() {
  const s = fcList[fcIdx % fcList.length]; fcFlipped = false;
  const dir = fcDir(s);
  $("fc-topic-label").textContent = `#${s.id} · ${s.topic} · ${s.level}`;
  $("fc-front").textContent = dir === "en-vi" ? s.en : s.vi;
  $("fc-back").textContent = dir === "en-vi" ? s.vi : s.en;
  $("fc-back").classList.add("hidden");
  $("fc-count").textContent = `${(fcIdx % fcList.length) + 1}/${fcList.length}${masteredSet.has(s.id) ? " · ✅ đã thuộc" : ""}`;
  $("fc-fav-btn").textContent = favSet.has(s.id) ? "🧡 Đã yêu thích" : "🤍 Yêu thích";
}
function fcFlip() { fcFlipped = !fcFlipped; $("fc-back").classList.toggle("hidden", !fcFlipped); }
$("flashcard").onclick = fcFlip; $("fc-flip").onclick = fcFlip;
$("fc-next").onclick = () => { fcIdx++; fcShow(); };
$("fc-prev").onclick = () => { fcIdx = (fcIdx - 1 + fcList.length) % fcList.length; fcShow(); };
$("fc-shuffle").onclick = () => { fcList.sort(() => Math.random() - .5); fcIdx = 0; fcShow(); toast("Đã trộn!"); };
[$("fc-topic"), $("fc-mode"), $("fc-unlearned"), $("fc-fav"), $("fc-due")].forEach(el => el.onchange = fcRefresh);
$("fc-speak").onclick = e => { e.stopPropagation();
  const s = fcList[fcIdx % fcList.length];
  speak(s._dir === "vi-en" ? s.vi : s.en, s._dir === "vi-en" ? "vi-VN" : "en-US"); };
$("fc-known").onclick = () => { const s = fcList[fcIdx % fcList.length];
  markMastered(s.id, true); srsUpdate(s.id, 4); touchDay(1, s.id); fcIdx++; fcShow(); };
$("fc-unknown").onclick = () => { const s = fcList[fcIdx % fcList.length];
  markMastered(s.id, false); srsUpdate(s.id, 1); fcIdx++; fcShow(); };
$("fc-fav-btn").onclick = () => { const s = fcList[fcIdx % fcList.length];
  $("fc-fav-btn").textContent = toggleFav(s.id) ? "🧡 Đã yêu thích" : "🤍 Yêu thích"; };
document.addEventListener("keydown", e => {
  if (!$("tab-cards").classList.contains("active")) return;
  if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
  if (e.code === "Space") { e.preventDefault(); fcFlip(); }
  if (e.key === "ArrowRight") { fcIdx++; fcShow(); }
  if (e.key === "ArrowLeft") { fcIdx = (fcIdx - 1 + fcList.length) % fcList.length; fcShow(); }
});

// ---------- TRANSLATE ----------
let trCur = null;
function trNew() {
  const p = pool($("tr-topic"), false, false);
  // ưu tiên câu chưa thuộc
  const un = p.filter(x => !masteredSet.has(x.id));
  trCur = (un.length ? un : p)[Math.floor(Math.random() * (un.length ? un.length : p.length))];
  const viEn = $("tr-mode").value === "vi-en";
  $("tr-src").textContent = viEn ? trCur.vi : trCur.en;
  $("tr-input").value = ""; $("tr-result").innerHTML = "";
  $("tr-answer").classList.add("hidden");
  $("tr-input").focus();
}
$("tr-new").onclick = trNew; $("tr-topic").onchange = trNew; $("tr-mode").onchange = trNew;
$("tr-speak-src").onclick = () => { if (!trCur) return;
  const viEn = $("tr-mode").value === "vi-en";
  speak(viEn ? trCur.vi : trCur.en, viEn ? "vi-VN" : "en-US"); };
const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
function lev(a, b) { const m = a.length, n = b.length, d = [...Array(m + 1)].map((_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return d[m][n]; }
function localScore(user, ref) {
  const u = norm(user), r = norm(ref);
  if (!u) return { pct: 0, cls: "poor", msg: "Bạn chưa nhập gì." };
  if (u === r) return { pct: 100, cls: "good", msg: "Chính xác 100%! Tuyệt vời! 🎉" };
  const sim = Math.max(0, 1 - lev(u, r) / Math.max(r.length, 1));
  const pct = Math.round(sim * 100);
  if (pct >= 80) return { pct, cls: "good", msg: `Rất tốt! Độ khớp ${pct}%. Chỉ sai khác nhỏ.` };
  if (pct >= 55) return { pct, cls: "mid", msg: `Khá ổn (${pct}%). So sánh với đáp án bên dưới nhé.` };
  return { pct, cls: "poor", msg: `Chưa đúng lắm (${pct}%). Xem đáp án và thử lại câu khác nhé.` };
}
$("tr-check").onclick = () => {
  if (!trCur) return;
  const viEn = $("tr-mode").value === "vi-en";
  const ref = viEn ? trCur.en : trCur.vi;
  const r = localScore($("tr-input").value, ref);
  $("tr-result").innerHTML = `<span class="${r.cls}">${r.msg}</span>`;
  $("tr-answer").textContent = "✅ Đáp án: " + ref;
  $("tr-answer").classList.remove("hidden");
  if (r.pct >= 80) { if (!masteredSet.has(trCur.id)) { markMastered(trCur.id, true); }
    srsUpdate(trCur.id, r.pct === 100 ? 5 : 4); touchDay(1, trCur.id); }
  else { srsUpdate(trCur.id, r.pct >= 55 ? 3 : 2); touchDay(0); persist(); renderHeader(); }
};
$("tr-show").onclick = () => { if (!trCur) return;
  const viEn = $("tr-mode").value === "vi-en";
  $("tr-answer").textContent = "✅ Đáp án: " + (viEn ? trCur.en : trCur.vi);
  $("tr-answer").classList.remove("hidden"); };
$("tr-input").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("tr-check").click(); } });

// --- Gemini ---
async function gemini(prompt) {
  // Key không còn nằm ở trình duyệt — mọi lệnh gọi AI đi qua server.
  // Giữ hàm này để báo rõ nếu code cũ nào còn gọi tới.
  throw new Error("Key đã chuyển lên server. Đăng nhập và thêm key trong ⚙️ Cài đặt.");
}
async function showAiFeedback(fb, quota) {
  const tag = quota === "shared" ? " <i>(dùng key chung của server)</i>" : "";
  $("tr-result").innerHTML = `<div class="ai-feedback">🤖 <b>Gemini nhận xét:</b>${tag}\n${String(fb).replace(/</g, "&lt;")}</div>`;
  touchDay(1, trCur.id);
}
function openKeySettings() {
  $("modal").classList.remove("hidden");
  refreshKeySettings();
  toast("Thêm key Gemini miễn phí của bạn để chấm bài.");
}
$("tr-ai").onclick = async () => {
  if (!trCur) return;
  const user = $("tr-input").value.trim();
  if (!user) { toast("Gõ bản dịch trước rồi hẵng chấm AI."); return; }
  if (!me) { toast("Đăng nhập để dùng AI chấm bài."); auMode(false); $("modal-auth").classList.remove("hidden"); return; }
  const viEn = $("tr-mode").value === "vi-en";
  $("tr-result").innerHTML = "🤖 Gemini đang chấm...";
  try {
    const r = await fetch("api/ai/grade", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: viEn ? trCur.vi : trCur.en,
        reference: viEn ? trCur.en : trCur.vi, userText: user,
        srcLang: viEn ? "vi" : "en", model: st.model }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { await showAiFeedback(j.feedback, j.quota); return; }
    if (r.status === 501) { openKeySettings(); return; }
    if (r.status === 429) { $("tr-result").innerHTML = `<span class="poor">Bạn chấm nhiều quá — nghỉ chút rồi thử lại (30 lượt/giờ).</span>`; return; }
    throw new Error(j.error || r.status);
  } catch (e) { $("tr-result").innerHTML = `<span class="poor">Server bận, thử lại sau.</span>`; }
};
async function refreshKeySettings() {
  const box = $("server-key-status");
  $("migrate-box").classList.toggle("hidden", !(me && st.key));
  if (!me) {
    box.textContent = "⚠️ Đăng nhập trước để thêm key Gemini của bạn.";
    $("ai-status").textContent = "";
    return;
  }
  try {
    const j = await (await fetch("api/ai/status")).json();
    box.innerHTML = j.mine
      ? `✅ Đã lưu key <b>${j.masked}</b> — AI chấm bằng quota của bạn. Muốn đổi thì dán key mới rồi bấm Lưu.`
      : (j.server ? "Server đã có key chung — bạn vẫn nên thêm key riêng để chủ động quota."
        : "Chưa có key — dán key miễn phí của bạn vào ô bên dưới rồi bấm Lưu & kiểm tra.");
  } catch { box.textContent = "Không nối được server."; }
}
$("btn-save-key").onclick = async () => {
  st.model = $("set-model").value; persist();
  const key = $("set-key").value.trim();
  if (!me) { toast("Đăng nhập trước đã."); return; }
  if (!key) { toast("Dán key vào ô trước."); return; }
  $("ai-status").textContent = "Đang kiểm tra key với Google...";
  try {
    const r = await fetch("api/ai/key", { method: "PUT",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key }) });
    const j = await r.json();
    if (r.ok) {
      $("ai-status").textContent = `✅ Key ${j.masked} hợp lệ — đã mã hóa trên server!`;
      $("set-key").value = ""; refreshKeySettings(); toast("Đã lưu key!");
    } else $("ai-status").textContent = {
      BAD_KEY_FORMAT: "❌ Key sai định dạng (phải bắt đầu bằng AIza...).",
      INVALID_KEY: "❌ Google báo key không hợp lệ.",
      RATE_LIMIT: "❌ Thử nhiều quá, quay lại sau.",
      VERIFY_FAILED: "❌ Không kiểm tra được (mạng/Google bận).",
      LOGIN_REQUIRED: "❌ Hãy đăng nhập." }[j.error] || "❌ Lỗi.";
  } catch { $("ai-status").textContent = "❌ Không nối được server."; }
};
$("btn-del-key").onclick = async () => {
  if (!me) return;
  if (!confirm("Xóa key khỏi server? Sau đó AI sẽ không chấm được nữa.")) return;
  try { await fetch("api/ai/key", { method: "DELETE" }); } catch {}
  refreshKeySettings(); toast("Đã xóa key.");
};
$("btn-migrate-key").onclick = async () => { // chuyển key cũ từ trình duyệt lên server rồi xóa local
  if (!me || !st.key) return;
  try {
    const r = await fetch("api/ai/key", { method: "PUT",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: st.key }) });
    if (r.ok) { st.key = ""; persist(); $("set-key").value = ""; refreshKeySettings(); toast("Đã chuyển key lên server và xóa khỏi máy!"); }
    else $("ai-status").textContent = "❌ Key cũ không hợp lệ — nhập key mới.";
  } catch { $("ai-status").textContent = "❌ Không nối được server."; }
};

// ---------- QUIZ ----------
let qzCur = null, qzLock = false, qzC = 0, qzT = 0;
function qzNew() {
  const p = pool($("qz-topic"), false, false);
  qzCur = p[Math.floor(Math.random() * p.length)];
  const viEn = $("qz-mode").value === "vi-en";
  $("qz-q").textContent = (viEn ? qzCur.vi : qzCur.en);
  const others = S.filter(x => x.id !== qzCur.id).sort(() => Math.random() - .5).slice(0, 3);
  const opts = [qzCur, ...others].sort(() => Math.random() - .5);
  qzLock = false; $("qz-result").innerHTML = "";
  $("qz-opts").innerHTML = "";
  opts.forEach(o => {
    const b = document.createElement("button");
    b.className = "qz-opt"; b.textContent = viEn ? o.en : o.vi;
    b.onclick = () => {
      if (qzLock) return; qzLock = true; qzT++;
      if (o.id === qzCur.id) { b.classList.add("correct"); qzC++;
        $("qz-result").innerHTML = `<span class="good">Đúng rồi! 🎉</span>`;
        markMastered(qzCur.id, true); srsUpdate(qzCur.id, 4); touchDay(1, qzCur.id);
      } else { b.classList.add("wrong");
        [...$("qz-opts").children].forEach(x => { if (x.textContent === (viEn ? qzCur.en : qzCur.vi)) x.classList.add("correct"); });
        $("qz-result").innerHTML = `<span class="poor">Sai rồi. Đáp án đúng được tô xanh.</span>`;
        srsUpdate(qzCur.id, 2); touchDay(0); persist(); renderHeader();
      }
      $("qz-correct").textContent = qzC; $("qz-total").textContent = qzT;
      $("qz-rate").textContent = Math.round(qzC / qzT * 100) + "%";
      setTimeout(qzNew, 1400);
    };
    $("qz-opts").appendChild(b);
  });
}
$("qz-new").onclick = qzNew; $("qz-topic").onchange = qzNew; $("qz-mode").onchange = qzNew;

// ---------- LIST ----------
let liPage = 0; const PER = 20;
function liFiltered() {
  const q = norm($("li-search").value);
  return S.filter(x =>
    (!$("li-topic").value || x.topic === $("li-topic").value) &&
    (!$("li-level").value || x.level === $("li-level").value) &&
    ($("li-filter").value !== "mastered" || masteredSet.has(x.id)) &&
    ($("li-filter").value !== "unlearned" || !masteredSet.has(x.id)) &&
    ($("li-filter").value !== "due" || isDue(x.id)) &&
    ($("li-filter").value !== "fav" || favSet.has(x.id)) &&
    (!q || norm(x.en).includes(q) || norm(x.vi).includes(q)));
}
function renderList() {
  const f = liFiltered();
  const pages = Math.max(1, Math.ceil(f.length / PER));
  liPage = Math.min(liPage, pages - 1);
  $("li-count").textContent = `Hiển thị ${f.length} câu`;
  $("li-page").textContent = `${liPage + 1}/${pages}`;
  $("li-list").innerHTML = "";
  f.slice(liPage * PER, liPage * PER + PER).forEach(x => {
    const d = document.createElement("div"); d.className = "sent";
    d.innerHTML = `<div class="en">${x.id}. ${x.en.replace(/</g, "&lt;")}</div>
      <div class="vi">${x.vi.replace(/</g, "&lt;")}</div>
      <div class="meta"><span class="tag">${x.topic}</span><span class="tag">${x.level}</span></div>`;
    const meta = d.querySelector(".meta");
    const mk = (t, cls, fn) => { const b = document.createElement("button");
      b.className = "mini " + cls; b.textContent = t; b.onclick = fn; meta.appendChild(b); return b; };
    mk("🔊", "", () => speak(x.en, "en-US"));
    const bk = mk(masteredSet.has(x.id) ? "✅ Đã thuộc" : "✔ Thuộc", masteredSet.has(x.id) ? "on" : "", () => {
      const on = !masteredSet.has(x.id); markMastered(x.id, on);
      bk.textContent = on ? "✅ Đã thuộc" : "✔ Thuộc"; bk.classList.toggle("on", on); if (on) touchDay(1, x.id); });
    const fb = mk(favSet.has(x.id) ? "🧡" : "🤍", favSet.has(x.id) ? "favon" : "", () => {
      const on = toggleFav(x.id); fb.textContent = on ? "🧡" : "🤍"; fb.classList.toggle("favon", on); });
    $("li-list").appendChild(d);
  });
}
["li-search", "li-topic", "li-level", "li-filter"].forEach(id =>
  $(id).addEventListener("input", () => { liPage = 0; renderList(); }));
$("li-prev").onclick = () => { liPage = Math.max(0, liPage - 1); renderList(); };
$("li-next").onclick = () => { liPage++; renderList(); };

// ---------- STATS ----------
function renderStats() {
  const m = masteredSet.size;
  $("s-total").textContent = Math.round(m / TOTAL * 100) + "%";
  $("s-total-sub").textContent = `Tiến độ thuộc (${m}/${TOTAL})`;
  $("s-bar").style.width = (m / TOTAL * 100) + "%";
  $("s-xp").textContent = st.xp; $("s-streak").textContent = st.streak + " 🔥";
  $("s-today").textContent = st.today.count;
  $("topic-bars").innerHTML = "";
  topics.forEach(t => {
    const all = S.filter(x => x.topic === t), done = all.filter(x => masteredSet.has(x.id)).length;
    const row = document.createElement("div"); row.className = "trow";
    row.innerHTML = `<div>${t} <small>${done}/${all.length}</small></div><div class="bar" style="width:120px"><div style="width:${Math.round(done / all.length * 100)}%"></div></div>`;
    $("topic-bars").appendChild(row);
  });
}
$("btn-export").onclick = () => {
  const blob = new Blob([JSON.stringify(st)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = "english1000-backup.json"; a.click();
};
$("btn-import").onclick = () => $("file-import").click();
$("file-import").onchange = e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { try { st = Object.assign(st, JSON.parse(r.result));
    masteredSet.clear(); st.mastered.forEach(i => masteredSet.add(i));
    favSet.clear(); st.fav.forEach(i => favSet.add(i));
    persist(); renderHeader(); renderStats(); toast("Đã nhập sao lưu!"); location.reload();
  } catch { toast("File không hợp lệ."); } };
  r.readAsText(f);
};
$("btn-reset").onclick = () => { if (confirm("Xóa toàn bộ tiến độ?")) {
  localStorage.removeItem("eng1000"); location.reload(); } };

// ---------- SETTINGS ----------
$("btn-settings").onclick = () => {
  $("set-key").value = ""; // không bao giờ hiện lại key (server chỉ trả 4 ký tự cuối)
  $("set-model").value = st.model;
  $("set-goal").value = st.goal; $("set-rate").value = st.rate;
  $("ai-status").textContent = "";
  $("modal").classList.remove("hidden");
  refreshKeySettings();
};
$("modal-close").onclick = () => {
  // LƯU Ý: key trong ô set-key KHÔNG lưu local — chỉ lưu qua nút "Lưu & kiểm tra key" (mã hóa trên server)
  st.model = $("set-model").value;
  st.goal = parseInt($("set-goal").value) || 20; st.rate = parseFloat($("set-rate").value) || 0.9;
  persist(); renderHeader(); $("modal").classList.add("hidden"); toast("Đã lưu cài đặt!");
};
$("modal").addEventListener("click", e => { if (e.target.id === "modal") $("modal-close").click(); });

// ---------- DICTATION (Nghe–gõ: Listening + Writing) ----------
let dcCur = null, dcPlays = 0;
function dcNew() {
  const p = pool($("dc-topic"), false, false);
  const un = p.filter(x => !masteredSet.has(x.id));
  dcCur = (un.length ? un : p)[Math.floor(Math.random() * (un.length ? un.length : p.length))];
  dcPlays = 0;
  $("dc-input").value = ""; $("dc-result").innerHTML = "";
  $("dc-hint-box").classList.add("hidden");
  dcPlayLabel(); // không tự đọc khi mới mở trang (trình duyệt chặn + gây giật mình)
}
function dcPlayLabel() {
  $("dc-play").textContent = dcPlays === 0 ? "▶ Nghe" : `▶ Nghe lại (${3 - dcPlays} lượt)`;
  $("dc-plays").textContent = dcPlays === 0 ? "Bấm Nghe để bắt đầu" : `Đã nghe ${dcPlays}/3 lần`;
}
function dcPlay(slow) {
  if (!dcCur) return;
  if (dcPlays >= 3) { toast("Hết lượt nghe! Cứ đoán đi, sai cũng nhớ lâu hơn."); return; }
  speak(dcCur.en, "en-US", slow ? 0.5 : undefined); // dùng chung TTS đã chống treo
  dcPlays++; dcPlayLabel();
}
$("dc-new").onclick = dcNew; $("dc-topic").onchange = dcNew;
$("dc-play").onclick = () => dcPlay(false);
$("dc-slow").onclick = () => dcPlay(true);
function wordDiff(user, ref) { // tô từng từ đúng/sai so với đáp án
  const u = norm(user).split(" "), r = norm(ref).split(" ");
  return r.map((w, i) => u[i] === w
    ? `<span class="w-ok">${ref.split(" ")[i]}</span>`
    : `<span class="w-bad">${ref.split(" ")[i]}</span>`).join(" ");
}
$("dc-check").onclick = () => {
  if (!dcCur) return;
  const r = localScore($("dc-input").value, dcCur.en);
  const detail = wordDiff($("dc-input").value, dcCur.en);
  $("dc-result").innerHTML = `<span class="${r.cls}">${r.msg}</span><div class="ai-feedback">${detail}</div>
    <div class="note">Nghĩa Việt: ${dcCur.vi.replace(/</g, "&lt;")}</div>`;
  if (r.pct >= 80) { markMastered(dcCur.id, true); srsUpdate(dcCur.id, r.pct === 100 ? 5 : 4); touchDay(1, dcCur.id); }
  else { srsUpdate(dcCur.id, r.pct >= 55 ? 3 : 2); touchDay(0); persist(); renderHeader(); }
};
$("dc-hint").onclick = () => { if (!dcCur) return;
  $("dc-hint-box").textContent = "💡 Nghĩa Việt: " + dcCur.vi;
  $("dc-hint-box").classList.remove("hidden"); };
$("dc-input").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("dc-check").click(); } });

// ---------- SPEAKING (Luyện nói: shadowing + chấm phát âm) ----------
let spCur = null, recognizing = false, mediaRec = null, audioChunks = [], recording = false;
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
function spNew(auto) {
  const p = pool($("sp-topic"), false, false);
  const un = p.filter(x => !masteredSet.has(x.id));
  spCur = (un.length ? un : p)[Math.floor(Math.random() * (un.length ? un.length : p.length))];
  $("sp-text").textContent = spCur.en;
  $("sp-vi").textContent = spCur.vi;
  $("sp-result").innerHTML = "";
  if (auto && $("sp-mode").value === "shadow") speak(spCur.en, "en-US");
}
$("sp-new").onclick = () => spNew(true); $("sp-topic").onchange = () => spNew(true); $("sp-mode").onchange = () => spNew(true);
$("sp-listen").onclick = () => { if (spCur) speak(spCur.en, "en-US"); };
function spScore(said) { // % từ đọc đúng (theo thứ tự)
  const u = norm(said).split(" "), r = norm(spCur.en).split(" ");
  let ok = 0; r.forEach((w, i) => { if (u[i] === w) ok++; });
  return { pct: Math.round(ok / r.length * 100), html: wordDiff(said, spCur.en) };
}
$("sp-rec").onclick = () => {
  if (!spCur) return;
  if (SR && !recording) { // chấm tự động bằng nhận dạng giọng nói
    const rec = new SR(); rec.lang = "en-US"; rec.interimResults = false; rec.maxAlternatives = 1;
    recognizing = true; $("sp-rec").textContent = "🔴 Đang nghe... nói đi!";
    $("sp-result").innerHTML = `<span class="note">🎙 Hãy đọc to câu trên...</span>`;
    rec.onresult = e => {
      const said = e.results[0][0].transcript;
      const s = spScore(said);
      const cls = s.pct >= 80 ? "good" : s.pct >= 55 ? "mid" : "poor";
      $("sp-result").innerHTML = `<div>Bạn đọc: <i>"${said.replace(/</g, "&lt;")}"</i></div>
        <div class="${cls}">Đúng ${s.pct}% số từ</div><div class="ai-feedback">${s.html}</div>`;
      srsUpdate(spCur.id, s.pct >= 80 ? 4 : s.pct >= 55 ? 3 : 2);
      if (s.pct >= 80) markMastered(spCur.id, true);
      touchDay(1, spCur.id); resetSpBtn();
    };
    rec.onerror = e => { $("sp-result").innerHTML = `<span class="poor">Không nghe rõ (${e.error}). Thử lại, nói to và gần mic.</span>`; resetSpBtn(); };
    rec.onend = () => { if (recognizing) resetSpBtn(); };
    try { rec.start(); } catch { resetSpBtn(); }
    recognizing = false;
  } else if (!recording) { // thu âm thường để tự nghe lại (mọi trình duyệt)
    if (!navigator.mediaDevices?.getUserMedia) { toast("Trình duyệt không có mic."); return; }
    navigator.mediaDevices.getUserMedia({ audio: true }).then(stream => {
      audioChunks = []; mediaRec = new MediaRecorder(stream);
      mediaRec.ondataavailable = e => audioChunks.push(e.data);
      mediaRec.onstop = () => {
        const url = URL.createObjectURL(new Blob(audioChunks, { type: "audio/webm" }));
        $("sp-result").innerHTML = `<div class="note">🔈 Nghe lại giọng bạn:</div>
          <audio controls src="${url}"></audio>
          <div class="tr-btns" style="margin-top:8px">
            <button class="btn success small" id="sp-ok">✔ Đọc đạt</button>
            <button class="btn danger small" id="sp-no">✖ Chưa đạt</button></div>`;
        $("sp-ok").onclick = () => { markMastered(spCur.id, true); srsUpdate(spCur.id, 4); touchDay(1, spCur.id); toast("Tuyệt! Câu mới nào."); spNew(); };
        $("sp-no").onclick = () => { srsUpdate(spCur.id, 2); touchDay(0); toast("Luyện lại nhé!"); spNew(); };
        resetSpBtn();
      };
      mediaRec.start(); recording = true;
      $("sp-rec").textContent = "⏹ Dừng & nghe lại";
    }).catch(() => toast("Chưa cấp quyền micro."));
  } else { recording = false; mediaRec?.stop(); }
};
function resetSpBtn() { recognizing = false; recording = false; $("sp-rec").textContent = "🎙 Thu âm & chấm"; }

// ---------- STATS (SRS info) ----------
const _renderStats = renderStats;
renderStats = function() {
  _renderStats();
  $("srs-info").textContent = `Còn ${dueCount()} câu đến hạn ôn hôm nay (câu mới + câu sắp quên). Bật ⏰ “Đến hạn ôn” trong Flashcard hoặc cứ luyện bình thường — app tự giãn lịch ôn theo trí nhớ của bạn.`;
};

// ---------- BACKEND: auth + đồng bộ tiến độ ----------
// Chưa đăng nhập: học offline như cũ (localStorage). Đăng nhập: tiến độ đẩy lên
// server (chống mất, đổi máy vẫn còn), key cá nhân KHÔNG bao giờ gửi lên server.
let me = null, syncT = null;
function renderAuth() {
  const a = $("auth-area");
  if (me) { a.innerHTML = "";
    const s = document.createElement("span"); s.textContent = "👤 " + me.username + " ";
    const b = document.createElement("button"); b.className = "btn small"; b.textContent = "Thoát";
    b.onclick = async () => { try { await fetch("api/auth/logout", { method: "POST" }); } catch {}
      me = null; renderAuth(); toast("Đã đăng xuất (tiến độ vẫn giữ trên máy này)."); };
    a.appendChild(s); a.appendChild(b);
  } else { a.innerHTML = "";
    const b = document.createElement("button"); b.className = "btn small"; b.textContent = "👤 Đăng nhập";
    b.onclick = () => { auMode("login"); $("modal-auth").classList.remove("hidden"); };
    a.appendChild(b);
  }
}
let auReg = false;
function auMode(reg) {
  auReg = reg;
  $("au-tab-login").className = reg ? "btn" : "btn primary";
  $("au-tab-register").className = reg ? "btn primary" : "btn";
  $("au-submit").textContent = reg ? "✔ Đăng ký" : "✔ Đăng nhập";
  $("au-err").textContent = "";
}
$("au-tab-login").onclick = () => auMode(false);
$("au-tab-register").onclick = () => auMode(true);
$("au-close").onclick = () => $("modal-auth").classList.add("hidden");
$("modal-auth").addEventListener("click", e => { if (e.target.id === "modal-auth") $("au-close").click(); });
$("au-submit").onclick = async () => {
  const username = $("au-user").value.trim(), password = $("au-pass").value;
  $("au-err").textContent = "";
  try {
    const r = await fetch(auReg ? "api/auth/register" : "api/auth/login", { method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }) });
    const j = await r.json();
    if (!r.ok) {
      $("au-err").textContent = { BAD_INPUT: "Tên 3–20 ký tự (chữ/số/._), mật khẩu ≥ 6 ký tự.",
        USER_EXISTS: "Tên này đã có người dùng.", WRONG_LOGIN: "Sai tên hoặc mật khẩu." }[j.error] || "Lỗi, thử lại.";
      return;
    }
    me = j; $("modal-auth").classList.add("hidden"); $("au-pass").value = "";
    renderAuth(); toast(`Chào ${me.username}! Đang đồng bộ tiến độ...`);
    await pullProgress();
  } catch { $("au-err").textContent = "Không nối được server."; }
};
$("au-pass").addEventListener("keydown", e => { if (e.key === "Enter") $("au-submit").click(); });

function scheduleSync() { // gọi sau mỗi lần persist(); chỉ chạy khi đã đăng nhập
  if (!me) return;
  clearTimeout(syncT); syncT = setTimeout(pushProgress, 2000);
}
async function pushProgress() {
  if (!me) return;
  try { await fetch("api/progress", { method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mastered: st.mastered, fav: st.fav, srs: st.srs,
      xp: st.xp, streak: st.streak, lastDay: st.lastDay, today: st.today, goal: st.goal }) }); }
  catch {}
}
async function pullProgress() {
  if (!me) return;
  try {
    const p = (await (await fetch("api/progress")).json()).progress;
    const localActive = st.xp > 0 || st.mastered.length > 0;
    const serverActive = p && (p.xp > 0 || (p.mastered || []).length > 0);
    if (!serverActive && localActive) { pushProgress(); toast("Đã đẩy tiến độ máy này lên server."); return; }
    if (!serverActive) return;
    (p.mastered || []).forEach(id => masteredSet.add(id));
    (p.fav || []).forEach(id => favSet.add(id));
    st.mastered = [...masteredSet]; st.fav = [...favSet];
    st.srs = Object.assign({}, p.srs || {}, st.srs || {});
    st.xp = Math.max(st.xp, p.xp || 0); st.streak = Math.max(st.streak, p.streak || 0);
    if (p.goal) st.goal = p.goal;
    persist(); renderHeader(); refreshDue();
    if ($("tab-stats").classList.contains("active")) renderStats();
    if ($("tab-list").classList.contains("active")) renderList();
    toast("Đã đồng bộ tiến độ từ server!");
    pushProgress(); // hội tụ 2 chiều
  } catch {}
}
async function refreshMe() {
  try { me = (await (await fetch("api/auth/me")).json()).user; }
  catch { me = null; }
  renderAuth();
  if (me) pullProgress();
}

// ---------- init ----------
$("sp-support").textContent = SR ? "trình duyệt hỗ trợ chấm phát âm tự động ✅" : "trình duyệt này không chấm tự động — vẫn thu âm nghe lại được";
async function boot() {
  try { // server là nguồn câu chính; rớt mạng thì dùng 12 file data/*.js có sẵn
    const r = await fetch("api/sentences");
    if (r.ok) { const j = await r.json();
      if (Array.isArray(j) && j.length) { S.length = 0; j.forEach(x => S.push(x)); rebuildTopics(); } }
  } catch {}
  applyTheme(); renderHeader(); refreshDue(); fcRefresh(); trNew(); dcNew(); spNew(false); qzNew(); renderList();
  await refreshMe();
}
boot();
