-- Nobody was told when a resident signed up, so a new member could sit waiting
-- for approval indefinitely while the committee had no reason to look.
-- Admins now get the same bell notification they get for a complaint.
--
-- Deliberately in-app only, not email: on launch night 88 flats register at
-- once, and 88 emails to each admin would be noise rather than signal. The
-- unread count conveys "there are people waiting" just as well.

create or replace function on_profile_registered() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_flat text;
  r record;
begin
  if new.status <> 'pending' then
    return null;  -- the bootstrapped first admin, or a seeded row
  end if;

  select label into v_flat from flats where id = new.flat_id;

  -- Only admins, since only an admin can approve.
  for r in
    select id from profiles
    where status = 'approved' and role = 'admin' and id <> new.id
  loop
    perform notify_in_app(r.id, null, 'new_member',
      'New sign-up: ' || new.name,
      coalesce(v_flat, 'No flat') || ' · ' ||
      case new.resident_type when 'owner' then 'Owner' else 'Tenant' end ||
      ' · waiting for approval');
  end loop;
  return null;
end;
$$;

create trigger profiles_notify_registration after insert on profiles
  for each row execute function on_profile_registered();
