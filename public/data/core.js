// core: data registry. Each d*.js sets C (category) + T (topic) then calls D(en, vi, level).
window.DB = [];
window.C = ""; window.T = "";
function D(en, vi, level) {
  window.DB.push({ id: window.DB.length + 1, en: en, vi: vi,
    category: window.C, topic: window.T, level: level || "A2" });
}
