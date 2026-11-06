# Client Messages (Twilio SMS)

This change adds Messages beside Calendar in the business sidebar. Staff can start a client conversation, read inbound questions, and send custom texts. The inbox polls every 15 seconds and refreshes on window focus. It shows unread counts, timestamps, delivery failures, and per-user read state. Phone numbers shared by multiple client records are retained as an unidentified thread until the records are resolved; the app never guesses a recipient.

## Deployment order

1. Apply `supabase/migrations/202611060001_client_messaging.sql` to **staging** first.
2. Provision a verified number for **each business**, as below. There is no global-number fallback. Configure every existing reminder-enabled business before deploying the reminder function update, or its reminders will be skipped.
3. Add the function secrets below, then deploy `send-client-message` with JWT verification **enabled**. Deploy `receive-appointment-confirmation` and `client-message-status` with JWT verification **disabled**; both verify Twilio's signed request against the receiving/sending number's own account token.
4. Deploy the updated `process-appointment-reminders` with its existing verification/scheduling configuration. It now uses the business's number and an atomic SMS quota reservation shared with custom replies.
5. Update each Twilio number's **A message comes in** webhook to the confirmation endpoint (HTTP POST). Its URL is unchanged, but the handler now records general questions as well as confirmations.
6. Deploy the web application. Run the staged checklist before applying this sequence to production.

Never point a live Twilio number at staging unless deliberately diverting those messages. Use a separate test number and consenting test recipient. No real messages are sent by the automated tests.

## Number mapping and secrets

Configure numbers using a trusted administrator's SQL session. Browser users cannot change sender identities or access account-token configuration. Verify control of the Twilio number in that account before provisioning it. A number can belong to only one PawfficeHQ business.

```sql
insert into public.business_sms_number
  (business_id, phone_number, account_sid, auth_token_secret)
values
  ('<business UUID>', '+19205550100', 'AC<32 hex characters>', 'TWILIO_BUSINESS_ONE_AUTH_TOKEN');
```

`phone_number` must be E.164. Set `TWILIO_BUSINESS_ONE_AUTH_TOKEN` to that Twilio account/subaccount's **Auth Token** in Supabase function secrets, not in SQL, React, Git, or a `VITE_` variable. Choose a separate secret name for a different account; numbers in the same account may reference the same secret. The configured `account_sid` must match incoming Twilio `AccountSid`.

Shared endpoint secrets:

- `TWILIO_CONFIRMATION_WEBHOOK_URL=https://<project-ref>.supabase.co/functions/v1/receive-appointment-confirmation`
- `TWILIO_MESSAGE_STATUS_WEBHOOK_URL=https://<project-ref>.supabase.co/functions/v1/client-message-status`

These must be the exact externally configured HTTPS URLs, without query parameters. The send handler adds its message ID to the status callback URL. Preserve the existing `REMINDER_CRON_SECRET` and reminder schedule. The old global Twilio credential secrets are no longer used by these updated functions; do not remove them while other deployed functions still depend on them.

## Expected behavior and limits

- Existing `appointment_sms_message` reminder/confirmation logs are backfilled and future writes mirrored. Texts previously discarded by the old webhook cannot be recovered from the app database; examine Twilio logs separately if needed.
- Each reply is routed by the business number in `To`, then matched to a unique client number **inside that business**. A new sender is still saved and visible by phone number. To reply, add a unique client with that number and recorded SMS consent, then use New message to link the thread.
- Sending validates active staff membership, subscription access, current client phone number, archive state, SMS consent, and opt-out state server-side. Unicode and multipart messages consume the appropriate segment allowance. Reserved segments remain consumed after a provider failure or timeout, to avoid undercounting ambiguous sends.
- Confirmation replies still update one unambiguous upcoming appointment associated with a recent reminder. A service question never triggers the old “Reply C” canned response. If several appointments could match, the text is saved for staff to clarify.
- STOP/opt-out keywords block the thread and revoke client SMS consent. Re-enabling a thread is intentionally an administrator operation after verifying a fresh client opt-in in Twilio; do not clear flags merely to bypass an opt-out. Then restore the client's consent through Clients.
- An interrupted send keeps its request ID. Check send status reuses that request instead of creating another message. A send left `pending` or `unknown` requires checking Twilio logs before manually reconciling its status; the app deliberately does not retry the provider automatically.
- “Queued” means accepted by Twilio, not delivered. Signed status callbacks advance messages to sent/delivered/failed/undelivered and cannot downgrade a terminal status.
- SMS text is supported in this first version. MMS attachments are identified by count and must be viewed in Twilio; files are not downloaded into the app. Automatic TwiML confirmation acknowledgments are not part of the conversation log.
- The existing deployed `send-client-notification` (pickup/email notifications) has no source in this repository. Its history cannot be imported or mirrored without that function and its log schema. It remains separate from this change; do not overwrite or redeploy it with an invented implementation. New custom texts and reminder history are included here.

## Validation

- `npm run test:run` includes custom reply, read-only, opt-out, retry/idempotency UI flows, phone normalization, SMS segment counting, and callback ordering.
- `npm run test:messaging-db` runs the real migration in disposable PGlite/Postgres fixtures: tenant isolation, privileged RPC access, duplicate webhooks, unidentified contacts, per-user unread markers, opt-out consent, reminder mirroring, and SMS quota limits.
- `deno test --allow-env --allow-read supabase/tests/messaging-webhooks.test.ts` tests the actual send/receive/status handlers with mocked HTTP: signatures, account routing, idempotency, authorization, consent, quota, confirmations and callback ordering.
- `npm run build` and `npm run smoke` validate the web build. Deno type-check the four changed Edge Functions separately.

Before production, send a question from a consenting test client; read and reply in Messages; check the Twilio delivery callback; test STOP; replay a webhook; verify two businesses with the same client phone number never see each other's texts; and confirm a reminder with `C`. Test using the actual staging Twilio/Supabase configuration, including webhook signatures, since local tests use no live credentials.
