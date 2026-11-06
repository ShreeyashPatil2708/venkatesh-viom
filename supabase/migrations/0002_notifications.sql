-- In-app notifications, alongside the emails: a bell with an unread count.
-- Committee members are told when a request is raised; the resident is told
-- when theirs moves on or the committee replies.

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles on delete cascade,
  ticket_id  uuid references tickets on delete cascade,
  kind       text not null,
  title      text not null,
  body       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);
create index notifications_unread_idx on notifications (user_id) where read_at is null;

alter table notifications enable row level security;

-- Only ever your own, and only the triggers below create them.
create policy notifications_read_own on notifications for select to authenticated
  using (user_id = auth.uid());
create policy notifications_update_own on notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- A resident may only ever flip their own notification to read; nothing else
-- about it is theirs to change.
create or replace function guard_notification_update() returns trigger
language plpgsql as $$
begin
  if new.user_id is distinct from old.user_id
     or new.ticket_id is distinct from old.ticket_id
     or new.kind is distinct from old.kind
     or new.title is distinct from old.title
     or new.body is distinct from old.body
     or new.created_at is distinct from old.created_at then
    raise exception 'only read_at can be changed';
  end if;
  return new;
end;
$$;
create trigger notifications_guard before update on notifications
  for each row execute function guard_notification_update();

create or replace function notify_in_app(
  p_user_id uuid, p_ticket_id uuid, p_kind text, p_title text, p_body text
) returns void
language sql security definer set search_path = public as $$
  insert into notifications (user_id, ticket_id, kind, title, body)
  values (p_user_id, p_ticket_id, p_kind, p_title, p_body);
$$;

-- ---------------------------------------------------------------- triggers

create or replace function on_ticket_created_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_flat text;
  v_kind text;
  r record;
begin
  select label into v_flat from flats where id = new.flat_id;
  v_kind := initcap(new.category::text);

  -- Every committee member except whoever raised it: a secretary filing their
  -- own complaint should not be notified about it.
  for r in
    select id from profiles
    where status = 'approved' and role in ('committee', 'admin') and id <> new.created_by
  loop
    perform notify_in_app(r.id, new.id, 'new_ticket',
      v_kind || ' from ' || coalesce(v_flat, 'a flat'), new.subject);
  end loop;
  return null;
end;
$$;
create trigger tickets_notify_in_app after insert on tickets
  for each row execute function on_ticket_created_notify();

create or replace function on_status_changed_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_label text;
  v_note  text;
begin
  if new.status is distinct from old.status then
    v_label := case new.status
                 when 'new' then 'reopened'
                 when 'in_progress' then 'in progress'
                 when 'resolved' then 'resolved'
                 when 'closed' then 'closed'
               end;
    -- The committee's optional message, written in the same breath as the
    -- status change, is what the resident most wants to read.
    select note into v_note from ticket_updates
    where ticket_id = new.id and visible_to_resident and note is not null
    order by created_at desc limit 1;

    perform notify_in_app(new.created_by, new.id, 'status_change',
      new.subject || ' is ' || v_label, v_note);
  end if;
  return null;
end;
$$;
create trigger tickets_notify_status_in_app after update on tickets
  for each row execute function on_status_changed_notify();

create or replace function on_note_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_subject text;
begin
  if new.visible_to_resident and new.note is not null and new.new_status is null then
    select created_by, subject into v_owner, v_subject from tickets where id = new.ticket_id;
    -- A committee member replying on their own request would be telling
    -- themselves something they just wrote.
    if v_owner is distinct from new.author_id then
      perform notify_in_app(v_owner, new.ticket_id, 'committee_note',
        'Committee replied about ' || v_subject, new.note);
    end if;
  end if;
  return null;
end;
$$;
create trigger ticket_updates_notify_in_app after insert on ticket_updates
  for each row execute function on_note_notify();
