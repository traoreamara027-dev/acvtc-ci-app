-- V7: données personnelles séparées des finances de l'association.
create table public.personal_entries_v7 (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 kind text not null check(kind in ('income','expense')),
 amount bigint not null check(amount between 1 and 1000000000),
 label text not null check(length(btrim(label)) between 1 and 160),
 entry_date date not null default current_date,
 created_at timestamptz not null default now()
);
create index personal_entries_v7_owner_date on public.personal_entries_v7(user_id,entry_date desc);
alter table public.personal_entries_v7 enable row level security;
create policy personal_entries_owner on public.personal_entries_v7 for all to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
revoke all on public.personal_entries_v7 from anon;
grant select,insert,update,delete on public.personal_entries_v7 to authenticated;

create table public.personal_goals_v7 (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 title text not null check(length(btrim(title)) between 1 and 160),
 target bigint not null check(target between 1 and 1000000000),
 saved bigint not null default 0 check(saved>=0 and saved<=target),
 deadline date not null,
 created_at timestamptz not null default now()
);
create index personal_goals_v7_owner on public.personal_goals_v7(user_id);
alter table public.personal_goals_v7 enable row level security;
create policy personal_goals_owner on public.personal_goals_v7 for all to authenticated
 using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
revoke all on public.personal_goals_v7 from anon;
grant select,insert,update,delete on public.personal_goals_v7 to authenticated;

create function public.personal_budget_snapshot_v7(p_month date) returns jsonb
 language sql stable security invoker set search_path='' as $$
 with own_entries as (
  select * from public.personal_entries_v7 where user_id=(select auth.uid())
 ), own_contributions as (
  select c.id,(c.amount::bigint+c.penalty::bigint) amount,coalesce(c.paid_at,c.updated_at)::date entry_date,c.period
  from public.contributions_v5 c join public.members_v5 m on m.id=c.member_id
  where m.auth_user_id=(select auth.uid()) and c.status='payé'
 ), movements as (
  select id,kind,amount,label,entry_date,false imported from own_entries
  union all
  select id,'expense',amount,'Cotisation ACVTC — '||to_char(period,'MM/YYYY'),entry_date,true from own_contributions
 ), bounds as(select date_trunc('month',p_month)::date start_date,(date_trunc('month',p_month)+interval '1 month')::date end_date)
 select jsonb_build_object(
  'income',coalesce((select sum(amount) from movements,bounds where kind='income' and entry_date>=start_date and entry_date<end_date),0),
  'expense',coalesce((select sum(amount) from movements,bounds where kind='expense' and entry_date>=start_date and entry_date<end_date),0),
  'daily_capacity',coalesce((select sum(case when kind='income' then amount else -amount end)/30.0 from movements where entry_date between current_date-29 and current_date),0),
  'tracking_days',(select count(distinct entry_date) from own_entries where entry_date between current_date-29 and current_date),
  'history',coalesce((select jsonb_agg(to_jsonb(t)) from (select movements.* from movements,bounds where entry_date>=start_date and entry_date<end_date order by entry_date desc,id limit 50)t),'[]'::jsonb)
 );
$$;
revoke all on function public.personal_budget_snapshot_v7(date) from public,anon;
grant execute on function public.personal_budget_snapshot_v7(date) to authenticated;

create table public.emergency_contacts_v7 (
 id text primary key, name text not null, location text not null default '',
 category text not null check(category in ('Police','Gendarmerie','Secours')),
 phones jsonb not null check(jsonb_typeof(phones)='array'),
 source_url text not null, last_seen timestamptz not null default now(),
 source_published text, pending jsonb
);
alter table public.emergency_contacts_v7 enable row level security;
create policy emergency_contacts_read on public.emergency_contacts_v7 for select to authenticated using(true);
revoke all on public.emergency_contacts_v7 from anon,authenticated;
grant select on public.emergency_contacts_v7 to authenticated;
create table public.emergency_sync_status_v7 (
 source_url text primary key, checked_at timestamptz not null default now(),
 success boolean not null, contact_count integer not null default 0
);
alter table public.emergency_sync_status_v7 enable row level security;
create policy emergency_status_read on public.emergency_sync_status_v7 for select to authenticated using(true);
revoke all on public.emergency_sync_status_v7 from anon,authenticated;
grant select on public.emergency_sync_status_v7 to authenticated;

