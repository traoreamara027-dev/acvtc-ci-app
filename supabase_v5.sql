-- ============================================================
-- ACVTC-CI V5 - Mise à niveau Supabase
-- À exécuter UNE SEULE FOIS dans Supabase > SQL Editor
-- Ce script conserve les profils V4 existants et ajoute la V5.
-- ============================================================

create extension if not exists pgcrypto;

-- 1) Rôle membre simple
insert into public.roles (nom)
select 'Membre'
where not exists (
  select 1 from public.roles where lower(trim(nom)) = 'membre'
);

-- 2) Enrichissement des profils existants
alter table public.profiles add column if not exists nom_complet text;
alter table public.profiles add column if not exists phone_e164 text;
alter table public.profiles add column if not exists verification_token uuid default gen_random_uuid();

update public.profiles
set nom_complet = trim(concat_ws(' ', nullif(prenoms,''), nullif(nom,'')))
where coalesce(nom_complet,'') = '';

update public.profiles
set verification_token = gen_random_uuid()
where verification_token is null;

create unique index if not exists profiles_verification_token_uq
on public.profiles(verification_token);

-- Normalisation des numéros ivoiriens
create or replace function public.normalize_ci_phone(p_phone text)
returns text
language sql
immutable
as $$
  select case
    when nullif(regexp_replace(coalesce(p_phone,''), '[^0-9+]', '', 'g'),'') is null then null
    when regexp_replace(coalesce(p_phone,''), '[^0-9+]', '', 'g') like '+%' then regexp_replace(coalesce(p_phone,''), '[^0-9+]', '', 'g')
    when regexp_replace(coalesce(p_phone,''), '[^0-9+]', '', 'g') like '225%' then '+' || regexp_replace(coalesce(p_phone,''), '[^0-9+]', '', 'g')
    when regexp_replace(coalesce(p_phone,''), '[^0-9+]', '', 'g') like '0%' then '+225' || substr(regexp_replace(coalesce(p_phone,''), '[^0-9+]', '', 'g'), 2)
    else '+225' || regexp_replace(coalesce(p_phone,''), '[^0-9+]', '', 'g')
  end;
$$;

update public.profiles
set phone_e164 = public.normalize_ci_phone(telephone)
where coalesce(phone_e164,'') = '' and coalesce(telephone,'') <> '';

-- 3) Référentiels accessibles au client
create or replace function public.list_sections()
returns table(id integer, nom text)
language sql
stable
security definer
set search_path = public
as $$
  select s.id::integer, s.nom::text from public.sections s order by s.id;
$$;

create or replace function public.list_roles()
returns table(id integer, nom text)
language sql
stable
security definer
set search_path = public
as $$
  select r.id::integer, r.nom::text from public.roles r order by r.id;
$$;

grant execute on function public.list_sections() to anon, authenticated;
grant execute on function public.list_roles() to anon, authenticated;

-- 4) Fonctions de droits
create or replace function public.current_role_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select r.nom
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.id = auth.uid()
  limit 1;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(lower(trim(public.current_role_name())) <> 'membre', false);
$$;

create or replace function public.is_president()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(trim(public.current_role_name())) in ('président','president');
$$;

create or replace function public.can_manage_pv()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_president()
      or lower(coalesce(public.current_role_name(),'')) like '%secrétaire%'
      or lower(coalesce(public.current_role_name(),'')) like '%secretaire%';
$$;

create or replace function public.can_manage_finance()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_president()
      or lower(coalesce(public.current_role_name(),'')) like '%trésor%'
      or lower(coalesce(public.current_role_name(),'')) like '%tresor%';
$$;

grant execute on function public.current_role_name() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_president() to authenticated;
grant execute on function public.can_manage_pv() to authenticated;
grant execute on function public.can_manage_finance() to authenticated;

-- 5) Compteurs et numéros automatiques
create table if not exists public.member_number_counters (
  section_id integer primary key references public.sections(id) on delete cascade,
  last_value integer not null default 0
);

