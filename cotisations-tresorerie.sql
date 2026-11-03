-- Cotisations multi-mois : droits existants, écriture atomique et sans doublon.
create or replace function public.contribution_period_quote_v7(p_member_id uuid,p_start_period date,p_month_count integer)
returns table(period date,amount integer,already_paid boolean,pending boolean)
language plpgsql security invoker set search_path='' as $$
declare v_section bigint;
begin
 if auth.uid() is null then raise exception 'Connexion requise.'; end if;
 if p_start_period is null or p_start_period < date '2000-01-01' or p_start_period > date '2100-12-01' or p_month_count is null or p_month_count < 1 or p_month_count > 60 then raise exception 'Choisissez entre 1 et 60 mois et une date valide.'; end if;
 select m.section_id into v_section from public.members_v5 m where m.id=p_member_id and m.actif;
 if v_section is null or not private.finance_access(v_section,true) then raise exception 'Membre indisponible ou accès non autorisé.'; end if;
 return query
 select d.month_start, r.base_amount,
 exists(select 1 from public.contributions_v5 c where c.member_id=p_member_id and c.period=d.month_start and c.status='payé'),
 exists(select 1 from public.payment_declarations_v5 p where p.member_id=p_member_id and p.period=d.month_start and p.status='PENDING')
 from (select (date_trunc('month',p_start_period)+make_interval(months=>i))::date month_start from generate_series(0,p_month_count-1) i) d
 cross join lateral public.monthly_due_v5(d.month_start,current_date) r
 order by d.month_start;
end;
$$;
revoke all on function public.contribution_period_quote_v7(uuid,date,integer) from public,anon;
grant execute on function public.contribution_period_quote_v7(uuid,date,integer) to authenticated;

create or replace function public.record_contribution_period_v7(p_member_id uuid,p_start_period date,p_month_count integer,p_expected_total integer,p_payment_method text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare v_row record; v_total bigint; v_ids uuid[]='{}'; v_id uuid; v_validator uuid;
begin
 if auth.uid() is null then raise exception 'Connexion requise.'; end if;
 if p_payment_method is null or p_payment_method not in ('ESPECES','WAVE','ORANGE_MONEY') then raise exception 'Moyen de paiement invalide.'; end if;
 -- Serialize new multi-month submissions for this member, including retries.
 perform pg_advisory_xact_lock(hashtextextended(p_member_id::text,0));
 select sum(q.amount) into v_total from public.contribution_period_quote_v7(p_member_id,p_start_period,p_month_count) q;
 if p_expected_total is null or v_total is null or v_total <> p_expected_total or v_total < 1 then raise exception 'Le montant a changé. Actualisez le récapitulatif avant de confirmer.'; end if;
 v_validator := public.current_member_id_v5();
 for v_row in select * from public.contribution_period_quote_v7(p_member_id,p_start_period,p_month_count) loop
   if v_row.already_paid then raise exception 'Le mois % est déjà payé. Aucun nouveau versement enregistré.',to_char(v_row.period,'MM/YYYY'); end if;
   if v_row.pending then raise exception 'Un paiement est déjà en attente pour %. Vérifiez-le avant de continuer.',to_char(v_row.period,'MM/YYYY'); end if;
   v_id := null;
   insert into public.contributions_v5(member_id,period,amount,penalty,status,payment_method,paid_at,validated_by_member_id,updated_at)
   values(p_member_id,v_row.period,v_row.amount,0,'payé',p_payment_method,now(),v_validator,now())
   on conflict(member_id,period) do update set amount=excluded.amount,penalty=0,status='payé',payment_method=excluded.payment_method,paid_at=excluded.paid_at,validated_by_member_id=excluded.validated_by_member_id,updated_at=now()
   where public.contributions_v5.status is distinct from 'payé'
   returning id into v_id;
   if v_id is null then raise exception 'Un des mois vient d’être payé. Aucun doublon enregistré.'; end if;
   v_ids := array_append(v_ids,v_id);
 end loop;
 return jsonb_build_object('months',array_length(v_ids,1),'total',v_total);
end;
$$;
revoke all on function public.record_contribution_period_v7(uuid,date,integer,integer,text) from public,anon;
grant execute on function public.record_contribution_period_v7(uuid,date,integer,integer,text) to authenticated;
