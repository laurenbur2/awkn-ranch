-- ========================================================================
-- Scheduling Tool v1 — Calendly-style extension
-- Adds: multiple event types per staff, atomic booking guard, reminder
-- columns, CRM lead linkage, permissions. Drops anon-insert RLS so
-- bookings must go through the edge function.
-- ========================================================================

-- 1. Event types: one profile can have many bookable event types.
create table if not exists scheduling_event_types (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references scheduling_profiles(id) on delete cascade,
  slug text not null,
  name text not null,
  description text,
  duration_minutes int not null default 30,
  buffer_minutes int not null default 0,
  advance_days int not null default 30,
  min_notice_minutes int not null default 60,
  location_type text not null default 'video',
  location_detail text,
  available_hours jsonb,
  color text,
  notify_sms_on_booking boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, slug)
);
create index if not exists scheduling_event_types_profile_idx on scheduling_event_types(profile_id);

-- 2. Extend scheduling_bookings. Live DB already has cancel_reason (not
--    cancelled_reason) and status, so we reuse those and add new columns.
alter table scheduling_bookings
  add column if not exists event_type_id uuid references scheduling_event_types(id) on delete restrict,
  add column if not exists booking_token uuid not null default gen_random_uuid(),
  add column if not exists rescheduled_from uuid references scheduling_bookings(id),
  add column if not exists cancelled_at timestamptz,
  add column if not exists booker_timezone text,
  add column if not exists reminder_24h_sent_at timestamptz,
  add column if not exists reminder_1h_sent_at timestamptz;

create index if not exists scheduling_bookings_token_idx on scheduling_bookings(booking_token);
create index if not exists scheduling_bookings_lead_idx on scheduling_bookings(lead_id);

-- 3. Seed a 'default' event type per existing profile, backfill existing
--    bookings, then make event_type_id NOT NULL so the unique index below
--    actually enforces uniqueness (NULL values are otherwise always distinct).
insert into scheduling_event_types (profile_id, slug, name, description, duration_minutes, buffer_minutes, advance_days, available_hours)
select id, 'default', coalesce(nullif(meeting_title,''), '30 Minute Meeting'), meeting_description,
       coalesce(meeting_duration, 30), coalesce(buffer_minutes, 0), coalesce(advance_days, 30), available_hours
from scheduling_profiles
on conflict do nothing;

update scheduling_bookings b
  set event_type_id = (select id from scheduling_event_types where profile_id = b.profile_id and slug = 'default' limit 1)
  where event_type_id is null;

alter table scheduling_bookings alter column event_type_id set not null;

-- 4. Atomic booking guard. Partial unique index on non-cancelled rows.
create unique index if not exists scheduling_bookings_slot_unique
  on scheduling_bookings(profile_id, event_type_id, start_datetime)
  where cancelled_at is null;

-- 5. Revoke anon DB-write access so bookings must go through the atomic
--    edge function. Keep service-role + authenticated-user policies.
drop policy if exists "Anon insert bookings" on scheduling_bookings;

-- 6. Permissions. view_scheduler seeded here explicitly since the top-menu
--    tab that auto-synced it is being removed.
insert into permissions (key, label, category, description, sort_order) values
  ('view_scheduler',    'View Scheduler',    'staff', 'Use the scheduling tool',                          120),
  ('manage_scheduling', 'Manage Scheduling', 'admin', 'See all staff scheduling setup + force toggles',   220)
on conflict (key) do nothing;

insert into role_permissions (role, permission_key)
select r, 'manage_scheduling' from unnest(array['admin','oracle']) r
on conflict do nothing;

-- 7. RLS on scheduling_event_types.
alter table scheduling_event_types enable row level security;

drop policy if exists "event_types_public_read" on scheduling_event_types;
create policy "event_types_public_read"
  on scheduling_event_types for select
  using (is_active = true);

drop policy if exists "event_types_owner_all" on scheduling_event_types;
create policy "event_types_owner_all"
  on scheduling_event_types for all
  using (exists (
    select 1 from scheduling_profiles p
    where p.id = scheduling_event_types.profile_id
      and p.app_user_id = (select id from app_users where auth_user_id = auth.uid())
  ));

drop policy if exists "event_types_admin_all" on scheduling_event_types;
create policy "event_types_admin_all"
  on scheduling_event_types for all
  using (
    exists (
      select 1 from app_users u
      join user_permissions up on up.app_user_id = u.id
      where u.auth_user_id = auth.uid()
        and up.permission_key = 'manage_scheduling' and up.granted = true
    )
    or exists (
      select 1 from app_users u
      where u.auth_user_id = auth.uid() and u.role in ('admin','oracle')
    )
  );

drop policy if exists "event_types_service_role" on scheduling_event_types;
create policy "event_types_service_role"
  on scheduling_event_types for all
  using (auth.role() = 'service_role');
