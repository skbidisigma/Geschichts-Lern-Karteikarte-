/* Karteikarten mit gespeicherter Wiederholung: Jede Karte hat eine Stufe 0–5.
   Richtig = eine Stufe höher und längere Pause, falsch = zurück und sofort wieder.
   Gespeichert wird nur in diesem Browser. */
const KEY = "ns-karten-v2";
const MIN = 60000, STEP = [0, 10 * MIN, 60 * MIN, 5 * 60 * MIN, 24 * 60 * MIN, 72 * 60 * MIN];
const $ = id => document.getElementById(id);
let data = Store.get(KEY, {});
data.cards = data.cards || {};
data.prefs = Object.assign({scope: "pflicht", topic: "all", dir: "event", mode: "flip"}, data.prefs || {});
const prefs = data.prefs;
const save = () => Store.set(KEY, data);
const st = id => data.cards[id] || (data.cards[id] = {b: 0, due: 0, r: 0, w: 0, last: 0, p: {d: 0, m: 0, y: 0}});
const seen = c => !!(data.cards[c.id] && data.cards[c.id].last);
const PFLICHT = EVENTS.filter(e => e.tier === 1);

function pool() { return EVENTS.filter(e => (prefs.scope === "alle" || e.tier === 1) && (prefs.topic === "all" || e.t === prefs.topic)); }
function weakness(c) { const s = st(c.id); if (!s.last) return 0; return s.w / (s.r + s.w || 1) * 10 + (5 - s.b) + Math.min(s.w, 5); }
function smartSet() {
  const now = Date.now(), p = pool();
  const due = p.filter(c => seen(c) && st(c.id).due <= now).sort((a, b) => weakness(b) - weakness(a));
  const fresh = p.filter(c => !seen(c)).slice(0, due.length > 12 ? 4 : 7);
  return {due, fresh, set: due.slice(0, 20 - fresh.length).concat(fresh)};
}
function nextDue() { const t = pool().filter(seen).map(c => st(c.id).due).sort((a, b) => a - b)[0]; return t ? Math.max(0, t - Date.now()) : null; }
function dur(ms) { const m = Math.ceil(ms / MIN); return m < 60 ? m + " Min." : m < 1440 ? Math.round(m / 60) + " Std." : Math.round(m / 1440) + " Tagen"; }

/* ---------- Übersicht ---------- */
function chips(rowId, key, onChange) {
  document.querySelectorAll("#" + rowId + " .chip").forEach(b => {
    b.setAttribute("aria-pressed", prefs[key] === b.dataset.v);
    b.onclick = () => { prefs[key] = b.dataset.v; save(); (onChange || renderHome)(); };
  });
}
function renderHome() {
  const p = pool();
  const safe = p.filter(c => st(c.id).b >= 4).length, mid = p.filter(c => seen(c) && st(c.id).b >= 2 && st(c.id).b < 4).length,
        low = p.filter(c => seen(c) && st(c.id).b < 2).length, neu = p.length - safe - mid - low;
  $("sSafe").textContent = safe; $("sMid").textContent = mid; $("sLow").textContent = low; $("sNew").textContent = neu;
  $("mG").style.width = safe / p.length * 100 + "%"; $("mY").style.width = mid / p.length * 100 + "%"; $("mR").style.width = low / p.length * 100 + "%";
  const ready = Math.round(p.filter(c => st(c.id).b >= 3).length / p.length * 100);
  $("ready").textContent = ready + " % sitzen schon";
  chips("scopeRow", "scope"); chips("topicRow", "topic"); chips("modeRow", "mode"); chips("dirRow", "dir");
  const typing = prefs.mode === "type";
  document.querySelectorAll("#dirRow .chip").forEach(b => { b.disabled = typing; if (typing) b.setAttribute("aria-pressed", b.dataset.v === "event"); });
  $("dirNote").hidden = !typing;
  const s = smartSet(), sb = $("smartBtn");
  if (s.set.length) { sb.innerHTML = "Klug lernen<small>" + s.due.length + " fällig · " + s.fresh.length + " neu</small>"; sb.onclick = () => start(s.set, false); }
  else { const n = nextDue(); sb.innerHTML = "Schwächste Karten trotzdem üben<small>Gerade nichts fällig" + (n != null ? " – nächste Karte in " + dur(n) : "") + "</small>";
    sb.onclick = () => start(p.slice().sort((a, b) => st(a.id).b - st(b.id).b || weakness(b) - weakness(a)).slice(0, 10), true); }
  $("allBtn").textContent = "Alle " + p.length + " Karten durchgehen"; $("allBtn").onclick = () => start(p, true);
  const weak = EVENTS.filter(c => st(c.id).w > 0 && st(c.id).b < 4).sort((a, b) => weakness(b) - weakness(a)).slice(0, 5);
  $("weakPanel").hidden = !weak.length;
  $("weakList").innerHTML = weak.map(c => { const s = st(c.id), part = Object.entries(s.p).sort((a, b) => b[1] - a[1])[0];
    const hint = part[1] > 0 ? " · meist falsch: " + {d: "Tag", m: "Monat", y: "Jahr"}[part[0]] : "";
    return '<div class="w"><span><b>' + c.e + "</b></span><span class=\"x\">" + s.w + "× falsch</span><small>" + c.d + hint + " · " + c.mn + "</small></div>"; }).join("");
  $("weakBtn").onclick = () => start(weak, true);
}

