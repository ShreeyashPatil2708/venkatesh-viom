-- Tenants change. An approval that lasts forever means a tenant who moved out
-- two years ago still has an account. So a tenant's approval now expires after
-- a year and an admin has to renew it; an owner's approval does not expire.

alter table profiles add column approved_at   timestamptz;
alter table profiles add column review_due_at timestamptz;

comment on column profiles.review_due_at is
  'When an admin must re-confirm this resident. Null for owners, who do not expire.';

-- One place that decides the dates, so every path through the UI agrees:
-- first approval, re-approval after a decline, and a switch between
-- owner and tenant all land here.
create or replace function set_review_dates() returns trigger
language plpgsql as $$
begin
  if new.status = 'approved' then
    -- On INSERT there is no old row; a profile created already approved (the
    -- first admin, or a seed) still needs its clock started.
    if tg_op = 'INSERT' or old.status is distinct from 'approved' then
      new.approved_at := now();
    end if;
    new.review_due_at := case
      when new.resident_type = 'tenant'
        then coalesce(new.approved_at, now()) + interval '1 year'
      else null
    end;
  else
    new.approved_at := null;
    new.review_due_at := null;
  end if;
  return new;
end;
$$;
create trigger profiles_set_review_dates before insert or update on profiles
  for each row execute function set_review_dates();

-- An expired tenant keeps their account and their history, but cannot raise
-- anything new until the committee confirms they still live here.
create or replace function is_approved() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles
    where id = auth.uid()
      and status = 'approved'
      and (review_due_at is null or review_due_at > now())
  );
$$;

-- Deliberately NOT expiry-checked: a committee member whose tenancy review
-- lapses would otherwise lock the whole committee out of the admin panel.
-- They lose the ability to raise their own requests, which is_approved covers,
-- but keep the panel.

create or replace function renew_resident(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then
    raise exception 'only an admin can renew a resident';
  end if;
  update profiles
  set approved_at = now(),
      review_due_at = case when resident_type = 'tenant' then now() + interval '1 year' end,
      status = 'approved'
  where id = p_id;
end;
$$;

-- Everyone already approved starts their clock now.
update profiles set approved_at = coalesce(approved_at, created_at) where status = 'approved';
update profiles
set review_due_at = coalesce(approved_at, created_at) + interval '1 year'
where status = 'approved' and resident_type = 'tenant';
