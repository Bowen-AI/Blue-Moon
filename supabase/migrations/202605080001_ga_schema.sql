-- Blue Moon GA core schema.
--
-- This migration keeps public event discovery separate from private organizer
-- and participant coordination data. Public clients should read from the safe
-- views at the bottom of the file; server routes may use the base tables with
-- the Supabase service role key.

create extension if not exists pgcrypto;

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon, authenticated;

do $$
begin
  create type public.organization_status as enum (
    'pending_review',
    'approved',
    'suspended',
    'rejected'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.organization_member_role as enum (
    'owner',
    'admin',
    'member'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.event_status as enum (
    'draft',
    'pending_review',
    'published',
    'completed',
    'cancelled',
    'rejected'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.participant_visibility as enum (
    'public',
    'private'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.participant_status as enum (
    'joined',
    'cancelled',
    'removed'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.proof_status as enum (
    'pending_review',
    'published',
    'rejected',
    'removed'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.report_status as enum (
    'open',
    'reviewing',
    'resolved',
    'dismissed'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 180),
  email text not null unique check (
    email = lower(email)
    and char_length(email) <= 254
    and position('@' in email) > 1
  ),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{2,119}$'),
  name text not null check (char_length(trim(name)) between 1 and 180),
  description text not null check (char_length(trim(description)) between 1 and 2000),
  website_url text,
  contact_name text not null check (char_length(trim(contact_name)) between 1 and 180),
  contact_email text not null check (
    contact_email = lower(contact_email)
    and char_length(contact_email) <= 254
    and position('@' in contact_email) > 1
  ),
  owner_id uuid references auth.users(id) on delete set null,
  status public.organization_status not null default 'pending_review',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id text not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_member_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create table if not exists public.events (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]{2,119}$'),
  organization_id text references public.organizations(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  source text not null default 'one_off' check (source in ('seed', 'one_off', 'organization')),
  title text not null check (char_length(trim(title)) between 1 and 180),
  category text not null check (char_length(trim(category)) between 1 and 80),
  status public.event_status not null default 'draft',
  location_name text not null check (char_length(trim(location_name)) between 1 and 240),
  city text not null check (char_length(trim(city)) between 1 and 120),
  postal_code text not null check (postal_code ~ '^[0-9]{5}$'),
  start_time timestamptz not null,
  end_time timestamptz,
  time_zone text not null default 'America/Los_Angeles',
  organizer_name text not null check (char_length(trim(organizer_name)) between 1 and 180),
  organizer_email text not null check (
    organizer_email = lower(organizer_email)
    and char_length(organizer_email) <= 254
    and position('@' in organizer_email) > 1
  ),
  organizer_role text not null default 'Local organizer',
  max_participants integer check (max_participants is null or (max_participants between 1 and 500)),
  participant_count_seed integer not null default 0 check (participant_count_seed >= 0),
  summary text not null check (char_length(trim(summary)) between 1 and 1200),
  description text not null check (char_length(trim(description)) between 1 and 4000),
  bring text,
  impact_metric text,
  proof_summary text,
  image_url text,
  image_alt text,
  instagram text,
  social_url text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  published_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_end_after_start check (end_time is null or end_time > start_time),
  constraint events_completed_have_completion check (status <> 'completed' or completed_at is not null)
);

create table if not exists public.event_participants (
  id text primary key default gen_random_uuid()::text check (id ~ '^[a-z0-9][a-z0-9_-]{2,119}$'),
  event_id text not null references public.events(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null check (char_length(trim(name)) between 1 and 180),
  email text not null check (
    email = lower(email)
    and char_length(email) <= 254
    and position('@' in email) > 1
  ),
  visibility public.participant_visibility not null default 'private',
  reminder_opt_in boolean not null default false,
  status public.participant_status not null default 'joined',
  joined_at timestamptz not null default now(),
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint participant_cancelled_at check (status <> 'cancelled' or cancelled_at is not null)
);

create table if not exists public.event_proofs (
  id uuid primary key default gen_random_uuid(),
  event_id text not null references public.events(id) on delete cascade,
  submitted_by uuid references auth.users(id) on delete set null,
  status public.proof_status not null default 'pending_review',
  summary text not null check (char_length(trim(summary)) between 1 and 2000),
  impact_metric text,
  image_url text,
  image_alt text,
  social_url text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id)
);

create table if not exists public.trust_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid references auth.users(id) on delete set null,
  reporter_email text check (
    reporter_email is null
    or (
      reporter_email = lower(reporter_email)
      and char_length(reporter_email) <= 254
      and position('@' in reporter_email) > 1
    )
  ),
  event_id text references public.events(id) on delete set null,
  organization_id text references public.organizations(id) on delete set null,
  proof_id uuid references public.event_proofs(id) on delete set null,
  reason text not null check (char_length(trim(reason)) between 1 and 180),
  details text not null check (char_length(trim(details)) between 1 and 4000),
  status public.report_status not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.early_access_requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 180),
  email text not null unique check (
    email = lower(email)
    and char_length(email) <= 254
    and position('@' in email) > 1
  ),
  interest text not null check (interest in ('Attend events', 'Create events', 'Invite organizers')),
  status text not null default 'new' check (status in ('new', 'contacted', 'converted', 'closed')),
  source text not null default 'site' check (char_length(trim(source)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_log (
  id bigserial primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(trim(action)) between 1 and 120),
  subject_table text not null check (char_length(trim(subject_table)) between 1 and 120),
  subject_id text not null check (char_length(trim(subject_id)) between 1 and 180),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.api_rate_limits (
  id uuid primary key default gen_random_uuid(),
  route text not null check (char_length(trim(route)) between 1 and 80),
  subject_hash text not null check (subject_hash ~ '^[a-f0-9]{64}$'),
  window_start timestamptz not null,
  window_seconds integer not null check (window_seconds between 60 and 86400),
  request_count integer not null default 0 check (request_count >= 0),
  blocked_count integer not null default 0 check (blocked_count >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists organizations_status_idx on public.organizations(status);
create index if not exists organization_members_user_idx on public.organization_members(user_id);
create index if not exists events_status_start_time_idx on public.events(status, start_time);
create index if not exists events_city_postal_idx on public.events(city, postal_code);
create index if not exists events_organization_idx on public.events(organization_id);
create index if not exists event_participants_event_idx on public.event_participants(event_id);
create index if not exists event_participants_email_idx on public.event_participants(email);
create unique index if not exists event_participants_one_active_email_per_event_idx
  on public.event_participants(event_id, email)
  where status = 'joined';
create index if not exists event_proofs_event_status_idx on public.event_proofs(event_id, status);
create index if not exists trust_reports_status_idx on public.trust_reports(status, created_at);
create index if not exists early_access_requests_status_idx on public.early_access_requests(status, created_at);
create index if not exists audit_log_subject_idx on public.audit_log(subject_table, subject_id, created_at);
create unique index if not exists api_rate_limits_route_subject_window_idx
  on public.api_rate_limits(route, subject_hash, window_start);
create index if not exists api_rate_limits_expires_idx on public.api_rate_limits(expires_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.event_is_published(requested_event_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events event
    where event.id = requested_event_id
      and event.status = 'published'
  );
$$;

create or replace function private.event_is_completed(requested_event_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.events event
    where event.id = requested_event_id
      and event.status = 'completed'
  );
$$;

create or replace function public.record_api_rate_limit_hit(
  requested_route text,
  requested_subject_hash text,
  requested_window_start timestamptz,
  requested_window_seconds integer,
  requested_limit integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  hit public.api_rate_limits%rowtype;
  request_allowed boolean;
  retry_after_seconds integer;
begin
  if requested_limit < 1 or requested_limit > 10000 then
    raise exception 'invalid requested_limit';
  end if;

  if requested_window_seconds < 60 or requested_window_seconds > 86400 then
    raise exception 'invalid requested_window_seconds';
  end if;

  if requested_subject_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'invalid requested_subject_hash';
  end if;

  insert into public.api_rate_limits (
    route,
    subject_hash,
    window_start,
    window_seconds,
    request_count,
    blocked_count,
    expires_at
  ) values (
    trim(requested_route),
    requested_subject_hash,
    requested_window_start,
    requested_window_seconds,
    1,
    0,
    requested_window_start + make_interval(secs => requested_window_seconds)
  )
  on conflict (route, subject_hash, window_start)
  do update set
    request_count = public.api_rate_limits.request_count + 1,
    window_seconds = excluded.window_seconds,
    expires_at = excluded.expires_at,
    updated_at = now()
  returning * into hit;

  request_allowed := hit.request_count <= requested_limit;

  if not request_allowed then
    update public.api_rate_limits
    set
      blocked_count = blocked_count + 1,
      updated_at = now()
    where id = hit.id
    returning * into hit;
  end if;

  retry_after_seconds := greatest(1, ceil(extract(epoch from (hit.expires_at - now())))::integer);

  return jsonb_build_object(
    'allowed', request_allowed,
    'requestCount', hit.request_count,
    'limit', requested_limit,
    'retryAfterSeconds', retry_after_seconds
  );
end;
$$;

create or replace function public.join_published_event(
  requested_join_id text,
  requested_event_id text,
  participant_name text,
  participant_email text,
  requested_visibility public.participant_visibility,
  requested_reminder_opt_in boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_event public.events%rowtype;
  active_count integer;
  saved_id text;
begin
  select *
  into target_event
  from public.events
  where id = requested_event_id
  for update;

  if not found or target_event.status <> 'published' then
    return jsonb_build_object('saved', false, 'reason', 'event_not_found');
  end if;

  if exists (
    select 1
    from public.event_participants participants
    where participants.event_id = requested_event_id
      and participants.email = lower(participant_email)
      and participants.status = 'joined'
  ) then
    return jsonb_build_object('saved', false, 'reason', 'duplicate_join');
  end if;

  select target_event.participant_count_seed + count(*)::integer
  into active_count
  from public.event_participants participants
  where participants.event_id = requested_event_id
    and participants.status = 'joined';

  if target_event.max_participants is not null
    and active_count >= target_event.max_participants then
    return jsonb_build_object(
      'saved', false,
      'reason', 'event_full',
      'participantCount', active_count,
      'capacity', target_event.max_participants
    );
  end if;

  saved_id := lower(coalesce(nullif(trim(requested_join_id), ''), gen_random_uuid()::text));
  if saved_id !~ '^[a-z0-9][a-z0-9_-]{2,119}$' then
    saved_id := gen_random_uuid()::text;
  end if;

  insert into public.event_participants (
    id,
    event_id,
    name,
    email,
    visibility,
    reminder_opt_in,
    status,
    joined_at
  ) values (
    saved_id,
    requested_event_id,
    trim(participant_name),
    lower(participant_email),
    coalesce(requested_visibility, 'private'::public.participant_visibility),
    coalesce(requested_reminder_opt_in, false),
    'joined',
    now()
  );

  return jsonb_build_object(
    'saved', true,
    'id', saved_id,
    'participantCount', active_count + 1,
    'capacity', target_event.max_participants
  );
exception
  when unique_violation then
    return jsonb_build_object('saved', false, 'reason', 'duplicate_join');
  when check_violation then
    return jsonb_build_object('saved', false, 'reason', 'validation_failed');
end;
$$;

grant usage on schema private to authenticated, service_role;
grant execute on function private.event_is_published(text) to authenticated, service_role;
grant execute on function private.event_is_completed(text) to authenticated, service_role;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_organizations_updated_at on public.organizations;
create trigger set_organizations_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

drop trigger if exists set_events_updated_at on public.events;
create trigger set_events_updated_at
before update on public.events
for each row execute function public.set_updated_at();

drop trigger if exists set_event_participants_updated_at on public.event_participants;
create trigger set_event_participants_updated_at
before update on public.event_participants
for each row execute function public.set_updated_at();

drop trigger if exists set_event_proofs_updated_at on public.event_proofs;
create trigger set_event_proofs_updated_at
before update on public.event_proofs
for each row execute function public.set_updated_at();

drop trigger if exists set_trust_reports_updated_at on public.trust_reports;
create trigger set_trust_reports_updated_at
before update on public.trust_reports
for each row execute function public.set_updated_at();

drop trigger if exists set_early_access_requests_updated_at on public.early_access_requests;
create trigger set_early_access_requests_updated_at
before update on public.early_access_requests
for each row execute function public.set_updated_at();

drop trigger if exists set_api_rate_limits_updated_at on public.api_rate_limits;
create trigger set_api_rate_limits_updated_at
before update on public.api_rate_limits
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.events enable row level security;
alter table public.event_participants enable row level security;
alter table public.event_proofs enable row level security;
alter table public.trust_reports enable row level security;
alter table public.early_access_requests enable row level security;
alter table public.audit_log enable row level security;
alter table public.api_rate_limits enable row level security;

drop policy if exists profiles_owner_select on public.profiles;
create policy profiles_owner_select on public.profiles
for select to authenticated
using (id = auth.uid());

drop policy if exists profiles_owner_insert on public.profiles;
create policy profiles_owner_insert on public.profiles
for insert to authenticated
with check (id = auth.uid());

drop policy if exists profiles_owner_update on public.profiles;
create policy profiles_owner_update on public.profiles
for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists organizations_member_select on public.organizations;
create policy organizations_member_select on public.organizations
for select to authenticated
using (
  owner_id = auth.uid()
  or exists (
    select 1
    from public.organization_members members
    where members.organization_id = organizations.id
      and members.user_id = auth.uid()
  )
);

drop policy if exists organizations_owner_insert on public.organizations;
create policy organizations_owner_insert on public.organizations
for insert to authenticated
with check (
  owner_id = auth.uid()
  and status = 'pending_review'
);

drop policy if exists organizations_pending_owner_update on public.organizations;
create policy organizations_pending_owner_update on public.organizations
for update to authenticated
using (
  owner_id = auth.uid()
  and status = 'pending_review'
)
with check (
  owner_id = auth.uid()
  and status = 'pending_review'
);

drop policy if exists organization_members_self_select on public.organization_members;
create policy organization_members_self_select on public.organization_members
for select to authenticated
using (user_id = auth.uid());

drop policy if exists events_owner_or_org_select on public.events;
create policy events_owner_or_org_select on public.events
for select to authenticated
using (
  created_by = auth.uid()
  or exists (
    select 1
    from public.organization_members members
    where members.organization_id = events.organization_id
      and members.user_id = auth.uid()
  )
);

drop policy if exists events_owner_insert on public.events;
create policy events_owner_insert on public.events
for insert to authenticated
with check (
  created_by = auth.uid()
  and status in ('draft', 'pending_review')
  and (
    organization_id is null
    or exists (
      select 1
      from public.organization_members members
      join public.organizations orgs on orgs.id = members.organization_id
      where members.organization_id = events.organization_id
        and members.user_id = auth.uid()
        and orgs.status = 'approved'
    )
  )
);

drop policy if exists events_owner_update_before_review on public.events;
create policy events_owner_update_before_review on public.events
for update to authenticated
using (
  created_by = auth.uid()
  and status in ('draft', 'pending_review')
)
with check (
  created_by = auth.uid()
  and status in ('draft', 'pending_review')
);

drop policy if exists event_participants_self_select on public.event_participants;
create policy event_participants_self_select on public.event_participants
for select to authenticated
using (
  user_id = auth.uid()
  or email = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists event_participants_organizer_select on public.event_participants;
create policy event_participants_organizer_select on public.event_participants
for select to authenticated
using (
  exists (
    select 1
    from public.events owned_events
    where owned_events.id = event_participants.event_id
      and (
        owned_events.created_by = auth.uid()
        or exists (
          select 1
          from public.organization_members members
          where members.organization_id = owned_events.organization_id
            and members.user_id = auth.uid()
        )
      )
  )
);

drop policy if exists event_participants_self_insert on public.event_participants;
create policy event_participants_self_insert on public.event_participants
for insert to authenticated
with check (
  status = 'joined'
  and private.event_is_published(event_participants.event_id)
  and user_id = auth.uid()
  and email = lower(coalesce(auth.jwt() ->> 'email', ''))
);

drop policy if exists event_participants_self_cancel on public.event_participants;
create policy event_participants_self_cancel on public.event_participants
for update to authenticated
using (
  user_id = auth.uid()
  or email = lower(coalesce(auth.jwt() ->> 'email', ''))
)
with check (
  status in ('joined', 'cancelled')
  and (
    user_id = auth.uid()
    or email = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
);

drop policy if exists event_proofs_submitter_or_organizer_select on public.event_proofs;
create policy event_proofs_submitter_or_organizer_select on public.event_proofs
for select to authenticated
using (
  submitted_by = auth.uid()
  or exists (
    select 1
    from public.events owned_events
    where owned_events.id = event_proofs.event_id
      and (
        owned_events.created_by = auth.uid()
        or exists (
          select 1
          from public.organization_members members
          where members.organization_id = owned_events.organization_id
            and members.user_id = auth.uid()
        )
      )
  )
);

drop policy if exists event_proofs_submitter_insert on public.event_proofs;
create policy event_proofs_submitter_insert on public.event_proofs
for insert to authenticated
with check (
  submitted_by = auth.uid()
  and status = 'pending_review'
  and private.event_is_completed(event_proofs.event_id)
  and (
    exists (
      select 1
      from public.events completed_events
      where completed_events.id = event_proofs.event_id
        and (
          completed_events.created_by = auth.uid()
          or exists (
            select 1
            from public.organization_members members
            where members.organization_id = completed_events.organization_id
              and members.user_id = auth.uid()
          )
        )
    )
    or exists (
      select 1
      from public.event_participants participants
      where participants.event_id = event_proofs.event_id
        and participants.status = 'joined'
        and (
          participants.user_id = auth.uid()
          or participants.email = lower(coalesce(auth.jwt() ->> 'email', ''))
        )
    )
  )
);

drop policy if exists event_proofs_submitter_update_before_review on public.event_proofs;
create policy event_proofs_submitter_update_before_review on public.event_proofs
for update to authenticated
using (
  submitted_by = auth.uid()
  and status = 'pending_review'
)
with check (
  submitted_by = auth.uid()
  and status = 'pending_review'
);

drop policy if exists trust_reports_public_insert on public.trust_reports;
create policy trust_reports_public_insert on public.trust_reports
for insert to anon, authenticated
with check (status = 'open');

create or replace view public.published_events_public
with (security_barrier = true)
as
select
  id,
  organization_id,
  source,
  title,
  category,
  status::text as status,
  location_name,
  city,
  postal_code,
  start_time,
  end_time,
  time_zone,
  organizer_name,
  organizer_role,
  max_participants,
  participant_count_seed,
  summary,
  description,
  bring,
  impact_metric,
  proof_summary,
  image_url,
  image_alt,
  instagram,
  social_url,
  published_at,
  created_at,
  updated_at
from public.events
where status in ('published', 'completed');

create or replace view public.public_event_participants
with (security_barrier = true)
as
select
  participants.event_id,
  participants.name,
  participants.joined_at
from public.event_participants participants
join public.events events on events.id = participants.event_id
where participants.status = 'joined'
  and participants.visibility = 'public'
  and events.status in ('published', 'completed');

create or replace view public.published_event_proofs_public
with (security_barrier = true)
as
select
  proofs.id,
  proofs.event_id,
  proofs.summary,
  proofs.impact_metric,
  proofs.image_url,
  proofs.image_alt,
  proofs.social_url,
  proofs.created_at,
  proofs.updated_at
from public.event_proofs proofs
join public.events events on events.id = proofs.event_id
where proofs.status = 'published'
  and events.status = 'completed';

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.organizations from anon, authenticated;
revoke all on table public.organization_members from anon, authenticated;
revoke all on table public.events from anon, authenticated;
revoke all on table public.event_participants from anon, authenticated;
revoke all on table public.event_proofs from anon, authenticated;
revoke all on table public.trust_reports from anon, authenticated;
revoke all on table public.early_access_requests from anon, authenticated;
revoke all on table public.audit_log from anon, authenticated;
revoke all on table public.api_rate_limits from anon, authenticated;
revoke all on sequence public.audit_log_id_seq from anon, authenticated;
revoke all on function public.record_api_rate_limit_hit(text, text, timestamptz, integer, integer) from public;
revoke all on function public.join_published_event(text, text, text, text, public.participant_visibility, boolean) from public;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema private to authenticated, service_role;
grant execute on function private.event_is_published(text) to authenticated, service_role;
grant execute on function private.event_is_completed(text) to authenticated, service_role;
grant execute on function public.record_api_rate_limit_hit(text, text, timestamptz, integer, integer) to service_role;
grant execute on function public.join_published_event(text, text, text, text, public.participant_visibility, boolean) to service_role;

grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update on table public.organizations to authenticated;
grant select on table public.organization_members to authenticated;
grant select, insert, update on table public.events to authenticated;
grant select, insert, update on table public.event_participants to authenticated;
grant select, insert, update on table public.event_proofs to authenticated;
grant insert on table public.trust_reports to anon, authenticated;
grant select on public.published_events_public to anon, authenticated;
grant select on public.public_event_participants to anon, authenticated;
grant select on public.published_event_proofs_public to anon, authenticated;

grant all on table public.profiles to service_role;
grant all on table public.organizations to service_role;
grant all on table public.organization_members to service_role;
grant all on table public.events to service_role;
grant all on table public.event_participants to service_role;
grant all on table public.event_proofs to service_role;
grant all on table public.trust_reports to service_role;
grant all on table public.early_access_requests to service_role;
grant all on table public.audit_log to service_role;
grant all on table public.api_rate_limits to service_role;
grant usage, select on sequence public.audit_log_id_seq to service_role;
