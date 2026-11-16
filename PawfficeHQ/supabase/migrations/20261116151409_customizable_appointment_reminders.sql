
-- Custom appointment reminders for each business

CREATE TABLE public.business_appointment_reminder_schedule (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    business_id uuid NOT NULL
        REFERENCES public.business(id) ON DELETE CASCADE,

    minutes_before integer NOT NULL
        CHECK (minutes_before >= 0 AND minutes_before <= 43200),

    message_type text NOT NULL DEFAULT 'reminder'
        CHECK (message_type IN ('reminder', 'confirmation')),

    message_template text NOT NULL DEFAULT
        'Hi {client_first_name}, {pet_names} has an appointment with {business_name} on {appointment_date} at {appointment_time}.',

    enabled boolean NOT NULL DEFAULT true,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT unique_business_reminder_timing
        UNIQUE (business_id, minutes_before)
);

-- Make business reminder lookups efficient.
CREATE INDEX business_reminder_schedule_lookup
ON public.business_appointment_reminder_schedule
    (business_id, enabled, minutes_before);

-- Enable business-level security.
ALTER TABLE public.business_appointment_reminder_schedule
ENABLE ROW LEVEL SECURITY;

-- Restrict API access to authenticated users.
REVOKE ALL ON public.business_appointment_reminder_schedule
FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.business_appointment_reminder_schedule
TO authenticated;

-- Active staff can view their business's schedules.
CREATE POLICY "Staff can view business reminder schedules"
ON public.business_appointment_reminder_schedule
FOR SELECT TO authenticated
USING (
    has_subscription_access(business_id)
    AND EXISTS (
        SELECT 1
        FROM public."STAFF" staff_member
        WHERE staff_member.auth_user_id = (SELECT auth.uid())
          AND staff_member.business_id =
              business_appointment_reminder_schedule.business_id
          AND staff_member.is_active = true
    )
);

-- Managers can add reminders.
CREATE POLICY "Managers can create reminder schedules"
ON public.business_appointment_reminder_schedule
FOR INSERT TO authenticated
WITH CHECK (
    can_manage_staff(business_id)
    AND has_subscription_access(business_id)
);

-- Managers can edit reminders.
CREATE POLICY "Managers can update reminder schedules"
ON public.business_appointment_reminder_schedule
FOR UPDATE TO authenticated
USING (
    can_manage_staff(business_id)
    AND has_subscription_access(business_id)
)
WITH CHECK (
    can_manage_staff(business_id)
    AND has_subscription_access(business_id)
);

-- Managers can delete reminders.
CREATE POLICY "Managers can delete reminder schedules"
ON public.business_appointment_reminder_schedule
FOR DELETE TO authenticated
USING (
    can_manage_staff(business_id)
    AND has_subscription_access(business_id)
);


-- Support a business-scoped foreign key.
ALTER TABLE public.business_appointment_reminder_schedule
ADD CONSTRAINT business_reminder_schedule_id_business_unique
UNIQUE (id, business_id);

-- Preserve SMS history when a schedule is deleted.
ALTER TABLE public.appointment_sms_message
ADD COLUMN reminder_schedule_id uuid;

-- A message may only reference a schedule
-- belonging to the same business.
ALTER TABLE public.appointment_sms_message
ADD CONSTRAINT appointment_sms_schedule_business_fkey
FOREIGN KEY (reminder_schedule_id, business_id)
REFERENCES public.business_appointment_reminder_schedule
    (id, business_id)
ON DELETE SET NULL (reminder_schedule_id);


-- Allow the new customizable reminder message type.
ALTER TABLE public.appointment_sms_message
DROP CONSTRAINT appointment_sms_message_message_kind_check;

ALTER TABLE public.appointment_sms_message
ADD CONSTRAINT appointment_sms_message_message_kind_check
CHECK (
    message_kind IN (
        'initial_reminder',
        'one_hour_reminder',
        'confirmation_reply',
        'manual_reminder',
        'scheduled_reminder'
    )
);

-- Prevent a custom schedule from sending twice
-- for the same appointment.
CREATE UNIQUE INDEX appointment_sms_one_scheduled_reminder
ON public.appointment_sms_message
    (appointment_id, reminder_schedule_id)
WHERE direction = 'outbound'
  AND message_kind = 'scheduled_reminder'
  AND reminder_schedule_id IS NOT NULL;

-- Speed up schedule-related message lookups.
CREATE INDEX appointment_sms_schedule_lookup
ON public.appointment_sms_message (reminder_schedule_id)
WHERE reminder_schedule_id IS NOT NULL;
