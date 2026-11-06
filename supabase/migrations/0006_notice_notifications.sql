-- Posting a notice told nobody. The committee would announce a water cut and
-- it would sit in the app unseen until someone happened to open that tab.
-- Every approved resident now gets a bell entry and a push.
--
-- Deliberately no email: one notice would be 88 emails against a 300/day
-- Brevo allowance, and notices are announcements rather than things awaiting
-- a reply.

create or replace function on_notice_posted() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  r record;
begin
  for r in
    select id from profiles
    where status = 'approved'
      and id <> new.created_by
      and (review_due_at is null or review_due_at > now())
  loop
    perform notify_in_app(r.id, null, 'notice', new.title, new.body);
  end loop;
  return null;
end;
$$;

create trigger notices_notify after insert on notices
  for each row execute function on_notice_posted();
