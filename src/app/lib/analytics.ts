const CONSENT_KEY = "yardpilot-analytics-consent";
const GA_SCRIPT_ID = "yardpilot-ga4";

type Consent = "granted" | "denied" | null;
type AnalyticsProperty = string | number | boolean;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function measurementId() {
  const value = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim() ?? "";
  return /^G-[A-Z0-9]+$/i.test(value) ? value : "";
}

export function analyticsConfigured() {
  return Boolean(measurementId());
}

export function getAnalyticsConsent(): Consent {
  const stored = localStorage.getItem(CONSENT_KEY);
  return stored === "granted" || stored === "denied" ? stored : null;
}

export function setAnalyticsConsent(consent: Exclude<Consent, null>) {
  localStorage.setItem(CONSENT_KEY, consent);
  if (consent === "granted") loadAnalytics();
}

export function loadAnalytics() {
  const id = measurementId();
  if (!id || getAnalyticsConsent() !== "granted") return;

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = window.gtag ?? ((...args: unknown[]) => window.dataLayer?.push(args));

  if (!document.getElementById(GA_SCRIPT_ID)) {
    const script = document.createElement("script");
    script.id = GA_SCRIPT_ID;
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(script);

    window.gtag("js", new Date());
    window.gtag("config", id, {
      anonymize_ip: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      send_page_view: false,
    });
  }
}

export function trackPageView(path: string) {
  if (getAnalyticsConsent() !== "granted") return;
  loadAnalytics();
  const id = measurementId();
  if (!id || !window.gtag) return;
  window.gtag("event", "page_view", {
    page_path: path,
    page_location: `${window.location.origin}${path}`,
  });
}

export function trackEvent(
  name: string,
  properties: Record<string, AnalyticsProperty> = {},
) {
  if (getAnalyticsConsent() !== "granted") return;
  loadAnalytics();
  if (!measurementId() || !window.gtag) return;

  // Never pass names, emails, phone numbers, addresses, free-form text, tokens,
  // invoice details, estimate details, or Stripe identifiers to Analytics.
  window.gtag("event", name, properties);
}