create table private.emergency_sync_key_v7 (id boolean primary key default true check(id),key_hash text not null);
revoke all on private.emergency_sync_key_v7 from public,anon,authenticated;

-- Machine-to-machine capability restricted to this directory, never personal data.
create function public.commit_emergency_sync_v7(p_key text,p_contacts jsonb,p_status jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare item jsonb; count_saved integer:=0;
begin
 if p_key is null or not exists(select 1 from private.emergency_sync_key_v7
 where key_hash=encode(sha256(convert_to(p_key,'UTF8')),'hex')) then raise exception 'Accès refusé'; end if;
 if jsonb_typeof(p_contacts)<>'array' or jsonb_array_length(p_contacts)>600 then raise exception 'Données invalides'; end if;
 for item in select value from jsonb_array_elements(p_contacts) loop
  if item->>'source_url' !~ '^https://annuaire[.]gouv[.]ci/accueil/liste_institution/commissariats-de-police(/[1-9])?$'
    or length(item->>'name') not between 4 and 200
    or item->>'category' not in ('Police','Gendarmerie','Secours')
    or jsonb_typeof(item->'phones')<>'array' or jsonb_array_length(item->'phones') not between 1 and 20
    or exists(select 1 from jsonb_array_elements_text(item->'phones') p where p !~ '^\+225(01|05|07|21|25|27)[0-9]{8}$')
  then raise exception 'Contact invalide'; end if;
  insert into public.emergency_contacts_v7(id,name,location,category,phones,source_url)
   values(item->>'id',item->>'name',item->>'location',item->>'category',item->'phones',item->>'source_url')
  on conflict(id) do update set
   last_seen=case when emergency_contacts_v7.phones=excluded.phones then now() else emergency_contacts_v7.last_seen end,
   pending=case when emergency_contacts_v7.phones=excluded.phones then null else item end;
  count_saved:=count_saved+1;
 end loop;
 for item in select value from jsonb_array_elements(p_status) loop
  if item->>'source_url' !~ '^https://(annuaire[.]gouv[.]ci/|gendarmerie[.]gouv[.]ci/|www[.]police[.]gouv[.]ci/)' then raise exception 'Source interdite'; end if;
  insert into public.emergency_sync_status_v7(source_url,success,contact_count)
   values(item->>'source_url',(item->>'success')::boolean,(item->>'contact_count')::integer)
  on conflict(source_url) do update set checked_at=now(),success=excluded.success,contact_count=excluded.contact_count;
 end loop;
 return count_saved;
end $$;
revoke all on function public.commit_emergency_sync_v7(text,jsonb,jsonb) from public,authenticated;
grant execute on function public.commit_emergency_sync_v7(text,jsonb,jsonb) to anon;

create function public.approve_emergency_contact_v7(p_id text) returns void language plpgsql
 security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.members_v5 where auth_user_id=auth.uid() and actif and role_id in (1,5))
 then raise exception 'Accès refusé'; end if;
 update public.emergency_contacts_v7 set phones=pending->'phones',source_url=pending->>'source_url',
 last_seen=now(),pending=null where id=p_id and pending is not null;
end $$;
revoke all on function public.approve_emergency_contact_v7(text) from public,anon;
grant execute on function public.approve_emergency_contact_v7(text) to authenticated;

insert into public.emergency_contacts_v7(id,name,location,category,phones,source_url,source_published) values
 ('national-police','Police — urgence nationale','Côte d’Ivoire','Police','["100"]','https://www.gouv.ci/uploads/publications/1705065321AKWABA12012024.pdf','12 janvier 2024'),
 ('national-gendarmerie','Gendarmerie — urgence nationale','Côte d’Ivoire','Gendarmerie','["145"]','https://www.gouv.ci/uploads/publications/1705065321AKWABA12012024.pdf','12 janvier 2024'),
 ('national-pompiers','Pompiers — urgence nationale','Côte d’Ivoire','Secours','["180"]','https://www.gouv.ci/uploads/publications/1705065321AKWABA12012024.pdf','12 janvier 2024');