insert into public.member_number_counters(section_id,last_value)
select s.id, count(p.id)::integer
from public.sections s
left join public.profiles p on p.section_id = s.id
group by s.id
on conflict (section_id) do nothing;

create or replace function public.next_member_number(p_section_id integer)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value integer;
  v_code text;
begin
  insert into public.member_number_counters(section_id,last_value)
  values (p_section_id,1)
  on conflict (section_id)
  do update set last_value = public.member_number_counters.last_value + 1
  returning last_value into v_value;

  select case lower(s.nom)
    when 'abidjan' then 'ABJ'
    when 'bouaké' then 'BKE'
    when 'bouake' then 'BKE'
    when 'yamoussoukro' then 'YAK'
    else upper(substr(regexp_replace(s.nom,'[^A-Za-z]','','g'),1,3))
  end
  into v_code
  from public.sections s where s.id = p_section_id;

  return 'ACVTC-' || coalesce(v_code,'CI') || '-' || lpad(v_value::text,4,'0');
end;
$$;

-- 6) Membres préparés par les administrateurs
create table if not exists public.pending_members (
  id uuid primary key default gen_random_uuid(),
  nom_complet text not null,
  phone_e164 text not null unique,
  section_id integer not null references public.sections(id),
  role_id integer not null references public.roles(id),
  created_by uuid,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  claimed_by uuid
);

alter table public.pending_members enable row level security;

