type ServiceWorkerSetupOptions = {
  enabled?: boolean;
  supportsServiceWorker?: boolean;
  register?: (
    scriptUrl: string,
    options: RegistrationOptions,
  ) => Promise<unknown>;
  addLoadListener?: (listener: () => void) => void;
  onError?: (error: unknown) => void;
};

export function registerPawfficeServiceWorker({
  enabled = import.meta.env.PROD,
  supportsServiceWorker =
    typeof navigator !== "undefined" && "serviceWorker" in navigator,
  register = (scriptUrl, options) =>
    navigator.serviceWorker.register(scriptUrl, options),
  addLoadListener = (listener) =>
    window.addEventListener("load", listener, { once: true }),
  onError = (error) =>
    console.warn("PawfficeHQ service worker registration failed.", error),
}: ServiceWorkerSetupOptions = {}) {
  if (!enabled || !supportsServiceWorker) return false;

  addLoadListener(() => {
    void register("/sw.js", { scope: "/" }).catch(onError);
  });

  return true;
}
