// Service Worker: cài app + học offline. Tăng VER mỗi lần đổi file tĩnh.
const VER = "eng2000-v11";
const CORE = ["/", "/index.html", "/styles.css", "/app.js?v=11", "/manifest.json",
  "/data/core.js", "/data/d1.js", "/data/d2.js", "/data/d3.js", "/data/d4.js",
  "/data/d5.js", "/data/d6.js", "/data/d7.js", "/data/d8.js", "/data/d9.js",
  "/data/d10.js", "/data/d11.js", "/data/d12.js", "/data/d13.js", "/data/d14.js",
  "/data/d15.js", "/data/d16.js", "/data/d17.js", "/data/d18.js", "/data/d19.js",
  "/data/d20.js",
  "/icons/icon-192.png", "/icons/icon-512.png", "/icons/maskable-512.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VER).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (e.request.method !== "GET" || u.origin !== location.origin) return;
  if (u.pathname.startsWith("/api/")) {
    // câu hỏi: mạng trước, rớt mạng dùng bản đã lưu (vẫn học offline được)
    if (u.pathname === "/api/sentences") {
      e.respondWith(fetch(e.request).then(r => {
        const c = r.clone();
        caches.open(VER).then(cc => cc.put(e.request, c));
        return r;
      }).catch(() => caches.match(e.request)));
    }
    return; // API còn lại: chỉ mạng (đăng nhập, đồng bộ, AI)
  }
  e.respondWith(caches.match(e.request).then(hit => hit ||
    fetch(e.request).then(r => {
      const c = r.clone();
      caches.open(VER).then(cc => cc.put(e.request, c));
      return r;
    }).catch(() => caches.match("/index.html"))));
});