/* ---------- Lernrunde ---------- */
let queue = [], total = 0, first = {}, current = null, flipped = false, typed = null, again = {};
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function start(cards, mix) {
  if (!cards.length) return;
  const list = mix ? shuffle(cards.slice()) : cards.slice();
  queue = list.map(c => { let f = prefs.mode === "type" ? "event" : prefs.dir === "mix" ? (Math.random() < .5 ? "event" : "date") : prefs.dir; if (c.noDateFront) f = "event"; return {c, front: f}; });
  total = queue.length; first = {}; again = {};
  show("study"); next();
}
function around(c) {
  const i = PFLICHT.findIndex(e => sortKey(e) > sortKey(c) || e.id === c.id), list = PFLICHT.filter(e => e.id !== c.id);
  const before = list.filter(e => sortKey(e) <= sortKey(c)).pop(), after = list.find(e => sortKey(e) > sortKey(c));
  return '<div class="around"><div><b>Davor</b><span>' + (before ? before.d + " " + before.e : "–") + "</span></div><div><b>Danach</b><span>" + (after ? after.d + " " + after.e : "–") + "</span></div></div>";
}
function next() {
  if (!queue.length) return finish();
  current = queue.shift(); flipped = false; typed = null;
  const {c, front} = current, card = $("card"), s = st(c.id);
  card.style.transition = "none"; card.classList.remove("flipped"); void card.offsetWidth; card.style.transition = "";
  $("cardwrap").className = "cardwrap t-" + c.t;
  const dots = '<span class="boxdots" title="Stufe ' + s.b + ' von 5">' + [1, 2, 3, 4, 5].map(i => '<i class="' + (i <= s.b ? "on" : "") + '"></i>').join("") + "</span>";
  const tag = '<span class="tag">' + TOPIC[c.t] + (c.tier === 2 ? " · Mappe" : "") + "</span>" + dots;
  $("fTag").innerHTML = tag; $("bTag").innerHTML = tag;
  const typing = prefs.mode === "type";
  if (front === "event") $("fBody").innerHTML = '<div class="ask">' + (c.day ? "Wann war das? Tag, Monat und Jahr" : "Wann war das? Monat und Jahr") + '</div><div class="main">' + c.e + "</div>";
  else $("fBody").innerHTML = '<div class="ask">Was geschah an diesem Datum?</div><div class="main date">' + c.d + "</div>";
  $("fHint").textContent = typing ? "Datum unten eintippen" : "Erst im Kopf antworten, dann tippen zum Umdrehen";
  const head = front === "event" ? '<div class="main date">' + c.d + '</div><div class="sub">' + c.e + "</div>" : '<div class="main">' + c.e + '</div><div class="sub" style="color:var(--c)">' + c.d + "</div>";
  $("bBody").innerHTML = head + '<div class="info">' + c.i + '</div><div class="mn"><b>Merkhilfe</b>' + c.mn + "</div>" + around(c);
  renderAnswer(); renderProgress();
}
function renderProgress() {
  const done = Object.keys(first).length, ok = Object.values(first).filter(v => v === 2).length, bad = Object.values(first).filter(v => v === 0).length;
  $("pCount").textContent = Math.min(done + 1, total) + " / " + total;
  $("pG").style.width = ok / total * 100 + "%"; $("pR").style.width = bad / total * 100 + "%";
  $("pLeft").textContent = queue.length ? "noch " + (queue.length + 1) : "letzte Karte";
}
function renderAnswer() {
  const a = $("answer"), c = current.c;
  if (prefs.mode === "type" && !flipped) {
    a.className = "answer one";
    a.innerHTML = '<form class="typebox" id="typeForm" autocomplete="off"><div class="dateinput">' +
      (c.day ? '<label>Tag<input id="iD" inputmode="numeric" maxlength="2" pattern="[0-9]*" aria-label="Tag"></label><span class="dot">.</span>' : "") +
      '<label>Monat<input id="iM" inputmode="numeric" maxlength="2" pattern="[0-9]*" aria-label="Monat"></label><span class="dot">.</span>' +
      '<label>Jahr<input id="iY" class="yy" inputmode="numeric" maxlength="4" pattern="[0-9]*" aria-label="Jahr"></label></div>' +
      (c.day && c.day.length > 1 ? '<div class="note">Doppeldatum: einer der beiden Tage reicht.</div>' : "") +
      '<button class="primary" type="submit">Prüfen</button><button class="ghost" type="button" id="skipBtn">Weiß ich nicht</button></form>';
    const ins = [...a.querySelectorAll("input")];
    ins.forEach((inp, i) => inp.addEventListener("input", () => { inp.value = inp.value.replace(/\D/g, ""); if (inp.value.length >= inp.maxLength && ins[i + 1]) ins[i + 1].focus(); }));
    ins[0].focus({preventScroll: true});
    $("typeForm").onsubmit = e => { e.preventDefault(); check(); };
    $("skipBtn").onclick = () => check(true);
  } else if (!flipped) {
    a.className = "answer one";
    a.innerHTML = '<button class="primary" id="flipBtn">Umdrehen <span class="kbd">Leertaste</span></button>';
    $("flipBtn").onclick = flip;
  } else if (typed) {
    a.className = "answer one";
    const parts = []; if (c.day) parts.push(["Tag", typed.d]); parts.push(["Monat", typed.m], ["Jahr", typed.y]);
    const wrong = parts.filter(p => !p[1]).map(p => p[0]);
    a.innerHTML = '<div class="typebox"><div class="dateinput">' + parts.map((p, i) => (i ? '<span class="dot">.</span>' : "") + "<label>" + p[0] + '<input disabled class="' + (p[0] === "Jahr" ? "yy " : "") + (p[1] ? "good" : "bad") + '" value="' + (typed.v[p[0]] || "–") + '"></label>').join("") + "</div>" +
      '<div class="verdict ' + (wrong.length ? "bad" : "good") + '">' + (wrong.length ? (typed.skip ? "Jetzt einprägen: " : "Nicht ganz – falsch: " + wrong.join(", ") + ". Richtig: ") + c.d : "Richtig!") + "</div>" +
      '<button class="primary" id="goBtn">Weiter <span class="kbd">Enter</span></button>' + (wrong.length ? "" : '<button class="ghost" id="luckBtn">War nur geraten</button>') + "</div>";
    $("goBtn").onclick = () => rate(wrong.length ? 0 : 2); $("goBtn").focus({preventScroll: true});
    if (!wrong.length) $("luckBtn").onclick = () => rate(1);
  } else {
    a.className = "answer";
    a.innerHTML = '<button class="rate no" data-q="0">Nicht gewusst<small>kommt gleich wieder <span class="kbd">1</span></small></button><button class="rate mid" data-q="1">Unsicher<small>kommt bald wieder <span class="kbd">2</span></small></button><button class="rate ok" data-q="2">Gewusst<small>längere Pause <span class="kbd">3</span></small></button>';
    a.querySelectorAll(".rate").forEach(b => b.onclick = () => rate(+b.dataset.q));
  }
}
function check(skip) {
  const c = current.c, v = {Tag: $("iD") ? $("iD").value : "", Monat: $("iM").value, Jahr: $("iY").value};
  let y = +v.Jahr; if (v.Jahr.length === 2) y += 1900;
  typed = {v, skip: !!skip, d: !skip && (!c.day || c.day.includes(+v.Tag)), m: !skip && +v.Monat === c.m, y: !skip && y === c.y};
  flipped = true; $("card").classList.add("flipped"); renderAnswer();
}
function flip() { if (!current || prefs.mode === "type") return; flipped = !flipped; $("card").classList.toggle("flipped", flipped); renderAnswer(); }
function rate(q) {
  if (!current || !flipped) return;
  const c = current.c, s = st(c.id), now = Date.now(), wasNew = !s.last;
  if (typed && !typed.skip) { if (c.day && !typed.d) s.p.d++; if (!typed.m) s.p.m++; if (!typed.y) s.p.y++; }
  if (q === 2) { s.r++; s.b = Math.min(5, s.b + (wasNew ? 2 : 1)); s.due = now + STEP[s.b]; }
  else if (q === 1) { s.b = Math.max(1, Math.min(s.b, 3)); s.due = now + STEP[s.b] / 2; }
  else { s.w++; s.b = s.b >= 3 ? 1 : 0; s.due = now; }
  s.last = now; save();
  if (!(c.id in first)) first[c.id] = q;
  if (q === 0) queue.splice(Math.min(3, queue.length), 0, current);
  else if (q === 1 && !again[c.id]) { again[c.id] = 1; queue.push(current); }
  current = null; next();
}
function finish() {
  const ids = Object.keys(first), ok = ids.filter(i => first[i] === 2).length, pct = Math.round(ok / ids.length * 100);
  $("rPct").textContent = pct + " %"; $("rPct").style.color = pct >= 80 ? "var(--ok)" : pct >= 50 ? "var(--mid)" : "var(--no)";
  $("rText").textContent = ok + " von " + ids.length + " beim ersten Versuch gewusst.";
  const miss = EVENTS.filter(c => c.id in first && first[c.id] < 2);
  $("rWrongPanel").hidden = !miss.length;
  $("rWrong").innerHTML = miss.map(c => '<div class="w"><span><b>' + c.e + '</b></span><span class="x">' + c.d + "</span><small>" + c.mn + "</small></div>").join("");
  const s = smartSet(); $("moreBtn").hidden = !s.set.length;
  $("moreBtn").innerHTML = "Weiter lernen<small>" + s.due.length + " fällig · " + s.fresh.length + " neu</small>"; $("moreBtn").onclick = () => start(s.set, false);
  const n = nextDue(); $("rNext").textContent = s.set.length ? "" : n != null ? "Für jetzt ist alles wiederholt. Nächste Karte fällig in " + dur(n) + " – mach eine Pause." : "";
  show("result");
}
function show(id) {
  ["home", "study", "result"].forEach(v => $(v).hidden = v !== id);
  $("backBtn").hidden = id === "home";
  if (id === "home") renderHome();
  window.scrollTo(0, 0);
}
$("backBtn").onclick = () => show("home"); $("homeBtn2").onclick = () => show("home");
$("cardwrap").onclick = flip;
$("resetBtn").onclick = () => { const b = $("resetBtn");
  if (b.dataset.sure) { data.cards = {}; save(); delete b.dataset.sure; b.textContent = "Lernstand zurücksetzen"; renderHome(); }
  else { b.dataset.sure = "1"; b.textContent = "Wirklich alles löschen? Noch einmal tippen"; setTimeout(() => { delete b.dataset.sure; b.textContent = "Lernstand zurücksetzen"; }, 4000); } };
document.addEventListener("keydown", e => {
  if ($("study").hidden || e.target.tagName === "INPUT") return;
  if (prefs.mode !== "type" && (e.key === " " || e.key === "Enter")) { e.preventDefault(); flip(); }
  else if (flipped && !typed && "123".includes(e.key)) rate(+e.key - 1);
});
renderHome();