create or replace function public.admin_create_member(
  p_nom_complet text,
  p_phone text,
  p_section_id integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role integer;
  v_phone text;
  v_id uuid;
begin
  if not public.is_admin() then raise exception 'Accès refusé'; end if;
  v_phone := public.normalize_ci_phone(p_phone);
  if v_phone is null then raise exception 'Numéro de téléphone invalide'; end if;

  select id into v_role from public.roles where lower(trim(nom))='membre' limit 1;
  if v_role is null then raise exception 'Le rôle Membre est introuvable'; end if;

  if exists (select 1 from public.profiles where public.normalize_ci_phone(coalesce(phone_e164,telephone)) = v_phone) then
    raise exception 'Ce numéro appartient déjà à un membre';
  end if;

  insert into public.pending_members(nom_complet, phone_e164, section_id, role_id, created_by)
  values (trim(p_nom_complet), v_phone, p_section_id, v_role, auth.uid())
  on conflict (phone_e164) do update
    set nom_complet=excluded.nom_complet,
        section_id=excluded.section_id,
        role_id=excluded.role_id,
        created_by=auth.uid(),
        created_at=now(),
        claimed_at=null,
        claimed_by=null
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.president_create_admin(
  p_nom_complet text,
  p_phone text,
  p_section_id integer,
  p_role_id integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_role_name text;
  v_id uuid;
begin
  if not public.is_president() then raise exception 'Réservé au Président'; end if;
  select nom into v_role_name from public.roles where id=p_role_id;
  if v_role_name is null or lower(trim(v_role_name))='membre' then raise exception 'Rôle administrateur invalide'; end if;
  v_phone := public.normalize_ci_phone(p_phone);
  if v_phone is null then raise exception 'Numéro de téléphone invalide'; end if;

  insert into public.pending_members(nom_complet, phone_e164, section_id, role_id, created_by)
  values (trim(p_nom_complet), v_phone, p_section_id, p_role_id, auth.uid())
  on conflict (phone_e164) do update
    set nom_complet=excluded.nom_complet,
        section_id=excluded.section_id,
        role_id=excluded.role_id,
        created_by=auth.uid(),
        created_at=now(),
        claimed_at=null,
        claimed_by=null
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on function public.admin_create_member(text,text,integer) to authenticated;
grant execute on function public.president_create_admin(text,text,integer,integer) to authenticated;

-- À la première connexion par SMS, le profil préparé est automatiquement réclamé.
create or replace function public.claim_phone_profile()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_pending public.pending_members%rowtype;
  v_num text;
begin
  if auth.uid() is null then return false; end if;
  if exists (select 1 from public.profiles where id=auth.uid()) then return true; end if;

  v_phone := public.normalize_ci_phone(auth.jwt()->>'phone');
  if v_phone is null then return false; end if;

  select * into v_pending
  from public.pending_members
  where phone_e164=v_phone and claimed_at is null
  order by created_at desc
  limit 1;

  if v_pending.id is null then return false; end if;

  v_num := public.next_member_number(v_pending.section_id);

  insert into public.profiles(
    id, nom, prenoms, nom_complet, telephone, phone_e164,
    section_id, role_id, numero_membre, actif, verification_token
  ) values (
    auth.uid(), v_pending.nom_complet, '', v_pending.nom_complet, v_phone, v_phone,
    v_pending.section_id, v_pending.role_id, v_num, true, gen_random_uuid()
  );

  update public.pending_members
  set claimed_at=now(), claimed_by=auth.uid()
  where id=v_pending.id;

  return true;
end;
$$;

grant execute on function public.claim_phone_profile() to authenticated;

-- Liste sécurisée des membres pour tous les administrateurs
create or replace function public.admin_list_members()
returns table(
  id uuid,
  nom text,
  prenoms text,
  nom_complet text,
  telephone text,
  phone_e164 text,
  section_id integer,
  role_id integer,
  numero_membre text,
  actif boolean
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Accès refusé'; end if;
  return query
    select p.id, p.nom, p.prenoms, p.nom_complet, p.telephone, p.phone_e164,
           p.section_id::integer, p.role_id::integer, p.numero_membre, p.actif
    from public.profiles p
    order by coalesce(p.nom_complet,p.nom), p.prenoms;
end;
$$;

grant execute on function public.admin_list_members() to authenticated;

-- 7) Photo du membre
create or replace function public.set_my_photo_url(p_url text)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.profiles set photo_url=p_url where id=auth.uid();
  return found;
end;
$$;
grant execute on function public.set_my_photo_url(text) to authenticated;

-- 8) Vérification publique du QR code
create or replace function public.verify_member_card(p_token text)
returns table(
  nom_complet text,
  numero_membre text,
  section_nom text,
  role_nom text,
  actif boolean,
  photo_url text
)
language sql
stable
security definer
set search_path=public
as $$
  select coalesce(p.nom_complet,trim(concat_ws(' ',p.prenoms,p.nom))),
         p.numero_membre,
         s.nom,
         r.nom,
         p.actif,
         p.photo_url
  from public.profiles p
  join public.sections s on s.id=p.section_id
  join public.roles r on r.id=p.role_id
  where p.verification_token::text = p_token
  limit 1;
$$;
grant execute on function public.verify_member_card(text) to anon, authenticated;

-- 9) Messages aux conducteurs
create table if not exists public.messages (
  id bigserial primary key,
  titre text not null,
  contenu text not null,
  section_id integer references public.sections(id),
  important boolean not null default false,
  publie boolean not null default true,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.messages enable row level security;

drop policy if exists v5_messages_read on public.messages;
create policy v5_messages_read on public.messages for select to authenticated using (publie=true);
drop policy if exists v5_messages_admin_insert on public.messages;
create policy v5_messages_admin_insert on public.messages for insert to authenticated with check (public.is_admin());
drop policy if exists v5_messages_admin_update on public.messages;
create policy v5_messages_admin_update on public.messages for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists v5_messages_admin_delete on public.messages;
create policy v5_messages_admin_delete on public.messages for delete to authenticated using (public.is_admin());

-- 10) Actualités VTC
create table if not exists public.vtc_news (
  id bigserial primary key,
  titre text not null,
  pays text,
  categorie text,
  resume text not null,
  source_url text,
  publie boolean not null default true,
  published_at timestamptz not null default now(),
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.vtc_news enable row level security;

drop policy if exists v5_news_read on public.vtc_news;
create policy v5_news_read on public.vtc_news for select to authenticated using (publie=true);
drop policy if exists v5_news_admin_insert on public.vtc_news;
create policy v5_news_admin_insert on public.vtc_news for insert to authenticated with check (public.is_admin());
drop policy if exists v5_news_admin_update on public.vtc_news;
create policy v5_news_admin_update on public.vtc_news for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists v5_news_admin_delete on public.vtc_news;
create policy v5_news_admin_delete on public.vtc_news for delete to authenticated using (public.is_admin());

-- 11) Archives des procès-verbaux
create table if not exists public.pv_documents (
  id bigserial primary key,
  titre text not null,
  date_reunion date not null,
  type_pv text,
  resume text,
  file_path text not null,
  file_name text,
  created_by uuid,
  created_at timestamptz not null default now()
);
alter table public.pv_documents enable row level security;

