-- Minimal stand-ins for the parts of Supabase that aren't plain Postgres, so
-- the real migration can be exercised locally.
-- Roles are cluster-wide, so only create them the first time.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;

create schema auth;
create table auth.users (id uuid primary key, email text);

-- Tests set test.uid to impersonate a signed-in user.
create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;

create schema storage;
create table storage.buckets (
  id text primary key, name text, public boolean,
  file_size_limit bigint, allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets, name text, owner uuid
);
alter table storage.objects enable row level security;
grant all on storage.objects to authenticated;

create or replace function storage.foldername(name text) returns text[]
language sql immutable as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

create schema net;
create table net._calls (url text, headers jsonb, body jsonb);
create or replace function net.http_post(url text, body jsonb default '{}', params jsonb default '{}',
                                         headers jsonb default '{}', timeout_milliseconds int default 5000)
returns bigint language sql as $$
  insert into net._calls values (url, headers, body) returning 1::bigint
$$;

grant usage on schema auth, storage, net, public to authenticated, anon, service_role;
