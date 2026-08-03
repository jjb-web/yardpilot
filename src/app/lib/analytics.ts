const CONSENT_KEY = "yardpilot-analytics-consent";
const GA_SCRIPT_ID = "yardpilot-ga4";

type Consent = "granted" | "denied" | null;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
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
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim();
  if (!measurementId || getAnalyticsConsent() !== "granted") return;
  if (document.getElementById(GA_SCRIPT_ID)) return;

  const script = document.createElement("script");
  script.id = GA_SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = (...args: unknown[]) => {
    window.dataLayer?.push(args);
  };
  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    anonymize_ip: true,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    send_page_view: false,
  });
}

export function trackPageView(path: string) {
  if (getAnalyticsConsent() !== "granted") return;
  loadAnalytics();
  const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim();
  if (!measurementId || !window.gtag) return;
  window.gtag("event", "page_view", {
    page_path: path,
    page_location: `${window.location.origin}${path}`,
  });
}

export function trackEvent(name: string, properties: Record<string, string | number | boolean> = {}) {
  if (getAnalyticsConsent() !== "granted") return;
  loadAnalytics();
  window.gtag?.("event", name, properties);
}
