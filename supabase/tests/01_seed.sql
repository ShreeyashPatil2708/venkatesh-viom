grant all on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

create or replace function assert_eq(actual anyelement, expected anyelement, label text)
returns void language plpgsql as $$
begin
  if actual is distinct from expected then
    raise exception 'FAIL % : got %, expected %', label, actual, expected;
  end if;
  raise notice 'pass  %', label;
end $$;

-- Raises only if the statement did NOT fail: used for "must be blocked" cases.
create or replace function assert_blocked(sql text, label text)
returns void language plpgsql as $$
begin
  execute sql;
  raise exception 'FAIL % : the statement was allowed but should have been blocked', label;
exception
  when insufficient_privilege or raise_exception or check_violation then
    raise notice 'pass  % (blocked)', label;
end $$;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test'),
  ('00000000-0000-0000-0000-00000000000b', 'resa@test'),
  ('00000000-0000-0000-0000-00000000000c', 'resb@test'),
  ('00000000-0000-0000-0000-00000000000d', 'pending@test'),
  ('00000000-0000-0000-0000-00000000000e', 'comm@test');

insert into flats (id, wing, number) values
  ('10000000-0000-0000-0000-000000000001', 'A', '101'),
  ('10000000-0000-0000-0000-000000000002', 'A', '102');

insert into profiles (id, flat_id, name, mobile, email, resident_type, role, status) values
  ('00000000-0000-0000-0000-00000000000a', '10000000-0000-0000-0000-000000000001',
   'Secretary', '9000000001', 'admin@test', 'owner', 'admin', 'approved'),
  ('00000000-0000-0000-0000-00000000000b', '10000000-0000-0000-0000-000000000001',
   'Resident A', '9000000002', 'resa@test', 'owner', 'resident', 'approved'),
  ('00000000-0000-0000-0000-00000000000c', '10000000-0000-0000-0000-000000000002',
   'Resident B', '9000000003', 'resb@test', 'tenant', 'resident', 'approved'),
  ('00000000-0000-0000-0000-00000000000d', '10000000-0000-0000-0000-000000000002',
   'Not Approved', '9000000004', 'pending@test', 'tenant', 'resident', 'pending'),
  ('00000000-0000-0000-0000-00000000000e', '10000000-0000-0000-0000-000000000001',
   'Treasurer', '9000000005', 'comm@test', 'owner', 'committee', 'approved');
