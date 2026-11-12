/* Hell/Dunkel + Navigation, auf allen Seiten gleich */
(function () {
  const KEY = "ns-theme";
  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function apply(t) { document.documentElement.dataset.theme = t; const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = t === "dark" ? "#0f141b" : "#f3f5f8"; }
  const sys = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  apply(get() || sys);
  document.addEventListener("DOMContentLoaded", () => {
    const b = document.getElementById("themeBtn");
    if (!b) return;
    const label = () => { const d = document.documentElement.dataset.theme === "dark"; b.setAttribute("aria-label", d ? "Zum hellen Design wechseln" : "Zum dunklen Design wechseln"); b.title = d ? "Hell" : "Dunkel"; };
    label();
    b.onclick = () => { const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; apply(t); try { localStorage.setItem(KEY, t); } catch (e) {} label(); };
  });
})();
const Store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
};
