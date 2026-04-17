-- Staff Portal upgrade: bootstrap permission system, archiving, job titles,
-- dashboard/staff-directory permissions, admin seeding.
-- See plan: mighty-chasing-ripple.md

-- =========================================================
-- 0. Bootstrap permission tables (referenced by code but not yet created)
-- =========================================================
create table if not exists permissions (
  key          text primary key,
  label        text not null,
  category     text,
  description  text,
  sort_order   int default 100,
  created_at   timestamptz not null default now()
);

create table if not exists role_permissions (
  role            text not null,
  permission_key  text not null references permissions(key) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (role, permission_key)
);

create table if not exists user_permissions (
  app_user_id    uuid not null references app_users(id) on delete cascade,
  permission_key text not null references permissions(key) on delete cascade,
  granted        boolean not null,
  granted_by     uuid references app_users(id),
  created_at     timestamptz not null default now(),
  primary key (app_user_id, permission_key)
);

create index if not exists idx_role_permissions_role on role_permissions(role);
create index if not exists idx_user_permissions_user on user_permissions(app_user_id);

-- =========================================================
-- 1. Archive columns + job_title_id on app_users
-- =========================================================
alter table app_users
  add column if not exists is_archived  boolean not null default false,
  add column if not exists archived_at  timestamptz,
  add column if not exists archived_by  uuid references app_users(id),
  add column if not exists job_title_id uuid;

-- =========================================================
-- 2. Job titles
-- =========================================================
create table if not exists job_titles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  color       text,
  is_archived boolean not null default false,
  created_by  uuid references app_users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists job_title_permissions (
  job_title_id   uuid not null references job_titles(id) on delete cascade,
  permission_key text not null references permissions(key) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (job_title_id, permission_key)
);

do $$ begin
  alter table app_users
    add constraint app_users_job_title_fk
    foreign key (job_title_id) references job_titles(id) on delete set null;
exception when duplicate_object then null; end $$;

-- =========================================================
-- 3. get_effective_permissions: union role + title + granted, minus revoked
-- =========================================================
create or replace function get_effective_permissions(p_app_user_id uuid)
returns setof text
language sql stable
security definer
set search_path = public as $$
  with u as (
    select role, job_title_id
      from app_users
     where id = p_app_user_id
  ),
  role_perms as (
    select rp.permission_key
      from role_permissions rp, u
     where rp.role = u.role
  ),
  title_perms as (
    select jtp.permission_key
      from job_title_permissions jtp, u
     where u.job_title_id is not null
       and jtp.job_title_id = u.job_title_id
  ),
  granted as (
    select permission_key
      from user_permissions
     where app_user_id = p_app_user_id and granted = true
  ),
  revoked as (
    select permission_key
      from user_permissions
     where app_user_id = p_app_user_id and granted = false
  ),
  base as (
    select permission_key from role_perms
    union
    select permission_key from title_perms
    union
    select permission_key from granted
  )
  select permission_key
    from base
   where permission_key not in (select permission_key from revoked);
$$;

grant execute on function get_effective_permissions(uuid) to anon, authenticated, service_role;

-- =========================================================
-- 4. Seed admin role for the four named emails
-- =========================================================
update app_users set role = 'admin'
 where lower(email) in (
   'justin@within.center',
   'lauren@awknranch.com',
   'william@awknranch.com',
   'wdnaylor@gmail.com'
 )
 and role not in ('admin','oracle');

