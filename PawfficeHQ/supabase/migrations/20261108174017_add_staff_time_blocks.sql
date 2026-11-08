
-- PawfficeHQ: Employee-specific calendar time blocks
-- Phase 1: Storage and access control only.
-- Does not modify appointment scheduling or drag-and-drop.

-- 1. Ensure a time block's employee belongs to its business.
ALTER TABLE public."STAFF"
ADD CONSTRAINT staff_id_business_unique
UNIQUE (id, business_id);

-- 2. Create time-block storage.
CREATE TABLE public.staff_time_block (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    business_id uuid NOT NULL
        REFERENCES public.business(id)
        ON DELETE CASCADE,

    staff_id uuid NOT NULL,

    title text NOT NULL DEFAULT 'Unavailable',
    notes text,

    start_at timestamptz NOT NULL,
    end_at timestamptz NOT NULL,

    created_by uuid DEFAULT auth.uid(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT staff_time_block_staff_business_fk
        FOREIGN KEY (staff_id, business_id)
        REFERENCES public."STAFF"(id, business_id)
        ON DELETE CASCADE,

    CONSTRAINT staff_time_block_valid_times
        CHECK (end_at > start_at),

    CONSTRAINT staff_time_block_title_not_empty
        CHECK (length(trim(title)) > 0)
);

-- 3. Optimize availability lookups.
CREATE INDEX staff_time_block_staff_time_idx
ON public.staff_time_block (
    business_id,
    staff_id,
    start_at,
    end_at
);

-- 4. Enable Row Level Security.
ALTER TABLE public.staff_time_block
ENABLE ROW LEVEL SECURITY;

-- 5. Business employees may view availability.
-- This policy intentionally does not grant access to
-- private event details; column permissions below
-- restrict what ordinary employees can read.
CREATE POLICY "Staff can view business availability"
ON public.staff_time_block
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public."STAFF" current_staff
        WHERE current_staff.auth_user_id = (SELECT auth.uid())
          AND current_staff.business_id =
              staff_time_block.business_id
          AND current_staff.is_active = true
    )
);

-- 6. Owners may create blocks for their employees.
-- Other employees may create blocks for themselves.
CREATE POLICY "Authorized staff can create time blocks"
ON public.staff_time_block
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public."STAFF" current_staff
        WHERE current_staff.auth_user_id = (SELECT auth.uid())
          AND current_staff.business_id =
              staff_time_block.business_id
          AND current_staff.is_active = true
          AND (
              current_staff.role = 'owner'
              OR current_staff.id =
                  staff_time_block.staff_id
          )
    )
);

-- 7. Authorized users may edit their own or
-- their business employees' blocks.
CREATE POLICY "Authorized staff can update time blocks"
ON public.staff_time_block
FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public."STAFF" current_staff
        WHERE current_staff.auth_user_id = (SELECT auth.uid())
          AND current_staff.business_id =
              staff_time_block.business_id
          AND current_staff.is_active = true
          AND (
              current_staff.role = 'owner'
              OR current_staff.id =
                  staff_time_block.staff_id
          )
    )
)
WITH CHECK (
    EXISTS (
        SELECT 1
        FROM public."STAFF" current_staff
        WHERE current_staff.auth_user_id = (SELECT auth.uid())
          AND current_staff.business_id =
              staff_time_block.business_id
          AND current_staff.is_active = true
          AND (
              current_staff.role = 'owner'
              OR current_staff.id =
                  staff_time_block.staff_id
          )
    )
);

-- 8. Authorized users may remove blocks.
CREATE POLICY "Authorized staff can delete time blocks"
ON public.staff_time_block
FOR DELETE
TO authenticated
USING (
    EXISTS (
        SELECT 1
        FROM public."STAFF" current_staff
        WHERE current_staff.auth_user_id = (SELECT auth.uid())
          AND current_staff.business_id =
              staff_time_block.business_id
          AND current_staff.is_active = true
          AND (
              current_staff.role = 'owner'
              OR current_staff.id =
                  staff_time_block.staff_id
          )
    )
);

-- 9. Explicit API permissions.
REVOKE ALL ON public.staff_time_block
FROM PUBLIC, anon, authenticated;

GRANT SELECT (
    id,
    business_id,
    staff_id,
    start_at,
    end_at,
    created_at
)
ON public.staff_time_block
TO authenticated;

GRANT INSERT (
    business_id,
    staff_id,
    title,
    notes,
    start_at,
    end_at
)
ON public.staff_time_block
TO authenticated;

GRANT UPDATE (
    title,
    notes,
    start_at,
    end_at
)
ON public.staff_time_block
TO authenticated;

GRANT DELETE
ON public.staff_time_block
TO authenticated;
