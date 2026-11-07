import { describe, expect, it } from "vitest";
import {
  isConfirmation,
  isOptOut,
  normalizeSmsPhone,
  shouldAdvanceStatus,
  smsSegments,
} from "../../supabase/functions/_shared/sms";

describe("two-way SMS routing and charging", () => {
  it("matches formatted US numbers and preserves explicit international numbers", () => {
    expect(normalizeSmsPhone("(920) 555-0123")).toBe("+19205550123");
    expect(normalizeSmsPhone("1 920 555 0123")).toBe("+19205550123");
    expect(normalizeSmsPhone("+442079460123")).toBe("+442079460123");
    expect(normalizeSmsPhone("not a phone")).toBeNull();
    expect(normalizeSmsPhone("123")).toBeNull();
  });
  it("counts multipart GSM extensions and Unicode SMS accurately", () => {
    expect(smsSegments("a".repeat(160))).toBe(1);
    expect(smsSegments("a".repeat(161))).toBe(2);
    expect(smsSegments("^".repeat(81))).toBe(2);
    expect(smsSegments("🐕".repeat(35))).toBe(1);
    expect(smsSegments("🐕".repeat(36))).toBe(2);
    expect(smsSegments("a".repeat(153 * 3 + 1))).toBe(4);
  });
  it("does not mistake a service question for a confirmation or opt-out", () => {
    expect(isConfirmation(" yes ")).toBe(true);
    expect(isConfirmation("yes, what services do you offer?")).toBe(false);
    expect(isOptOut("STOP")).toBe(true);
    expect(isOptOut("custom stop text", "STOP")).toBe(true);
    expect(isOptOut("Can I cancel my appointment?")).toBe(false);
  });
  it("does not let delayed status callbacks overwrite delivery or failure", () => {
    expect(shouldAdvanceStatus("queued", "delivered")).toBe(true);
    expect(shouldAdvanceStatus("unknown", "sent")).toBe(true);
    expect(shouldAdvanceStatus("delivered", "sent")).toBe(false);
    expect(shouldAdvanceStatus("failed", "queued")).toBe(false);
    expect(shouldAdvanceStatus("sent", "undelivered")).toBe(true);
    expect(shouldAdvanceStatus("sent", "not-a-status")).toBe(false);
  });
});
