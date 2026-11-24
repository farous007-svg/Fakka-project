/* Tiny i18n helper shared by the website and the app.
 * Each page defines window.FAKKA_STRINGS = { en: {...}, ar: {...} } before loading this file.
 * Elements opt in with data-i18n="key" (text), data-i18n-placeholder="key", data-i18n-aria="key".
 */
(function () {
  const STORAGE_KEY = "fakka.lang";

  function getLang() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === "ar" || saved === "en") return saved;
    } catch (_) {}
    return (navigator.language || "en").toLowerCase().startsWith("ar") ? "ar" : "en";
  }

  let lang = getLang();
  const listeners = [];

  function t(key, vars) {
    const dict = (window.FAKKA_STRINGS || {})[lang] || {};
    let s = dict[key];
    if (s == null) s = ((window.FAKKA_STRINGS || {}).en || {})[key] ?? key;
    if (vars) for (const k in vars) s = s.replace(new RegExp("\\{" + k + "\\}", "g"), vars[k]);
    return s;
  }

  function apply(root) {
    root = root || document;
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    root.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll("[data-i18n-html]").forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
    root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => { el.placeholder = t(el.dataset.i18nPlaceholder); });
    root.querySelectorAll("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
    const title = t("doc.title");
    if (title !== "doc.title") document.title = title;
  }

  function setLang(next) {
    lang = next;
    try { localStorage.setItem(STORAGE_KEY, next); } catch (_) {}
    apply();
    listeners.forEach((fn) => fn(lang));
  }

  function toggle() { setLang(lang === "ar" ? "en" : "ar"); }

  /** Format a money amount in EGP using the active language's digits.
   * `sign` ("+" or "−") is kept next to the number; in Arabic the signed number is
   * wrapped in Unicode LTR isolates so RTL layout doesn't push the sign to the far end. */
  function money(value, sign) {
    const locale = lang === "ar" ? "ar-EG" : "en-EG";
    const n = new Intl.NumberFormat(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
    sign = sign || "";
    return lang === "ar" ? "⁦" + sign + n + "⁩ ج.م" : sign + "EGP " + n;
  }

  window.FakkaI18n = {
    t, apply, setLang, toggle, money,
    get lang() { return lang; },
    onChange(fn) { listeners.push(fn); },
  };

  document.addEventListener("DOMContentLoaded", () => {
    apply();
    document.querySelectorAll("[data-lang-toggle]").forEach((b) => b.addEventListener("click", toggle));
  });
})();
