-- Viom Society app: schema, row-level security and notification triggers.
-- Apply with:  supabase db push   (or paste into the Supabase SQL editor)

create extension if not exists pg_net;

-- ---------------------------------------------------------------- enums

create type resident_type as enum ('owner', 'tenant');
create type user_role     as enum ('resident', 'committee', 'admin');
create type profile_status as enum ('pending', 'approved', 'rejected');
create type ticket_category as enum ('complaint', 'suggestion', 'enquiry');
create type ticket_status as enum ('new', 'in_progress', 'resolved', 'closed');

-- ---------------------------------------------------------------- tables

-- Runtime config read only by the notification triggers (RLS on, no policies,
-- so nothing but service_role / postgres can see it). Populated once at setup.
create table app_config (
  key   text primary key,
  value text not null
);
alter table app_config enable row level security;

create table flats (
  id      uuid primary key default gen_random_uuid(),
  wing    text not null default '',
  number  text not null,
  label   text generated always as (
            case when wing = '' then number else wing || '-' || number end
          ) stored,
  created_at timestamptz not null default now(),
  unique (wing, number)
);

create table profiles (
  id            uuid primary key references auth.users on delete cascade,
  flat_id       uuid references flats on delete restrict,
  name          text not null,
  mobile        text not null,
  email         text not null,
  resident_type resident_type not null,
  role          user_role not null default 'resident',
  status        profile_status not null default 'pending',
  created_at    timestamptz not null default now()
);

create sequence ticket_ref_seq start 1;

create table tickets (
  id          uuid primary key default gen_random_uuid(),
  ref_code    text not null unique default 'VM-' || lpad(nextval('ticket_ref_seq')::text, 4, '0'),
  flat_id     uuid not null references flats on delete restrict,
  created_by  uuid not null references profiles on delete cascade,
  category    ticket_category not null,
  subject     text not null check (length(trim(subject)) between 3 and 120),
  description text not null check (length(trim(description)) between 5 and 4000),
  photo_path  text,
  status      ticket_status not null default 'new',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  resolved_at timestamptz
);
create index tickets_created_by_idx on tickets (created_by, created_at desc);
create index tickets_status_idx on tickets (status, created_at desc);

create table ticket_updates (
  id                  uuid primary key default gen_random_uuid(),
  ticket_id           uuid not null references tickets on delete cascade,
  author_id           uuid not null references profiles on delete cascade,
  note                text,
  old_status          ticket_status,
  new_status          ticket_status,
  visible_to_resident boolean not null default true,
  created_at          timestamptz not null default now()
);
create index ticket_updates_ticket_idx on ticket_updates (ticket_id, created_at);

create table notices (
  id         uuid primary key default gen_random_uuid(),
  title      text not null check (length(trim(title)) between 3 and 120),
  body       text not null check (length(trim(body)) between 3 and 4000),
  pinned     boolean not null default false,
  created_by uuid not null references profiles on delete cascade,
  created_at timestamptz not null default now()
);
create index notices_order_idx on notices (pinned desc, created_at desc);

-- One row per email we try to send: makes a retried trigger a no-op and gives
-- the committee somewhere to look when an email is missing.
create table email_log (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid references tickets on delete cascade,
  kind       text not null,
  to_email   text not null,
  dedupe_key text not null unique,
  status     text not null default 'pending',
  error      text,
  sent_at    timestamptz not null default now()
);
alter table email_log enable row level security;

-- ------------------------------------------------- helpers (SECURITY DEFINER
-- so policies on profiles can ask about profiles without recursing)

create or replace function is_committee() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and status = 'approved' and role in ('committee', 'admin')
  );
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and status = 'approved' and role = 'admin'
  );
$$;

create or replace function is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and status = 'approved');
$$;

create or replace function my_flat_id() returns uuid
language sql stable security definer set search_path = public as $$
  select flat_id from profiles where id = auth.uid();
$$;

-- A resident may edit their own name/mobile but never their own role or
-- approval status; only an admin can change those.
create or replace function guard_profile_privileges() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.status is distinct from old.status)
     and not is_admin() then
    raise exception 'only an admin can change role or status';
  end if;
  return new;
end;
$$;
create trigger profiles_guard_privileges before update on profiles
  for each row execute function guard_profile_privileges();

create or replace function touch_ticket() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'resolved' and old.status is distinct from 'resolved' then
    new.resolved_at := now();
  end if;
  return new;
end;
$$;
create trigger tickets_touch before update on tickets
  for each row execute function touch_ticket();

-- ---------------------------------------------------------------- RLS

alter table flats enable row level security;
alter table profiles enable row level security;
alter table tickets enable row level security;
alter table ticket_updates enable row level security;
alter table notices enable row level security;

-- flats: readable by anyone signed in (the sign-up form needs the list)
create policy flats_read on flats for select to authenticated using (true);
create policy flats_write on flats for all to authenticated
  using (is_committee()) with check (is_committee());

