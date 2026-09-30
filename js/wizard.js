/* ============================================================
   LegalLaunch — multi-step questionnaire wizard
   - progress bar, back/next, validation
   - localStorage autosave + restore + reset
   - realistic defaults so users finish fast
   Exposes window.Wizard.collectAnswers() and hooks the
   Generate button to window.App.generate().
   ============================================================ */
(function () {
  "use strict";

  var STORAGE_KEY = "ll_answers_v1";
  var TOTAL_STEPS = 5;
  var currentStep = 1;
  var saveTimer = null;

  function $(sel) { return document.querySelector(sel); }
  function $all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }

  /* ---------- navigation ---------- */

  function showStep(n) {
    currentStep = Math.min(Math.max(n, 1), TOTAL_STEPS);
    $all(".wiz-step").forEach(function (el) {
      el.hidden = (parseInt(el.getAttribute("data-step"), 10) !== currentStep);
    });
    var pct = Math.round((currentStep / TOTAL_STEPS) * 100);
    var bar = $("#wizBar");
    if (bar) bar.style.width = pct + "%";
    var label = $("#wizLabel");
    if (label) label.textContent = "Step " + currentStep + " of " + TOTAL_STEPS;
    $all("#wizDots span").forEach(function (d, i) {
      d.className = i < currentStep ? "dot done" : "dot";
    });
    var prev = $("#wizPrev");
    if (prev) prev.disabled = (currentStep === 1);
    var next = $("#wizNext");
    var gen = $("#wizGenerate");
    if (next && gen) {
      next.hidden = (currentStep === TOTAL_STEPS);
      gen.hidden = (currentStep !== TOTAL_STEPS);
    }
    var step = $('.wiz-step[data-step="' + currentStep + '"]');
    if (step) step.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function firstInvalidInStep(step) {
    var stepEl = $('.wiz-step[data-step="' + step + '"]');
    if (!stepEl) return null;
    var required = stepEl.querySelectorAll("[data-required]");
    for (var i = 0; i < required.length; i++) {
      var el = required[i];
      var val = (el.type === "radio")
        ? !!stepEl.querySelector('input[name="' + el.name + '"]:checked')
        : el.value.trim();
      if (!val) return el;
    }
    var email = stepEl.querySelector('input[type="email"]');
    if (email && email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) return email;
    return null;
  }

  function goNext() {
    var bad = firstInvalidInStep(currentStep);
    if (bad) {
      bad.focus();
      var msg = $("#wizError");
      if (msg) {
        msg.textContent = bad.type === "email"
          ? "Please enter a valid email address (e.g. you@yoursite.com)."
          : "Please fill in " + (bad.getAttribute("data-required-label") || "this field") + " before continuing.";
        msg.hidden = false;
        setTimeout(function () { msg.hidden = true; }, 4000);
      }
      return;
    }
    if (currentStep === TOTAL_STEPS) { generate(); return; }
    showStep(currentStep + 1);
    save();
  }

  function generate() {
    if (window.App && typeof window.App.generate === "function") {
      window.App.generate(collectAnswers());
    }
  }

  /* ---------- state ---------- */

  function readForm() {
    var company = $("input[name='entityType']:checked");
    return {
      siteName: ($("#f_siteName") || {}).value || "",
      siteUrl: ($("#f_siteUrl") || {}).value || "",
      contactEmail: ($("#f_email") || {}).value || "",
      entityType: company ? company.value : "individual",
      companyName: ($("#f_companyName") || {}).value || "",
      regions: {
        eu: !!($("#f_eu") || {}).checked,
        uk: !!($("#f_uk") || {}).checked,
        ca: !!($("#f_ca") || {}).checked,
        other: !!($("#f_other") || {}).checked
      },
      jurisdiction: ($("#f_jurisdiction") || {}).value || "California, United States",
      collect: {
        analytics: !!($("#f_c_analytics") || {}).checked,
        accounts: !!($("#f_c_accounts") || {}).checked,
        payments: !!($("#f_c_payments") || {}).checked,
        ads: !!($("#f_c_ads") || {}).checked,
        contact: !!($("#f_c_contact") || {}).checked,
        cookies: !!($("#f_c_cookies") || {}).checked
      },
      dataCustom: ($("#f_dataCustom") || {}).value || "",
      services: {
        ga: !!($("#f_s_ga") || {}).checked,
        gads: !!($("#f_s_gads") || {}).checked,
        meta: !!($("#f_s_meta") || {}).checked,
        stripe: !!($("#f_s_stripe") || {}).checked,
        paypal: !!($("#f_s_paypal") || {}).checked,
        mailchimp: !!($("#f_s_mailchimp") || {}).checked,
        hotjar: !!($("#f_s_hotjar") || {}).checked,
        cloudflare: !!($("#f_s_cloudflare") || {}).checked
      },
      refund: (($("input[name='refund']:checked") || {}).value) || "14day",
      refundCustom: ($("#f_refundCustom") || {}).value || ""
    };
  }

  function collectAnswers() {
    var a = readForm();
    a.effectiveDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    return a;
  }

  function writeForm(a) {
    if (!a) return;
    function setVal(id, v) { var el = document.getElementById(id); if (el) el.value = v == null ? "" : v; }
    setVal("f_siteName", a.siteName);
    setVal("f_siteUrl", a.siteUrl);
    setVal("f_email", a.contactEmail);
    var r = document.querySelector("input[name='entityType'][value='" + (a.entityType || "individual") + "']");
    if (r) r.checked = true;
    setVal("f_companyName", a.companyName);
    ["eu", "uk", "ca", "other"].forEach(function (k) {
      var el = document.getElementById("f_" + k);
      if (el) el.checked = !!(a.regions && a.regions[k]);
    });
    setVal("f_jurisdiction", a.jurisdiction);
    ["analytics", "accounts", "payments", "ads", "contact", "cookies"].forEach(function (k) {
      var el = document.getElementById("f_c_" + k);
      if (el) el.checked = !!(a.collect && a.collect[k]);
    });
    setVal("f_dataCustom", a.dataCustom);
    ["ga", "gads", "meta", "stripe", "paypal", "mailchimp", "hotjar", "cloudflare"].forEach(function (k) {
      var el = document.getElementById("f_s_" + k);
      if (el) el.checked = !!(a.services && a.services[k]);
    });
    var rr = document.querySelector("input[name='refund'][value='" + (a.refund || "14day") + "']");
    if (rr) rr.checked = true;
    setVal("f_refundCustom", a.refundCustom);
    toggleCompany();
    toggleRefundCustom();
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collectAnswers()));
    } catch (e) { /* private mode etc. */ }
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 350);
  }

  function restore() {
    var raw = null;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) {}
    if (!raw) return false;
    try {
      var a = JSON.parse(raw);
      if (a && (a.siteName || a.contactEmail)) {
        writeForm(a);
        var note = $("#wizRestored");
        if (note) note.hidden = false;
        return true;
      }
    } catch (e) {}
    return false;
  }

  function resetDraft() {
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) {}
    location.reload();
  }

  /* ---------- conditional UI ---------- */

  function toggleCompany() {
    var isCompany = !!document.querySelector("input[name='entityType'][value='company']:checked");
    var wrap = $("#companyNameWrap");
    if (wrap) wrap.hidden = !isCompany;
  }

  function toggleRefundCustom() {
    var isCustom = !!document.querySelector("input[name='refund'][value='custom']:checked");
    var wrap = $("#refundCustomWrap");
    if (wrap) wrap.hidden = !isCustom;
  }

  /* ---------- init ---------- */

  function init() {
    var form = $("#wizardForm");
    if (!form) return;

    form.addEventListener("submit", function (e) { e.preventDefault(); goNext(); });

    $all("#wizNext, #wizGenerate").forEach(function (btn) {
      btn.addEventListener("click", function (e) { e.preventDefault(); goNext(); });
    });
    var prev = $("#wizPrev");
    if (prev) prev.addEventListener("click", function (e) { e.preventDefault(); showStep(currentStep - 1); });

    form.addEventListener("input", function (e) {
      if (e.target.name === "entityType") toggleCompany();
      if (e.target.name === "refund") toggleRefundCustom();
      scheduleSave();
    });
    form.addEventListener("change", function (e) {
      if (e.target.name === "entityType") toggleCompany();
      if (e.target.name === "refund") toggleRefundCustom();
      scheduleSave();
    });
    form.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
        e.preventDefault();
        goNext();
      }
    });

    var resetBtn = $("#wizReset");
    if (resetBtn) resetBtn.addEventListener("click", function (e) { e.preventDefault(); resetDraft(); });

    var restored = restore();
    if (!restored) {
      toggleCompany();
      toggleRefundCustom();
    }
    showStep(1);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  window.Wizard = {
    collectAnswers: collectAnswers,
    save: save
  };
})();
