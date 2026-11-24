import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ServiceAgreementProfile from "./ServiceAgreementProfile";

const { from } = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("../lib/supabase", () => ({ supabase: { from } }));

const signedAt = "2026-11-23T12:00:00.000Z";
const expiresAt = Date.parse("2026-11-24T12:00:00.000Z");

function mockAgreements(signedVersion = "version", latestStatus?: string) {
  const signedRequest = { id: "request", template_id: "template", version_id: signedVersion, status: "signed", signed_at: signedAt };
  const requests = latestStatus
    ? [{ id: "new-request", template_id: "template", version_id: "version", status: latestStatus }, signedRequest]
    : [signedRequest];
  const tables: Record<string, unknown[]> = {
    service_agreement_template: [{ id: "template", title: "Grooming agreement", active_version_id: "version", validity_days: 1 }],
    service_agreement_request: requests,
    service_agreement_signature: [{ request_id: "request", signed_at: signedAt }],
  };
  from.mockImplementation((table: string) => {
    const query = Object.assign(Promise.resolve({ data: tables[table], error: null }), {
      select: () => query,
      eq: () => query,
      order: () => query,
    });
    return query;
  });
}

async function openProfile() {
  await act(async () => {
    render(<ServiceAgreementProfile businessId="business" clientId={1} />);
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  from.mockReset();
});

it("switches from Signed to Expired at the deadline while the profile stays open", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(expiresAt - 1);
  mockAgreements();
  await openProfile();

  expect(screen.getByText("Signed", { exact: true })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "View signed PDF" })).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByText("Expired", { exact: true })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Create signing link" })).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.getByText("Expired", { exact: true })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "View signed PDF" })).not.toBeInTheDocument();
});

it.each([
  ["version", "sent", "Pending signature"],
  ["old-version", undefined, "Outdated agreement"],
  ["version", undefined, "Expired"],
])("shows the correct status when opening an already-expired profile (%s / %s)", async (version, latestStatus, status) => {
  vi.useFakeTimers();
  vi.setSystemTime(expiresAt + 1);
  mockAgreements(version, latestStatus);
  await openProfile();

  expect(screen.getByText(status, { exact: true })).toBeInTheDocument();
});
