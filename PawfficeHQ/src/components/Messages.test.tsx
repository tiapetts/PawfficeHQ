import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Messages from "./Messages";
const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  invoke: vi.fn(),
}));
vi.mock(
  "../lib/supabase",
  () => ({
    supabase: {
      rpc: mocks.rpc,
      from: mocks.from,
      functions: { invoke: mocks.invoke },
    },
  }),
);
const threadId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const thread = {
  id: threadId,
  client_id: 7,
  phone_number: "+19205550123",
  client_name: "Sam Client",
  sms_opted_out: false,
  last_message_at: "2026-11-06T12:00:00Z",
  preview: "Do you offer nail trims?",
  unread_count: 1,
};
function queryResult(data: unknown) {
  const result = { data, error: null };
  const query: Record<string, unknown> = {
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(result).then(resolve),
  };
  for (
    const method of ["select", "eq", "order", "limit", "range", "is", "or"]
  ) query[method] = () => query;
  return query;
}
beforeEach(() => {
  mocks.rpc.mockImplementation((name: string) =>
    name === "messaging_inbox" ? queryResult([thread]) : Promise.resolve({
      data: name === "get_messaging_connection"
        ? [{ phone_number: "+19205559999" }]
        : null,
      error: null,
    })
  );
  mocks.from.mockImplementation(() =>
    queryResult([{
      id: "incoming",
      direction: "inbound",
      message_body: "Do you offer nail trims?",
      media_count: 0,
      status: "received",
      error_message: null,
      created_at: "2026-11-06T12:00:00Z",
    }])
  );
  mocks.invoke.mockResolvedValue({
    data: { message: { id: "outgoing", status: "queued" } },
    error: null,
  });
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
});
async function openConversation(props = {}) {
  render(
    <Messages businessId="bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb" {...props} />,
  );
  fireEvent.click(await screen.findByRole("button", { name: /Sam Client/ }));
  await screen.findByText("Do you offer nail trims?", {
    selector: ".messages-bubble p",
  });
}
describe("client messaging", () => {
  it("shows client questions and sends a custom reply with a stable request ID", async () => {
    await openConversation();
    fireEvent.change(screen.getByLabelText("Your message"), {
      target: { value: "Yes, nail trims are available." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send text" }));
    await waitFor(() =>
      expect(mocks.invoke).toHaveBeenCalledWith("send-client-message", {
        body: expect.objectContaining({
          conversationId: threadId,
          message: "Yes, nail trims are available.",
          requestId: expect.any(String),
        }),
      })
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Your message")).toHaveValue("")
    );
    expect(mocks.rpc).toHaveBeenCalledWith(
      "mark_client_conversation_read",
      expect.objectContaining({ p_conversation_id: threadId }),
    );
  });
  it("checks the same send request after a network interruption", async () => {
    mocks.invoke.mockResolvedValueOnce({
      data: null,
      error: new Error("connection lost"),
    });
    await openConversation();
    fireEvent.change(screen.getByLabelText("Your message"), {
      target: { value: "Your appointment is at 2." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send text" }));
    const check = await screen.findByRole("button", {
      name: "Check send status",
    });
    await waitFor(() => expect(check).toBeEnabled());
    fireEvent.click(check);
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(2));
    expect(mocks.invoke.mock.calls[1]).toEqual(mocks.invoke.mock.calls[0]);
  });
  it("blocks composing and sending when the business is read-only", async () => {
    await openConversation({ readOnly: true });
    expect(screen.getByLabelText("Your message")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send text" })).toBeDisabled();
    expect(mocks.invoke).not.toHaveBeenCalled();
  });
  it("blocks replies to a number that has opted out", async () => {
    mocks.rpc.mockImplementation((name: string) =>
      name === "messaging_inbox"
        ? queryResult([{ ...thread, sms_opted_out: true }])
        : Promise.resolve({
          data: name === "get_messaging_connection"
            ? [{ phone_number: "+19205559999" }]
            : null,
          error: null,
        })
    );
    await openConversation();
    expect(screen.getByText("This number has opted out. Sending is disabled."))
      .toBeVisible();
    expect(screen.getByRole("button", { name: "Send text" })).toBeDisabled();
  });
});
