\set A '00000000-0000-0000-0000-00000000000b'
\set B '00000000-0000-0000-0000-00000000000c'
\set P '00000000-0000-0000-0000-00000000000d'
\set C '00000000-0000-0000-0000-00000000000e'
\set ADM '00000000-0000-0000-0000-00000000000a'
\set FA '10000000-0000-0000-0000-000000000001'
\set FB '10000000-0000-0000-0000-000000000002'

-- ============ resident A files a ticket for their own flat
begin;
set local role authenticated;
set local test.uid = :'A';
insert into tickets (flat_id, created_by, category, subject, description)
values (:'FA', :'A', 'complaint', 'Lobby light out', 'The light in A wing lobby is dead.');
select assert_eq((select count(*)::int from tickets), 1, 'A sees own ticket');
commit;

-- ============ resident A may not file against another flat
begin;
set local role authenticated;
set local test.uid = :'A';
select assert_blocked(
  format('insert into tickets (flat_id, created_by, category, subject, description)
          values (%L, %L, %L, %L, %L)', :'FB', :'A', 'complaint', 'Not my flat', 'Should fail'),
  'A cannot file for another flat');
select assert_blocked(
  format('insert into tickets (flat_id, created_by, category, subject, description)
          values (%L, %L, %L, %L, %L)', :'FA', :'B', 'complaint', 'Impersonation', 'Should fail'),
  'A cannot file as another resident');
commit;

-- ============ resident B files their own, then neither can see the other's
begin;
set local role authenticated;
set local test.uid = :'B';
insert into tickets (flat_id, created_by, category, subject, description)
values (:'FB', :'B', 'suggestion', 'Add a bench', 'Please add a bench in the garden.');
select assert_eq((select count(*)::int from tickets), 1, 'B sees only own ticket');
select assert_eq((select count(*)::int from tickets where created_by = :'A'), 0,
                 'B cannot see A''s ticket');
commit;

begin;
set local role authenticated;
set local test.uid = :'A';
select assert_eq((select count(*)::int from tickets), 1, 'A still sees only own ticket');
select assert_eq((select count(*)::int from tickets where subject = 'Add a bench'), 0,
                 'A cannot see B''s ticket');
-- a resident has no update policy at all
with u as (update tickets set status = 'resolved' where created_by = :'A' returning 1)
select assert_eq((select count(*)::int from u), 0, 'A cannot resolve their own ticket');
commit;

-- ============ an unapproved profile can do nothing
begin;
set local role authenticated;
set local test.uid = :'P';
select assert_eq((select count(*)::int from tickets), 0, 'pending user sees no tickets');
select assert_eq((select count(*)::int from notices), 0, 'pending user sees no notices');
select assert_blocked(
  format('insert into tickets (flat_id, created_by, category, subject, description)
          values (%L, %L, %L, %L, %L)', :'FB', :'P', 'complaint', 'Before approval', 'Should fail'),
  'pending user cannot file a ticket');
select assert_eq((select count(*)::int from profiles), 1, 'pending user sees only own profile');
commit;

-- ============ nobody can promote themselves
begin;
set local role authenticated;
set local test.uid = :'A';
select assert_blocked(
  'update profiles set role = ''admin'' where id = auth.uid()',
  'A cannot make themselves admin');
select assert_blocked(
  'update profiles set resident_type = ''owner'', role = ''committee'' where id = auth.uid()',
  'A cannot give themselves a committee role');
update profiles set name = 'Resident A2', mobile = '9111111111' where id = auth.uid();
select assert_eq((select name from profiles where id = :'A'), 'Resident A2',
                 'A can edit their own name');
commit;

-- The real self-approval attack: a pending user approving themselves.
begin;
set local role authenticated;
set local test.uid = :'P';
select assert_blocked(
  'update profiles set status = ''approved'' where id = auth.uid()',
  'a pending user cannot approve themselves');
select assert_eq((select status::text from profiles where id = :'P'), 'pending',
                 'and they are still pending afterwards');
commit;

-- ============ committee sees everything and can act
begin;
set local role authenticated;
set local test.uid = :'C';
select assert_eq((select count(*)::int from tickets), 2, 'committee sees all tickets');
select assert_eq((select count(*)::int from profiles), 5, 'committee sees all profiles');
select admin_update_ticket(
  (select id from tickets where created_by = :'A'),
  'in_progress', 'Electrician coming tomorrow.', true);
select admin_update_ticket(
  (select id from tickets where created_by = :'A'),
  'resolved', 'Spoke to the plumber about the budget.', false);
select assert_eq((select status::text from tickets where created_by = :'A'), 'resolved',
                 'committee moved the status');
select assert_eq((select count(*)::int from ticket_updates), 2, 'two updates recorded');
commit;

-- ============ resident sees the visible note but never the internal one
begin;
set local role authenticated;
set local test.uid = :'A';
select assert_eq((select count(*)::int from ticket_updates), 1, 'A sees only the visible note');
select assert_eq((select note from ticket_updates), 'Electrician coming tomorrow.',
                 'A sees the right note');
select assert_eq((select resolved_at is not null from tickets where created_by = :'A'), true,
                 'resolved_at was stamped');
commit;

-- ============ a resident cannot fake a committee reply
begin;
set local role authenticated;
set local test.uid = :'A';
select assert_blocked(
  format('insert into ticket_updates (ticket_id, author_id, note)
          values ((select id from tickets where created_by = %L), %L, %L)',
         :'A', :'A', 'Marking this done myself'),
  'A cannot add a ticket update');
select assert_blocked(
  format('select admin_update_ticket((select id from tickets where created_by = %L), %L)',
         :'A', 'closed'),
  'A cannot call the committee RPC');
commit;

-- ============ notices: committee writes, residents read
begin;
set local role authenticated;
set local test.uid = :'C';
insert into notices (title, body, created_by) values ('Water cut Sunday', '10am to 2pm.', :'C');
commit;

begin;
set local role authenticated;
set local test.uid = :'A';
select assert_eq((select count(*)::int from notices), 1, 'resident reads notices');
select assert_blocked(
  format('insert into notices (title, body, created_by) values (%L, %L, %L)',
         'Fake notice', 'Not allowed', :'A'),
  'resident cannot post a notice');
with d as (delete from notices returning 1)
select assert_eq((select count(*)::int from d), 0, 'resident cannot delete notices');
commit;

-- ============ flats readable by all, writable by committee only
begin;
set local role authenticated;
set local test.uid = :'P';
select assert_eq((select count(*)::int from flats), 2, 'sign-up form can list flats');
select assert_blocked('insert into flats (wing, number) values (''Z'', ''999'')',
                      'resident cannot add flats');
commit;

-- ============ email_log is invisible to residents and committee alike
begin;
set local role authenticated;
set local test.uid = :'C';
select assert_eq((select count(*)::int from email_log), 0, 'email_log hidden from committee');
commit;

-- ============ storage: own folder only, committee sees all
begin;
set local role authenticated;
set local test.uid = :'A';
insert into storage.objects (bucket_id, name, owner)
values ('ticket-photos', :'A' || '/photo1.jpg', :'A');
select assert_blocked(
  format('insert into storage.objects (bucket_id, name, owner) values (%L, %L, %L)',
         'ticket-photos', :'B' || '/sneaky.jpg', :'A'),
  'A cannot write into B''s photo folder');
select assert_eq((select count(*)::int from storage.objects), 1, 'A sees own photo');
commit;

begin;
set local role authenticated;
set local test.uid = :'B';
select assert_eq((select count(*)::int from storage.objects), 0, 'B cannot see A''s photo');
commit;

begin;
set local role authenticated;
set local test.uid = :'C';
select assert_eq((select count(*)::int from storage.objects), 1, 'committee can see photos');
commit;

-- ============ admin approves a pending member; committee cannot
begin;
set local role authenticated;
set local test.uid = :'C';
with u as (update profiles set status = 'approved' where id = :'P' returning 1)
select assert_eq((select count(*)::int from u), 0, 'committee cannot approve members');
commit;

begin;
set local role authenticated;
set local test.uid = :'ADM';
update profiles set status = 'approved' where id = :'P';
select assert_eq((select status::text from profiles where id = :'P'), 'approved',
                 'admin can approve a member');
update profiles set role = 'committee' where id = :'P';
select assert_eq((select role::text from profiles where id = :'P'), 'committee',
                 'admin can change a role');
commit;

-- ============ the notification triggers fire with the right payload
insert into app_config (key, value) values
  ('edge_base_url', 'https://test.supabase.co/functions/v1'),
  ('webhook_secret', 'shhh');
delete from net._calls;

begin;
set local role authenticated;
set local test.uid = :'B';
insert into tickets (flat_id, created_by, category, subject, description)
values (:'FB', :'B', 'enquiry', 'Parking rules', 'Where can guests park?');
commit;

select assert_eq((select count(*)::int from net._calls
                  where url = 'https://test.supabase.co/functions/v1/notify-new-ticket'), 1,
                 'new ticket calls notify-new-ticket once');
select assert_eq((select headers->>'x-webhook-secret' from net._calls
                  where url like '%/notify-new-ticket'), 'shhh',
                 'the webhook carries the shared secret');
select assert_eq((select (body->>'ticket_id') is not null from net._calls
                  where url like '%/notify-new-ticket'), true,
                 'the webhook carries the ticket id');

delete from net._calls;
begin;
set local role authenticated;
set local test.uid = :'C';
select admin_update_ticket((select id from tickets where subject = 'Parking rules'),
                           'resolved', 'Guests use the visitor bay.', true);
commit;

select assert_eq((select count(*)::int from net._calls
                  where url like '%/notify-status-change'), 1,
                 'a status change calls notify-status-change once');
select assert_eq((select body->>'new_status' from net._calls
                  where url like '%/notify-status-change'), 'resolved',
                 'the status webhook names the new status');

-- A visible reply with no status change must still reach the resident.
delete from net._calls;
begin;
set local role authenticated;
set local test.uid = :'C';
select admin_update_ticket((select id from tickets where subject = 'Parking rules'),
                           null, 'Signage ordered.', true);
commit;
select assert_eq((select count(*)::int from net._calls
                  where url like '%/notify-status-change'), 1,
                 'a visible reply emails the resident');
select assert_eq((select body->>'note_only' from net._calls
                  where url like '%/notify-status-change'), 'true',
                 'the reply is flagged as note-only');

-- An internal note must stay silent.
delete from net._calls;
begin;
set local role authenticated;
set local test.uid = :'C';
select admin_update_ticket((select id from tickets where subject = 'Parking rules'),
                           null, 'Chase the contractor for the invoice.', false);
commit;
select assert_eq((select count(*)::int from net._calls), 0,
                 'an internal note sends neither email nor push');

-- A status change carrying a note must send exactly one email, not two.
delete from net._calls;
begin;
set local role authenticated;
set local test.uid = :'C';
select admin_update_ticket((select id from tickets where subject = 'Parking rules'),
                           'closed', 'Closing this off.', true);
commit;
select assert_eq((select count(*)::int from net._calls
                  where url like '%/notify-status-change'), 1,
                 'status change with a note emails once, not twice');

-- ============ in-app notifications
-- Resident A raises something; both committee members should be told, and A
-- should not be told about their own request.
delete from notifications;
begin;
set local role authenticated;
set local test.uid = :'A';
insert into tickets (flat_id, created_by, category, subject, description)
values (:'FA', :'A', 'complaint', 'Lift stuck', 'The lift is stuck on floor 3.');
commit;

-- Three hold a committee role by this point: the admin, the treasurer, and
-- the member promoted in the handover test above.
select assert_eq((select count(*)::int from notifications), 3,
                 'every committee member is notified of a new request');
select assert_eq((select count(*)::int from notifications where user_id = :'A'), 0,
                 'the raiser is not notified of their own request');
select assert_eq((select title from notifications limit 1), 'Complaint from A-101',
                 'the notification names the type and flat');

-- The resident sees only their own notifications.
begin;
set local role authenticated;
set local test.uid = :'A';
select assert_eq((select count(*)::int from notifications), 0,
                 'A cannot see the committee notifications');
commit;

begin;
set local role authenticated;
set local test.uid = :'C';
select assert_eq((select count(*)::int from notifications), 1, 'committee sees their own');
commit;

-- Resolving it notifies the resident and carries the committee message.
begin;
set local role authenticated;
set local test.uid = :'C';
select admin_update_ticket((select id from tickets where subject = 'Lift stuck'),
                           'resolved', 'Technician fixed it this morning.', true);
commit;

select assert_eq((select count(*)::int from notifications
                  where user_id = :'A' and kind = 'status_change'), 1,
                 'the resident is notified when it is resolved');
select assert_eq((select body from notifications
                  where user_id = :'A' and kind = 'status_change'),
                 'Technician fixed it this morning.',
                 'the committee message rides along');
select assert_eq((select title from notifications
                  where user_id = :'A' and kind = 'status_change'),
                 'Lift stuck is resolved', 'the title says what happened');

-- An internal note must not reach the resident here either.
delete from notifications;
begin;
set local role authenticated;
set local test.uid = :'C';
select admin_update_ticket((select id from tickets where subject = 'Lift stuck'),
                           null, 'Invoice still pending from the contractor.', false);
commit;
select assert_eq((select count(*)::int from notifications), 0,
                 'an internal note creates no notification');

-- A resident may mark their own read, but may not rewrite it.
delete from notifications;
begin;
set local role authenticated;
set local test.uid = :'C';
select admin_update_ticket((select id from tickets where subject = 'Lift stuck'),
                           null, 'Lift is under warranty.', true);
commit;

begin;
set local role authenticated;
set local test.uid = :'A';
select assert_eq((select count(*)::int from notifications where read_at is null), 1,
                 'the reply arrives unread');
update notifications set read_at = now() where user_id = auth.uid();
select assert_eq((select count(*)::int from notifications where read_at is null), 0,
                 'the resident can mark it read');
select assert_blocked('update notifications set title = ''Hacked'' where user_id = auth.uid()',
                      'the resident cannot rewrite a notification');
commit;

-- ============ a committee member is also an ordinary resident
begin;
set local role authenticated;
set local test.uid = :'C';
insert into tickets (flat_id, created_by, category, subject, description)
values (:'FA', :'C', 'complaint', 'My own tap leaks', 'The kitchen tap in my flat leaks.');
select assert_eq((select count(*)::int from tickets where created_by = :'C'), 1,
                 'a committee member can raise their own request');
commit;

begin;
set local role authenticated;
set local test.uid = :'ADM';
select assert_eq((select count(*)::int from notifications
                  where user_id = :'ADM' and kind = 'new_ticket'
                  and title like '%A-101%'), 1,
                 'the other committee member is told about it');
commit;

-- ============ a tenant's approval expires after a year, an owner's does not
-- B is a tenant (seeded that way), A is an owner.
select assert_eq((select review_due_at is not null from profiles where id = :'B'), true,
                 'the tenant has a review date');
select assert_eq((select review_due_at is null from profiles where id = :'A'), true,
                 'the owner has no review date');
select assert_eq(
  (select date_trunc('day', review_due_at) = date_trunc('day', now() + interval '1 year')
   from profiles where id = :'B'), true, 'the tenant review falls a year out');

-- Wind B's review into the past and they should lose the ability to raise
-- anything new, while keeping their account and their history.
alter table profiles disable trigger profiles_set_review_dates;
update profiles set review_due_at = now() - interval '1 day' where id = :'B';
alter table profiles enable trigger profiles_set_review_dates;

begin;
set local role authenticated;
set local test.uid = :'B';
select assert_blocked(
  format('insert into tickets (flat_id, created_by, category, subject, description)
          values (%L, %L, %L, %L, %L)', :'FB', :'B', 'complaint', 'After expiry', 'Should fail'),
  'an expired tenant cannot raise a request');
select assert_eq((select count(*)::int from tickets where created_by = :'B') > 0, true,
                 'an expired tenant still sees their past requests');
select assert_eq((select count(*)::int from notices), 0,
                 'an expired tenant cannot read notices');
commit;

-- Only an admin may renew.
begin;
set local role authenticated;
set local test.uid = :'C';
select assert_blocked(format('select renew_resident(%L)', :'B'),
                      'a committee member cannot renew a tenant');
commit;

begin;
set local role authenticated;
set local test.uid = :'ADM';
select renew_resident(:'B');
commit;

select assert_eq((select review_due_at > now() + interval '300 days' from profiles where id = :'B'),
                 true, 'renewing pushes the review a year out');

begin;
set local role authenticated;
set local test.uid = :'B';
insert into tickets (flat_id, created_by, category, subject, description)
values (:'FB', :'B', 'complaint', 'After renewal', 'Should now succeed.');
select assert_eq((select count(*)::int from tickets where subject = 'After renewal'), 1,
                 'a renewed tenant can raise requests again');
commit;

-- Switching someone from tenant to owner clears the expiry, and back again
-- sets a fresh one.
begin;
set local role authenticated;
set local test.uid = :'ADM';
update profiles set resident_type = 'owner' where id = :'B';
select assert_eq((select review_due_at is null from profiles where id = :'B'), true,
                 'promoting a tenant to owner clears the review date');
update profiles set resident_type = 'tenant' where id = :'B';
select assert_eq((select review_due_at is not null from profiles where id = :'B'), true,
                 'switching back to tenant sets a review date again');
commit;

-- An admin who is also a tenant keeps the admin panel even when their own
-- tenancy review lapses, so the committee can never lock itself out.
alter table profiles disable trigger profiles_set_review_dates;
update profiles set resident_type = 'tenant', review_due_at = now() - interval '1 day'
where id = :'ADM';
alter table profiles enable trigger profiles_set_review_dates;
begin;
set local role authenticated;
set local test.uid = :'ADM';
select assert_eq((select count(*)::int from tickets) > 0, true,
                 'an expired admin still sees every request');
select assert_eq((select count(*)::int from (
    select 1 from profiles where status = 'pending' limit 1) p), 0,
  'and the members list still works');
commit;

-- ============ admins are told when someone signs up
delete from notifications;
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000f', 'newcomer@test');
insert into profiles (id, flat_id, name, mobile, email, resident_type, role, status)
values ('00000000-0000-0000-0000-00000000000f', :'FB', 'New Comer', '9000000006',
        'newcomer@test', 'tenant', 'resident', 'pending');

select assert_eq((select count(*)::int from notifications where kind = 'new_member'), 1,
                 'the admin is told about a new sign-up');
select assert_eq((select user_id from notifications where kind = 'new_member'), :'ADM',
                 'and it goes to the admin, not the committee');
select assert_eq((select title from notifications where kind = 'new_member'),
                 'New sign-up: New Comer', 'the notification names them');
select assert_eq((select ticket_id is null from notifications where kind = 'new_member'), true,
                 'a sign-up notification has no ticket attached');

-- Several people may share one flat, each with their own account.
select assert_eq((select count(*)::int from profiles where flat_id = :'FB') >= 2, true,
                 'a flat can hold more than one resident');

-- ============ push device tokens
begin;
set local role authenticated;
set local test.uid = :'A';
insert into device_tokens (token, user_id) values ('tokenA', :'A');
select assert_eq((select count(*)::int from device_tokens), 1, 'a phone registers its own token');
select assert_blocked(
  format('insert into device_tokens (token, user_id) values (%L, %L)', 'tokenB', :'B'),
  'a phone cannot register a token for someone else');
commit;

begin;
set local role authenticated;
set local test.uid = :'B';
select assert_eq((select count(*)::int from device_tokens), 0,
                 'tokens are invisible to other residents');
commit;

-- Every notification queues a push.
delete from net._calls;
begin;
set local role authenticated;
set local test.uid = :'C';
select admin_update_ticket((select id from tickets where created_by = :'A' limit 1),
                           'in_progress', 'Looking into it.', true);
commit;
select assert_eq((select count(*)::int from net._calls where url like '%/send-push'), 1,
                 'a notification queues exactly one push');
