import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizeSmsPhone, smsSegments } from "../_shared/sms.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

// The scheduled worker is deliberately opt-in for custom schedules. Businesses
// without a custom schedule continue using their existing 24/48h + 1h setup.
type Settings = {
  business_id: string;
  client_sms_reminders_enabled: boolean;
  initial_reminder_hours: 24 | 48;
  one_hour_reminder_enabled: boolean;
  reminder_message_template: string;
};
type Appointment = {
  id: string;
  business_id: string;
  client_id: number;
  start_at: string;
  status: string;
};
type ReminderSchedule = {
  id: string;
  business_id: string;
  minutes_before: number;
  message_type: "reminder" | "confirmation";
  message_template: string;
  enabled: boolean;
};
type SendJob = {
  kind:
    | "manual_reminder"
    | "initial_reminder"
    | "one_hour_reminder"
    | "scheduled_reminder";
  scheduleId?: string;
  template?: string;
};

const HOUR_MS = 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
// Match this to the cron cadence before enabling custom SMS. A one-hour
// lookback tolerates an hourly invocation without sending days-late reminders.
const DUE_GRACE_MS = HOUR_MS;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: cors });
  if (request.method !== "POST")
    return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceKey)
    return json({ error: "Supabase configuration missing." }, 500);
  const cronSecret = Deno.env.get("REMINDER_CRON_SECRET") ?? "";
  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false },
  });
  const input = await request.json().catch(() => ({}));
  const appointmentId =
    typeof input.appointmentId === "string" ? input.appointmentId : null;
  const manual = Boolean(appointmentId);

  if (manual) {
    const token = request.headers
      .get("Authorization")
      ?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Sign in to send a reminder." }, 401);
    const { data: userData, error: userError } =
      await admin.auth.getUser(token);
    if (userError || !userData.user)
      return json({ error: "Sign in to send a reminder." }, 401);
    const { data: appointment } = await admin
      .from("appointment")
      .select("business_id")
      .eq("id", appointmentId!)
      .maybeSingle();
    if (!appointment) return json({ error: "Appointment not found." }, 404);
    const { data: staff } = await admin
      .from("STAFF")
      .select("id")
      .eq("business_id", appointment.business_id)
      .eq("auth_user_id", userData.user.id)
      .eq("is_active", true)
      .maybeSingle();
    if (!staff) return json({ error: "Not authorized." }, 403);
  } else if (
    !cronSecret ||
    request.headers.get("x-reminder-secret") !== cronSecret
  ) {
    return json({ error: "Not authorized." }, 401);
  }

  const now = new Date();
  const { data: allSettings, error: settingsError } = await admin
    .from("business_notification_settings")
    .select(
      "business_id, client_sms_reminders_enabled, initial_reminder_hours, one_hour_reminder_enabled, reminder_message_template",
    );
  if (settingsError) return json({ error: settingsError.message }, 500);
  const settingsByBusiness = new Map<string, Settings>(
    ((allSettings ?? []) as Settings[]).map((row) => [row.business_id, row]),
  );

  const { data: schedules, error: scheduleError } = await admin
    .from("business_appointment_reminder_schedule")
    .select(
      "id, business_id, minutes_before, message_type, message_template, enabled",
    );
  if (scheduleError) return json({ error: scheduleError.message }, 500);
  const schedulesByBusiness = new Map<string, ReminderSchedule[]>();
  for (const schedule of (schedules ?? []) as ReminderSchedule[]) {
    const current = schedulesByBusiness.get(schedule.business_id) ?? [];
    current.push(schedule);
    schedulesByBusiness.set(schedule.business_id, current);
  }

  const maxMinutes = Math.max(
    49 * 60,
    ...((schedules ?? []) as ReminderSchedule[])
      .filter((schedule) => schedule.enabled)
      .map((schedule) => schedule.minutes_before),
  );
  let query = admin
    .from("appointment")
    .select("id, business_id, client_id, start_at, status")
    .gt("start_at", now.toISOString())
    .not("status", "in", "(cancelled,canceled,completed,no_show,void)");
  query = manual
    ? query.eq("id", appointmentId!)
    : query.lte(
        "start_at",
        new Date(now.getTime() + maxMinutes * MINUTE_MS).toISOString(),
      );
  const { data: appointments, error: appointmentError } = await query;
  if (appointmentError) return json({ error: appointmentError.message }, 500);

  const results: Array<Record<string, unknown>> = [];
  for (const appointment of (appointments ?? []) as Appointment[]) {
    const settings = settingsByBusiness.get(appointment.business_id);
    if (!manual && !settings?.client_sms_reminders_enabled) continue;
    const appointmentTime = new Date(appointment.start_at).getTime();
    const untilAppointment = appointmentTime - now.getTime();
    const businessSchedules =
      schedulesByBusiness.get(appointment.business_id) ?? [];
    const jobs: SendJob[] = [];

    if (manual) {
      jobs.push({ kind: "manual_reminder" });
    } else if (businessSchedules.length > 0) {
      // An explicitly disabled custom schedule must NOT fall back to legacy SMS.
      for (const schedule of businessSchedules) {
        if (!schedule.enabled) continue;
        const dueAt = appointmentTime - schedule.minutes_before * MINUTE_MS;
        const lateness = now.getTime() - dueAt;
        if (lateness >= 0 && lateness < DUE_GRACE_MS) {
          jobs.push({
            kind: "scheduled_reminder",
            scheduleId: schedule.id,
            template: schedule.message_template,
          });
        }
      }
    } else {
      const hoursAway = untilAppointment / HOUR_MS;
      if (
        settings &&
        hoursAway <= settings.initial_reminder_hours &&
        hoursAway > 1
      ) {
        jobs.push({ kind: "initial_reminder" });
      }
      if (settings?.one_hour_reminder_enabled && hoursAway <= 1) {
        jobs.push({ kind: "one_hour_reminder" });
      }
    }
    if (!jobs.length) continue;

    const { data: smsNumber, error: smsNumberError } = await admin
      .from("business_sms_number")
      .select("phone_number, account_sid, auth_token_secret")
      .eq("business_id", appointment.business_id)
      .maybeSingle();
    const twilioToken = smsNumber
      ? Deno.env.get(smsNumber.auth_token_secret)
      : null;
    if (smsNumberError || !smsNumber || !twilioToken) {
      results.push({
        appointmentId: appointment.id,
        status: "skipped",
        reason: "Business Twilio connection is not configured.",
      });
      continue;
    }

    const { data: client, error: clientError } = await admin
      .from("CLIENT")
      .select("id, FirstName, PhoneNumber, sms_consent")
      .eq("id", appointment.client_id)
      .eq("business_id", appointment.business_id)
      .maybeSingle();
    if (clientError || !client?.sms_consent || !client.PhoneNumber) {
      results.push({
        appointmentId: appointment.id,
        status: "skipped",
        reason: "Client SMS consent or phone number is missing.",
      });
      continue;
    }
    const phone = normalizeSmsPhone(client.PhoneNumber);
    if (!phone) {
      results.push({
        appointmentId: appointment.id,
        status: "skipped",
        reason: "Invalid client phone number.",
      });
      continue;
    }
    const { data: conversation, error: optOutError } = await admin
      .from("client_conversation")
      .select("sms_opted_out")
      .eq("business_id", appointment.business_id)
      .eq("phone_number", phone)
      .maybeSingle();
    if (optOutError || conversation?.sms_opted_out) {
      results.push({
        appointmentId: appointment.id,
        status: "skipped",
        reason: "Client SMS is unavailable or opted out.",
      });
      continue;
    }

    const [{ data: business }, { data: links }, { data: profile }] =
      await Promise.all([
        admin
          .from("business")
          .select("business_name")
          .eq("id", appointment.business_id)
          .maybeSingle(),
        admin
          .from("appointment_pet")
          .select("pet_id")
          .eq("appointment_id", appointment.id),
        admin
          .from("business_settings")
          .select("time_zone")
          .eq("business_id", appointment.business_id)
          .maybeSingle(),
      ]);
    const petIds = (links ?? []).map((link) => link.pet_id);
    const { data: pets } = petIds.length
      ? await admin.from("PET").select("PetName").in("id", petIds)
      : { data: [] as Array<{ PetName: string }> };
    const timeZone = profile?.time_zone ?? "America/Chicago";
    const start = new Date(appointment.start_at);
    const tokens: Record<string, string> = {
      "{client_first_name}": client.FirstName ?? "there",
      "{business_name}": business?.business_name ?? "your pet care provider",
      "{pet_names}":
        (pets ?? []).map((pet) => pet.PetName).join(" and ") || "Your pet",
      "{appointment_date}": start.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        timeZone,
      }),
      "{appointment_time}": start.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone,
      }),
    };

    for (const job of jobs) {
      const template =
        job.template ??
        (job.kind === "one_hour_reminder"
          ? "Reminder from {business_name}: {pet_names}'s appointment is in one hour at {appointment_time}. Reply C to confirm."
          : (settings?.reminder_message_template ??
            "Hi {client_first_name}, {pet_names} has an appointment with {business_name} on {appointment_date} at {appointment_time}. Reply C to confirm."));
      const body = Object.entries(tokens).reduce(
        (message, [key, value]) => message.replaceAll(key, value),
        template,
      );
      const { data: log, error: logError } = await admin
        .from("appointment_sms_message")
        .insert({
          business_id: appointment.business_id,
          appointment_id: appointment.id,
          client_id: client.id,
          direction: "outbound",
          message_kind: job.kind,
          reminder_schedule_id: job.scheduleId ?? null,
          phone_number: phone,
          message_body: body,
        })
        .select("id")
        .maybeSingle();
      if (logError) {
        if (logError.code !== "23505") {
          results.push({
            appointmentId: appointment.id,
            kind: job.kind,
            status: "failed",
            reason: logError.message,
          });
        }
        continue;
      }
      if (!log) continue;
      const segments = smsSegments(body);
      const { data: quota, error: quotaError } = await admin.rpc(
        "reserve_reminder_sms_segments",
        {
          p_business_id: appointment.business_id,
          p_segments: segments,
        },
      );
      if (quotaError || !quota?.[0]?.allowed) {
        await admin
          .from("appointment_sms_message")
          .update({
            status: "failed",
            error_message: "Monthly SMS allowance unavailable or reached.",
          })
          .eq("id", log.id);
        results.push({
          appointmentId: appointment.id,
          kind: job.kind,
          status: "skipped",
          reason: "SMS allowance unavailable.",
        });
        continue;
      }
      try {
        const form = new URLSearchParams({
          To: phone,
          From: smsNumber.phone_number,
          Body: body,
        });
        const response = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${smsNumber.account_sid}/Messages.json`,
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${btoa(`${smsNumber.account_sid}:${twilioToken}`)}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: form,
          },
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          await admin
            .from("appointment_sms_message")
            .update({
              status: "failed",
              error_message: payload.message ?? "Twilio rejected the message.",
            })
            .eq("id", log.id);
          results.push({
            appointmentId: appointment.id,
            kind: job.kind,
            status: "failed",
            reason: "Twilio rejected the message.",
          });
          continue;
        }
        await admin
          .from("appointment_sms_message")
          .update({
            status: "sent",
            provider_message_id: payload.sid,
            sent_at: new Date().toISOString(),
          })
          .eq("id", log.id);
        results.push({
          appointmentId: appointment.id,
          kind: job.kind,
          scheduleId: job.scheduleId,
          status: "sent",
        });
      } catch (error) {
        await admin
          .from("appointment_sms_message")
          .update({
            status: "failed",
            error_message:
              error instanceof Error ? error.message : "SMS send failed.",
          })
          .eq("id", log.id);
        results.push({
          appointmentId: appointment.id,
          kind: job.kind,
          status: "failed",
        });
      }
    }
  }
  return json({ success: true, results });
});
