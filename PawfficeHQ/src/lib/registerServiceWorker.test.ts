import { describe, expect, it, vi } from "vitest";
import { registerPawfficeServiceWorker } from "./registerServiceWorker";

describe("registerPawfficeServiceWorker", () => {
  it("does nothing when service workers are unavailable", () => {
    const register = vi.fn();

    expect(
      registerPawfficeServiceWorker({
        enabled: true,
        supportsServiceWorker: false,
        register,
      }),
    ).toBe(false);
    expect(register).not.toHaveBeenCalled();
  });

  it("handles registration rejection without an unhandled promise", async () => {
    const error = new Error("Rejected");
    const register = vi.fn().mockRejectedValue(error);
    const onError = vi.fn();
    let onLoad = () => {};

    expect(
      registerPawfficeServiceWorker({
        enabled: true,
        supportsServiceWorker: true,
        register,
        addLoadListener: (listener) => {
          onLoad = listener;
        },
        onError,
      }),
    ).toBe(true);

    onLoad();
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(error));
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/" });
  });
});
