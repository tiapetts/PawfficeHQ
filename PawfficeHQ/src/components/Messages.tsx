import { type FormEvent, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import "./Messages.css";

type Thread = {
  id: string;
  client_id: number | null;
  phone_number: string;
  client_name: string;
  sms_opted_out: boolean;
  last_message_at: string;
  preview: string | null;
  unread_count: number;
};
type Message = {
  id: string;
  direction: "inbound" | "outbound";
  message_body: string;
  media_count: number;
  status: string;
  error_message: string | null;
  created_at: string;
};
type Client = {
  id: number;
  FirstName: string;
  LastName: string;
  PhoneNumber: string | null;
};
type Attempt = { requestId: string; conversationId: string; message: string };
const pageSize = 100;
const messageFields =
  "id,direction,message_body,media_count,status,error_message,created_at";
const dateLabel = (value: string) =>
  new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export default function Messages(
  { businessId, readOnly = false, onUnreadChange }: {
    businessId: string;
    readOnly?: boolean;
    onUnreadChange?: () => void;
  },
) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadedThreadId, setLoadedThreadId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [inboxLimit, setInboxLimit] = useState(pageSize);
  const [hasMoreThreads, setHasMoreThreads] = useState(false);
  const [hasOlder, setHasOlder] = useState(false);
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [attempts, setAttempts] = useState<Record<string, Attempt>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sendNotice, setSendNotice] = useState("");
  const [connection, setConnection] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [clientLoading, setClientLoading] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);
  const currentThread = useRef(threadId);
  useEffect(() => {
    currentThread.current = threadId;
  }, [threadId]);
  const selected = threads.find((thread) => thread.id === threadId);
  const draft = threadId ? drafts[threadId] ?? "" : "";
  const attempt = threadId ? attempts[threadId] : undefined;

  async function refreshInbox() {
    const { data, error: loadError } = await supabase.rpc("messaging_inbox", {
      p_business_id: businessId,
    }).range(0, inboxLimit);
    if (loadError) {
      setError(
        "Messages could not be loaded. Check that messaging setup is complete, then refresh.",
      );
      return;
    }
    setThreads((data ?? []).slice(0, inboxLimit));
    setHasMoreThreads((data ?? []).length > inboxLimit);
    setLoading(false);
  }
  useEffect(() => {
    let active = true;
    async function refresh() {
      const [inbox, number] = await Promise.all([
        supabase.rpc("messaging_inbox", { p_business_id: businessId }).range(
          0,
          inboxLimit,
        ),
        supabase.rpc("get_messaging_connection", { p_business_id: businessId }),
      ]);
      if (!active) return;
      if (inbox.error || number.error) {
        setError(
          "Messages could not be loaded. Check that messaging setup is complete, then refresh.",
        );
      } else {
        setThreads((inbox.data ?? []).slice(0, inboxLimit));
        setHasMoreThreads((inbox.data ?? []).length > inboxLimit);
        setConnection(number.data?.[0]?.phone_number ?? null);
      }
      setLoading(false);
    }
    void refresh();
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15_000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [businessId, inboxLimit]);

  useEffect(() => {
    let active = true;
    if (!threadId) return;
    async function refresh() {
      const { data, error: loadError } = await supabase.from("client_message")
        .select(messageFields)
        .eq("business_id", businessId).eq("conversation_id", threadId)
        .order("created_at", { ascending: false }).order("id", {
          ascending: false,
        }).limit(pageSize);
      if (!active) return;
      if (loadError) {
        setError(
          "This conversation could not be loaded. Refresh to try again.",
        );
      } else {
        const rows = (data ?? []) as Message[];
        setLoadedThreadId(threadId);
        setMessages((previous) => {
          const merged = new Map(
            previous.map((message) => [message.id, message]),
          );
          rows.forEach((message) => merged.set(message.id, message));
          return [...merged.values()].sort((a, b) =>
            a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
          );
        });
        setHasOlder((previous) => previous || rows.length === pageSize);
        const newestInbound = rows.find((message) =>
          message.direction === "inbound"
        );
        if (newestInbound && !document.hidden && document.hasFocus()) {
          const { error: readError } = await supabase.rpc(
            "mark_client_conversation_read",
            {
              p_conversation_id: threadId,
              p_read_at: newestInbound.created_at,
            },
          );
          if (!readError && active) {
            setThreads((previous) =>
              previous.map((thread) =>
                thread.id === threadId ? { ...thread, unread_count: 0 } : thread
              )
            );
            onUnreadChange?.();
          }
        }
      }
      if (active) setThreadLoading(false);
    }
    const initial = window.setTimeout(() => {
      setMessages([]);
      setHasOlder(false);
      setSendNotice("");
      setThreadLoading(true);
      setLoadingOlder(false);
      void refresh();
    }, 0);
    const timer = window.setInterval(() => {
      if (!document.hidden) void refresh();
    }, 15_000);
    window.addEventListener("focus", refresh);
    return () => {
      active = false;
      window.clearTimeout(initial);
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [businessId, threadId, onUnreadChange]);

  const lastMessageId = messages.at(-1)?.id;
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [lastMessageId]);

  useEffect(() => {
    if (!showNew) return;
    let active = true;
    const timer = window.setTimeout(async () => {
      setClientLoading(true);
      const term = clientSearch.replace(/[^\p{L}\p{N} +.-]/gu, "").trim();
      let query = supabase.from("CLIENT").select(
        "id,FirstName,LastName,PhoneNumber",
      ).eq("business_id", businessId).is("archived_at", null);
      if (term) {
        query = query.or(
          `FirstName.ilike.%${term}%,LastName.ilike.%${term}%,PhoneNumber.ilike.%${term}%`,
        );
      }
      const { data, error: clientError } = await query.order("LastName").limit(
        25,
      );
      if (!active) return;
      if (clientError) setError("Client search could not be loaded.");
      setClients((data ?? []) as Client[]);
      setClientLoading(false);
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [showNew, clientSearch, businessId]);

  async function startConversation(clientId: number) {
    setStarting(true);
    setError("");
    const { data, error: startError } = await supabase.rpc(
      "start_client_conversation",
      { p_business_id: businessId, p_client_id: clientId },
    );
    if (startError) setError(startError.message);
    else {
      await refreshInbox();
      setThreadId(data as string);
      setShowNew(false);
    }
    setStarting(false);
  }
  async function loadOlder() {
    const oldest = messages[0];
    if (!oldest || !threadId) return;
    const requestedThread = threadId;
    setLoadingOlder(true);
    const { data, error: olderError } = await supabase.from("client_message")
      .select(messageFields)
      .eq("business_id", businessId).eq("conversation_id", requestedThread)
      .or(
        `created_at.lt.${oldest.created_at},and(created_at.eq.${oldest.created_at},id.lt.${oldest.id})`,
      )
      .order("created_at", { ascending: false }).order("id", {
        ascending: false,
      }).limit(pageSize);
    if (currentThread.current === requestedThread) {
      if (olderError) setError("Earlier messages could not be loaded.");
      else {
        setMessages(
          (previous) => [...((data ?? []) as Message[]).reverse(), ...previous],
        );
        setHasOlder(data?.length === pageSize);
      }
      setLoadingOlder(false);
    }
  }
  async function send(event: FormEvent) {
    event.preventDefault();
    if (!threadId || !draft.trim() || sending || readOnly) return;
    const target = threadId;
    const request = attempts[target] ??
      {
        requestId: crypto.randomUUID(),
        conversationId: target,
        message: draft.trim(),
      };
    setAttempts((previous) => ({ ...previous, [target]: request }));
    setSending(true);
    setError("");
    setSendNotice("");
    try {
      const { data, error: sendError } = await supabase.functions.invoke(
        "send-client-message",
        { body: { ...request, businessId } },
      );
      if (sendError) {
        const response = (sendError as { context?: Response }).context;
        if (response && [400, 401, 403, 404, 503].includes(response.status)) {
          const rejected = await response.json().catch(() => null);
          if (rejected?.error) {
            setError(rejected.error);
            setAttempts((previous) => {
              const next = { ...previous };
              delete next[target];
              return next;
            });
            return;
          }
        }
        throw sendError;
      }
      const status = data?.message?.status as string | undefined;
      if (data?.error) {
        setError(data.error);
        // A known failure is safe to correct and send as a new request.
        if (!status || ["failed", "undelivered"].includes(status)) {
          setAttempts((previous) => {
            const next = { ...previous };
            delete next[target];
            return next;
          });
        }
      } else if (["pending", "unknown"].includes(status ?? "")) {
        setSendNotice(
          "Send status is unconfirmed. Check status below or check Twilio before sending another copy.",
        );
      } else if (["queued", "sent", "delivered"].includes(status ?? "")) {
        setDrafts((previous) => ({ ...previous, [target]: "" }));
        setAttempts((previous) => {
          const next = { ...previous };
          delete next[target];
          return next;
        });
        setSendNotice(
          status === "delivered"
            ? "Delivered."
            : "Accepted by Twilio. Delivery status will update in the conversation.",
        );
      } else throw new Error("No message status returned");
      const { data: latest } = await supabase.from("client_message").select(
        messageFields,
      ).eq("business_id", businessId).eq("conversation_id", target).order(
        "created_at",
        { ascending: false },
      ).order("id", { ascending: false }).limit(pageSize);
      if (currentThread.current === target && latest) {
        setMessages((previous) => {
          const merged = new Map(
            previous.map((message) => [message.id, message]),
          );
          (latest as Message[]).forEach((message) =>
            merged.set(message.id, message)
          );
          return [...merged.values()].sort((a, b) =>
            a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)
          );
        });
      }
      await refreshInbox();
    } catch {
      setError(
        "The send request was interrupted. Use Check send status to check the same request without sending a duplicate.",
      );
    } finally {
      setSending(false);
    }
  }
  const term = search.toLowerCase();
  const visibleThreads = threads.filter((thread) =>
    (!unreadOnly || Number(thread.unread_count) > 0) &&
    `${thread.client_name} ${thread.phone_number} ${thread.preview ?? ""}`
      .toLowerCase().includes(term)
  );
  return (
    <section className="messages-page" aria-labelledby="messages-title">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">Client conversations</p>
          <h2 id="messages-title">Messages</h2>
          <p>
            {connection
              ? `Texts from ${connection}`
              : "Connect your business Twilio number to send and receive texts."}
          </p>
        </div>
        <button
          className="primary-button"
          type="button"
          disabled={readOnly || !connection}
          onClick={() => setShowNew((value) => !value)}
        >
          New message
        </button>
      </header>
      {error && (
        <p className="messages-error" role="alert">
          {error}{" "}
          <button
            type="button"
            onClick={() => {
              setError("");
              void refreshInbox();
            }}
          >
            Refresh inbox
          </button>
        </p>
      )}
      {showNew && (
        <section className="messages-new" aria-label="Start a conversation">
          <label>
            Find a client<input
              value={clientSearch}
              onChange={(event) =>
                setClientSearch(event.target.value)}
              placeholder="Name or phone number"
            />
          </label>
          <button
            type="button"
            onClick={() =>
              setShowNew(false)}
          >
            Close
          </button>
          <div>
            {clientLoading
              ? <p>Searching clients…</p>
              : clients.length
              ? clients.map((client) => (
                <button
                  type="button"
                  key={client.id}
                  disabled={starting || !client.PhoneNumber}
                  onClick={() => void startConversation(client.id)}
                >
                  {client.FirstName} {client.LastName}
                  <small>{client.PhoneNumber ?? "No phone number"}</small>
                </button>
              ))
              : <p>No matching clients. Add the client in Clients first.</p>}
          </div>
          <small>Showing up to 25 clients. Search to find someone else.</small>
        </section>
      )}
      <div
        className={`messages-workspace ${
          threadId ? "messages-has-selection" : ""
        }`}
      >
        <aside className="messages-inbox" aria-label="Conversations">
          <label className="messages-search">
            Search conversations<input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Client, number, or recent message"
            />
          </label>
          <label className="messages-filter">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(event) => setUnreadOnly(event.target.checked)}
            />{" "}
            Unread only
          </label>
          <div className="messages-thread-list">
            {loading
              ? <p>Loading conversations…</p>
              : visibleThreads.length
              ? visibleThreads.map((thread) => (
                <button
                  type="button"
                  key={thread.id}
                  className={`messages-thread ${
                    thread.id === threadId ? "selected" : ""
                  }`}
                  aria-pressed={thread.id === threadId}
                  onClick={() => {
                    setThreadId(thread.id);
                    setError("");
                  }}
                >
                  <span>
                    <strong>{thread.client_name || thread.phone_number}</strong>
                    {Number(thread.unread_count) > 0 && (
                      <span className="messages-unread">
                        {thread.unread_count} unread
                      </span>
                    )}
                  </span>
                  <small>{dateLabel(thread.last_message_at)}</small>
                  <p>{thread.preview || "No messages yet"}</p>
                </button>
              ))
              : (
                <p className="messages-empty">
                  {unreadOnly
                    ? "No unread conversations."
                    : "No conversations yet. Start a new message to a client."}
                </p>
              )}
          </div>
          {hasMoreThreads && (
            <button
              type="button"
              onClick={() => setInboxLimit((limit) => limit + pageSize)}
            >
              Load more conversations
            </button>
          )}
        </aside>
        <section
          className="messages-conversation"
          aria-label="Selected conversation"
        >
          {selected
            ? (
              <>
                <header className="messages-conversation-heading">
                  <button
                    className="messages-back"
                    type="button"
                    onClick={() => setThreadId(null)}
                  >
                    ← Conversations
                  </button>
                  <h3>{selected.client_name || "Unknown sender"}</h3>
                  <p>{selected.phone_number}</p>
                </header>
                <div
                  className="messages-log"
                  role="log"
                  aria-label="Message history"
                  aria-live="polite"
                  aria-busy={threadLoading}
                  ref={logRef}
                >
                  {hasOlder && (
                    <button
                      type="button"
                      disabled={loadingOlder}
                      onClick={() => void loadOlder()}
                    >
                      {loadingOlder ? "Loading…" : "Load earlier messages"}
                    </button>
                  )}
                  {threadLoading || loadedThreadId !== threadId
                    ? <p>Loading messages…</p>
                    : !messages.length
                    ? (
                      <p className="messages-empty">
                        Start the conversation with a message below.
                      </p>
                    )
                    : messages.map((message) => (
                      <article
                        key={message.id}
                        className={`messages-bubble ${message.direction}`}
                      >
                        <span className="messages-sender">
                          {message.direction === "outbound"
                            ? "Your business"
                            : selected.client_name || "Client"}
                        </span>
                        <p>{message.message_body}</p>
                        {message.media_count > 0 && (
                          <p className="messages-attachment">
                            {message.media_count}{" "}
                            attachment(s) received. View attachments in Twilio.
                          </p>
                        )}
                        <footer>
                          <time dateTime={message.created_at}>
                            {dateLabel(message.created_at)}
                          </time>
                          <span>
                            {message.status === "unknown"
                              ? "Send unconfirmed"
                              : message.status}
                          </span>
                        </footer>
                        {message.error_message && (
                          <p className="messages-delivery-error">
                            {message.error_message}
                          </p>
                        )}
                      </article>
                    ))}
                </div>
                <form className="messages-composer" onSubmit={send}>
                  {readOnly && <p>Messaging is read-only for this account.</p>}
                  {selected.sms_opted_out && (
                    <p>This number has opted out. Sending is disabled.</p>
                  )}
                  {!selected.client_id && (
                    <p>
                      Add a unique matching client phone number in Clients, then
                      start a new conversation with that client to enable
                      replies.
                    </p>
                  )}
                  <label htmlFor="client-message-draft">
                    Your message<textarea
                      id="client-message-draft"
                      rows={3}
                      maxLength={1600}
                      value={draft}
                      disabled={readOnly || sending || !!attempt ||
                        selected.sms_opted_out || !selected.client_id ||
                        !connection}
                      onChange={(event) =>
                        setDrafts((previous) => ({
                          ...previous,
                          [selected.id]: event.target.value,
                        }))}
                      placeholder="Answer a question, confirm details, or share service information…"
                    />
                  </label>
                  <div>
                    <small>
                      {draft.length}/1,600 · Uses your SMS allowance
                    </small>
                    <button
                      className="primary-button"
                      type="submit"
                      disabled={readOnly || sending || !draft.trim() ||
                        selected.sms_opted_out || !selected.client_id ||
                        !connection}
                    >
                      {sending
                        ? "Please wait…"
                        : attempt
                        ? "Check send status"
                        : "Send text"}
                    </button>
                  </div>
                  <small>
                    Recorded client SMS consent is required. Accepted by Twilio
                    does not mean delivered.
                  </small>
                  {sendNotice && <p role="status">{sendNotice}</p>}
                </form>
              </>
            )
            : (
              <div className="messages-empty">
                <h3>Keep every client conversation together</h3>
                <p>
                  Select a conversation or start a new message. Incoming texts
                  appear here automatically while this page is open.
                </p>
              </div>
            )}
        </section>
      </div>
    </section>
  );
}