-- profiles: own row always; committee sees all; only admin may write others
create policy profiles_read_own on profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_read_committee on profiles for select to authenticated
  using (is_committee());
create policy profiles_insert_own on profiles for insert to authenticated
  with check (id = auth.uid() and role = 'resident' and status = 'pending');
create policy profiles_update_own on profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin on profiles for update to authenticated
  using (is_admin()) with check (is_admin());

-- tickets: residents see and file only their own, for their own flat
create policy tickets_read_own on tickets for select to authenticated
  using (created_by = auth.uid());
create policy tickets_read_committee on tickets for select to authenticated
  using (is_committee());
create policy tickets_insert_own on tickets for insert to authenticated
  with check (created_by = auth.uid() and is_approved() and flat_id = my_flat_id());
create policy tickets_update_committee on tickets for update to authenticated
  using (is_committee()) with check (is_committee());

-- ticket_updates: committee sees everything; a resident sees notes marked visible
create policy ticket_updates_read on ticket_updates for select to authenticated
  using (
    is_committee()
    or (visible_to_resident
        and exists (select 1 from tickets t
                    where t.id = ticket_id and t.created_by = auth.uid()))
  );
create policy ticket_updates_insert on ticket_updates for insert to authenticated
  with check (is_committee() and author_id = auth.uid());

-- notices: every approved resident reads, committee writes
create policy notices_read on notices for select to authenticated
  using (is_approved());
create policy notices_insert on notices for insert to authenticated
  with check (is_committee() and created_by = auth.uid());
create policy notices_update on notices for update to authenticated
  using (is_committee()) with check (is_committee());
create policy notices_delete on notices for delete to authenticated
  using (is_committee());

-- ---------------------------------------------------------------- storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ticket-photos', 'ticket-photos', false, 2097152,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy ticket_photos_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'ticket-photos'
    and is_approved()
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy ticket_photos_read on storage.objects for select to authenticated
  using (
    bucket_id = 'ticket-photos'
    and ((storage.foldername(name))[1] = auth.uid()::text or is_committee())
  );

-- --------------------------------------------- committee action, in one step
-- Insert the note first, then move the status, so the "status changed" email
-- can always find the note that goes with it.

create or replace function admin_update_ticket(
  p_ticket_id uuid,
  p_status    ticket_status default null,
  p_note      text default null,
  p_visible   boolean default true
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_old ticket_status;
begin
  if not is_committee() then
    raise exception 'not allowed';
  end if;
  select status into v_old from tickets where id = p_ticket_id;
  if v_old is null then
    raise exception 'no such ticket';
  end if;

  if (p_note is not null and length(trim(p_note)) > 0)
     or (p_status is not null and p_status is distinct from v_old) then
    insert into ticket_updates (ticket_id, author_id, note, old_status, new_status,
                                visible_to_resident)
    values (p_ticket_id, auth.uid(), nullif(trim(coalesce(p_note, '')), ''), v_old,
            case when p_status is distinct from v_old then p_status end,
            p_visible);
  end if;

  if p_status is not null and p_status is distinct from v_old then
    update tickets set status = p_status where id = p_ticket_id;
  end if;
end;
$$;

-- ------------------------------------------------------- email notifications
-- Posts to the Edge Functions over pg_net. Both the function URL and the
-- shared secret live in app_config, set once during setup.

create or replace function notify_edge(p_fn text, p_body jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_base   text;
  v_secret text;
begin
  select value into v_base from app_config where key = 'edge_base_url';
  select value into v_secret from app_config where key = 'webhook_secret';
  if v_base is null or v_secret is null then
    return;  -- not configured yet: skip quietly rather than block the write
  end if;
  perform net.http_post(
    url     := v_base || '/' || p_fn,
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-webhook-secret', v_secret),
    body    := p_body
  );
end;
$$;

create or replace function on_ticket_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform notify_edge('notify-new-ticket', jsonb_build_object('ticket_id', new.id));
  return null;
end;
$$;
create trigger tickets_notify_new after insert on tickets
  for each row execute function on_ticket_created();

create or replace function on_ticket_status_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    perform notify_edge('notify-status-change',
      jsonb_build_object('ticket_id', new.id,
                         'old_status', old.status,
                         'new_status', new.status));
  end if;
  return null;
end;
$$;
create trigger tickets_notify_status after update on tickets
  for each row execute function on_ticket_status_changed();

-- A committee reply that does not move the status still needs to reach the
-- resident, otherwise "plumber coming tomorrow" is never seen outside the app.
create or replace function on_resident_note() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_status ticket_status;
begin
  if new.visible_to_resident
     and new.note is not null
     and new.new_status is null then
    select status into v_status from tickets where id = new.ticket_id;
    perform notify_edge('notify-status-change',
      jsonb_build_object('ticket_id', new.ticket_id,
                         'new_status', v_status,
                         'note_only', true,
                         'update_id', new.id));
  end if;
  return null;
end;
$$;
create trigger ticket_updates_notify_note after insert on ticket_updates
  for each row execute function on_resident_note();
