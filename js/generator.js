/* ============================================================
   LegalLaunch — document generation engine
   Pure functions, no DOM access. Exposes window.Generator
   (and Generator on globalThis for Node-based testing).
   Canonical document format: a light Markdown subset:
     "# Title", "## N. Heading", plain paragraphs,
     "- " bullets, and pipe tables.
   Renderers convert this subset to HTML / plain text.
   ============================================================ */
(function () {
  "use strict";

  /* ---------------- utilities ---------------- */

  function escHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function normalizeUrl(u) {
    u = String(u || "").trim();
    if (!u) return "";
    if (!/^https?:\/\//i.test(u)) u = "https://" + u;
    return u.replace(/\/+$/, "");
  }

  function todayLong() {
    try {
      return new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
    } catch (e) {
      return new Date().toDateString();
    }
  }

  /* FNV-1a 32-bit hash -> license key "XXXX-XXXX" */
  function fnv1a32(str) {
    var h = 0x811c9dc5;
    str = String(str);
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  function licenseKeyFor(email) {
    var normalized = String(email || "").trim().toLowerCase();
    var hex = fnv1a32("legallaunch-salt-v1" + normalized).toString(16).toUpperCase();
    while (hex.length < 8) hex = "0" + hex;
    return hex.slice(0, 4) + "-" + hex.slice(4, 8);
  }

  /* ---------------- md subset -> HTML fragment ---------------- */

  function mdToHtmlFragment(md) {
    var lines = String(md).split(/\r?\n/);
    var out = [];
    var inUl = false;
    var inTable = false, inHead = false;

    function closeUl() { if (inUl) { out.push("</ul>"); inUl = false; } }
    function closeTable() {
      if (inTable) {
        out.push(inHead ? "</thead>" : "</tbody>");
        out.push("</table>");
        inTable = false; inHead = false;
      }
    }

    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (t === "") { closeUl(); continue; }
      if (/^##\s+/.test(t)) {
        closeUl(); closeTable();
        out.push("<h2>" + escHtml(t.replace(/^##\s+/, "")) + "</h2>");
        continue;
      }
      if (/^#\s+/.test(t)) {
        closeUl(); closeTable();
        out.push("<h1>" + escHtml(t.replace(/^#\s+/, "")) + "</h1>");
        continue;
      }
      if (/^\|.+\|$/.test(t)) {
        var cells = t.slice(1, -1).split("|").map(function (c) { return c.trim(); });
        if (cells.every(function (c) { return /^:?-{3,}:?$/.test(c); })) continue; /* separator row */
        if (!inTable) {
          closeUl();
          inTable = true; inHead = true;
          out.push("<table><thead><tr>" + cells.map(function (c) { return "<th>" + escHtml(c) + "</th>"; }).join("") + "</tr>");
          continue;
        }
        if (inHead) { out.push("</thead><tbody>"); inHead = false; }
        out.push("<tr>" + cells.map(function (c) { return "<td>" + escHtml(c) + "</td>"; }).join("") + "</tr>");
        continue;
      }
      if (/^[-•]\s+/.test(t)) {
        closeTable();
        if (!inUl) { out.push("<ul>"); inUl = true; }
        out.push("<li>" + escHtml(t.replace(/^[-•]\s+/, "")) + "</li>");
        continue;
      }
      closeUl(); closeTable();
      out.push("<p>" + escHtml(t) + "</p>");
    }
    closeUl(); closeTable();
    return out.join("\n");
  }

  /* md subset -> standalone printable HTML document */
  function mdToHtmlDoc(title, md, metaLines) {
    var meta = (metaLines || []).join("<br>");
    return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>' +
      escHtml(title) + "</title>\n<style>\n" +
      "body{font-family:Georgia,'Times New Roman',serif;color:#1a1a1a;line-height:1.65;margin:0;padding:48px 24px;background:#fff;}\n" +
      ".doc{max-width:760px;margin:0 auto;}\nh1{font-size:1.9em;margin:0 0 .3em;}\n.meta{color:#555;font-size:.95em;margin-bottom:2em;border-bottom:1px solid #ddd;padding-bottom:1em;}\n" +
      "h2{font-size:1.15em;margin:1.8em 0 .5em;}\np{margin:.6em 0;}\nul{margin:.6em 0;padding-left:1.4em;}\nli{margin:.3em 0;}\n" +
      "table{border-collapse:collapse;width:100%;margin:1em 0;font-size:.92em;}\nth,td{border:1px solid #ccc;padding:7px 9px;text-align:left;vertical-align:top;}\nth{background:#f2f2f2;}\n" +
      "@media print{body{padding:0;font-size:12.5pt;}.doc{max-width:none;}}\n" +
      "</style>\n</head>\n<body>\n<div class=\"doc\">\n" +
      mdToHtmlFragment(md) +
      (meta ? "\n<p class=\"meta\">" + meta + "</p>" : "") +
      "\n</div>\n</body>\n</html>";
  }

  /* md subset -> plain text */
  function mdToTxt(md) {
    var lines = String(md).split(/\r?\n/);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].replace(/\s+$/, "");
      var m;
      if ((m = t.match(/^#\s+(.+)$/))) {
        out.push(m[1].toUpperCase());
        out.push("=".repeat(Math.min(m[1].length, 66)));
      } else if ((m = t.match(/^##\s+(.+)$/))) {
        out.push("");
        out.push(m[1]);
        out.push("-".repeat(Math.min(m[1].length, 66)));
      } else {
        out.push(t);
      }
    }
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
  }

  /* ---------------- answer normalization ---------------- */

  function normalizeAnswers(a) {
    a = a || {};
    return {
      siteName: String(a.siteName || "This Website").trim(),
      siteUrl: normalizeUrl(a.siteUrl),
      contactEmail: String(a.contactEmail || "").trim(),
      entityType: a.entityType === "company" ? "company" : "individual",
      companyName: String(a.companyName || "").trim(),
      regions: {
        eu: !!(a.regions && a.regions.eu),
        uk: !!(a.regions && a.regions.uk),
        ca: !!(a.regions && a.regions.ca),
        other: !!(a.regions && a.regions.other)
      },
      jurisdiction: String(a.jurisdiction || "California, United States").trim(),
      collect: {
        analytics: !!(a.collect && a.collect.analytics),
        accounts: !!(a.collect && a.collect.accounts),
        payments: !!(a.collect && a.collect.payments),
        ads: !!(a.collect && a.collect.ads),
        contact: !!(a.collect && a.collect.contact),
        cookies: !!(a.collect && a.collect.cookies)
      },
      dataCustom: String(a.dataCustom || "").trim(),
      services: {
        ga: !!(a.services && a.services.ga),
        gads: !!(a.services && a.services.gads),
        meta: !!(a.services && a.services.meta),
        stripe: !!(a.services && a.services.stripe),
        paypal: !!(a.services && a.services.paypal),
        mailchimp: !!(a.services && a.services.mailchimp),
        hotjar: !!(a.services && a.services.hotjar),
        cloudflare: !!(a.services && a.services.cloudflare)
      },
      refund: ["14day", "30day", "none", "custom"].indexOf(a.refund) >= 0 ? a.refund : "14day",
      refundCustom: String(a.refundCustom || "").trim(),
      effectiveDate: String(a.effectiveDate || todayLong())
    };
  }

  /* ---------------- reference data ---------------- */

  var SERVICE_LABELS = {
    ga: "Google Analytics (Google Ireland Limited / Google LLC)",
    gads: "Google Ads (Google Ireland Limited / Google LLC)",
    meta: "Meta Pixel — Facebook & Instagram advertising (Meta Platforms Ireland Ltd. / Meta Platforms, Inc.)",
    stripe: "Stripe — payment processing (Stripe Payments Europe, Ltd. / Stripe, Inc.)",
    paypal: "PayPal — payment processing (PayPal (Europe) S.à r.l. et Cie, S.C.A. / PayPal, Inc.)",
    mailchimp: "Mailchimp — email newsletters (The Rocket Science Group, LLC / Intuit)",
    hotjar: "Hotjar — behavior analytics and session recordings (Hotjar Ltd.)",
    cloudflare: "Cloudflare — security, bot detection and content delivery (Cloudflare, Inc.)"
  };

  var SERVICE_PURPOSE = {
    ga: "website traffic analytics",
    gads: "advertising and conversion measurement",
    meta: "ad delivery and conversion tracking",
    stripe: "secure payment processing and fraud prevention",
    paypal: "payment processing",
    mailchimp: "email newsletter delivery",
    hotjar: "understanding how visitors use the site",
    cloudflare: "security, performance and bot protection"
  };

  var SERVICE_COOKIES = {
    ga: [
      ["_ga", "Google Analytics", "Distinguishes visitors for analytics reporting", "2 years"],
      ["_gid", "Google Analytics", "Distinguishes visitors for short-term analytics", "24 hours"],
      ["_gat", "Google Analytics", "Throttles request rate", "1 minute"]
    ],
    gads: [
      ["_gcl_au", "Google Ads", "Stores ad click information for conversion tracking", "90 days"],
      ["IDE", "Google Ads / DoubleClick", "Ad serving, frequency capping and measurement", "13 months"]
    ],
    meta: [
      ["_fbp", "Meta Pixel", "Ad delivery, targeting and conversion tracking", "3 months"]
    ],
    hotjar: [
      ["_hjid", "Hotjar", "Persists a unique Hotjar user ID (session analytics)", "1 year"],
      ["_hjSessionUser", "Hotjar", "Session user attribution", "1 year"]
    ],
    stripe: [
      ["__stripe_mid", "Stripe", "Fraud prevention (strictly necessary)", "1 year"],
      ["__stripe_sid", "Stripe", "Fraud prevention during a session (strictly necessary)", "30 minutes"]
    ],
    mailchimp: [
      ["mc_ses", "Mailchimp", "Tracks form sessions for signup forms", "30 minutes"]
    ],
    paypal: [
      ["ts_c", "PayPal", "Security and fraud prevention (strictly necessary)", "3 years"]
    ],
    cloudflare: [
      ["__cf_bm", "Cloudflare", "Bot management and security (strictly necessary)", "30 minutes"]
    ]
  };

  /* ---------------- shared fragments ---------------- */

  function whoWeAreLine(a) {
    if (a.entityType === "company" && a.companyName) {
      return a.companyName + ' ("we", "us", or "our"), the operator of ' + a.siteName + " (" + (a.siteUrl || "our website") + ")";
    }
    return 'the operator of ' + a.siteName + ' ("we", "us", or "our"; ' + (a.siteUrl || "our website") + ")";
  }

  function contactBlock(a) {
    return "If you have any questions about this document, contact us at " + a.contactEmail +
      (a.entityType === "company" && a.companyName ? " or write to " + a.companyName + "." : ".");
  }

  /* ---------------- PRIVACY POLICY ---------------- */

  function buildPrivacy(a) {
    var p = [];
    var EU = a.regions.eu || a.regions.uk;
    var who = whoWeAreLine(a);

    p.push("# Privacy Policy");
    p.push("Effective date: " + a.effectiveDate + ".");
    p.push("This Privacy Policy applies to " + (a.siteUrl || a.siteName) + ".");

    p.push("## 1. Introduction");
    p.push("This Privacy Policy explains how " + who +
      " collect, use, disclose, and safeguard personal information when you visit our website, contact us, create an account, or make a purchase. We respect your privacy and are committed to handling your personal information responsibly, transparently, and in accordance with applicable data protection laws.");
    p.push("Please read this policy carefully. By using " + a.siteName + ", you acknowledge the practices described in this Privacy Policy. If you do not agree with them, please do not use the website.");

    p.push("## 2. Who We Are");
    if (a.entityType === "company" && a.companyName) {
      p.push("The data controller responsible for your personal information is " + a.companyName +
        ", operating the website " + (a.siteUrl || a.siteName) + ". References to \u201cwe\u201d, \u201cus\u201d and \u201cour\u201d in this policy mean " + a.companyName + ".");
    } else {
      p.push("This website is operated by an individual proprietor. The person responsible for your personal information is the owner of " + a.siteName +
        ", reachable at " + a.contactEmail + ".");
    }

    p.push("## 3. Scope");
    p.push("This policy applies to information we collect through " + (a.siteUrl || "our website") +
      " and through any related communications with us, including emails. It does not apply to third-party websites, products, or services that we do not own or control, even if they are linked from our website. We encourage you to review the privacy policies of any third-party services you interact with.");

    /* 4. Information we collect */
    var s4 = [];
    s4.push("We collect only the information that is reasonably necessary to operate " + a.siteName + " and to provide our services. The categories of information we collect depend on how you interact with the website.");
    var provided = [];
    if (a.collect.contact) {
      provided.push("Contact details you submit through forms or by email, such as your name, email address, and the content of your message. We use this information solely to respond to your inquiry.");
    }
    if (a.collect.accounts) {
      provided.push("Account information you provide when registering, such as your name, email address, and a password (stored only in hashed, non-reversible form). You are responsible for keeping your login credentials confidential.");
    }
    if (a.collect.payments) {
      provided.push("Order and billing information, such as the items purchased, the amount paid, and a transaction reference. Full payment card numbers are never sent to our servers; they are collected and processed directly by our payment provider.");
    }
    if (provided.length) {
      s4.push("Information you provide to us:");
      s4 = s4.concat(provided.map(function (x) { return "- " + x; }));
    }
    if (a.collect.analytics) {
      s4.push("- Information collected automatically: when you browse the site, our analytics tools record technical data such as your IP address (truncated where supported), browser type and version, device type, operating system, referring page, pages viewed, and the time and duration of your visit. This information helps us understand aggregate usage patterns and improve the website.");
    }
    if (a.collect.ads) {
      s4.push("- Advertising identifiers: advertising partners may set cookies or similar technologies that assign your browser a pseudonymous identifier so that we can measure the performance of our campaigns and, where applicable, limit how often you see the same advertisement.");
    }
    if (a.collect.cookies) {
      s4.push("- Cookies and similar technologies: small text files stored on your device. The specific cookies we use, their providers, their purposes, and their lifetimes are listed in our Cookie Policy.");
    }
    if (a.dataCustom) {
      s4.push("- " + a.dataCustom);
    }
    if (!a.collect.analytics && !a.collect.accounts && !a.collect.payments && !a.collect.ads && !a.collect.contact && !a.collect.cookies && !a.dataCustom) {
      s4.push("We do not require you to create an account or submit personal details in order to browse this website. If you contact us by email, we will process your email address and the contents of your message in order to reply.");
    }
    s4.push("We do not knowingly collect sensitive categories of personal data (such as health information, biometric identifiers, or government ID numbers) through this website, and we ask that you not send us such information.");
    p.push("## 4. Information We Collect");
    p.push(s4.join("\n"));

    /* 5. How we use */
    var uses = [];
    if (a.collect.contact) uses.push("to respond to your questions, feedback, or support requests");
    if (a.collect.accounts) uses.push("to create and administer your account and authenticate your logins");
    if (a.collect.payments) uses.push("to process your orders, deliver digital products or services, and handle billing, invoices, and refunds");
    if (a.collect.analytics) uses.push("to measure aggregate traffic, diagnose technical issues, and improve the content, layout, and performance of the website");
    if (a.collect.ads) uses.push("to measure the effectiveness of our marketing and control the frequency of advertisements");
    if (a.collect.mailchimpOrNewsletter !== false) uses.push("to send you service-related communications that are necessary for the operation of the website");
    uses = uses.length ? uses : ["to operate, maintain, and secure the website"];
    uses.push("to detect, prevent, and address fraud, abuse, or technical or security incidents");
    uses.push("to comply with legal obligations and enforce our terms and policies");
    p.push("## 5. How We Use Your Information");
    p.push("We use the personal information we collect for the following purposes:");
    p.push(uses.map(function (u) { return "- " + u + ";"; }).join("\n").replace(/;$/, "."));
    p.push("We do not sell your personal information, and we do not use your personal information for automated decision-making or profiling that produces legal or similarly significant effects.");

    /* 6. Lawful basis (EU/UK) */
    if (EU) {
      p.push("## 6. Lawful Basis for Processing" + (a.regions.uk ? " (UK GDPR / EU GDPR)" : " (GDPR)"));
      p.push("Where the EU General Data Protection Regulation (Regulation (EU) 2016/679)" + (a.regions.uk ? " or the UK GDPR" : "") +
        " applies, we process your personal data only when we have a lawful basis for doing so under Article 6 of the GDPR, in particular:");
      p.push("- **Consent (Article 6(1)(a))**: you have given clear consent for us to process your personal data for a specific purpose, for example optional analytics or marketing cookies. You may withdraw consent at any time without affecting the lawfulness of processing based on consent before its withdrawal.");
      p.push("- **Contract (Article 6(1)(b))**: processing is necessary to perform a contract with you, for example to provide your account, deliver a purchase, or respond to a request you initiate.");
      p.push("- **Legitimate interests (Article 6(1)(f))**: processing is necessary for our legitimate business interests, such as securing and improving the website and understanding aggregate usage, provided those interests are not overridden by your rights and freedoms.");
      p.push("- **Legal obligation (Article 6(1)(c))**: processing is necessary to comply with applicable law, such as tax and accounting record-keeping.");
    }

    /* 7. Cookies */
    p.push("## " + (EU ? "7" : "6") + ". Cookies and Similar Technologies");
    p.push("We and, where applicable, our service providers use cookies, local storage, and similar technologies to operate the website, remember your preferences, measure traffic" + (a.collect.ads ? ", and support advertising measurement" : "") + ". Strictly necessary cookies are always active because the website cannot function without them; other categories are used only with your consent where consent is required.");
    p.push("For a complete list of the cookies we may set, including names, providers, purposes, and expiration periods, please see our Cookie Policy.");

    /* 8. Third parties */
    var svcKeys = Object.keys(a.services).filter(function (k) { return a.services[k]; });
    p.push("## " + (EU ? "8" : "7") + ". Third-Party Service Providers");
    if (svcKeys.length) {
      p.push("We share personal information with the following categories of service providers, who process it on our behalf under contract:");
      p.push(svcKeys.map(function (k) { return "- " + (SERVICE_LABELS[k] || k) + " — used for " + SERVICE_PURPOSE[k] + ";"; }).join("\n").replace(/;$/, "."));
      p.push("These providers act as processors (or \u201cservice providers\u201d under applicable US state privacy laws) and are permitted to use personal information only to provide their services to us. Some providers may be located outside your country; see the section on international transfers below.");
    } else {
      p.push("We share personal information only with a limited set of vendors that help us operate this website, such as our hosting provider and email delivery service. Each of them processes personal information on our behalf under contract and may not use it for their own purposes.");
    }

    /* 9. Sharing */
    p.push("## " + (EU ? "9" : "8") + ". How We Share and Disclose Information");
    p.push("We do not sell or rent your personal information. We disclose personal information only in the following circumstances:");
    p.push("- **Service providers**: to vendors that host, secure, analyze, or support our website and business operations, as described above.\n- **Legal requirements**: when required by law, legal process, or a valid request from public authorities, and to protect our rights, property, or safety or that of others.\n- **Business transfers**: in connection with a merger, acquisition, or sale of assets, in which case we will notify you before your personal information is transferred and becomes subject to a different privacy policy.\n- **With your consent**: when you have explicitly asked us to or agreed to a specific disclosure.");
    p.push("We may also publish aggregate, de-identified statistics (for example, total visitor counts) that cannot reasonably be used to identify you.");

    /* 10. Transfers */
    var secNum = EU ? 10 : 9;
    p.push("## " + secNum + ". International Data Transfers");
    if (EU) {
      p.push("Our service providers may process personal information in countries other than your own, including the United States. Where personal data is transferred outside the European Economic Area" + (a.regions.uk ? " or the United Kingdom" : "") +
        ", we rely on appropriate safeguards such as the European Commission's Standard Contractual Clauses (Article 46 GDPR), the UK International Data Transfer Addendum where applicable, or an adequacy decision. You may request a copy of the safeguards used for your data by contacting us.");
    } else {
      p.push("Information we collect may be processed in countries other than your own. Where that happens, we rely on our service providers' contractual commitments to protect your information in line with this policy.");
    }

    /* 11. Retention */
    p.push("## " + (secNum + 1) + ". Data Retention");
    p.push("We keep personal information only as long as necessary for the purposes described in this policy, unless a longer period is required by law. Indicative retention periods:" +
      (a.collect.accounts ? "\n- Account records: for as long as your account is active, and up to 24 months after closure to handle disputes, after which they are deleted or anonymized." : "") +
      (a.collect.contact ? "\n- Contact form and email correspondence: up to 24 months after our last exchange, then deleted." : "") +
      (a.collect.analytics ? "\n- Analytics data: per the retention configured in the analytics tool, typically 14\u201326 months." : "") +
      (a.collect.payments ? "\n- Transaction and billing records: for the period required by tax and accounting law (commonly 6\u201310 years)." : "") +
      "\n- Security logs: up to 12 months.");
    p.push("When personal information is no longer required, we delete it or de-identify it so it can no longer be associated with you.");

    /* 12. Security */
    p.push("## " + (secNum + 2) + ". Data Security");
    p.push("We use administrative, technical, and physical safeguards designed to protect personal information, including TLS/HTTPS encryption for data in transit, hashed storage of credentials, least-privilege access controls, and regular review of the software we run. No method of transmission or storage is completely secure, and we cannot guarantee absolute security; if a breach affecting your personal information occurs, we will notify you and the relevant authorities as required by applicable law.");

    /* 13. Children */
    p.push("## " + (secNum + 3) + ". Children's Privacy");
    p.push("This website is not directed to children" + (a.regions.eu || a.regions.uk ? " under 16 (or under 13 where the applicable age of consent is lower)" : " under 13") +
      ", and we do not knowingly collect personal information from them. If you believe a child has provided us personal information, contact us and we will delete it promptly.");

    /* 14. Your rights */
    p.push("## " + (secNum + 4) + ". Your Privacy Rights");
    var rightsText = "";
    if (EU) {
      rightsText = "If you are located in the European Economic Area" + (a.regions.uk ? " or the United Kingdom" : "") + ", the GDPR gives you the following rights over your personal data:\n" +
        "- **Access (Article 15)**: obtain confirmation that we process your data and a copy of it.\n- **Rectification (Article 16)**: have inaccurate data corrected.\n- **Erasure (Article 17)**: request deletion of your data where there is no overriding legal reason to keep it.\n- **Restriction (Article 18)**: ask us to pause processing while a dispute is resolved.\n- **Data portability (Article 20)**: receive data you provided to us in a structured, commonly used, machine-readable format.\n- **Objection (Article 21)**: object to processing based on legitimate interests or for direct marketing; where you object to direct marketing we will stop.\n- **Withdraw consent**: at any time, for processing based on consent.\n- **Complain**: lodge a complaint with your national supervisory authority (for example, the Irish Data Protection Commission, or the UK Information Commissioner's Office if you are in the UK).";
    }
    if (a.regions.ca) {
      rightsText += (rightsText ? "\n\n" : "") + "If you are a California resident, the California Consumer Privacy Act as amended by the CPRA (Cal. Civ. Code \u00a7\u00a7 1798.100\u20131798.125) gives you the following rights:\n" +
        "- **Right to know**: request the categories and specific pieces of personal information we have collected about you, the sources, the business purposes, and the categories of third parties with whom it is shared.\n- **Right to delete**: request deletion of personal information we hold about you, subject to legal exceptions.\n- **Right to correct**: request correction of inaccurate personal information.\n- **Right to opt out of sale or sharing**: you may direct us not to sell or share your personal information. **We do not sell personal information for money, and we do not share it for cross-context behavioral advertising.**\n- **Right to non-discrimination**: we will not discriminate against you for exercising any of these rights, including by charging different prices or providing a different level of service.\n\nTo exercise a California right, email us at " + a.contactEmail + " with the subject line \u201cCalifornia Privacy Request\u201d. We will verify your request by matching information you provide to information we already hold, respond within 45 days (extendable once by a further 45 days with notice), and provide the response free of charge, up to two requests per 12-month period. You may use an authorized agent to submit a request with written permission.";
    }
    if (!rightsText) {
      rightsText = "Depending on where you live, you may have statutory rights over your personal information, such as the right to access the information we hold about you, to request correction or deletion, and to object to certain processing. To exercise any such right, email us at " + a.contactEmail + " and describe your request; we will respond within the period required by applicable law (normally within 30 days).";
    }
    p.push(rightsText);
    p.push("Regardless of your jurisdiction, you can always contact us at " + a.contactEmail + " to ask what personal information we hold about you or to request deletion, and we will do our best to help.");

    /* 15. Marketing */
    p.push("## " + (secNum + 5) + ". Marketing Communications");
    p.push("If you receive emails from us, every message will contain an unsubscribe link, and you can also opt out at any time by replying to the email or writing to " + a.contactEmail + ". Opting out of marketing does not stop essential service communications such as receipts or security notices.");

    /* 16. Changes */
    p.push("## " + (secNum + 6) + ". Changes to This Privacy Policy");
    p.push("We may update this Privacy Policy from time to time to reflect changes in our practices, services, or legal requirements. The \u201ceffective date\u201d at the top of this page shows the latest version. If a change is material, we will provide a more prominent notice on the website or by email where appropriate. Continued use of the website after an update means you accept the revised policy.");

    /* 17. Contact */
    p.push("## " + (secNum + 7) + ". Contact Us");
    p.push("If you have questions, requests, or complaints about this Privacy Policy or our data practices, contact us at **" + a.contactEmail + "**." +
      (a.entityType === "company" && a.companyName ? " Postal inquiries can be sent to " + a.companyName + "." : "") +
      " We aim to acknowledge privacy requests within 5 business days and to fully respond within 30 days.");
    if (a.regions.uk) {
      p.push("You also have the right to complain to the Information Commissioner's Office (ICO), the UK supervisory authority, at ico.org.uk.");
    } else if (a.regions.eu) {
      p.push("You also have the right to lodge a complaint with the supervisory authority in your EU member state.");
    }

    return { title: "Privacy Policy", md: p.join("\n\n") };
  }

  /* ---------------- TERMS OF SERVICE ---------------- */

  function buildTerms(a) {
    var t = [];
    var who = whoWeAreLine(a);
    var sells = a.collect.payments;

    t.push("# Terms of Service");
    t.push("Effective date: " + a.effectiveDate + ".");
    t.push("These Terms of Service (\u201cTerms\u201d) govern your access to and use of " + (a.siteUrl || a.siteName) + ".");

    t.push("## 1. Agreement to These Terms");
    t.push("By accessing or using " + a.siteName + ", or by clicking a button indicating acceptance, you agree to be bound by these Terms and our Privacy Policy. If you do not agree, you must not use the website. These Terms form a binding agreement between you and " + who + ".");

    t.push("## 2. Who We Are");
    t.push("The website is operated by " + who + ". Questions about these Terms can be sent to " + a.contactEmail + ".");

    t.push("## 3. Description of the Service");
    t.push(a.siteName + " is a website that provides information, content" +
      (a.collect.accounts ? ", user accounts" : "") + (sells ? ", and digital products or services available for purchase" : "") +
      ". We may add, change, or remove features at any time. Where these Terms refer to \u201cthe Service\u201d, they mean the website and any features, content, or products offered through it.");

    t.push("## 4. Eligibility");
    t.push("You must be at least 18 years old, or the age of legal majority in your jurisdiction, to make purchases or create an account. If you use the website on behalf of an organization, you represent that you have authority to bind that organization to these Terms.");

    if (a.collect.accounts) {
      t.push("## 5. Accounts");
      t.push("You may need to register an account to access certain features. You agree to provide accurate, current information, to keep your password confidential, and to notify us immediately at " + a.contactEmail + " if you suspect unauthorized use of your account. You are responsible for all activity under your account. We may suspend or close accounts that violate these Terms or that we reasonably believe are compromised.");
    }

    if (sells) {
      t.push("## " + (a.collect.accounts ? 6 : 5) + ". Purchases, Pricing, and Payment");
      t.push("Prices for digital products and services are displayed on the website before checkout and are payable in the currency shown at the time of purchase. We use third-party payment processors" +
        (a.services.stripe && a.services.paypal ? " (currently Stripe and PayPal)" : a.services.stripe ? " (currently Stripe)" : a.services.paypal ? " (currently PayPal)" : "") +
        "; your payment details are transmitted directly to them and are not stored on our servers. Prices do not include taxes unless stated; you are responsible for any applicable VAT, GST, or sales tax. We may change prices at any time, but changes will not apply retroactively to completed purchases. Your access to a purchased product begins as soon as delivery completes. Our refund practices are described in the Refund Policy, which forms part of these Terms.");
    }

    t.push("## " + ((a.collect.accounts ? 6 : 5) + (sells ? 1 : 0)) + ". Acceptable Use");
    t.push("You agree not to:");
    t.push("- use the website for any unlawful purpose or in violation of any applicable law or regulation;\n- scrape, harvest, or systematically extract data or content from the website without our written permission;\n- attempt to gain unauthorized access to the website, other accounts, or related systems or networks, including through probing, scanning, or testing vulnerabilities;\n- interfere with or disrupt the website, including by introducing malware, overloading, or \u201cflooding\u201d infrastructure;\n- impersonate any person or entity or misrepresent your affiliation with any person or entity;\n- copy, resell, or sublicense the website's content or any purchased product except as expressly permitted; or\n- use the website to distribute spam, deceptive content, or material that infringes the rights of others.");
    t.push("We reserve the right to investigate suspected violations and to take appropriate action, including suspending access and reporting to law enforcement.");

    var nextNum = (a.collect.accounts ? 6 : 5) + (sells ? 1 : 0) + 1;
    t.push("## " + nextNum + ". Intellectual Property Rights");
    t.push("The website and its entire contents, features, and functionality \u2014 including text, graphics, logos, icons, code, and the design, selection, and arrangement of them \u2014 are owned by us or our licensors and are protected by copyright, trademark, and other intellectual property laws. Subject to your compliance with these Terms, we grant you a limited, revocable, non-exclusive, non-transferable license to access the website and view content for your personal, non-commercial use. You may not reproduce, distribute, modify, create derivative works of, publicly display, or commercially exploit any part of the website without our prior written consent, except that you may print or download copies of publicly available pages (such as our policies) for your own records.");

    t.push("## " + (nextNum + 1) + ". User Content and Feedback");
    t.push("If you send us ideas, suggestions, feedback, or other content (\u201cUser Content\u201d), you grant us a worldwide, perpetual, irrevocable, royalty-free license to use it to operate and improve the website and our services. You represent that any User Content you send does not infringe third-party rights. We are under no obligation to use or respond to User Content and we may delete it at our discretion.");

    t.push("## " + (nextNum + 2) + ". Third-Party Websites and Services");
    t.push("The website may link to or integrate third-party websites and services (for example" +
      (svcListShort(a) ? ", " + svcListShort(a) : ", analytics or payment providers") +
      "). These are provided for your convenience only. We do not control and are not responsible for third-party content, policies, or practices. Your dealings with third parties are solely between you and them, and you should review their terms and privacy policies.");

    t.push("## " + (nextNum + 3) + ". Disclaimer of Warranties");
    t.push("THE WEBSITE AND ALL CONTENT, PRODUCTS, AND SERVICES ARE PROVIDED \u201cAS IS\u201d AND \u201cAS AVAILABLE\u201d, WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED. TO THE FULLEST EXTENT PERMITTED BY LAW, WE DISCLAIM ALL IMPLIED WARRANTIES, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE WEBSITE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE, OR THAT DEFECTS WILL BE CORRECTED. NOTHING ON THE WEBSITE CONSTITUTES PROFESSIONAL ADVICE OF ANY KIND, INCLUDING LEGAL, FINANCIAL, OR MEDICAL ADVICE.");

    t.push("## " + (nextNum + 4) + ". Limitation of Liability");
    t.push("TO THE FULLEST EXTENT PERMITTED BY LAW, WE WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR FOR LOSS OF PROFITS, REVENUE, DATA, OR GOODWILL, ARISING OUT OF OR RELATING TO YOUR USE OF THE WEBSITE, EVEN IF WE HAVE BEEN ADVISED OF THE POSSIBILITY OF SUCH DAMAGES. OUR TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS WILL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID US IN THE TWELVE (12) MONTHS BEFORE THE CLAIM AROSE" + (sells ? ", OR (B) USD 100" : ", OR (B) USD 0") + ". SOME JURISDICTIONS DO NOT ALLOW CERTAIN LIMITATIONS, SO PARTS OF THIS SECTION MAY NOT APPLY TO YOU; IN THAT CASE, OUR LIABILITY IS LIMITED TO THE SMALLEST AMOUNT PERMITTED BY LAW.");

    t.push("## " + (nextNum + 5) + ". Indemnification");
    t.push("You agree to indemnify and hold harmless us and our owners, operators, and service providers from any claims, liabilities, damages, losses, and expenses (including reasonable legal fees) arising out of or related to your violation of these Terms, your violation of any law or third-party right, or any content you submit to us.");

    t.push("## " + (nextNum + 6) + ". Termination");
    t.push("We may suspend or terminate your access to the website, with or without notice, if you breach these Terms or if we discontinue the Service. You may stop using the website at any time. Sections that by their nature should survive termination (including intellectual property, disclaimers, liability limits, and governing law) will survive." +
      (a.collect.accounts ? " If your account is terminated, your license to any content tied to the account ends, except for products you purchased, which remain governed by the Refund Policy and any license granted with them." : ""));

    t.push("## " + (nextNum + 7) + ". Governing Law and Jurisdiction");
    t.push("These Terms are governed by the laws of " + a.jurisdiction + ", without regard to conflict-of-law rules. You and we agree that the state or courts located in " + a.jurisdiction +
      " will have exclusive jurisdiction over any dispute arising out of or relating to these Terms or the website, and you consent to the personal jurisdiction of those courts. Before filing suit, please contact us at " + a.contactEmail + " \u2014 most disputes can be resolved quickly and amicably. Nothing in this section limits either party's ability to seek injunctive relief, or any non-waivable statutory consumer rights you may have to bring proceedings in your country of residence.");

    t.push("## " + (nextNum + 8) + ". Changes to These Terms");
    t.push("We may modify these Terms at any time. The current version will always be posted on this page with an updated effective date. Material changes will be announced on the website (or by email where appropriate) at least 7 days before taking effect for existing users. Continued use of the website after changes take effect constitutes acceptance of the revised Terms.");

    t.push("## " + (nextNum + 9) + ". General");
    t.push("If any provision of these Terms is held invalid or unenforceable, it will be modified to the minimum extent necessary, and the remaining provisions will stay in force. Our failure to enforce a right is not a waiver of it. These Terms, together with the Privacy Policy, Cookie Policy, and Refund Policy, constitute the entire agreement between you and us regarding the website. You may not assign these Terms without our consent; we may assign them in connection with a merger or sale of assets.");

    t.push("## " + (nextNum + 10) + ". Contact Us");
    t.push("Questions, complaints, or notices regarding these Terms should be sent to **" + a.contactEmail + "**. We aim to reply within 5 business days.");

    return { title: "Terms of Service", md: t.join("\n\n") };
  }

  function svcListShort(a) {
    var names = { ga: "Google Analytics", gads: "Google Ads", meta: "the Meta Pixel", stripe: "Stripe", paypal: "PayPal", mailchimp: "Mailchimp", hotjar: "Hotjar", cloudflare: "Cloudflare" };
    var keys = Object.keys(a.services).filter(function (k) { return a.services[k]; });
    if (!keys.length) return "";
    return keys.map(function (k) { return names[k]; }).join(", ");
  }

  /* ---------------- COOKIE POLICY ---------------- */

  function buildCookies(a) {
    var c = [];
    var EU = a.regions.eu || a.regions.uk;

    c.push("# Cookie Policy");
    c.push("Effective date: " + a.effectiveDate + ".");
    c.push("This Cookie Policy explains how " + a.siteName + " (" + (a.siteUrl || "our website") + ") uses cookies and similar technologies. It supplements our Privacy Policy.");

    c.push("## 1. What Are Cookies?");
    c.push("Cookies are small text files that a website stores on your computer, phone, or tablet when you visit. They are widely used to make websites work, to remember your preferences, to understand how visitors use a site, and \u2014 where enabled \u2014 to support advertising. Cookies set by the website you are visiting are called first-party cookies; cookies set by other domains, such as our analytics or advertising partners, are called third-party cookies. A cookie itself is not a program: it cannot install software, read other files on your device, or transmit anything on its own \u2014 it simply lets a website recognize your browser, either for the duration of your visit (\u201csession cookies\u201d) or across visits (\u201cpersistent cookies\u201d).");
    c.push("\u201cSimilar technologies\u201d is covered by this policy too. That includes local storage and indexed databases (browser storage that can hold larger amounts of data than cookies), tracking pixels or web beacons (invisible images embedded in pages or emails that record when content is viewed), software development kits (SDKs) embedded in mobile apps, and session-replay or heat-mapping scripts. These technologies collect and transmit information in broadly the same way as cookies, so everywhere this policy says \u201ccookies\u201d, read it as \u201ccookies and these equivalent technologies\u201d.");

    c.push("## 2. How We Use Cookies");
    var cats = ["- **Strictly necessary** \u2014 required for core functions such as page navigation, security, load balancing, and remembering your consent choices. The website cannot work properly without them, and they cannot be switched off in our systems."];
    if (a.collect.cookies || a.collect.accounts) cats.push("- **Preferences / functionality** \u2014 remember choices you make (such as language or display settings) to give you a more personalized experience.");
    if (a.collect.analytics || a.services.ga || a.services.hotjar) cats.push("- **Analytics** \u2014 help us understand how visitors interact with the website by collecting and reporting information anonymously or pseudonymously, so we can improve content and usability.");
    if (a.collect.ads || a.services.gads || a.services.meta) cats.push("- **Advertising / marketing** \u2014 used to deliver relevant ads, measure campaign performance, cap ad frequency, and build audiences for marketing.");
    if (a.collect.payments && (a.services.stripe || a.services.paypal)) cats.push("- **Payments and fraud prevention** \u2014 set by our payment providers to process transactions securely and detect fraud; these are strictly necessary for checkout to work.");
    c.push("We use the following categories of cookies:");
    c.push(cats.join("\n"));

    c.push("## 3. Cookie Inventory");
    c.push("The table below lists the cookies this site may set, who sets them, what they do, and how long they last. Durations are set by the provider and may change; we review this list periodically.");
    var rows = [
      ["cookie_consent", "This website", "Stores your cookie consent preferences", "12 months"],
      ["session", "This website", "Maintains your browsing session and security", "Session"]
    ];
    var svcKeys = Object.keys(a.services).filter(function (k) { return a.services[k]; });
    svcKeys.forEach(function (k) {
      (SERVICE_COOKIES[k] || []).forEach(function (r) { rows.push(r); });
    });
    if (!a.collect.analytics && !a.collect.ads && !a.collect.payments && !svcKeys.length) {
      rows.push(["(no third-party cookies)", "\u2014", "Based on your current setup, no third-party cookies are used; revisit this table if you add analytics or advertising.", "\u2014"]);
    }
    c.push("| Cookie name | Provider | Purpose | Duration |\n| --- | --- | --- | --- |\n" + rows.map(function (r) { return "| " + r.join(" | ") + " |"; }).join("\n"));

    c.push("## 4. Third-Party Cookies");
    if (svcKeys.length) {
      c.push("When you interact with parts of the site that use our third-party services" + " (" + svcListShort(a) + "), those providers may set their own cookies governed by their respective privacy policies. Their cookies allow them to recognize your device across sites for the purposes described above. We do not control third-party cookies; to learn how each provider uses data, consult their privacy and cookie policies.");
    } else {
      c.push("Based on your current configuration, this website sets only its own strictly necessary and preference cookies. If we add analytics, advertising, or payment tools in the future, we will update this policy and, where required, request your consent before they run.");
    }

    c.push("## 5. How Long Do Cookies Stay on My Device?");
    c.push("Session cookies exist only in your browser's memory and disappear when you close the tab or browser. Persistent cookies are written to your device and last for the fixed duration listed for each cookie in the table above \u2014 anywhere from 30 seconds for short-lived technical cookies to 13 months for some advertising identifiers. If a cookie's provider extends its lifetime, the provider's documentation governs, and we update this table periodically to match. You can erase any persistent cookie at any time through your browser settings; deleting a cookie does not delete the underlying data held about you by us or a provider, which is governed by the retention periods in our Privacy Policy.");

    c.push("## 6. Cookies and Your Personal Data");
    var cookieDataText = "Most of the cookies in the table above do not directly contain your name or email address \u2014 they store pseudonymous identifiers. However, when combined with other data, these identifiers can relate to an identifiable person, which means they are treated as personal data under privacy law.";
    if (EU) {
      cookieDataText += " If you are in the EU or UK, cookies and similar technologies used for analytics or marketing are processed under the GDPR on the basis of your consent (or, for strictly necessary cookies, our legitimate interest in operating a secure website), and you have the rights described in our Privacy Policy over the data they relate to.";
    }
    if (a.regions.ca) {
      cookieDataText += " If you are a California resident, cookie-derived identifiers may be considered personal information under the CCPA/CPRA, and the privacy rights described in our Privacy Policy \u2014 including the right to know, delete, correct, and opt out of sale or sharing \u2014 apply to them.";
    }
    cookieDataText += " The full picture of how we handle personal information, including contact details for privacy requests, is in our Privacy Policy.";
    c.push(cookieDataText);

    c.push("## 7. Your Choices and How to Control Cookies");
    if (EU) {
      c.push("If you are in the EU or UK, we ask for your consent before setting non-essential cookies. When you first visit, you can accept or reject each non-essential category, and you can change or withdraw your choice at any time via the cookie banner" + " (look for \u201ccookie settings\u201d in the site footer or banner)." + " Withdrawing consent takes effect immediately for new page loads.");
    } else {
      c.push("You can control and delete cookies through your browser settings, and most browsers let you block third-party cookies or receive an alert before a cookie is stored. Restricting cookies may affect parts of the site.");
    }
    c.push("In addition:");
    c.push("- **Browser settings**: all major browsers include options to view, delete, and block cookies. In Chrome, Edge, and Firefox look under \u201cSettings \u2192 Privacy\u201d; in Safari on Mac under \u201cPreferences \u2192 Privacy\u201d. You can block all cookies, block only third-party cookies, or delete specific site cookies while keeping others.\n- **Mobile devices**: on iOS, use \u201cSettings \u2192 Safari \u2192 Privacy & Security\u201d (or the equivalent for your browser app); on Android, open your browser's \u201cSettings \u2192 Site settings \u2192 Cookies\u201d. Adjusting these affects all websites you visit in that browser.\n- **Opt-out tools**: for advertising cookies, you can opt out via industry portals such as the Digital Advertising Alliance's WebChoices tool, the Network Advertising Initiative's opt-out page, or Google's Ads Settings, where applicable. These set their own opt-out cookies, so clearing cookies can erase your opt-out \u2014 re-run the tools after clearing.\n- **Do Not Track**: some browsers send a \u201cDo Not Track\u201d signal. There is no consistent industry standard for honoring it, but where a signal is received we treat it as a request to disable non-essential cookies for that visit.");
    c.push("Blocking strictly necessary cookies may prevent the website from working correctly (for example, keeping you logged in or processing a purchase). Clearing all cookies also resets your consent choices, so the cookie banner will reappear on your next visit \u2014 which is by design, since your old preference no longer exists to honor.");

    c.push("## 8. Changes to This Cookie Policy");
    c.push("We may update this Cookie Policy as we add or remove services or as provider practices change. The effective date above shows the current version. Material changes will be highlighted on the website. If a new third-party service begins setting cookies through this site, we add its cookies to the inventory table before they are used, and where consent is required, before your consent is requested.");

    c.push("## 9. Contact Us");
    c.push("Questions about this Cookie Policy? Contact **" + a.contactEmail + "**.");

    return { title: "Cookie Policy", md: c.join("\n\n") };
  }

  /* ---------------- REFUND POLICY ---------------- */

  function buildRefund(a) {
    var r = [];
    var EU = a.regions.eu || a.regions.uk;

    r.push("# Refund Policy");
    r.push("Effective date: " + a.effectiveDate + ".");
    r.push("This Refund Policy applies to purchases made through " + (a.siteUrl || a.siteName) + " and forms part of our Terms of Service. Nothing in this policy removes rights you have under the consumer protection laws of your country.");

    r.push("## 1. Overview");
    r.push(a.siteName + " sells digital products and services" + (a.collect.accounts ? " delivered through your account" : " delivered electronically") +
      ". Because digital goods are delivered instantly and cannot be \u201creturned\u201d in the physical sense, this policy explains exactly when refunds are available, how to request one, and how quickly you will be paid back.");
    r.push("We wrote this policy to be plain and honest, and we hold ourselves to it: if a purchase qualifies for a refund under this policy, you will get it, without games, guilt trips, or hoops. Equally, we describe the limits of what is covered up front so you are never surprised. If anything here is unclear, email us before buying \u2014 we would rather answer a pre-sale question than process an unhappy refund.");

    /* 2. Refund window by style */
    if (a.refund === "14day") {
      r.push("## 2. 14-Day Refund Guarantee");
      r.push("If you are not satisfied with your purchase, you may request a full refund within **14 days** of the date of purchase, no complicated conditions attached. To qualify:");
      r.push("- your request must be received within 14 days of purchase;\n- the request should come from the email address used for the purchase, so we can verify it;\n- we may ask for a short reason so we can improve \u2014 it is appreciated but not required.\nRefunds are issued to the original payment method. If a promotional discount applied, the refund equals the amount actually paid.");
    } else if (a.refund === "30day") {
      r.push("## 2. 30-Day Refund Guarantee");
      r.push("If you are not satisfied with your purchase, you may request a full refund within **30 days** of the date of purchase. To qualify:");
      r.push("- your request must be received within 30 days of purchase;\n- the request should come from the email address used for the purchase, so we can verify it;\n- we may ask for a short reason so we can improve \u2014 it is appreciated but not required.\nRefunds are issued to the original payment method. If a promotional discount applied, the refund equals the amount actually paid.");
    } else if (a.refund === "none") {
      r.push("## 2. All Sales Are Final");
      r.push("Because our products are digital and are delivered immediately upon purchase \u2014 with full access to everything included \u2014 all sales are final and purchases are generally **non-refundable**. Please read the product description carefully before buying. Exceptions:");
      r.push("- if the product is defective, materially different from its description, or cannot be delivered for technical reasons, contact us within 14 days and we will fix the issue or refund you in full;\n- if you were charged more than once for the same product by mistake, the duplicate charge will be refunded in full;\n- refunds may also be available where required by applicable consumer protection law, which this policy does not override.");
    } else {
      r.push("## 2. Refund Terms");
      r.push(a.refundCustom || "Please describe your refund terms in the generator (you selected \u201ccustom\u201d but left this text empty).");
    }

    r.push("## 3. What Is Covered");
    r.push("| Covered | Not covered |\n| --- | --- |\n| Defective or corrupted downloads \u2014 replaced or refunded in full | Change of mind outside the refund window in section 2 |\n| Products that cannot be delivered for technical reasons | Requests to \u201creturn\u201d a fully delivered digital product outside the window |\n| Duplicate or mistaken charges | Purchases made before this policy's effective date under a different stated policy |\n| Failure on our side to grant access you paid for | Abuse patterns described in section 5 |");
    r.push("If your situation sits between these categories, ask us anyway \u2014 edge cases are judged by a human reading your actual circumstances, not by a script.");

    r.push("## 4. How to Request a Refund");
    r.push("Email **" + a.contactEmail + "** with the subject line \u201cRefund request\u201d and include:");
    r.push("- the email address used for the purchase;\n- the order or receipt number from your confirmation email;\n- a brief description of the issue (optional but helpful).");
    r.push("You do not need to fill in forms, call a phone line, or explain at length \u2014 a two-line email is enough. If you no longer have your receipt, your purchase email address alone is usually sufficient for us to locate the order.");

    r.push("## 5. Review, Approval, and When You'll See the Money");
    r.push("| Step | Timing |\n| --- | --- |\n| We acknowledge your request | Within 2 business days |\n| We complete our review and confirm the decision | Within 5 business days |\n| Approved refunds are submitted to the payment provider | Immediately after confirmation |\n| Funds appear on your statement | Typically 5\u201310 business days after submission |");
    r.push("The last step depends on your bank or card issuer, not on us \u2014 some issuers post refunds within 24 hours, others take the full 10 business days. Refunds are returned to the original payment method (the same card, PayPal account, or other method used at purchase); we cannot refund to a different card or account. Where applicable, the original purchase is deactivated once a refund is processed.");

    r.push("## 6. Exceptions and Abuse");
    r.push("To keep prices low for honest customers, we reserve the right to refuse refunds in cases of clear abuse, including repeated purchase-and-refund cycles of the same product, requests made significantly outside the stated window, or fraud. Nothing in this section limits rights you have under mandatory consumer protection law. Partial refunds may be offered, with your agreement, where a product was bundled or heavily discounted, or where genuine partial use makes a full refund inequitable for both sides.");

    if (EU) {
      r.push("## 7. EU / UK Right of Withdrawal");
      r.push("If you are a consumer in the European Union or the United Kingdom, distance-selling rules normally give you a 14-day right of withdrawal. For digital content, that right can be waived: by completing your purchase you expressly request immediate delivery and acknowledge that, once delivery begins (or full access is granted), you lose the 14-day withdrawal right" +
        (a.refund !== "none" ? ". Independently of that waiver, we still honor the voluntary refund guarantee in section 2, which gives you at least the same protection" : "") +
        ". This policy does not affect statutory rights that cannot be waived.");
    }

    var num = EU ? 8 : 7;
    r.push("## " + num + ". Chargebacks");
    r.push("Please contact us before opening a payment dispute \u2014 we can almost always resolve issues faster and more completely than a chargeback process, and a chargeback can take 60\u201390 days to conclude versus days for a direct refund. Chargebacks filed without first contacting us may result in suspension of access" + (a.collect.accounts ? " and of the associated account" : "") +
      ", and we may submit evidence of delivery, access logs, and this policy to the payment network. This section does not limit your right to escalate a genuine unresolved complaint to your payment provider or a consumer authority.");

    r.push("## " + (num + 1) + ". Your Statutory Rights");
    r.push("This policy works alongside your statutory consumer rights; it does not replace or weaken them. Depending on where you live, you may have rights to a remedy for faulty digital content, protection against unfair contract terms, and access to local dispute-resolution or consumer-protection bodies \u2014 regardless of what is written here. Where any part of this policy conflicts with mandatory law that applies to you, the law prevails.");

    r.push("## " + (num + 2) + ". Changes to This Policy");
    r.push("We may update this Refund Policy from time to time. The version in effect at the time of your purchase governs that purchase, and if we make the policy *more* generous, the newer version applies to your purchase too. The effective date above reflects the current version.");

    r.push("## " + (num + 3) + ". Contact");
    r.push("Refund questions? Email **" + a.contactEmail + "** with your order details \u2014 a human reads every message, usually within one business day.");

    return { title: "Refund Policy", md: r.join("\n\n") };
  }

  /* ---------------- public API ---------------- */

  function buildAll(rawAnswers) {
    var a = normalizeAnswers(rawAnswers);
    return {
      answers: a,
      docs: {
        privacy: buildPrivacy(a),
        terms: buildTerms(a),
        cookies: buildCookies(a),
        refund: buildRefund(a)
      }
    };
  }

  var Generator = {
    normalizeAnswers: normalizeAnswers,
    buildAll: buildAll,
    mdToHtmlFragment: mdToHtmlFragment,
    mdToHtmlDoc: mdToHtmlDoc,
    mdToTxt: mdToTxt,
    fnv1a32: fnv1a32,
    licenseKeyFor: licenseKeyFor
  };

  if (typeof window !== "undefined") window.Generator = Generator;
  if (typeof globalThis !== "undefined") globalThis.Generator = Generator;
})();
