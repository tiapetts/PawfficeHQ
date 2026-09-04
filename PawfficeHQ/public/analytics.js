(() => {
  const measurementId = "G-98C6RJ1R10", consentKey = "pawfficehq_analytics_consent", safeLocation = `${location.origin}${location.pathname}`;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag("consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
  let loaded = false;
  function loadAnalytics() {
    if (loaded) return; loaded = true;
    window.gtag("consent", "update", { analytics_storage: "granted" });
    window.gtag("js", new Date());
    window.gtag("config", measurementId, { page_location: safeLocation, allow_google_signals: false, allow_ad_personalization_signals: false });
    const script = document.createElement("script"); script.async = true; script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`; document.head.appendChild(script);
  }
  function track(name, parameters = {}) { if (loaded && name) window.gtag("event", name, parameters); }
  window.pawfficeAnalytics = { track };
  window.addEventListener("pawffice:analytics", event => track(event.detail?.name, event.detail?.parameters));
  document.addEventListener("click", event => { const target = event.target.closest?.("[data-analytics-event]"); if (target) track(target.dataset.analyticsEvent); });
  document.addEventListener("submit", event => { if (event.target?.id === "support-form") track("support_request_started"); });
  function dismiss(choice) { localStorage.setItem(consentKey, choice); document.querySelector(".analytics-consent")?.remove(); if (choice === "accepted") loadAnalytics(); }
  function showBanner() {
    const banner = document.createElement("aside"); banner.className = "analytics-consent"; banner.setAttribute("aria-label", "Analytics preferences");
    banner.innerHTML = `<div><strong>Help us improve PawfficeHQ</strong><p>Allow anonymous website analytics so we can understand which public pages are useful. We never send client, pet, medical, email, or form information to Google. <a href="/privacy.html#analytics">Privacy details</a></p></div><div class="analytics-consent-actions"><button type="button" data-choice="declined">No thanks</button><button type="button" class="accept" data-choice="accepted">Allow analytics</button></div>`;
    banner.addEventListener("click", event => { const choice = event.target.closest?.("button")?.dataset.choice; if (choice) dismiss(choice); }); document.body.appendChild(banner);
  }
  const consent = localStorage.getItem(consentKey); if (consent === "accepted") loadAnalytics(); else if (consent !== "declined") window.addEventListener("DOMContentLoaded", showBanner, { once: true });
})();
