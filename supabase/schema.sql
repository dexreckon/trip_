-- =====================================================================
--  Margalla Trail 5 Trip — database schema + security rules
--  Run this ONCE in Supabase → SQL Editor → New query → Run
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Organizers (the 2 admin accounts) ----------
create table if not exists public.organizers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name    text
);

create or replace function public.is_organizer()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.organizers where user_id = auth.uid());
$$;

create or replace function public.is_confirmed_student()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.students where id = auth.uid() and payment_status = 'confirmed');
$$;

-- ---------- Trip settings (single row) ----------
create table if not exists public.settings (
  id             int primary key default 1 check (id = 1),
  trip_name      text not null default 'Margalla Trail 5 Trip',
  destination    text not null default 'Margalla Hills – Trail 5, Islamabad',
  trip_date      timestamptz not null default (now() + interval '30 days'),
  price          int  not null default 2000,
  meeting_point  text default 'University main gate',
  itinerary      text default '',
  organizer_contacts text default '',
  bank_name     text default '',
  account_title  text default '',
  account_number text default '',
  payment_note   text default 'Write your roll number in the transfer reference.'
);
insert into public.settings (id) values (1) on conflict do nothing;

-- ---------- Students ----------
create table if not exists public.students (
  id                uuid primary key references auth.users(id) on delete cascade,
  full_name         text not null,
  roll_no           text not null,
  roll_key          text not null unique,
  phone             text,
  emergency_name    text,
  emergency_phone   text not null,
  relation          text not null,
  payment_status    text not null default 'unpaid'
                    check (payment_status in ('unpaid','pending','confirmed','rejected')),
  payment_proof_path text,
  proof_submitted_at timestamptz,
  paid_amount       int not null default 0,
  confirmed_at      timestamptz,
  reject_reason     text,
  qr_token          text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_at        timestamptz not null default now()
);

-- ---------- Organizer alerts / messages ----------
create table if not exists public.alerts (
  id         bigint generated always as identity primary key,
  message    text not null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------- Emergencies ----------
create table if not exists public.emergencies (
  id         bigint generated always as identity primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  message    text,
  lat        double precision,
  lng        double precision,
  resolved   boolean not null default false,
  created_at timestamptz not null default now()
);

-- ---------- Attendance ----------
create table if not exists public.attendance (
  id         bigint generated always as identity primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  checkpoint text not null check (checkpoint in ('depart_uni','arrive_trail','depart_food','return_uni')),
  marked_by  uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (student_id, checkpoint)
);

-- ---------- Row Level Security ----------
alter table public.organizers  enable row level security;
alter table public.settings    enable row level security;
alter table public.students    enable row level security;
alter table public.alerts      enable row level security;
alter table public.emergencies enable row level security;
alter table public.attendance  enable row level security;

drop policy if exists org_self        on public.organizers;
drop policy if exists settings_read   on public.settings;
drop policy if exists settings_write  on public.settings;
drop policy if exists stu_select      on public.students;
drop policy if exists stu_insert      on public.students;
drop policy if exists stu_org_update  on public.students;
drop policy if exists stu_org_delete  on public.students;
drop policy if exists alerts_select   on public.alerts;
drop policy if exists alerts_insert   on public.alerts;
drop policy if exists alerts_delete   on public.alerts;
drop policy if exists emg_select      on public.emergencies;
drop policy if exists emg_insert      on public.emergencies;
drop policy if exists emg_update      on public.emergencies;
drop policy if exists att_select      on public.attendance;
drop policy if exists att_insert      on public.attendance;
drop policy if exists att_delete      on public.attendance;

create policy org_self       on public.organizers for select to authenticated using (user_id = auth.uid());

create policy settings_read  on public.settings for select to authenticated using (true);
create policy settings_write on public.settings for update to authenticated using (public.is_organizer()) with check (public.is_organizer());

create policy stu_select     on public.students for select to authenticated using (id = auth.uid() or public.is_organizer());
create policy stu_insert     on public.students for insert to authenticated
  with check (id = auth.uid() and payment_status = 'unpaid' and paid_amount = 0);
create policy stu_org_update on public.students for update to authenticated using (public.is_organizer()) with check (public.is_organizer());
create policy stu_org_delete on public.students for delete to authenticated using (public.is_organizer());

create policy alerts_select  on public.alerts for select to authenticated using (public.is_organizer() or public.is_confirmed_student());
create policy alerts_insert  on public.alerts for insert to authenticated with check (public.is_organizer());
create policy alerts_delete  on public.alerts for delete to authenticated using (public.is_organizer());

create policy emg_select     on public.emergencies for select to authenticated using (student_id = auth.uid() or public.is_organizer());
create policy emg_insert     on public.emergencies for insert to authenticated with check (student_id = auth.uid() and public.is_confirmed_student());
create policy emg_update     on public.emergencies for update to authenticated using (public.is_organizer()) with check (public.is_organizer());

create policy att_select     on public.attendance for select to authenticated using (student_id = auth.uid() or public.is_organizer());
create policy att_insert     on public.attendance for insert to authenticated with check (public.is_organizer());
create policy att_delete     on public.attendance for delete to authenticated using (public.is_organizer());

-- ---------- Public trip info for the sign-up page (no bank details) ----------
create or replace function public.public_trip_info()
returns table (trip_name text, destination text, trip_date timestamptz, price int)
language sql security definer stable set search_path = public as $$
  select trip_name, destination, trip_date, price from public.settings where id = 1;
$$;
grant execute on function public.public_trip_info() to anon, authenticated;

-- ---------- Student submits payment screenshot (only way a student can change status) ----------
create or replace function public.submit_payment(p_path text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_path is null or left(p_path, 37) <> auth.uid()::text || '/' then
    raise exception 'Invalid file path';
  end if;
  update public.students
     set payment_proof_path = p_path,
         payment_status = 'pending',
         reject_reason = null,
         proof_submitted_at = now()
   where id = auth.uid() and payment_status in ('unpaid','rejected');
  if not found then raise exception 'Payment cannot be submitted right now'; end if;
end $$;
grant execute on function public.submit_payment(text) to authenticated;

-- ---------- Storage bucket for payment screenshots (private) ----------
insert into storage.buckets (id, name, public) values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do nothing;

drop policy if exists proofs_insert on storage.objects;
drop policy if exists proofs_select on storage.objects;
create policy proofs_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy proofs_select on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_organizer()));

-- ---------- Realtime (live alerts, live payment status, live emergencies) ----------
do $$
declare t text;
begin
  foreach t in array array['alerts','students','emergencies','attendance','settings'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;
