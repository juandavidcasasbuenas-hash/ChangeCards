-- Run once in the Supabase SQL Editor. Accessible only by the server's service role.
create table if not exists public.tester_feedback (
  id uuid primary key,
  created_at timestamptz not null default now(),
  message text not null check (char_length(message) between 1 and 3000),
  email text not null default '' check (char_length(email) <= 254),
  screen text not null check (screen in ('landing', 'table', 'co-op')),
  app_version text,
  ip_hash text not null,
  notification_sent_at timestamptz
);
alter table public.tester_feedback enable row level security;
revoke all on public.tester_feedback from anon, authenticated;
grant select, insert, update on public.tester_feedback to service_role;
create index if not exists tester_feedback_rate_limit on public.tester_feedback (ip_hash, created_at);
