import { beforeEach, describe, expect, it, vi } from "vitest";

const sentry = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  withScope: vi.fn((callback: (scope: { setContext: ReturnType<typeof vi.fn> }) => void) => callback({ setContext: vi.fn() })),
}));

vi.mock("@sentry/react", () => sentry);

describe("production monitoring", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("stays dormant when no DSN is configured", async () => {
    const { initializeMonitoring } = await import("./monitoring");
    expect(initializeMonitoring()).toBe(false);
    expect(sentry.init).not.toHaveBeenCalled();
  });

  it("uses privacy-safe defaults when configured", async () => {
    vi.stubEnv("VITE_SENTRY_DSN", "https://public@example.ingest.sentry.io/1");
    const { initializeMonitoring } = await import("./monitoring");
    expect(initializeMonitoring()).toBe(true);
    expect(sentry.init).toHaveBeenCalledWith(expect.objectContaining({ sendDefaultPii: false, tracesSampleRate: 0.1 }));
  });
});