-- =========================================================
-- 5. Seed canonical permissions
-- =========================================================
insert into permissions (key, label, category, description, sort_order) values
  -- Core staff pages
  ('view_dashboard',        'View Dashboard',        'staff', 'Staff portal landing dashboard',  10),
  ('view_staff_directory',  'View Staff Directory',  'staff', 'See the staff directory',         20),
  ('view_crm',              'View CRM',              'staff', 'See CRM pipeline and leads',      100),
  ('view_memberships',      'View Memberships',      'staff', 'See AWKN Memberships',            110),
  ('view_scheduler',        'View Scheduler',        'staff', 'Use the staff scheduler',         120),
  ('view_calendar',         'View Calendar',         'staff', 'See the shared calendar',         130),
  -- Existing tabs (synced here so DB has them from the start)
  ('view_rentals',          'View Rentals',          'staff', 'Reservations/rentals view',       140),
  ('view_events',           'View Events',           'staff', 'Events view',                     150),
  ('view_purchases',        'View Sales',            'staff', 'Sales/purchases view',            160),
  ('view_inventory',        'View Inventory',        'staff', 'Inventory view',                  170),
  ('view_spaces',           'View Spaces',           'staff', 'Spaces admin view',               180),
  ('view_media',            'View Media',            'staff', 'Media admin view',                190),
  ('view_sms',              'View SMS',              'staff', 'SMS inbox/outbox',                200),
  ('view_hours',            'View Workstuff',        'staff', 'Associate hours view',            210),
  ('view_faq',              'View FAQ',              'staff', 'FAQ/AI admin',                    220),
  ('view_voice',            'View Voice',            'staff', 'Concierge/voice admin',           230),
  ('view_todo',             'View Todo',             'staff', 'Todo lists',                      240),
  ('view_appdev',           'View App Dev',          'staff', 'App Dev console',                 250),
  -- Admin-only
  ('manage_users',          'Manage Users',          'admin', 'Add / archive / edit staff',      300),
  ('manage_permissions',    'Manage Permissions',    'admin', 'Edit per-user permissions',      305),
  ('manage_job_titles',     'Manage Job Titles',     'admin', 'Create and edit job titles',      310),
  ('view_users',            'View Users',            'admin', 'See the users list',              320),
  ('view_passwords',        'View Passwords',        'admin', 'Password vault',                  330),
  ('view_settings',         'View Settings',         'admin', 'Org settings',                    340),
  ('view_templates',        'View Templates',        'admin', 'Document/email templates',        350),
  ('view_accounting',       'View Accounting',       'admin', 'Accounting admin',                360),
  ('view_testdev',          'View Test Dev',         'admin', 'Test dev tooling',                370),
  ('view_openclaw',         'View AlpaClaw',         'admin', 'AlpaClaw internals',              380),
  ('view_devcontrol',       'View DevControl',       'admin', 'DevControl panel',                390)
on conflict (key) do nothing;

-- =========================================================
-- 6. Default role -> permission assignments
-- =========================================================

-- Everyone signed in sees Dashboard + Staff directory
insert into role_permissions (role, permission_key)
select r, k
  from unnest(array['staff','admin','oracle','resident','associate','demo']) r
  cross join unnest(array['view_dashboard','view_staff_directory']) k
on conflict do nothing;

-- Staff (+admin, oracle) get all staff-section view_* permissions
insert into role_permissions (role, permission_key)
select r, p.key
  from unnest(array['staff','admin','oracle']) r
  cross join permissions p
 where p.category = 'staff'
on conflict do nothing;

-- Admin/oracle get all admin-section permissions
insert into role_permissions (role, permission_key)
select r, p.key
  from unnest(array['admin','oracle']) r
  cross join permissions p
 where p.category = 'admin'
on conflict do nothing;

-- =========================================================
-- 7. Indexes
-- =========================================================
create index if not exists idx_app_users_job_title_id on app_users(job_title_id);
create index if not exists idx_app_users_is_archived  on app_users(is_archived) where is_archived = false;
create index if not exists idx_job_title_permissions_title on job_title_permissions(job_title_id);

-- =========================================================
-- 8. RLS policies
-- =========================================================
alter table permissions            enable row level security;
alter table role_permissions       enable row level security;
alter table user_permissions       enable row level security;
alter table job_titles             enable row level security;
alter table job_title_permissions  enable row level security;

-- Read: any authenticated user can see permissions metadata, role mappings, job titles.
drop policy if exists permissions_read on permissions;
create policy permissions_read on permissions
  for select using (auth.role() = 'authenticated');

drop policy if exists role_permissions_read on role_permissions;
create policy role_permissions_read on role_permissions
  for select using (auth.role() = 'authenticated');

drop policy if exists user_permissions_read on user_permissions;
create policy user_permissions_read on user_permissions
  for select using (auth.role() = 'authenticated');

drop policy if exists job_titles_read on job_titles;
create policy job_titles_read on job_titles
  for select using (auth.role() = 'authenticated');

drop policy if exists job_title_permissions_read on job_title_permissions;
create policy job_title_permissions_read on job_title_permissions
  for select using (auth.role() = 'authenticated');

-- Write: admin/oracle only
do $$
declare
  t text;
begin
  for t in select unnest(array['permissions','role_permissions','user_permissions','job_titles','job_title_permissions']) loop
    execute format('drop policy if exists %I_write on %I', t, t);
    execute format($f$
      create policy %I_write on %I
        for all using (
          exists (
            select 1 from app_users
             where auth_user_id = auth.uid()
               and role in ('admin','oracle')
          )
        ) with check (
          exists (
            select 1 from app_users
             where auth_user_id = auth.uid()
               and role in ('admin','oracle')
          )
        )
    $f$, t, t);
  end loop;
end $$;
