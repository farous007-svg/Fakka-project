/* Fakka app prototype.
 * Everything runs in the browser: a shared "ledger" lives in localStorage, so open
 * the app in two tabs (one merchant, one customer) and watch change arrive live.
 * Amounts are stored as integer piasters (1 EGP = 100 piasters) to avoid float errors.
 */
(function () {
  const I = window.FakkaI18n;
  const t = I.t;
  const DB_KEY = "fakka.db";
  const SESSION_KEY = "fakka.session";
  const MAX_CHANGE = 2000; // EGP 20 per change transaction
  const QR_LIB = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";

  const DEMO = {
    merchant: { phone: "01000000001", name: "El-Nour Market", nameAr: "سوبر ماركت النور", role: "merchant", balance: 50000 },
    customer: { phone: "01000000002", name: "Mona", nameAr: "منى", role: "customer", balance: 1250 },
    friend: { phone: "01000000003", name: "Karim", nameAr: "كريم", role: "customer", balance: 300 },
  };
  const CHARITIES = [
    { id: "food", en: "Food Bank", ar: "بنك الطعام", ic: "🍲" },
    { id: "health", en: "Children's Hospital", ar: "مستشفى الأطفال", ic: "🏥" },
    { id: "water", en: "Clean Water Fund", ar: "صندوق المياه النظيفة", ic: "💧" },
  ];

  /* ---------- storage ---------- */
  let memSession = null;
  function loadDb() {
    let db = null;
    try { db = JSON.parse(localStorage.getItem(DB_KEY)); } catch (_) {}
    if (!db || !db.accounts) db = seed();
    return db;
  }
  function seed() {
    const db = { accounts: {}, tx: [] };
    Object.values(DEMO).forEach((a) => (db.accounts[a.phone] = { ...a, created: Date.now() }));
    const now = Date.now();
    db.tx.push(
      { id: uid(), kind: "change", from: DEMO.merchant.phone, to: DEMO.customer.phone, amount: 350, at: now - 3600e3 * 26 },
      { id: uid(), kind: "change", from: DEMO.merchant.phone, to: DEMO.customer.phone, amount: 125, at: now - 3600e3 * 5 },
    );
    return db;
  }
  function saveDb(db) { try { localStorage.setItem(DB_KEY, JSON.stringify(db)); } catch (_) {} }
  function getSession() {
    try { return sessionStorage.getItem(SESSION_KEY) || localStorage.getItem(SESSION_KEY); } catch (_) { return memSession; }
  }
  function setSession(phone) {
    memSession = phone;
    try {
      if (phone) { sessionStorage.setItem(SESSION_KEY, phone); localStorage.setItem(SESSION_KEY, phone); }
      else { sessionStorage.removeItem(SESSION_KEY); localStorage.removeItem(SESSION_KEY); }
    } catch (_) {}
  }

  /* ---------- helpers ---------- */
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function esc(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function latinDigits(s) {
    return String(s).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
  }
  function normPhone(s) { return latinDigits(s).replace(/\D/g, "").replace(/^(?:0020|20)(?=1)/, "0"); }
  function validPhone(p) { return /^01\d{9}$/.test(p); }
  /** Parse a user-typed amount into piasters; returns NaN if invalid. */
  function parseAmount(s) {
    const v = latinDigits(s).replace(/[٫,]/g, ".").trim();
    if (!/^\d+(\.\d{0,2})?$/.test(v)) return NaN;
    return Math.round(parseFloat(v) * 100);
  }
  const money = (p, sign) => I.money(p / 100, sign);
  function plain(p) { return (p / 100).toFixed(2); }
  function nameOf(acc) { if (!acc) return ""; return (I.lang === "ar" && acc.nameAr) || acc.name; }
  function charityName(id) { const c = CHARITIES.find((x) => x.id === id); return c ? c[I.lang] || c.en : id; }
  function fmtTime(ts) {
    const locale = I.lang === "ar" ? "ar-EG" : "en-GB";
    const d = new Date(ts);
    const today = new Date().toDateString() === d.toDateString();
    return today
      ? t("today") + " · " + d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString(locale, { day: "numeric", month: "short" }) + " · " + d.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  }
  function $(sel, root) { return (root || document).querySelector(sel); }

  let db = loadDb();
  saveDb(db);
  const view = $("#view");

  function me() { const p = getSession(); return p ? db.accounts[p] : null; }

  /* ---------- transactions ---------- */
  function transfer({ kind, from, to, amount }) {
    db = loadDb();
    const src = from && db.accounts[from];
    if (src && src.balance < amount) return { error: "err.balance" };
    if (src) src.balance -= amount;
    if (to && db.accounts[to]) db.accounts[to].balance += amount;
    const tx = { id: uid(), kind, from, to, amount, at: Date.now() };
    db.tx.push(tx);
    saveDb(db);
    return { tx };
  }
  /** Find or create a wallet for a phone number (prototype: unknown numbers get a wallet waiting for them). */
  function ensureCustomer(phone) {
    db = loadDb();
    if (!db.accounts[phone]) {
      db.accounts[phone] = { phone, name: phone, role: "customer", balance: 0, created: Date.now() };
      saveDb(db);
      return true;
    }
    return false;
  }

  function describe(tx, myPhone) {
    const out = tx.from === myPhone;
    const other = db.accounts[out ? tx.to : tx.from];
    const n = esc(nameOf(other) || (out ? tx.to : tx.from) || "");
    switch (tx.kind) {
      case "change": return { ic: "🪙", label: t(out ? "tx.changeTo" : "tx.changeFrom", { name: n }), out };
      case "pay": return { ic: "🛒", label: t(out ? "tx.paid" : "tx.payFrom", { name: n }), out };
      case "send": return { ic: "↗", label: t(out ? "tx.sentTo" : "tx.from", { name: n }), out };
      case "donate": return { ic: "🤲", label: t("tx.donated", { name: esc(charityName(String(tx.to).replace("charity:", ""))) }), out: true };
      case "topup": return { ic: "🏦", label: t("tx.topup"), out: false };
      default: return { ic: "•", label: tx.kind, out };
    }
  }

  function txListHtml(phone, limit) {
    const list = db.tx.filter((x) => x.from === phone || x.to === phone).sort((a, b) => b.at - a.at).slice(0, limit || 50);
    if (!list.length) return `<div class="empty">${t("empty")}</div>`;
    return `<ul class="tx-list">${list.map((tx) => {
      const d = describe(tx, phone);
      return `<li class="tx"><span class="ic" aria-hidden="true">${d.ic}</span>
        <div class="meta"><strong>${d.label}</strong><span>${fmtTime(tx.at)}</span></div>
        <span class="amt ${d.out ? "out" : "in"}">${money(tx.amount, d.out ? "−" : "+")}</span></li>`;
    }).join("")}</ul>`;
  }

  /* ---------- views ---------- */
  function render() {
    db = loadDb();
    const acc = me();
    $("#logout").hidden = !acc;
    if (!acc) return renderWelcome();
    acc.role === "merchant" ? renderMerchant(acc) : renderCustomer(acc);
    I.apply(view);
  }

  function renderWelcome() {
    const params = new URLSearchParams(location.search);
    const preRole = params.get("role") === "merchant" ? "merchant" : "customer";
    view.innerHTML = `
      <div class="stack">
        <div class="welcome-hero">
          <div class="coin-mark" aria-hidden="true">ف</div>
          <h1 data-i18n="w.title"></h1>
          <p class="muted" data-i18n="w.sub"></p>
        </div>
        <form class="card stack" id="signup" novalidate>
          <fieldset class="role-pick" style="border:0;padding:0;margin:0">
            <legend class="sr-only" data-i18n="w.iam"></legend>
            <label><input type="radio" name="role" value="customer" ${preRole === "customer" ? "checked" : ""}><span class="ic">👤</span><strong data-i18n="role.customer"></strong></label>
            <label><input type="radio" name="role" value="merchant" ${preRole === "merchant" ? "checked" : ""}><span class="ic">🏪</span><strong data-i18n="role.merchant"></strong></label>
          </fieldset>
          <div class="field"><label for="su-name" data-i18n="f.name"></label><input id="su-name" name="name" autocomplete="name" required></div>
          <div class="field"><label for="su-phone" data-i18n="f.phone"></label><input id="su-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="01xxxxxxxxx" required></div>
          <p class="error" id="su-err"></p>
          <button class="btn btn-primary btn-block" type="submit" data-i18n="w.start"></button>
        </form>
        <div class="demo-box stack">
          <strong data-i18n="w.demo"></strong>
          <p class="muted small" style="margin:0" data-i18n="w.demoHint"></p>
          <div class="row">
            <button class="btn btn-ghost" type="button" data-demo="customer">👤 <span data-i18n="w.demoCustomer"></span></button>
            <button class="btn btn-ghost" type="button" data-demo="merchant">🏪 <span data-i18n="w.demoMerchant"></span></button>
          </div>
        </div>
      </div>`;
    I.apply(view);
    view.querySelectorAll("[data-demo]").forEach((b) => b.addEventListener("click", () => { setSession(DEMO[b.dataset.demo].phone); render(); }));
    $("#signup").addEventListener("submit", (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const name = String(f.get("name") || "").trim();
      const phone = normPhone(f.get("phone"));
      const err = $("#su-err");
      if (!name) return (err.textContent = t("err.name"));
      if (!validPhone(phone)) return (err.textContent = t("err.phone"));
      db = loadDb();
      const existing = db.accounts[phone];
      if (existing) {
        if (existing.name === existing.phone) { existing.name = name; existing.role = f.get("role"); saveDb(db); }
        else toast(t("toast.welcomeBack", { name: nameOf(existing) }));
      } else {
        db.accounts[phone] = { phone, name, role: f.get("role"), balance: 0, created: Date.now() };
        saveDb(db);
      }
      setSession(phone);
      render();
    });
  }

  function renderCustomer(acc) {
    view.innerHTML = `
      <div class="stack">
        <div class="balance">
          <div class="label" data-i18n="c.balance"></div>
          <div class="amount">${money(acc.balance)}</div>
          <div class="who">${esc(t("hello", { name: nameOf(acc) }))} · <span dir="ltr">${acc.phone}</span></div>
        </div>
        <div class="actions">
          <button class="action primary" data-act="receive"><span class="ic">⬇</span><span data-i18n="a.receive"></span></button>
          <button class="action" data-act="pay"><span class="ic">🛒</span><span data-i18n="a.pay"></span></button>
          <button class="action" data-act="send"><span class="ic">↗</span><span data-i18n="a.send"></span></button>
          <button class="action" data-act="donate"><span class="ic">🤲</span><span data-i18n="a.donate"></span></button>
        </div>
        <div class="section-title"><h2 data-i18n="activity"></h2></div>
        ${txListHtml(acc.phone)}
      </div>`;
    bindActions({ receive: sheetReceive, pay: () => sheetTransfer("pay"), send: () => sheetTransfer("send"), donate: sheetDonate });
  }

  function renderMerchant(acc) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const today = db.tx.filter((x) => x.at >= start.getTime());
    const sent = today.filter((x) => x.kind === "change" && x.from === acc.phone);
    const received = today.filter((x) => x.kind === "pay" && x.to === acc.phone);
    const sum = (a) => a.reduce((s, x) => s + x.amount, 0);
    view.innerHTML = `
      <div class="stack">
        <div class="balance">
          <div class="label" data-i18n="m.float"></div>
          <div class="amount">${money(acc.balance)}</div>
          <div class="who">${esc(nameOf(acc))} · <span dir="ltr">${acc.phone}</span></div>
        </div>
        <button class="btn btn-primary btn-block" data-act="change" style="font-size:1.1rem">🪙 <span data-i18n="a.giveChange"></span></button>
        <div class="actions three">
          <button class="action" data-act="topup"><span class="ic">🏦</span><span data-i18n="a.topup"></span></button>
          <button class="action" data-act="receive"><span class="ic">⬇</span><span data-i18n="a.myCode"></span></button>
          <button class="action" data-act="history"><span class="ic">📋</span><span data-i18n="a.history"></span></button>
        </div>
        <div class="section-title"><h2 data-i18n="m.today"></h2></div>
        <div class="stats">
          <div class="stat"><strong>${money(sum(sent))}</strong><span>${esc(t("m.sentN", { n: sent.length.toLocaleString(I.lang === "ar" ? "ar-EG" : "en") }))}</span></div>
          <div class="stat"><strong>${money(sum(received))}</strong><span>${esc(t("m.recvN", { n: received.length.toLocaleString(I.lang === "ar" ? "ar-EG" : "en") }))}</span></div>
        </div>
        <div class="section-title"><h2 data-i18n="activity"></h2></div>
        ${txListHtml(acc.phone, 8)}
      </div>`;
    bindActions({ change: sheetChange, topup: sheetTopup, receive: sheetReceive, history: sheetHistory });
  }

  function bindActions(map) {
    view.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => map[b.dataset.act]()));
  }

  /* ---------- sheets ---------- */
  let lastFocus = null;
  function openSheet(titleKey, html, onMount) {
    lastFocus = document.activeElement;
    $("#sheet-title").textContent = t(titleKey);
    $("#sheet-body").innerHTML = html;
    I.apply($("#sheet-body"));
    $("#sheet").hidden = false;
    $("#sheet-backdrop").hidden = false;
    onMount && onMount($("#sheet-body"));
    const first = $("#sheet-body input, #sheet-body button");
    (first || $("#sheet-close")).focus();
  }
  function closeSheet() {
    $("#sheet").hidden = true;
    $("#sheet-backdrop").hidden = true;
    $("#sheet-body").innerHTML = "";
    lastFocus && lastFocus.focus && lastFocus.focus();
  }
  $("#sheet-close").addEventListener("click", closeSheet);
  $("#sheet-backdrop").addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#sheet").hidden) closeSheet(); });

  function success(msgHtml) {
    $("#sheet-body").innerHTML = `<div class="success stack"><div class="big-ic">✅</div><p style="font-weight:700;font-size:1.1rem;margin:0">${msgHtml}</p>
      <button class="btn btn-primary btn-block" type="button" id="done" data-i18n="done"></button></div>`;
    I.apply($("#sheet-body"));
    $("#done").addEventListener("click", closeSheet);
    $("#done").focus();
    render();
  }

  function sheetReceive() {
    const acc = me();
    openSheet(acc.role === "merchant" ? "a.myCode" : "a.receive", `
      <div class="stack" style="text-align:center">
        <p class="muted" style="margin:0" data-i18n="${acc.role === "merchant" ? "r.hintM" : "r.hint"}"></p>
        <div class="qr-wrap" id="qr"><span class="muted small" data-i18n="r.loading"></span></div>
        <div class="code">${acc.phone.replace(/(\d{3})(\d{4})(\d{4})/, "$1 $2 $3")}</div>
        <button class="btn btn-ghost" type="button" id="copy" data-i18n="r.copy"></button>
      </div>`, () => {
      renderQr($("#qr"), "fakka:" + acc.phone);
      $("#copy").addEventListener("click", () => {
        navigator.clipboard && navigator.clipboard.writeText(acc.phone).then(() => toast(t("toast.copied")), () => {});
      });
    });
  }

  function loadScript(src) {
    return new Promise((res, rej) => {
      if (window.qrcode) return res();
      const s = document.createElement("script");
      s.src = src; s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
  }
  function renderQr(el, text) {
    loadScript(QR_LIB).then(() => {
      const qr = window.qrcode(0, "M");
      qr.addData(text); qr.make();
      el.innerHTML = `<img alt="${esc(t("r.qrAlt"))}" style="image-rendering:pixelated" src="${qr.createDataURL(8, 0)}">`;
    }).catch(() => { el.innerHTML = `<span class="muted small">${esc(t("r.qrFail"))}</span>`; });
  }

  function phoneField(id, labelKey, demoPhone, demoKey) {
    return `<div class="field"><label for="${id}" data-i18n="${labelKey}"></label>
      <input id="${id}" type="tel" inputmode="tel" placeholder="01xxxxxxxxx" autocomplete="off">
      ${demoPhone ? `<div class="chips"><button type="button" class="chip" data-fill="${id}" data-val="${demoPhone}">${esc(t(demoKey))}</button></div>` : ""}</div>`;
  }
  function wireFill(root) {
    root.querySelectorAll("[data-fill]").forEach((c) => c.addEventListener("click", () => {
      const input = $("#" + c.dataset.fill, root);
      input.value = c.dataset.val;
      input.dispatchEvent(new Event("input"));
    }));
  }

  function sheetTransfer(kind) {
    const acc = me();
    const isPay = kind === "pay";
    const demo = isPay ? DEMO.merchant.phone : acc.phone === DEMO.friend.phone ? DEMO.customer.phone : DEMO.friend.phone;
    openSheet(isPay ? "a.pay" : "a.send", `
      <form class="stack" id="tf" novalidate>
        ${phoneField("tf-phone", isPay ? "f.merchantPhone" : "f.friendPhone", demo, isPay ? "chip.demoMerchant" : "chip.demoFriend")}
        <div class="field"><label for="tf-amt" data-i18n="f.amount"></label><input id="tf-amt" inputmode="decimal" placeholder="0.00" autocomplete="off">
          <span class="hint">${esc(t("hint.available", { v: money(acc.balance) }))}</span></div>
        <p class="error" id="tf-err"></p>
        <button class="btn btn-primary btn-block" type="submit" data-i18n="${isPay ? "a.pay" : "a.send"}"></button>
      </form>`, (root) => {
      wireFill(root);
      $("#tf").addEventListener("submit", (e) => {
        e.preventDefault();
        const err = $("#tf-err");
        const phone = normPhone($("#tf-phone").value);
        const amount = parseAmount($("#tf-amt").value);
        db = loadDb();
        const target = db.accounts[phone];
        if (!validPhone(phone)) return (err.textContent = t("err.phone"));
        if (phone === acc.phone) return (err.textContent = t("err.self"));
        if (isPay && (!target || target.role !== "merchant")) return (err.textContent = t("err.noMerchant"));
        if (!isPay && target && target.role === "merchant") return (err.textContent = t("err.isMerchant"));
        if (!(amount > 0)) return (err.textContent = t("err.amount"));
        if (!isPay) ensureCustomer(phone);
        const r = transfer({ kind, from: acc.phone, to: phone, amount });
        if (r.error) return (err.textContent = t(r.error));
        const name = nameOf(loadDb().accounts[phone]);
        success(esc(t(isPay ? "ok.paid" : "ok.sent", { v: money(amount), name })));
      });
    });
  }

  function sheetDonate() {
    const acc = me();
    const piasters = acc.balance % 100;
    openSheet("a.donate", `
      <form class="stack" id="dn" novalidate>
        <div class="stack" role="radiogroup" aria-labelledby="dn-l"><strong id="dn-l" data-i18n="d.pick"></strong>
          ${CHARITIES.map((c, i) => `<label class="charity"><input type="radio" name="ch" value="${c.id}" ${i === 0 ? "checked" : ""}><span aria-hidden="true">${c.ic}</span><span>${esc(c[I.lang] || c.en)}</span></label>`).join("")}
        </div>
        <div class="field"><label for="dn-amt" data-i18n="f.amount"></label><input id="dn-amt" inputmode="decimal" placeholder="0.00" autocomplete="off">
          <div class="chips">
            ${piasters ? `<button type="button" class="chip" data-fill="dn-amt" data-val="${plain(piasters)}">${esc(t("d.piasters", { v: money(piasters) }))}</button>` : ""}
            <button type="button" class="chip" data-fill="dn-amt" data-val="1.00">${money(100)}</button>
            <button type="button" class="chip" data-fill="dn-amt" data-val="5.00">${money(500)}</button>
          </div>
          <span class="hint">${esc(t("hint.available", { v: money(acc.balance) }))}</span></div>
        <p class="error" id="dn-err"></p>
        <button class="btn btn-primary btn-block" type="submit" data-i18n="a.donate"></button>
      </form>`, (root) => {
      wireFill(root);
      $("#dn").addEventListener("submit", (e) => {
        e.preventDefault();
        const amount = parseAmount($("#dn-amt").value);
        const ch = new FormData(e.target).get("ch");
        if (!(amount > 0)) return ($("#dn-err").textContent = t("err.amount"));
        const r = transfer({ kind: "donate", from: acc.phone, to: "charity:" + ch, amount });
        if (r.error) return ($("#dn-err").textContent = t(r.error));
        success(esc(t("ok.donated", { v: money(amount), name: charityName(ch) })));
      });
    });
  }

  function sheetChange() {
    const acc = me();
    openSheet("a.giveChange", `
      <form class="stack" id="ch" novalidate>
        <div class="row">
          <div class="field grow"><label for="ch-bill" data-i18n="f.bill"></label><input id="ch-bill" inputmode="decimal" placeholder="46.50" autocomplete="off"></div>
          <div class="field grow"><label for="ch-paid" data-i18n="f.paid"></label><input id="ch-paid" inputmode="decimal" placeholder="50.00" autocomplete="off"></div>
        </div>
        <div class="calc-result" id="ch-calc" hidden>
          <div class="line"><span data-i18n="c.change"></span><b id="ch-total"></b></div>
          <div class="line"><span data-i18n="c.cash"></span><b id="ch-cash"></b></div>
        </div>
        <div class="field"><label for="ch-fakka" data-i18n="f.fakka"></label><input id="ch-fakka" inputmode="decimal" placeholder="0.00" autocomplete="off">
          <span class="hint">${esc(t("hint.fakka", { v: money(MAX_CHANGE) }))}</span>
          <div class="chips" id="ch-chips" hidden><button type="button" class="chip" id="ch-all" data-i18n="c.allFakka"></button></div></div>
        ${phoneField("ch-phone", "f.customerPhone", DEMO.customer.phone, "chip.demoCustomer")}
        <p class="error" id="ch-err"></p>
        <button class="btn btn-primary btn-block" type="submit" data-i18n="c.send"></button>
      </form>`, (root) => {
      wireFill(root);
      let change = 0;
      const recalc = () => {
        const bill = parseAmount($("#ch-bill").value), paid = parseAmount($("#ch-paid").value);
        const ok = bill > 0 && paid >= bill;
        $("#ch-calc").hidden = !ok;
        $("#ch-chips").hidden = !ok;
        if (!ok) return;
        change = paid - bill;
        const fakka = Math.min(change % 500, MAX_CHANGE); // part that can't be paid with notes (smallest note: EGP 5)
        $("#ch-total").textContent = money(change);
        $("#ch-fakka").value = plain(fakka);
        updateCash();
      };
      const updateCash = () => {
        const f = parseAmount($("#ch-fakka").value) || 0;
        $("#ch-cash").textContent = money(Math.max(change - f, 0));
      };
      $("#ch-bill").addEventListener("input", recalc);
      $("#ch-paid").addEventListener("input", recalc);
      $("#ch-fakka").addEventListener("input", updateCash);
      $("#ch-all").addEventListener("click", () => { $("#ch-fakka").value = plain(Math.min(change, MAX_CHANGE)); updateCash(); });
      $("#ch").addEventListener("submit", (e) => {
        e.preventDefault();
        const err = $("#ch-err");
        const amount = parseAmount($("#ch-fakka").value);
        const phone = normPhone($("#ch-phone").value);
        if (!(amount > 0)) return (err.textContent = t("err.amount"));
        if (amount > MAX_CHANGE) return (err.textContent = t("err.max", { v: money(MAX_CHANGE) }));
        if (change && amount > change) return (err.textContent = t("err.moreThanChange"));
        if (!validPhone(phone)) return (err.textContent = t("err.phone"));
        if (phone === acc.phone) return (err.textContent = t("err.self"));
        const target = loadDb().accounts[phone];
        if (target && target.role === "merchant") return (err.textContent = t("err.isMerchant"));
        const created = ensureCustomer(phone);
        const r = transfer({ kind: "change", from: acc.phone, to: phone, amount });
        if (r.error) return (err.textContent = t("err.float"));
        const name = nameOf(loadDb().accounts[phone]);
        success(esc(t("ok.change", { v: money(amount), name })) + (created ? `<br><span class="muted small">${esc(t("ok.newWallet"))}</span>` : ""));
      });
    });
  }

  function sheetTopup() {
    const acc = me();
    openSheet("a.topup", `
      <form class="stack" id="tu" novalidate>
        <p class="muted" style="margin:0" data-i18n="tu.hint"></p>
        <div class="field"><label for="tu-amt" data-i18n="f.amount"></label><input id="tu-amt" inputmode="decimal" placeholder="0.00" autocomplete="off">
          <div class="chips">${[100, 200, 500].map((v) => `<button type="button" class="chip" data-fill="tu-amt" data-val="${v}.00">${money(v * 100)}</button>`).join("")}</div></div>
        <p class="error" id="tu-err"></p>
        <button class="btn btn-primary btn-block" type="submit" data-i18n="a.topup"></button>
      </form>`, (root) => {
      wireFill(root);
      $("#tu").addEventListener("submit", (e) => {
        e.preventDefault();
        const amount = parseAmount($("#tu-amt").value);
        if (!(amount > 0)) return ($("#tu-err").textContent = t("err.amount"));
        transfer({ kind: "topup", from: null, to: acc.phone, amount });
        success(esc(t("ok.topup", { v: money(amount) })));
      });
    });
  }

  function sheetHistory() { openSheet("a.history", txListHtml(me().phone, 200)); }

  /* ---------- toast & live updates ---------- */
  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 3200);
  }

  // Another tab changed the ledger (e.g. merchant sent change): refresh and announce new money.
  window.addEventListener("storage", (e) => {
    if (e.key !== DB_KEY) return;
    const prev = db;
    db = loadDb();
    const acc = me();
    if (!acc) return;
    const seen = new Set(prev.tx.map((x) => x.id));
    db.tx.filter((x) => !seen.has(x.id) && x.to === acc.phone).forEach((x) => {
      const d = describe(x, acc.phone);
      const tmp = document.createElement("div");
      tmp.innerHTML = d.label;
      toast(money(x.amount, "+") + " · " + tmp.textContent);
    });
    if ($("#sheet").hidden) render();
  });

  $("#logout").addEventListener("click", () => { setSession(null); closeSheet(); render(); });
  I.onChange(() => { render(); if (!$("#sheet").hidden) closeSheet(); });

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  render();
})();
