import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { useState } from "react";
import App from "./App";

const mocks = vi.hoisted(() => ({
  listener: null as null | ((event: string, session: Session | null) => void),
  rpc: vi.fn(),
  profile: vi.fn(),
  refresh: vi.fn(),
}));
const session = (id = "owner") => ({ user: { id }, access_token: "token" }) as Session;
vi.mock("./lib/supabase", () => ({
  supabase: {
    auth: {
      refreshSession: mocks.refresh,
      signOut: vi.fn(),
      onAuthStateChange: (callback: typeof mocks.listener) => {
        mocks.listener = callback;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
    },
    rpc: mocks.rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: mocks.profile }) }) }),
  },
}));
vi.mock("./components/Auth", () => ({ default: () => <div>Sign in screen</div> }));
vi.mock("./components/BusinessSetup", () => ({ default: () => <div>Business setup</div> }));
vi.mock("./components/SetPassword", () => ({ default: () => <div>Password recovery</div> }));
vi.mock("./components/SubscriptionGate", () => ({ default: () => <div>Subscription gate</div> }));
vi.mock("./components/PlatformAdmin", () => ({
  default: ({ onOpenMyBusiness }: { onOpenMyBusiness: () => void }) =>
    <button onClick={onOpenMyBusiness}>Open business</button>,
}));
vi.mock("./components/Dashboard", () => ({
  default: function Workspace() {
    const [page, setPage] = useState("Home");
    return <div><button onClick={() => setPage("Clients")}>Go to Clients</button>
      <h1>{page}</h1><input aria-label="Phone draft" /></div>;
  },
}));
async function openClientDraft() {
  render(<App />);
  fireEvent.click(await screen.findByText("Open business"));
  fireEvent.click(screen.getByText("Go to Clients"));
  fireEvent.change(screen.getByLabelText("Phone draft"), { target: { value: "6085550100" } });
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.listener = null;
  mocks.refresh.mockResolvedValue({ data: { session: session() }, error: null });
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.profile.mockResolvedValue({
    data: { id: "staff", business_id: "business", first_name: "Owner", last_name: "Test" },
    error: null,
  });
});
describe("workspace state during auth events", () => {
  it("keeps the current page and draft on repeated sign-in and token refresh", async () => {
    await openClientDraft();
    const input = screen.getByLabelText("Phone draft");
    await act(async () => {
      mocks.listener!("SIGNED_IN", session());
      mocks.listener!("TOKEN_REFRESHED", session());
      mocks.listener!("SIGNED_IN", session());
    });
    expect(screen.getByRole("heading", { name: "Clients" })).toBeInTheDocument();
    expect(screen.getByLabelText("Phone draft")).toBe(input);
    expect(input).toHaveValue("6085550100");
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("refreshes updated access without unmounting the workspace", async () => {
    await openClientDraft();
    const input = screen.getByLabelText("Phone draft");
    act(() => mocks.listener!("USER_UPDATED", session()));
    await waitFor(() => expect(mocks.profile).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText("Phone draft")).toBe(input);
    expect(input).toHaveValue("6085550100");
  });
  it("clears the workspace on sign-out", async () => {
    await openClientDraft();
    act(() => mocks.listener!("SIGNED_OUT", null));
    expect(screen.getByText("Sign in screen")).toBeInTheDocument();
    expect(screen.queryByLabelText("Phone draft")).not.toBeInTheDocument();
  });
  it("does not carry the workspace into another account", async () => {
    await openClientDraft();
    act(() => mocks.listener!("SIGNED_IN", session("another-owner")));
    expect(screen.queryByLabelText("Phone draft")).not.toBeInTheDocument();
    expect(await screen.findByText("Open business")).toBeInTheDocument();
    expect(mocks.profile).toHaveBeenCalledTimes(2);
  });
});
