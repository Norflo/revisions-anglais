// « Révisions d'anglais » — onglet « Ajouter » (seulement dans l'appli Android).
// Chargé par l'APK après la page principale : il en réutilise les variables (W, view, render…).
// Traduction et voix fournies par l'appli Android (objet AndroidApp).
(function () {
  if (!window.AndroidApp) return;

  const AKEY = "vocab-added-v1";
  const key = s => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();
  let added = [];
  try { added = JSON.parse(localStorage.getItem(AKEY)) || []; } catch (e) { added = []; }
  const saveAdded = () => { try { localStorage.setItem(AKEY, JSON.stringify(added)); } catch (e) {} };

  // Liste personnelle : après « Effacer tous les mots », la liste partagée n'est plus affichée.
  const PKEY = "vocab-personal-v1";
  let personal = false;
  try { personal = localStorage.getItem(PKEY) === "1"; } catch (e) {}
  const SHARED = W.slice();   // mots de la liste partagée (DATA), gardés pour pouvoir les remettre

  // Mots déjà arrivés dans la liste partagée (DATA) : la copie du téléphone n'est plus utile.
  const official = new Set(personal ? [] : DATA.map(d => key(d[0])));
  const before = added.length;
  added = added.filter(a => {
    if (!official.has(key(a.en))) return true;
    try { AndroidApp.dropLocal(audioSlug(a.en)); } catch (e) {}
    return false;
  });
  if (added.length !== before) saveAdded();

  function rebuild() {
    // W = mots officiels + mots ajoutés ici, par ordre alphabétique (w.i = position dans W).
    const base = personal ? [] : SHARED;
    const sharedKeys = new Set(base.map(w => key(w.en)));
    const extra = added.filter(a => !sharedKeys.has(key(a.en))).map(a => ({ en: a.en, fr: a.fr, mine: a.mine || "", mine0: a.mine || "", note: a.note || "", local: true }));
    const all = base.concat(extra).sort((a, b) => a.en.localeCompare(b.en, "en", { sensitivity: "base" }));
    W.length = 0;
    all.forEach((w, i) => { w.i = i; W.push(w); });
    applyMine();
  }

  // Voix du téléphone : si elle a changé (meilleure voix choisie), on refait les sons des mots ajoutés.
  const VKEY = "vocab-voice-v1";
  function voiceInfo() { try { return String(AndroidApp.voiceInfo() || ""); } catch (e) { return ""; } }
  function resynthIfNeeded(tries) {
    const v = voiceInfo();
    if (!v) { if (tries > 0) setTimeout(() => resynthIfNeeded(tries - 1), 700); return; }
    let old = ""; try { old = localStorage.getItem(VKEY) || ""; } catch (e) {}
    if (old === v) return;
    added.forEach(a => { try { AndroidApp.synth(a.en, audioSlug(a.en)); } catch (e) {} });
    try { localStorage.setItem(VKEY, v); } catch (e) {}
    if (view === "add") render();
  }
  setTimeout(() => resynthIfNeeded(10), 500);

  // Voix du téléphone quand un son manque.
  ttsFallback = t => { try { AndroidApp.speak(String(t)); } catch (e) {} };

  // ---------- Onglet ----------
  const tabs = document.getElementById("tabs");
  const tb = document.createElement("button");
  tb.dataset.tab = "add";
  tb.textContent = "+ Ajouter";
  tabs.appendChild(tb);

  const st = document.createElement("style");
  st.textContent = `
    #tabs{grid-template-columns:repeat(4,auto);width:min(400px,calc(100% - 24px))}
    #tabs button{font-size:.84rem;padding:11px 8px;white-space:nowrap}
    .addf input{margin-bottom:10px}
    .sugg{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 12px}
    .sugg button{border:0;border-radius:999px;padding:7px 13px;font:inherit;font-size:.9rem;font-weight:600;background:var(--track);color:var(--ink)}
    .sugg button.on{background:var(--t-blue);color:#fff}
    .sugg button.on .pos{background:rgba(255,255,255,.28);color:#fff}
    .addmsg{margin:10px 0 0;font-weight:600}
    .addmsg.ok{color:var(--good)} .addmsg.ko{color:var(--bad)}
    .two{display:flex;gap:8px} .two .btn{flex:1}
    .loc{display:inline-block;font-size:.72rem;font-weight:700;color:var(--accent);background:var(--accent-soft);border-radius:999px;padding:1px 8px;margin-left:6px;vertical-align:middle}
    .del{border:0;background:none;color:var(--muted);font-size:1.1rem;padding:4px 8px}
  `;
  document.head.appendChild(st);

  const F = { en: "", fr: "", mine: "", note: "", alts: [], busy: false, msg: "", ok: true };

  function renderAdd() {
    const mineList = added.slice().sort((a, b) => a.en.localeCompare(b.en, "en", { sensitivity: "base" }));
    return `<section class="panel addf">
      <div class="label" style="margin-top:0">Mot ou expression en anglais</div>
      <form id="trform" autocomplete="off">
        <input type="text" id="a-en" value="${esc(F.en)}" placeholder="ex. : take for granted" autocapitalize="off" spellcheck="false">
        <button class="btn main" type="submit" ${F.busy ? "disabled" : ""}>${F.busy ? "Traduction…" : "Traduire"}</button>
      </form>
      ${F.alts.length ? `<div class="label">Propositions (touche pour choisir)</div>
        <div class="sugg">${F.alts.map((a, k) => `<button data-alt="${k}" class="${key(a) === key(F.fr) ? "on" : ""}">${frHtml(a)}</button>`).join("")}</div>` : ""}
      <div class="label">Traduction</div>
      <input type="text" id="a-fr" value="${esc(F.fr)}" placeholder="ex. : n. brouillon ; v. rédiger">
      <div class="small" style="margin:-4px 0 10px">Pour préciser la nature : n. (nom), v. (verbe), adj., adv., prép., expr., séparés par « ; ».</div>
      <div class="label">Ma traduction (facultatif)</div>
      <input type="text" id="a-mine" value="${esc(F.mine)}" placeholder="ta propre traduction">
      <div class="label">Remarque (facultatif)</div>
      <input type="text" id="a-note" value="${esc(F.note)}" placeholder="exemple, autre sens…">
      <div class="two" style="margin-top:6px">
        <button class="btn ghost" data-a-listen>🔊 Écouter</button>
        <button class="btn main" data-a-save>Ajouter à mes mots</button>
      </div>
      ${F.msg ? `<div class="addmsg ${F.ok ? "ok" : "ko"}">${esc(F.msg)}</div>` : ""}
      ${voiceLine()}
    </section>
    <section class="panel">
      <div class="label" style="margin-top:0">Ajoutés sur le téléphone (${added.length})</div>
      ${mineList.length ? mineList.map(a => `<div class="row"><div class="t"><b class="say" data-speak="${esc(a.en)}">${esc(a.en)}</b>${a.gh ? `<span class="loc">✓ GitHub</span>` : ""}<div class="fr">${frHtml(a.fr)}</div>${a.mine ? `<div class="mn">Ta traduction : <em>${esc(a.mine)}</em></div>` : ""}</div>
          <button class="del" data-a-del="${esc(a.en)}" aria-label="Supprimer">✕</button></div>`).join("")
        : `<div class="empty">Aucun mot ajouté ici pour l'instant.</div>`}
      ${token && pending().length ? `<button class="btn ghost" data-g-sync style="margin-top:12px" ${G.busy ? "disabled" : ""}>${G.busy ? "Envoi…" : "Envoyer sur GitHub"}</button>` : ""}
    </section>
    ${renderGitHub()}`;
  }

  function voiceLine() {
    const v = voiceInfo(); if (!v) return "";
    const [eng, name] = v.split("|");
    if (eng !== "Google") return `<div class="small" style="margin-top:12px">Voix du téléphone : ${esc(eng)}. Pour une voix plus naturelle, installe « Services de synthèse vocale de Google » (Speech Services by Google) depuis le Play Store, puis relance l'appli.</div>`;
    return `<div class="small" style="margin-top:12px">Voix : Google ${name && name.endsWith("-network") ? "en ligne (la plus naturelle)" : "du téléphone"}.</div>`;
  }

  function readForm() {
    const g = id => { const el = document.getElementById(id); return el ? el.value : null; };
    const en = g("a-en"); if (en !== null) F.en = en;
    const fr = g("a-fr"); if (fr !== null) F.fr = fr;
    const mi = g("a-mine"); if (mi !== null) F.mine = mi;
    const no = g("a-note"); if (no !== null) F.note = no;
  }

  const baseRender = render;
  render = function () {
    if (view !== "add") { tb.classList.remove("on"); return baseRender(); }
    document.querySelectorAll("#tabs button").forEach(b => b.classList.toggle("on", b === tb));
    document.querySelector(".wrap").classList.remove("wide");
    $app.innerHTML = renderAdd();
  };

  // ---------- Traduction (réponse de l'appli Android) ----------
  let reqId = 0;
  window.__ajoutTr = function (id, json) {
    if (id !== reqId) return;
    F.busy = false;
    let r = null; try { r = JSON.parse(json); } catch (e) {}
    if (!r || !r.alts || !r.alts.length) {
      F.msg = "Pas de traduction trouvée (Internet ?). Tu peux l'écrire toi-même."; F.ok = false;
    } else {
      F.alts = r.alts.concat(F.alts.filter(a => POS_RE.test(a))); if (!F.alts.some(a => POS_RE.test(a))) F.fr = r.alts[0];
      F.msg = ""; F.ok = true;
    }
    if (view === "add") render();
  };

  // ---------- Traduction par nature du mot (nom, verbe, adjectif…) ----------
  // Le dictionnaire anglais (dictionaryapi.dev) dit si le mot est un nom, un verbe, un adjectif…
  // Puis chaque sens est traduit séparément (MyMemory) avec un petit mot qui force la nature :
  // « to draft » → rédiger (verbe), « the draft » → le brouillon (nom), « it is … » → adjectif.
  // Résultat proposé : « n. brouillon ; v. rédiger ».
  const CUES = {
    verb: ["v.", w => "to " + w, t => t.replace(/^(de |d'|d’)/i, "")],
    noun: ["n.", w => "the " + w, t => t.replace(/^(le |la |les |l'|l’|un |une |des |du )/i, "")],
    adjective: ["adj.", w => "it is " + w, t => { t = t.replace(/^(c'est |c’est |il est |elle est |cela est |ça est )/i, ""); return /^(un|une|le|la|les|des|du|l'|l’)\b/i.test(t) ? "" : t; }],
    adverb: ["adv.", w => w, t => t],
    preposition: ["prép.", w => w, t => t],
    interjection: ["interj.", w => w + "!", t => t.replace(/\s*!$/, "")],
  };
  async function mm(q) {
    const r = await fetch("https://api.mymemory.translated.net/get?langpair=en%7Cfr&q=" + encodeURIComponent(q));
    const j = await r.json();
    return String((j.responseData && j.responseData.translatedText) || "");
  }
  async function posSuggest(en, id) {
    if (/\s/.test(en)) return;   // expressions : pas dans le dictionnaire mot à mot
    let kinds = [];
    try {
      const r = await fetch("https://api.dictionaryapi.dev/api/v2/entries/en/" + encodeURIComponent(en.toLowerCase()));
      if (!r.ok) return;
      const d = await r.json();
      d.forEach(e => (e.meanings || []).forEach(m => { if (CUES[m.partOfSpeech] && !kinds.includes(m.partOfSpeech)) kinds.push(m.partOfSpeech); }));
    } catch (e) { return; }
    if (!kinds.length) return;
    const parts = [];
    for (const k of kinds.slice(0, 4)) {
      const [tag, cue, clean] = CUES[k];
      let t = "";
      try { t = clean((await mm(cue(en))).trim().replace(/[.!]$/, "").trim()); } catch (e) {}
      if (!t || key(t) === key(cue(en)) || key(t) === key(en)) continue;
      t = t.charAt(0).toLowerCase() + t.slice(1);
      if (!parts.some(p => key(p.slice(p.indexOf(" ") + 1)) === key(t))) parts.push(tag + " " + t);
    }
    if (id !== reqId || !parts.length) return;
    const full = parts.join(" ; ");
    F.alts = [full].concat(parts.length > 1 ? parts : [], F.alts.filter(a => !POS_RE.test(a)));
    readForm(); F.fr = full;
    if (view === "add") render();
  }

  function translate() {
    readForm();
    const en = F.en.trim();
    if (!en) return;
    F.busy = true; F.alts = []; F.msg = ""; reqId++;
    render();
    try { AndroidApp.translate(reqId, en); } catch (e) { F.busy = false; render(); }
    posSuggest(en, reqId);
  }

  function exists(en) { return W.some(w => key(w.en) === key(en)); }

  function save() {
    readForm();
    const en = F.en.trim().replace(/\s+/g, " ");
    const fr = F.fr.trim();
    if (!en) { F.msg = "Écris d'abord le mot anglais."; F.ok = false; return render(); }
    if (!fr && !F.mine.trim()) { F.msg = "Ajoute une traduction."; F.ok = false; return render(); }
    if (exists(en)) { F.msg = `« ${en} » est déjà dans tes mots.`; F.ok = false; return render(); }
    const word = en.charAt(0).toUpperCase() + en.slice(1);
    added.push({ en: word, fr: fr || F.mine.trim(), mine: F.mine.trim(), note: F.note.trim(), t: Date.now() });
    saveAdded();
    try { AndroidApp.synth(word, audioSlug(word)); } catch (e) {}
    S = null; rebuild();
    Object.assign(F, { en: "", fr: "", mine: "", note: "", alts: [], msg: `« ${word} » ajouté à tes mots.`, ok: true });
    render();
    sync(false);
  }


  $app.addEventListener("submit", e => {
    if (e.target.id !== "trform") return;
    e.preventDefault(); translate();
  });
  $app.addEventListener("click", e => {
    if (view !== "add") return;
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.alt !== undefined) { readForm(); F.fr = F.alts[+t.dataset.alt]; render(); return; }
    if (t.dataset.aListen !== undefined) { readForm(); if (F.en.trim()) AndroidApp.speak(F.en.trim()); return; }
    if (t.dataset.aSave !== undefined) { save(); return; }
    if (t.dataset.gSync !== undefined) { sync(false); return; }
    if (t.dataset.gEdit !== undefined) { G.edit = true; G.msg = ""; render(); return; }
    if (t.dataset.gCancel !== undefined) { G.edit = false; G.msg = ""; render(); return; }
    if (t.dataset.gSave !== undefined) { saveToken(); return; }
    if (t.dataset.aDel !== undefined) {
      const en = t.dataset.aDel;
      added = added.filter(a => a.en !== en); saveAdded();
      try { AndroidApp.dropLocal(audioSlug(en)); } catch (e) {}
      S = null; rebuild(); render(); return;
    }
  });

  // Page « Ajouter » : toucher l'écran ailleurs que sur une case, un bouton ou un mot à écouter
  // met le curseur dans la case du mot anglais (à la fin du texte déjà tapé).
  document.addEventListener("click", e => {
    if (view !== "add") return;
    if (e.target.closest("input, textarea, select, button, a, label, [data-speak], #tabs")) return;
    const en = document.getElementById("a-en"); if (!en) return;
    en.focus();
    const n = en.value.length; try { en.setSelectionRange(n, n); } catch (err) {}
  });

  // ---------- Enregistrement sur GitHub ----------
  // Avec une clé GitHub (collée une fois), chaque mot ajouté est écrit directement dans la liste
  // partagée (DATA de index.html). Le workflow « Révisions d'anglais - sons » ajoute ensuite tout
  // seul la phrase d'exemple (Tatoeba), la fréquence et la voix Ava (anglais/tools/fill.py).
  const TKEY = "gh-token-v1";
  const REPO = "Norflo/revisions-anglais", FILE = "anglais/site/index.html";
  let token = ""; try { token = localStorage.getItem(TKEY) || ""; } catch (e) {}
  const G = { busy: false, msg: "", ok: true, edit: false };
  const pending = () => added.filter(a => !a.gh);

  const b64dec = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\s/g, "")), c => c.charCodeAt(0)));
  function b64enc(s) {
    const b = new TextEncoder().encode(s); let r = "";
    for (let i = 0; i < b.length; i += 0x8000) r += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000));
    return btoa(r);
  }

  async function gh(method, tok, body) {
    const url = `https://api.github.com/repos/${REPO}/contents/${FILE}` + (method === "GET" ? `?ref=main&t=${Date.now()}` : "");
    const headers = { Authorization: "Bearer " + tok, Accept: "application/vnd.github+json" };
    if (body) headers["Content-Type"] = "application/json";
    const r = await fetch(url, { method, headers, cache: "no-store", body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.message || "HTTP " + r.status); e.status = r.status; throw e; }
    return j;
  }

  // Ajoute les mots dans DATA, à leur place alphabétique, sans toucher aux autres lignes.
  function insertWords(html, words) {
    const m = html.match(/const DATA = \[\n([\s\S]*?)\n\];/);
    if (!m) throw new Error("liste DATA introuvable");
    const rows = m[1].split("\n").map(l => l.replace(/,\s*$/, ""));
    const have = new Set(rows.map(l => key(JSON.parse(l)[0])));
    const done = []; let fresh = 0;
    for (const a of words) {
      if (have.has(key(a.en))) { done.push(a); continue; }
      const line = JSON.stringify([a.en, a.fr, a.mine || "", a.note || ""]);
      let k = rows.findIndex(l => JSON.parse(l)[0].localeCompare(a.en, "en", { sensitivity: "base" }) > 0);
      if (k < 0) k = rows.length;
      rows.splice(k, 0, line); have.add(key(a.en)); done.push(a); fresh++;
    }
    const out = html.slice(0, m.index) + "const DATA = [\n" + rows.join(",\n") + "\n];" + html.slice(m.index + m[0].length);
    return { html: out, done, fresh };
  }

  function ghError(e) {
    if (e.status === 401) return "Clé GitHub refusée (expirée ?) : colle une nouvelle clé plus bas.";
    if (e.status === 403 || e.status === 404) return "La clé GitHub n'a pas le droit d'écrire dans revisions-anglais (voir plus bas).";
    if (!e.status) return "Pas d'Internet : le mot est gardé sur le téléphone, il partira plus tard.";
    return "GitHub : " + e.message;
  }

  async function sync(quiet) {
    const words = pending();
    if (!token || G.busy || !words.length) return;
    G.busy = true; if (view === "add") render();
    try {
      let res;
      for (let essai = 0; ; essai++) {
        const f = await gh("GET", token);
        res = insertWords(b64dec(f.content), words);
        if (!res.fresh) break;
        const names = words.map(a => a.en).join(", ");
        try {
          await gh("PUT", token, { message: `Anglais : ajout de ${names} (depuis l'appli)`, content: b64enc(res.html), sha: f.sha, branch: "main" });
          break;
        } catch (e) { if (essai >= 2 || (e.status !== 409 && e.status !== 422)) throw e; }
      }
      res.done.forEach(a => { a.gh = true; }); saveAdded();
      G.ok = true;
      G.msg = `Enregistré sur GitHub : ${res.done.map(a => a.en).join(", ")}. La phrase d'exemple et la voix Ava arrivent d'ici quelques minutes.`;
      if (view === "add" && F.ok) F.msg = "";
    } catch (e) {
      G.ok = false; G.msg = ghError(e);
    }
    G.busy = false;
    if (view === "add" && !(quiet && G.ok)) render();
  }

  async function saveToken() {
    const el = document.getElementById("g-token");
    const t = (el ? el.value : "").trim();
    if (!t) { G.ok = false; G.msg = "Colle d'abord la clé."; return render(); }
    G.busy = true; G.msg = ""; render();
    try {
      await gh("GET", t);
      token = t; try { localStorage.setItem(TKEY, t); } catch (e) {}
      G.edit = false; G.ok = true; G.msg = "Clé enregistrée.";
      G.busy = false; render();
      sync(false);
    } catch (e) {
      G.busy = false; G.ok = false;
      G.msg = e.status === 401 ? "Cette clé est refusée par GitHub : vérifie-la." : ghError(e);
      render();
    }
  }

  function renderGitHub() {
    const msg = G.msg ? `<div class="addmsg ${G.ok ? "ok" : "ko"}">${esc(G.msg)}</div>` : "";
    if (token && !G.edit) return `<section class="panel">
      <div class="label" style="margin-top:0">Enregistrement sur GitHub : activé ✓</div>
      <div class="small">Chaque mot ajouté va directement dans la liste partagée. La phrase d'exemple, la fréquence et la voix Ava sont ajoutées toutes seules quelques minutes après.</div>
      ${msg}
      <button class="btn ghost" data-g-edit style="margin-top:10px">Changer la clé GitHub</button>
    </section>`;
    return `<section class="panel">
      <div class="label" style="margin-top:0">Enregistrement sur GitHub</div>
      <div class="small">Pour que les mots ajoutés ici aillent dans la liste partagée (avec phrase d'exemple et voix Ava), colle une clé GitHub, une seule fois.<br>
      Pour la créer : github.com → photo de profil → Settings → Developer settings → Personal access tokens → <b>Fine-grained tokens</b> → Generate new token.
      Repository access : <b>Only select repositories</b> → revisions-anglais. Permissions : <b>Contents → Read and write</b>. Puis copie la clé (github_pat_…).</div>
      <input type="password" id="g-token" placeholder="github_pat_…" autocomplete="off" autocapitalize="off" spellcheck="false" style="margin-top:10px">
      <div class="two">
        ${token ? `<button class="btn ghost" data-g-cancel>Annuler</button>` : ""}
        <button class="btn main" data-g-save ${G.busy ? "disabled" : ""}>${G.busy ? "Vérification…" : "Enregistrer la clé"}</button>
      </div>
      ${msg}
    </section>`;
  }

  // Au démarrage : envoie les mots restés en attente (pas d'Internet la dernière fois…).
  setTimeout(() => sync(true), 1500);

  // Petit repère « ajouté » dans « Mes mots ».
  const baseList = renderList;
  renderList = function () {
    let html = baseList();
    for (const w of W) if (w.local) {
      const needle = `data-speak="${esc(w.en)}">${esc(w.en)}</b>`;
      html = html.replace(needle, needle + `<span class="loc">ajouté</span>`);
    }
    return html;
  };


  // ---------- Exercice « En contexte » : la phrase la plus courante, avec un trou ----------
  let EX = {};
  fetch("exemples.json").then(r => r.ok ? r.json() : {}).then(d => { EX = d || {}; if (view === "home") render(); }).catch(() => {});
  const hasEx = w => !!EX[w.en];

  const st2 = document.createElement("style");
  st2.textContent = `
    .m-ctx{background:var(--t-green)}
    .ctxs{font-size:1.32rem;line-height:1.45;font-weight:600;margin:6px 0 4px}
    .ctxs .blank{display:inline-block;min-width:84px;border-bottom:3px solid var(--accent);margin:0 2px}
    .ctxs mark{background:var(--accent-soft);color:var(--accent);border-radius:8px;padding:0 5px}
    .ctxfr{margin-top:10px;color:var(--muted);font-size:.95rem;font-style:italic}
    .ctxbtn{border:0;background:none;color:var(--accent);font:inherit;font-weight:600;font-size:.92rem;margin-top:12px;padding:6px}
  `;
  document.head.appendChild(st2);

  const ICON_CTX = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h6M14 12h6M4 18h16"/><path d="M10.5 12h3" stroke-dasharray="1 2"/></svg>';

  const baseHome = renderHome;
  renderHome = function () {
    const html = baseHome();
    const n = W.filter(hasEx).length;
    const btn = `<button class="mode m-ctx" data-start="ctx"><span class="ic">${ICON_CTX}</span><span><b>En contexte</b><span>${n ? "Le mot dans une phrase courante : trouve celui qui manque." : "Chargement des phrases…"}</span></span></button>`;
    const k = html.lastIndexOf("</div>");
    return html.slice(0, k) + btn + html.slice(k);
  };

  const baseStart = start;
  start = function (mode) {
    if (mode !== "ctx") return baseStart(mode);
    const q = buildQueue(W.length).filter(i => hasEx(W[i])).slice(0, settings.size);
    if (!q.length) return;
    S = { mode: "ctx", dir: "en", queue: q, pos: 0, total: q.length, graded: new Set(), right: [], wrong: [],
          answered: false, choice: null, typed: "", okTyped: null, opts: null, showFr: false, played: -1 };
    view = "play"; render();
  };

  function sentence(w, reveal) {
    const ex = EX[w.en][0];
    return esc(ex).replace(/\[(.+?)\]/, (m, g) => reveal ? `<mark>${g}</mark>` : `<span class="blank">&nbsp;</span>`);
  }
  function plain(w) { return EX[w.en][0].replace(/[\[\]]/g, ""); }

  function playSentence(w) {
    const url = "audio/ex-" + audioSlug(w.en) + ".mp3?v=5";
    const text = plain(w);
    const ctx = getCtx();
    if (!ctx) return speakEl(url, text);
    try { if (ctx.state !== "running") ctx.resume(); } catch (e) {}
    const token = ++speakToken;
    loadBuf(url).then(buf => {
      if (token !== speakToken) return;
      stopCur();
      const src = ctx.createBufferSource(); src.buffer = buf;
      const g = ctx.createGain(); const at = ctx.currentTime + 0.03;
      g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(1, at + 0.012);
      src.connect(g); g.connect(ctx.destination);
      src.start(at, Math.min(0.15, buf.duration / 4));
      curSrc = { src, g };
      src.onended = () => { if (curSrc && curSrc.src === src) curSrc = null; };
    }).catch(() => { if (token === speakToken) ttsFallback(text); });
  }

  const basePlay = renderPlay;
  renderPlay = function () {
    if (!S || S.mode !== "ctx") return basePlay();
    const w = current();
    const done = Math.min(S.graded.size, S.total);
    const top = `<div class="top">
        <button class="x" data-quit aria-label="Arrêter">${ICON.close}</button>
        <div class="bar"><i style="width:${done / S.total * 100}%"></i></div>
        <div class="count">${done}/${S.total}</div>
      </div>`;
    if (!S.opts) S.opts = options(w);
    const ok = S.answered && (S.choice === w.i || sameAnswer(W[S.choice], w, S.dir));
    const opts = S.opts.map(i => {
      const x = W[i]; let cls = "opt";
      if (S.answered) { if (i === w.i || sameAnswer(x, w, S.dir)) cls += " right"; else if (i === S.choice) cls += " wrong"; }
      return `<button class="${cls}" data-opt="${i}" ${S.answered ? "disabled" : ""}>${esc(x.en)}</button>`;
    }).join("");
    if (S.answered && S.played !== S.pos) { S.played = S.pos; setTimeout(() => playSentence(w), 120); }
    return top + `<section class="postcard card">
        <div class="dirtag">${S.answered ? "La phrase complète" : "Quel mot manque ?"}</div>
        ${S.answered ? `<div class="postmark ${ok ? "good" : "bad"}">${ok ? "Bravo !" : "Raté"}</div>` : ""}
        <div class="ctxs">${sentence(w, S.answered)}</div>
        ${S.answered || S.showFr ? `<div class="ctxfr">${esc(EX[w.en][1])}</div>`
          : `<button class="ctxbtn" data-ctx-fr>Voir la traduction de la phrase</button>`}
        ${S.answered ? `<button class="ctxbtn" data-ctx-say>🔊 Réécouter la phrase</button>
          ${detail(w).replace('<div class="detail">', '<div class="detail" style="margin-top:12px">')}` : ""}
      </section>
      <div class="opts">${opts}</div>
      ${S.answered ? `<div style="margin-top:14px"><button class="btn main" data-next>Suivant</button></div>` : ""}`;
  };

  $app.addEventListener("click", e => {
    if (view !== "play" || !S || S.mode !== "ctx") return;
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.ctxFr !== undefined) { S.showFr = true; render(); return; }
    if (t.dataset.ctxSay !== undefined) { playSentence(current()); return; }
  });


  // ---------- Fréquence d'usage en anglais (frequences.json : 4 très courant … 1 rare) ----------
  let FQ = {};
  fetch("frequences.json").then(r => r.ok ? r.json() : {}).then(d => { FQ = d || {}; if (view === "list" || view === "play") render(); }).catch(() => {});
  const FQ_LABEL = { 4: "très courant", 3: "courant", 2: "peu courant", 1: "rare" };
  const st3 = document.createElement("style");
  st3.textContent = `
    .fq{display:inline-block;font-size:.72rem;font-weight:700;border-radius:999px;padding:1px 8px;margin-left:6px;vertical-align:middle;font-family:inherit;letter-spacing:0}
    .fq4{background:rgba(48,209,88,.18);color:#13803a} .fq3{background:rgba(10,132,255,.15);color:#0a63c9}
    .fq2{background:rgba(255,149,10,.18);color:#a85c00} .fq1{background:rgba(255,59,48,.16);color:#c4271c}
  `;
  document.head.appendChild(st3);
  const fqBadge = w => FQ[w.en] ? `<span class="fq fq${FQ[w.en]}" title="Fréquence en anglais">${FQ_LABEL[FQ[w.en]]}</span>` : "";

  const baseDetail = detail;
  detail = function (w) {
    const html = baseDetail(w);
    const k = html.indexOf("</span></div>");
    return k < 0 ? html : html.slice(0, k + 7) + fqBadge(w) + html.slice(k + 7);
  };

  const baseList2 = renderList;
  renderList = function () {
    let html = baseList2();
    for (const w of W) {
      const b = fqBadge(w); if (!b) continue;
      const needle = `data-speak="${esc(w.en)}">${esc(w.en)}</b>`;
      html = html.replace(needle, needle + b);
    }
    return html;
  };


  // Colonne « Fréquence » dans l'onglet Tableau
  const baseTable = renderTable;
  renderTable = function () {
    let html = baseTable();
    const byEn = {}; for (const w of W) byEn[esc(w.en)] = w;
    html = html.replace("<th>🇬🇧 Anglais</th>", "<th>🇬🇧 Anglais</th><th>📊 Fréquence</th>");
    html = html.replace(/(<tr><th scope="row"><span class="say" data-speak="([^"]*)">[\s\S]*?<\/th>)/g,
      (m, cell, en) => cell + `<td>${byEn[en] ? fqBadge(byEn[en]).replace('class="fq ', 'style="margin-left:0" class="fq ') : ""}</td>`);
    return html.replace('colspan="5"', 'colspan="6"');
  };


  // ---------- Mots à revoir en un clic ----------
  const dueIdx = () => { const now = Date.now(); return W.filter(w => { const r = rec(w); return r.b > 0 && r.d <= now; }).map(w => w.i); };
  const st4 = document.createElement("style");
  st4.textContent = `
    .duebtn{width:100%;margin:14px 0 2px;display:flex;align-items:center;justify-content:center;gap:10px}
    .duebtn b{background:rgba(255,255,255,.28);border-radius:999px;padding:2px 10px}
    .stat.s-due{cursor:pointer}
  `;
  document.head.appendChild(st4);

  const baseHome2 = renderHome;
  renderHome = function () {
    const html = baseHome2();
    const n = dueIdx().length;
    const btn = n
      ? `<button class="btn main duebtn" data-due-go>▶ Travailler mes mots à revoir <b>${n}</b></button>`
      : `<div class="small" style="text-align:center;margin:14px 0 2px">Aucun mot à revoir pour l'instant 🎉</div>`;
    const k = html.indexOf('<div class="label lead">');
    return k < 0 ? html : html.slice(0, k) + btn + html.slice(k);
  };

  const baseStart2 = start;
  start = function (mode) {
    if (mode !== "due") return baseStart2(mode);
    const q = shuffle(dueIdx()).slice(0, 40);
    if (!q.length) return;
    S = { mode: "quiz", dir: settings.dir, queue: q, pos: 0, total: q.length, graded: new Set(), right: [], wrong: [],
          answered: false, choice: null, typed: "", okTyped: null, opts: null };
    view = "play"; render(); window.scrollTo(0, 0);
  };

  $app.addEventListener("click", e => {
    if (view !== "home") return;
    if (e.target.closest("[data-due-go]")) { start("due"); return; }
    if (e.target.closest(".stat.s-due")) { listFilter = "due"; listQuery = ""; view = "list"; render(); window.scrollTo(0, 0); }
  });


  // ---------- Effacer tous les mots (avec sécurité) ----------
  let wipeStep = 0, wipeText = "";
  const baseHome3 = renderHome;
  renderHome = function () {
    if (W.length) return baseHome3();
    return `<section class="postcard hero"><div class="hero-k">Ta liste est vide</div>
      <div class="hero-fr" style="margin-top:6px">Ajoute tes premiers mots dans l'onglet « + Ajouter » : ils apparaîtront ici pour les réviser.</div></section>`;
  };
  const baseStart3 = start;
  start = function (mode) { if (!W.length) return; return baseStart3(mode); };

  function wipeBlock() {
    if (personal && wipeStep === 0) {
      return `<div class="reset"><button class="btn ghost" data-w-restore>Remettre la liste de mots partagée</button>
        <div class="small" style="margin-top:6px">Ta liste est personnelle : la liste partagée est masquée.</div></div>`;
    }
    if (wipeStep === 0) return `<div class="reset"><button class="btn ghost" data-w-start style="color:var(--bad)">Effacer tous les mots</button></div>`;
    const ok = wipeText.trim().toUpperCase() === "EFFACER";
    return `<div class="reset"><div class="confirm">
        <b>Effacer tous les mots ?</b><br>
        La liste sera vide : tous les mots, ceux que tu as ajoutés sur ce téléphone, tes traductions et ta progression seront effacés.
        Les mots partagés ne seront plus affichés (tu pourras les remettre ensuite).
        <div style="margin-top:10px">Pour confirmer, écris <b>EFFACER</b> :</div>
        <input type="text" id="w-input" value="${esc(wipeText)}" autocapitalize="characters" autocomplete="off" spellcheck="false" style="margin-top:8px">
        <div class="actions"><button class="btn ghost" data-w-cancel>Annuler</button>
          <button class="btn ko" data-w-yes ${ok ? "" : "disabled style=\"opacity:.45\""}>Tout effacer</button></div>
      </div></div>`;
  }

  const baseList3 = renderList;
  renderList = function () {
    const html = baseList3();
    const k = html.lastIndexOf("</section>");
    return html.slice(0, k) + wipeBlock() + html.slice(k);
  };

  function wipeAll() {
    added.forEach(a => { try { AndroidApp.dropLocal(audioSlug(a.en)); } catch (e) {} });
    added = []; saveAdded();
    P = {}; lsSave(); M = {}; mSave();
    personal = true; try { localStorage.setItem(PKEY, "1"); } catch (e) {}
    wipeStep = 0; wipeText = ""; S = null;
    rebuild(); view = "home"; render(); window.scrollTo(0, 0);
  }

  $app.addEventListener("input", e => {
    if (e.target.id !== "w-input") return;
    wipeText = e.target.value;
    const b = $app.querySelector("[data-w-yes]");
    const ok = wipeText.trim().toUpperCase() === "EFFACER";
    if (b) { b.disabled = !ok; b.style.opacity = ok ? "" : ".45"; }
  });
  $app.addEventListener("click", e => {
    if (view !== "list") return;
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.wStart !== undefined) { wipeStep = 1; wipeText = ""; render(); setTimeout(() => { const i = document.getElementById("w-input"); if (i) i.focus(); }, 30); return; }
    if (t.dataset.wCancel !== undefined) { wipeStep = 0; wipeText = ""; render(); return; }
    if (t.dataset.wYes !== undefined) { if (wipeText.trim().toUpperCase() === "EFFACER") wipeAll(); return; }
    if (t.dataset.wRestore !== undefined) {
      personal = false; try { localStorage.removeItem(PKEY); } catch (e) {}
      S = null; rebuild(); render(); return;
    }
  });

  rebuild();
  render();
})();
