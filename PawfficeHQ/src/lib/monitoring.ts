import * as Sentry from "@sentry/react";

let initialized = false;

function withoutQueryString(value: unknown) {
  if (typeof value !== "string") return value;
  return value.split(/[?#]/, 1)[0];
}

export function initializeMonitoring() {
  const dsn = import.meta.env.VITE_SENTRY_DSN?.trim();
  if (!dsn || initialized) return false;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    enabled: import.meta.env.PROD,
    sendDefaultPii: false,
    tracesSampleRate: 0.1,
    maxBreadcrumbs: 30,
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === "navigation" && breadcrumb.data) {
        breadcrumb.data.from = withoutQueryString(breadcrumb.data.from);
        breadcrumb.data.to = withoutQueryString(breadcrumb.data.to);
      }
      if (["fetch", "xhr"].includes(breadcrumb.category ?? "") && breadcrumb.data) {
        breadcrumb.data.url = withoutQueryString(breadcrumb.data.url);
      }
      return breadcrumb;
    },
    beforeSend(event) {
      delete event.user;
      if (event.request) {
        delete event.request.cookies;
        delete event.request.data;
        delete event.request.headers;
        event.request.url = withoutQueryString(event.request.url) as string;
      }
      return event;
    },
  });

  initialized = true;
  return true;
}

export function captureApplicationError(error: Error, componentStack?: string) {
  if (!initialized) return;
  Sentry.withScope((scope) => {
    if (componentStack) scope.setContext("react", { componentStack });
    Sentry.captureException(error);
  });
}
