/* ============================================================
   LegalLaunch — site configuration
   EDIT THIS FILE to change branding, price and your payment link.
   1) Paste your Stripe Payment Link into stripePaymentLink below.
   2) Change price / brandName if you rebrand.
   Nothing else in the app needs to change.
   ============================================================ */

window.SITE_CONFIG = {
  brandName: "LegalLaunch",
  price: "$29",
  priceTier2: "$49",
  // Paste your Stripe Payment Link here, e.g. "https://buy.stripe.com/xxxxxxx"
  // While it is the placeholder, the buy buttons will explain that checkout is not configured yet.
  stripePaymentLink: "PASTE_YOUR_STRIPE_PAYMENT_LINK_HERE",
  supportEmail: "" // optional: if empty, the app only shows your site's own contact email
};
