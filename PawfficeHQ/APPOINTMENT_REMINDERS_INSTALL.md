# Appointment text reminders

## Deploy

1. Apply `supabase/migrations/202608310001_sms_appointment_reminders.sql`.
2. Deploy `process-appointment-reminders` with JWT verification enabled.
3. Deploy `receive-appointment-confirmation` with JWT verification disabled (Twilio signs each webhook request).
4. Add function secrets already used for SMS: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_PHONE_NUMBER`.
5. Add a long random `REMINDER_CRON_SECRET`.
6. Add `TWILIO_CONFIRMATION_WEBHOOK_URL` with the exact public URL of `receive-appointment-confirmation`.

## Twilio inbound webhook

In the Twilio phone-number settings, set **A message comes in** to:

`https://<project-ref>.supabase.co/functions/v1/receive-appointment-confirmation`

Use HTTP `POST`.

## Scheduler

Call `process-appointment-reminders` every five minutes with HTTP `POST` and this header:

`x-reminder-secret: <REMINDER_CRON_SECRET>`

The function is idempotent. A database uniqueness constraint prevents the same automatic reminder from being sent twice.

## Test checklist

- Record SMS consent on a test client with a real mobile number.
- Enable client reminders in Settings and choose 24 or 48 hours.
- Use **Send text reminder now** on a future appointment.
- Reply `C` to the text and verify the appointment shows **Client confirmed by text**.
- Confirm cancelled appointments and clients without consent receive no automatic messages.