drop policy if exists v5_pv_read on public.pv_documents;
create policy v5_pv_read on public.pv_documents for select to authenticated using (public.is_admin());
drop policy if exists v5_pv_insert on public.pv_documents;
create policy v5_pv_insert on public.pv_documents for insert to authenticated with check (public.can_manage_pv());
drop policy if exists v5_pv_update on public.pv_documents;
create policy v5_pv_update on public.pv_documents for update to authenticated using (public.can_manage_pv()) with check (public.can_manage_pv());
drop policy if exists v5_pv_delete on public.pv_documents;
create policy v5_pv_delete on public.pv_documents for delete to authenticated using (public.can_manage_pv());

-- 12) Cotisations de base
create table if not exists public.cotisations (
  id bigserial primary key,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  mois date not null,
  montant integer not null default 500,
  statut text not null default 'impaye' check (statut in ('impaye','paye')),
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique(profile_id, mois)
);
alter table public.cotisations enable row level security;

drop policy if exists v5_cotis_self_read on public.cotisations;
create policy v5_cotis_self_read on public.cotisations for select to authenticated using (profile_id=auth.uid() or public.can_manage_finance());
drop policy if exists v5_cotis_finance_insert on public.cotisations;
create policy v5_cotis_finance_insert on public.cotisations for insert to authenticated with check (public.can_manage_finance());
drop policy if exists v5_cotis_finance_update on public.cotisations;
create policy v5_cotis_finance_update on public.cotisations for update to authenticated using (public.can_manage_finance()) with check (public.can_manage_finance());

-- 13) Politiques minimales du profil courant
alter table public.profiles enable row level security;
drop policy if exists v5_profile_self_select on public.profiles;
create policy v5_profile_self_select on public.profiles for select to authenticated using (id=auth.uid());
drop policy if exists v5_profile_self_update on public.profiles;
create policy v5_profile_self_update on public.profiles for update to authenticated using (id=auth.uid()) with check (id=auth.uid());

-- 14) Stockage des photos et PV
insert into storage.buckets(id,name,public)
values ('member-photos','member-photos',true)
on conflict (id) do update set public=true;

insert into storage.buckets(id,name,public)
values ('pv-files','pv-files',false)
on conflict (id) do nothing;

drop policy if exists v5_member_photos_insert on storage.objects;
create policy v5_member_photos_insert on storage.objects for insert to authenticated
with check (bucket_id='member-photos' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists v5_member_photos_update on storage.objects;
create policy v5_member_photos_update on storage.objects for update to authenticated
using (bucket_id='member-photos' and (storage.foldername(name))[1]=auth.uid()::text)
with check (bucket_id='member-photos' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists v5_pv_storage_read on storage.objects;
create policy v5_pv_storage_read on storage.objects for select to authenticated
using (bucket_id='pv-files' and public.is_admin());

drop policy if exists v5_pv_storage_insert on storage.objects;
create policy v5_pv_storage_insert on storage.objects for insert to authenticated
with check (bucket_id='pv-files' and public.can_manage_pv());

drop policy if exists v5_pv_storage_update on storage.objects;
create policy v5_pv_storage_update on storage.objects for update to authenticated
using (bucket_id='pv-files' and public.can_manage_pv())
with check (bucket_id='pv-files' and public.can_manage_pv());

drop policy if exists v5_pv_storage_delete on storage.objects;
create policy v5_pv_storage_delete on storage.objects for delete to authenticated
using (bucket_id='pv-files' and public.can_manage_pv());

-- Fin de la migration V5.
