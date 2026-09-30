/* ============================================================
   LegalLaunch — app controller
   - monetization gate: free watermark preview vs. unlock
   - license validation: FNV-1a 32 of "legallaunch-salt-v1"+email
     -> first 8 hex uppercase -> "XXXX-XXXX"
   - ?demo=1 unlocks for 24 hours (documented in README)
   - tabbed output, edit mode, copy, Blob downloads, print
   ============================================================ */
(function () {
  "use strict";

  var LICENSE_KEY = "ll_license_v1";   // { email, key, ts }
  var DEMO_KEY = "ll_demo_until_v1";   // ms timestamp
  var DEMO_HOURS = 24;

  var state = {
    answers: null,
    docs: null,          // { privacy:{title,md}, terms:..., cookies:..., refund:... }
    active: "privacy",
    editing: false,
    unlocked: false,
    demoActive: false
  };

  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  /* ================= lock / license ================= */

  function readLicense() {
    try {
      var raw = localStorage.getItem(LICENSE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function saveLicense(email, key) {
    try {
      localStorage.setItem(LICENSE_KEY, JSON.stringify({ email: email, key: key, ts: Date.now() }));
    } catch (e) {}
  }

  function demoUntil() {
    try {
      var v = parseInt(localStorage.getItem(DEMO_KEY) || "0", 10);
      return isNaN(v) ? 0 : v;
    } catch (e) { return 0; }
  }

  function refreshLock() {
    state.unlocked = !!readLicense();
    state.demoActive = Date.now() < demoUntil();
  }

  function isUnlocked() {
    refreshLock();
    return state.unlocked || state.demoActive;
  }

  function normalizeEmail(e) {
    return String(e || "").trim().toLowerCase();
  }

  function expectedKeyFor(email) {
    return window.Generator.licenseKeyFor(normalizeEmail(email));
  }

  function keyEquals(input, email) {
    var clean = String(input || "").toUpperCase().replace(/[^A-F0-9]/g, "");
    return clean.length === 8 && clean === expectedKeyFor(email).replace("-", "");
  }

  /* ================= UI: lock state ================= */

  function applyLockUI() {
    var unlocked = isUnlocked();
    $all("[data-unlock-only]").forEach(function (el) { el.hidden = unlocked; });
    $all("[data-locked-only]").forEach(function (el) { el.hidden = !unlocked; });
    $all("[data-buy-link]").forEach(function (el) {
      var link = (window.SITE_CONFIG && window.SITE_CONFIG.stripePaymentLink) || "";
      if (link && link.indexOf("PASTE_YOUR") !== 0) {
        el.setAttribute("href", link);
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener");
        el.removeAttribute("data-not-configured");
        el.style.opacity = "";
        el.style.pointerEvents = "";
      } else {
        el.setAttribute("data-not-configured", "1");
        el.removeAttribute("href");
        el.style.opacity = ".5";
      }
    });
    var notCfg = $("#buyNotConfigured");
    if (notCfg) {
      var configured = !!(window.SITE_CONFIG && window.SITE_CONFIG.stripePaymentLink &&
        window.SITE_CONFIG.stripePaymentLink.indexOf("PASTE_YOUR") !== 0);
      notCfg.hidden = configured;
      notCfg.textContent = configured ? "" :
        "Site owner: paste your Stripe payment link into js/config.js (stripePaymentLink) to enable checkout. Owner note only, not shown to buyers once configured.";
    }
    var pill = $("#lockPill");
    if (pill) {
      if (unlocked) {
        pill.textContent = state.unlocked ? "Unlocked" : "Demo unlocked";
        pill.className = "pill pill-unlocked";
      } else {
        pill.textContent = "Free preview";
        pill.className = "pill pill-locked";
      }
    }
    var demoBanner = $("#demoBanner");
    if (demoBanner) demoBanner.hidden = !(state.demoActive && !state.unlocked);
    var unlockedBanner = $("#unlockedBanner");
    if (unlockedBanner) unlockedBanner.hidden = !(state.unlocked || state.demoActive);
    renderActiveDoc();
  }

  function openUnlock() {
    var m = $("#unlockModal");
    if (!m) return;
    m.hidden = false;
    var err = $("#unlockError");
    if (err) err.hidden = true;
    setTimeout(function () { var e = $("#unlockEmail"); if (e) e.focus(); }, 40);
  }

  function closeUnlock() {
    var m = $("#unlockModal");
    if (m) m.hidden = true;
  }

  function tryUnlock() {
    var emailEl = $("#unlockEmail");
    var keyEl = $("#unlockKey");
    var err = $("#unlockError");
    var email = normalizeEmail(emailEl && emailEl.value);
    var key = (keyEl && keyEl.value) || "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      if (err) { err.textContent = "Enter the email address you used at checkout."; err.hidden = false; }
      if (emailEl) emailEl.focus();
      return;
    }
    if (!keyEquals(key, email)) {
      if (err) {
        err.textContent = "That license key doesn't match this email. Check for typos (keys look like A3F9-12BC, uppercase). If you just purchased, allow a few minutes and check your receipt email.";
        err.hidden = false;
      }
      if (keyEl) keyEl.focus();
      return;
    }
    saveLicense(email, expectedKeyFor(email));
    closeUnlock();
    state.editing = state.editing && true;
    applyLockUI();
    var banner = $("#demoBanner");
    if (banner) banner.hidden = true;
    var ok = $("#unlockedBanner");
    if (ok) ok.hidden = false;
    if (ok) ok.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function activateDemo() {
    try {
      localStorage.setItem(DEMO_KEY, String(Date.now() + DEMO_HOURS * 3600 * 1000));
    } catch (e) {}
    applyLockUI();
  }

  /* ================= output rendering ================= */

  var DOC_ORDER = ["privacy", "terms", "cookies", "refund"];
  var DOC_LABELS = { privacy: "Privacy Policy", terms: "Terms of Service", cookies: "Cookie Policy", refund: "Refund Policy" };

  function currentMd() {
    if (!state.docs || !state.docs[state.active]) return "";
    return state.docs[state.active].md;
  }

  function renderTabs() {
    var wrap = $("#docTabs");
    if (!wrap) return;
    wrap.innerHTML = "";
    DOC_ORDER.forEach(function (key) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "tab" + (key === state.active ? " tab-active" : "");
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", key === state.active ? "true" : "false");
      b.textContent = DOC_LABELS[key];
      var wc = state.docs && state.docs[key] ? wordCount(state.docs[key].md) : 0;
      var span = document.createElement("span");
      span.className = "tab-meta";
      span.textContent = wc ? wc.toLocaleString() + " words" : "";
      b.appendChild(span);
      b.addEventListener("click", function () {
        state.active = key;
        state.editing = false;
        renderTabs();
        renderActiveDoc();
      });
      wrap.appendChild(b);
    });
  }

  function wordCount(md) {
    return String(md).trim().split(/\s+/).filter(Boolean).length;
  }

  function renderActiveDoc() {
    var paper = $("#docPaper");
    if (!paper || !state.docs) return;
    var md = currentMd();
    paper.innerHTML = window.Generator.mdToHtmlFragment(md);

    var unlocked = isUnlocked();
    var viewer = $("#docViewer");
    if (viewer) viewer.classList.toggle("watermarked", !unlocked);

    var editor = $("#docEditor");
    if (editor) {
      if (state.editing) {
        if (editor.value !== md) editor.value = md;
      }
      editor.hidden = !state.editing;
      paper.hidden = state.editing;
    }

    var editBtn = $("#btnEdit");
    if (editBtn) {
      editBtn.textContent = state.editing ? "Done editing" : "Edit";
      editBtn.setAttribute("aria-pressed", state.editing ? "true" : "false");
      editBtn.disabled = !unlocked;
      editBtn.title = unlocked ? "Tweak the wording, then re-download" : "Editing is part of the paid unlock";
    }
    ["#btnCopy", "#btnDlHtml", "#btnDlMd", "#btnDlTxt", "#btnDlAll", "#btnPrint"].forEach(function (sel) {
      var el = $(sel);
      if (el) el.disabled = !unlocked;
    });
    var hint = $("#docHint");
    if (hint) {
      hint.textContent = unlocked
        ? (state.editing
          ? "Editing " + DOC_LABELS[state.active] + ". Changes are saved in this browser and included in downloads."
          : "Unlocked: copy, download, edit and print freely. Re-generate anytime from the wizard.")
        : "Free preview: read the full document. Copy, download, print and editing unlock for " + ((window.SITE_CONFIG && window.SITE_CONFIG.price) || "$29") + " one-time.";
    }
  }

  function onEditorInput() {
    var editor = $("#docEditor");
    if (!editor || !state.docs) return;
    state.docs[state.active].md = editor.value;
    clearTimeout(state._editTimer);
    state._editTimer = setTimeout(function () { renderTabs(); }, 500);
  }

  /* ================= downloads / copy / print ================= */

  function download(filename, content, mime) {
    var blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function slug() {
    var base = (state.answers && state.answers.siteName) || "website";
    var s = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "website";
    return s;
  }

  function doCopy() {
    var md = currentMd();
    var txt = window.Generator.mdToTxt(md);
    function done() {
      var b = $("#btnCopy");
      if (b) { var old = b.textContent; b.textContent = "Copied!"; setTimeout(function () { b.textContent = old; }, 1600); }
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done, function () { fallbackCopy(txt); done(); });
    } else {
      fallbackCopy(txt); done();
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) {}
    document.body.removeChild(ta);
  }

  function doPrint() {
    var viewer = $("#docViewer");
    if (!viewer) return;
    viewer.classList.add("printing");
    document.body.classList.add("print-mode");
    setTimeout(function () {
      window.print();
      document.body.classList.remove("print-mode");
      viewer.classList.remove("printing");
    }, 60);
  }

  /* ================= generate ================= */

  function generate(answers) {
    var result = window.Generator.buildAll(answers);
    state.answers = result.answers;
    state.docs = result.docs;
    state.active = "privacy";
    state.editing = false;

    var out = $("#output");
    if (out) out.hidden = false;
    var empty = $("#outputEmpty");
    if (empty) empty.hidden = true;

    renderTabs();
    renderActiveDoc();
    applyLockUI();

    setTimeout(function () {
      var t = $("#output");
      if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 80);
  }

  /* ================= init ================= */

  function init() {
    var cfg = window.SITE_CONFIG || {};
    $all("[data-brand]").forEach(function (el) { el.textContent = cfg.brandName || "LegalLaunch"; });
    $all("[data-price]").forEach(function (el) { el.textContent = cfg.price || "$29"; });
    $all("[data-price2]").forEach(function (el) { el.textContent = cfg.priceTier2 || "$49"; });

    // demo unlock via ?demo=1 (owner testing; documented in README)
    try {
      var params = new URLSearchParams(location.search);
      if (params.get("demo") === "1") activateDemo();
    } catch (e) {}

    // buttons
    var openBtns = $all("[data-open-unlock]");
    openBtns.forEach(function (b) { b.addEventListener("click", function (e) { e.preventDefault(); openUnlock(); }); });
    var closeBtn = $("#unlockClose");
    if (closeBtn) closeBtn.addEventListener("click", closeUnlock);
    var modal = $("#unlockModal");
    if (modal) {
      modal.addEventListener("click", function (e) { if (e.target === modal) closeUnlock(); });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeUnlock();
    });
    var unlockBtn = $("#unlockConfirm");
    if (unlockBtn) unlockBtn.addEventListener("click", tryUnlock);
    var unlockForm = $("#unlockForm");
    if (unlockForm) {
      unlockForm.addEventListener("submit", function (e) { e.preventDefault(); tryUnlock(); });
    }

    var tabs = $("#docTabs");
    if (tabs) tabs.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      var btns = $all("#docTabs .tab");
      var idx = btns.indexOf(document.activeElement);
      if (idx < 0) return;
      var dir = e.key === "ArrowRight" ? 1 : -1;
      var next = btns[(idx + dir + btns.length) % btns.length];
      next.focus(); next.click();
    });

    var copy = $("#btnCopy");
    if (copy) copy.addEventListener("click", doCopy);
    var print = $("#btnPrint");
    if (print) print.addEventListener("click", doPrint);
    var dlHtml = $("#btnDlHtml");
    if (dlHtml) dlHtml.addEventListener("click", function () {
      var doc = state.docs[state.active];
      download(slug() + "-" + state.active + "-policy.html",
        window.Generator.mdToHtmlDoc(doc.title, doc.md, ["Website: " + ((state.answers && state.answers.siteUrl) || "")]), "text/html;charset=utf-8");
    });
    var dlMd = $("#btnDlMd");
    if (dlMd) dlMd.addEventListener("click", function () {
      var doc = state.docs[state.active];
      download(slug() + "-" + state.active + "-policy.md", doc.md, "text/markdown;charset=utf-8");
    });
    var dlTxt = $("#btnDlTxt");
    if (dlTxt) dlTxt.addEventListener("click", function () {
      var doc = state.docs[state.active];
      download(slug() + "-" + state.active + "-policy.txt", window.Generator.mdToTxt(doc.md), "text/plain;charset=utf-8");
    });
    var dlAll = $("#btnDlAll");
    if (dlAll) dlAll.addEventListener("click", function () {
      DOC_ORDER.forEach(function (key, i) {
        setTimeout(function () {
          var doc = state.docs[key];
          download(slug() + "-" + key + "-policy.md", doc.md, "text/markdown;charset=utf-8");
        }, i * 350);
      });
    });
    var editBtn = $("#btnEdit");
    if (editBtn) editBtn.addEventListener("click", function () {
      if (!isUnlocked()) { openUnlock(); return; }
      state.editing = !state.editing;
      renderActiveDoc();
    });
    var editor = $("#docEditor");
    if (editor) editor.addEventListener("input", onEditorInput);

    applyLockUI();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.App = {
    generate: generate,
    isUnlocked: isUnlocked,
    openUnlock: openUnlock,
    activateDemo: activateDemo,
    _licenseKeyFor: expectedKeyFor
  };
})();
