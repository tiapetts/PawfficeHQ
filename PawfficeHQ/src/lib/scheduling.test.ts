import { describe, expect, it } from "vitest";
import { addWeeksToLocalDate, formatLocalDateInput, rangesOverlap } from "./scheduling";

describe("scheduling safeguards", () => {
  it("adds weeks without leaking a UTC date into the local calendar", () => expect(addWeeksToLocalDate("2026-09-05T16:30:00", 6)).toBe("2026-10-17"));
  it("formats a local calendar date", () => expect(formatLocalDateInput(new Date(2026, 0, 9, 23, 30))).toBe("2026-01-09"));
  it("detects overlaps but permits back-to-back visits", () => { const at=(time:string)=>new Date(`2026-09-05T${time}:00`); expect(rangesOverlap(at("09:00"),at("10:00"),at("09:30"),at("10:30"))).toBe(true); expect(rangesOverlap(at("09:00"),at("10:00"),at("10:00"),at("11:00"))).toBe(false); });
  it("rejects an invalid source date", () => expect(() => addWeeksToLocalDate("not-a-date", 2)).toThrow("Invalid appointment date"));
});
