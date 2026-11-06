-- Real push, so a resident hears "your complaint is resolved" while the app is
-- closed. The bell alone only updates when the app is open.
--
-- Each phone registers an FCM token against its signed-in user; every in-app
-- notification then fans out to that user's phones.

create table device_tokens (
  token      text primary key,
  user_id    uuid not null references profiles on delete cascade,
  platform   text not null default 'android',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index device_tokens_user_idx on device_tokens (user_id);

alter table device_tokens enable row level security;

-- A phone only ever manages its own registration.
create policy device_tokens_read_own on device_tokens for select to authenticated
  using (user_id = auth.uid());
create policy device_tokens_insert_own on device_tokens for insert to authenticated
  with check (user_id = auth.uid());
create policy device_tokens_update_own on device_tokens for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy device_tokens_delete_own on device_tokens for delete to authenticated
  using (user_id = auth.uid());

-- Every in-app notification is also pushed to that user's phones. Reusing the
-- notifications table means push and bell can never disagree about what
-- happened, and the "who gets told" rules live in one place.
create or replace function on_notification_push() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform notify_edge('send-push', jsonb_build_object('notification_id', new.id));
  return null;
end;
$$;

create trigger notifications_push after insert on notifications
  for each row execute function on_notification_push();
