begin;
create schema if not exists private;
grant usage on schema private to authenticated;
create or replace function private.finance_access(p_section bigint, p_write boolean default false)
returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.members_v5 m where m.auth_user_id=auth.uid() and m.actif and (
 m.role_id in (1,5) or (not p_write and m.role_id=2) or
 (m.section_id=p_section and (m.role_id=6 or (not p_write and m.role_id=7))) ));
$$;
revoke all on function private.finance_access(bigint,boolean) from public,anon;
grant execute on function private.finance_access(bigint,boolean) to authenticated;
create table public.section_treasury_v6 (
 section_id bigint primary key references public.sections(id),
 treasurer_phone text not null check (treasurer_phone ~ '^\+225[0-9]{10}$'),
 updated_at timestamptz not null default now()
);
alter table public.section_treasury_v6 enable row level security;
grant select,insert,update on public.section_treasury_v6 to authenticated;
create policy treasury_read on public.section_treasury_v6 for select to authenticated using (
 private.finance_access(section_id,false) or exists(select 1 from public.members_v5 m where m.auth_user_id=auth.uid() and m.actif and m.section_id=section_treasury_v6.section_id));
create policy treasury_insert on public.section_treasury_v6 for insert to authenticated with check(private.finance_access(section_id,true));
create policy treasury_update on public.section_treasury_v6 for update to authenticated using(private.finance_access(section_id,true)) with check(private.finance_access(section_id,true));
create table public.cash_entries_v6 (
 id uuid primary key default gen_random_uuid(), section_id bigint not null references public.sections(id),
 kind text not null check(kind in ('income','expense','opening')),
 amount bigint not null check(amount>0 and amount<=1000000000000),
 entry_date date not null default current_date,
 reason text not null check(length(trim(reason)) between 1 and 500),
 details text not null default '' check(length(details)<=3000),
 receipt_reference text not null default '' check(length(receipt_reference)<=500),
 created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now()
);
create index cash_entries_v6_section_date on public.cash_entries_v6(section_id,entry_date desc);
create index cash_entries_v6_author on public.cash_entries_v6(created_by);
alter table public.cash_entries_v6 enable row level security;
grant select,insert on public.cash_entries_v6 to authenticated;
create policy cash_read on public.cash_entries_v6 for select to authenticated using(private.finance_access(section_id,false));
create policy cash_insert on public.cash_entries_v6 for insert to authenticated with check(private.finance_access(section_id,true) and created_by=auth.uid());
-- Existing cotisations must follow the same section boundaries, including direct Data API access.
drop policy if exists contributions_v5_manage on public.contributions_v5;
drop policy if exists contributions_v5_read on public.contributions_v5;
create policy contributions_v5_read on public.contributions_v5 for select to authenticated using(member_id=public.current_member_id_v5() or exists(select 1 from public.members_v5 m where m.id=member_id and private.finance_access(m.section_id,false)));
create policy contributions_v5_insert on public.contributions_v5 for insert to authenticated with check(exists(select 1 from public.members_v5 m where m.id=member_id and private.finance_access(m.section_id,true)));
create policy contributions_v5_update on public.contributions_v5 for update to authenticated using(exists(select 1 from public.members_v5 m where m.id=member_id and private.finance_access(m.section_id,true))) with check(exists(select 1 from public.members_v5 m where m.id=member_id and private.finance_access(m.section_id,true)));
drop policy if exists payment_declarations_v5_read on public.payment_declarations_v5;
drop policy if exists payment_declarations_v5_finance_update on public.payment_declarations_v5;
create policy payment_declarations_v5_read on public.payment_declarations_v5 for select to authenticated using(member_id=public.current_member_id_v5() or exists(select 1 from public.members_v5 m where m.id=member_id and private.finance_access(m.section_id,false)));
create policy payment_declarations_v5_finance_update on public.payment_declarations_v5 for update to authenticated using(exists(select 1 from public.members_v5 m where m.id=member_id and private.finance_access(m.section_id,true))) with check(exists(select 1 from public.members_v5 m where m.id=member_id and private.finance_access(m.section_id,true)));
create or replace function public.finance_summary_v6() returns table(section_id bigint,section_name text,income numeric,expense numeric,balance numeric)
language sql stable security invoker set search_path='' as $$
 select s.id,s.nom,coalesce(c.total,0)+coalesce(e.income,0),coalesce(e.expense,0),coalesce(c.total,0)+coalesce(e.income,0)+coalesce(e.opening,0)-coalesce(e.expense,0)
 from public.sections s
 left join lateral(select sum(c.amount+c.penalty) total from public.contributions_v5 c join public.members_v5 m on m.id=c.member_id where m.section_id=s.id and c.status='payé') c on true
 left join lateral(select sum(amount) filter(where kind='income') income,sum(amount) filter(where kind='expense') expense,sum(amount) filter(where kind='opening') opening from public.cash_entries_v6 where section_id=s.id) e on true
 where private.finance_access(s.id,false);
$$;
revoke all on function public.finance_summary_v6() from public,anon;
grant execute on function public.finance_summary_v6() to authenticated;
-- Retire temporary-payment creation while keeping old records intact.
revoke execute on function public.get_treasury_settings_v6() from public,anon,authenticated;
revoke execute on function public.set_treasurer_phone_v6(text) from public,anon,authenticated;
alter function public.list_pending_payments_v5() security invoker;
alter function public.list_confirmed_contributions_v5() security invoker;
alter function public.review_payment_v5(uuid,text,text) security invoker;
alter function public.record_contribution_v5(uuid,date,integer,integer,text,text) security invoker;
revoke execute on function public.create_payment_link_v6(uuid,numeric,text,text,text,integer) from public,anon,authenticated;
revoke execute on function public.list_my_payment_links_v6() from public,anon,authenticated;
revoke execute on function public.list_payment_links_admin_v6() from public,anon,authenticated;
revoke execute on function public.resolve_payment_link_v6(uuid) from public,anon,authenticated;
revoke execute on function public.cancel_payment_link_v6(uuid) from public,anon,authenticated;
commit;
