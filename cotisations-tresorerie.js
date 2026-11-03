// Saisie des cotisations depuis la liste des membres, par période complète.
(function () {
  'use strict';
  window.installerCotisationsTresorerieV7 = function (content) {
    const root = document.createElement('section');
    root.id = 'treasury-members-v7'; root.className = 'card'; content.prepend(root);
    const esc = echapperHtml, money = n => Number(n).toLocaleString('fr-FR') + ' FCFA';
    const normalize = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('fr').trim();
    const monthLabel = s => new Date(s.slice(0,7)+'-01T12:00:00Z').toLocaleDateString('fr-FR',{month:'long',year:'numeric',timeZone:'UTC'});
    const globalWrite = [1,5].includes(Number(profilActuel?.role_id));
    const sectionId = profilActuel?.section_id;
    let members = [], search = '', page = 0, generation = 0;
    const $ = id => root.querySelector('#'+id);
    function list() {
      generation++;
      const terms = normalize(search).split(/\s+/).filter(Boolean);
      const matches = members.map((m,i)=>({m,i})).filter(({m})=>terms.every(t=>normalize(m.nom_complet+' '+(m.numero_membre || '')).includes(t)));
      page = Math.max(0, Math.min(page, Math.ceil(matches.length/30)-1));
      root.innerHTML = `<h2>Cotisations des membres</h2><p>Choisissez un membre pour ajouter sa cotisation.</p>
        <label for="treasury-member-search">Rechercher par nom ou numéro de membre</label><input id="treasury-member-search" type="search" autocomplete="off" placeholder="Nom, prénom ou numéro de membre" value="${esc(search)}">
        <p id="treasury-member-count" class="note" role="status">${matches.length} membre(s) · ${globalWrite?'Toutes les sections':esc(nomSection(sectionId))}</p>
        <div class="treasury-member-list">${matches.slice(page*30,page*30+30).map(({m,i})=>`<button type="button" class="treasury-member-row" data-member="${i}"><span><strong>${esc(m.nom_complet)}</strong><small>${esc(nomSection(m.section_id))}${m.numero_membre?' · '+esc(m.numero_membre):''}</small></span><span class="treasury-member-add">Ajouter sa cotisation →</span></button>`).join('') || '<p>Aucun membre trouvé. Essayez un autre nom.</p>'}</div>
        <div class="treasury-member-pages"><button class="btn btn-light" type="button" id="treasury-prev" ${page===0?'disabled':''}>Précédent</button><span>Page ${page+1} / ${Math.max(1,Math.ceil(matches.length/30))}</span><button class="btn btn-light" type="button" id="treasury-next" ${(page+1)*30>=matches.length?'disabled':''}>Suivant</button></div>`;
      $('treasury-member-search').addEventListener('input',e=>{
        search=e.target.value;const position=e.target.selectionStart;page=0;list();
        $('treasury-member-search').focus();
        if(position!==null) $('treasury-member-search').setSelectionRange(position,position);
      });
      root.querySelectorAll('[data-member]').forEach(b=>b.addEventListener('click',()=>form(members[Number(b.dataset.member)])));
      $('treasury-prev').onclick=()=>{page--;list();};$('treasury-next').onclick=()=>{page++;list();};
    }
    function form(member) {
      generation++; let quoteVersion=0, quote=null, timer=null, saving=false;
      root.innerHTML=`<button type="button" class="btn btn-light" id="treasury-back">← Liste des membres</button><h2>Ajouter une cotisation</h2>
        <h3 id="treasury-selected-name" tabindex="-1">${esc(member.nom_complet)}</h3><p class="note">${esc(nomSection(member.section_id))}${member.numero_membre?' · '+esc(member.numero_membre):''}</p>
        <form id="treasury-contribution-form"><fieldset id="treasury-fields" class="treasury-fields">
          <label for="treasury-frequency">Période de cotisation</label><select id="treasury-frequency"><option value="1">Mensuelle — 1 mois</option><option value="2">Bimestrielle — 2 mois</option><option value="3">Trimestrielle — 3 mois</option><option value="6">Semestrielle — 6 mois</option><option value="12">Annuelle — janvier à décembre</option><option value="custom">Autre nombre de mois</option></select>
          <div id="treasury-custom-wrap" hidden><label for="treasury-custom">Nombre de mois</label><input id="treasury-custom" disabled type="number" min="1" max="60" step="1" value="1"></div>
          <div id="treasury-month-wrap"><label for="treasury-start">Premier mois à payer</label><input id="treasury-start" type="month" min="2000-01" max="2100-12" required value="${new Date().toISOString().slice(0,7)}"></div>
          <div id="treasury-year-wrap" hidden><label for="treasury-year">Année de cotisation</label><input id="treasury-year" disabled type="number" min="2000" max="2100" step="1" value="${new Date().getUTCFullYear()}"></div>
          <p class="note">Les mois couverts et le montant total sont calculés avant validation. Aucune pénalité ajoutée.</p>
          <div id="treasury-quote" class="treasury-quote" aria-live="polite">Calcul de la période…</div>
          <label for="treasury-method">Moyen de paiement reçu</label><select id="treasury-method"><option value="ESPECES">Espèces — remise en main propre</option><option value="WAVE">Wave</option><option value="ORANGE_MONEY">Orange Money</option></select>
          <p class="note">Confirmez uniquement l’argent déjà reçu. Cet enregistrement ne prélève pas le membre.</p>
          <button class="btn btn-primary" id="treasury-save" type="submit" disabled>Confirmer la cotisation reçue</button>
        </fieldset><p id="treasury-save-status" role="status" aria-live="polite"></p></form>`;
      $('treasury-selected-name').focus();
      const formGeneration=generation;
      function parameters(){
        const frequency=$('treasury-frequency').value;
        const count=frequency==='custom'?Number($('treasury-custom').value):Number(frequency);
        const start=frequency==='12'?`${$('treasury-year').value}-01`:$('treasury-start').value;
        if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(start) || start<'2000-01' || start>'2100-12' || !Number.isInteger(count)||count<1||count>60) return null;
        return {p_member_id:member.id,p_start_period:start+'-01',p_month_count:count};
      }
      async function updateQuote(){
        if(saving)return;
        clearTimeout(timer); const version=++quoteVersion; quote=null;
        $('treasury-save').disabled=true;
        const params=parameters();
        if(!params){$('treasury-quote').textContent='Choisissez une date valide et entre 1 et 60 mois.';return;}
        $('treasury-quote').textContent='Vérification des mois et du montant…';
        let rep;
        try { rep=await supabaseClient.rpc('contribution_period_quote_v7',params); }
        catch (_) { rep={error:{message:'Vérifiez votre connexion.'}}; }
        if(!root.isConnected||generation!==formGeneration||version!==quoteVersion)return;
        if(rep.error){$('treasury-quote').innerHTML='<p>Calcul indisponible. Vérifiez votre connexion.</p><button type="button" class="btn btn-light" id="treasury-retry-quote">Réessayer</button>';$('treasury-retry-quote').onclick=updateQuote;return;}
        const rows=rep.data||[];
        if(rows.length!==params.p_month_count){$('treasury-quote').textContent='Période incomplète. Changez la date pour réessayer.';return;}
        const total=rows.reduce((sum,r)=>sum+Number(r.amount),0);
        const blocked=rows.some(r=>r.already_paid||r.pending);
        $('treasury-quote').innerHTML=`<strong>${esc(monthLabel(rows[0].period))}${rows.length>1?' à '+esc(monthLabel(rows.at(-1).period)):''}</strong><p>${rows.length} mois · Total reçu : <b>${money(total)}</b></p><details><summary>Voir les mois couverts</summary><ul>${rows.map(r=>`<li>${esc(monthLabel(r.period))} : ${money(r.amount)}${r.already_paid?' — déjà payé':r.pending?' — paiement en attente':''}</li>`).join('')}</ul></details>${blocked?'<p class="treasury-conflict">Certains mois sont déjà payés ou en attente. Choisissez une autre période ou vérifiez les paiements en attente.</p>':''}`;
        if(!blocked&&Number.isSafeInteger(total)&&total>0){quote={...params,total};$('treasury-save').disabled=false;}
      }
      function changed(){
        quoteVersion++;quote=null;$('treasury-save').disabled=true;
        const annual=$('treasury-frequency').value==='12';
        $('treasury-month-wrap').hidden=annual;$('treasury-start').required=!annual;$('treasury-start').disabled=annual;
        $('treasury-year-wrap').hidden=!annual;$('treasury-year').required=annual;$('treasury-year').disabled=!annual;
        const custom=$('treasury-frequency').value==='custom';$('treasury-custom-wrap').hidden=!custom;$('treasury-custom').required=custom;$('treasury-custom').disabled=!custom;
        clearTimeout(timer);timer=setTimeout(updateQuote,180);
      }
      for(const id of ['treasury-frequency','treasury-start','treasury-year','treasury-custom'])$(id).addEventListener('input',changed);
      $('treasury-back').onclick=()=>{if(!saving){clearTimeout(timer);list();$('treasury-member-search').focus();}};
      $('treasury-contribution-form').addEventListener('submit',async e=>{
        e.preventDefault();if(saving||!quote)return;
        const params=parameters();if(JSON.stringify(params)!==JSON.stringify({p_member_id:quote.p_member_id,p_start_period:quote.p_start_period,p_month_count:quote.p_month_count}))return updateQuote();
        const request={...params,p_expected_total:quote.total,p_payment_method:$('treasury-method').value};
        saving=true;$('treasury-fields').disabled=true;$('treasury-back').disabled=true;
        $('treasury-save-status').textContent='Enregistrement en cours…';
        try{
          const rep=await supabaseClient.rpc('record_contribution_period_v7',request);
          if(!root.isConnected)return;
          if(rep.error){$('treasury-save-status').textContent=rep.error.message||'Enregistrement refusé. Vérifiez la période.';return;}
          $('treasury-save-status').textContent=`Cotisation confirmée : ${rep.data.months} mois, ${money(rep.data.total)}. Le solde est actualisé.`;
          toast('Cotisation confirmée : '+money(rep.data.total));
          // Refresh the existing summary and journal together after the atomic write.
          await window.finances();
        }catch(_){if(root.isConnected)$('treasury-save-status').textContent='Connexion interrompue. Vérifiez les mois avant de réessayer.';}
        finally{saving=false;if(root.isConnected){$('treasury-fields').disabled=false;$('treasury-back').disabled=false;await updateQuote();}}
      });
      updateQuote();
    }
    async function load(){
      root.innerHTML='<h2>Cotisations des membres</h2><p role="status">Chargement de la liste des membres…</p>';
      members=[];
      try{
        for(let offset=0;;){
          let q=supabaseClient.from('members_v5').select('id,nom_complet,numero_membre,section_id').eq('actif',true).order('nom_complet').order('id').range(offset,offset+499);
          if(!globalWrite)q=q.eq('section_id',sectionId);
          const rep=await q;if(!root.isConnected)return;if(rep.error)throw rep.error;
          const rows=rep.data||[];if(!rows.length)break;members.push(...rows);offset+=rows.length;
        }
        list();
      }catch(_){if(root.isConnected){root.innerHTML='<h2>Cotisations des membres</h2><p>Liste indisponible. Vérifiez votre connexion.</p><button type="button" class="btn btn-light" id="treasury-retry">Réessayer</button>';$('treasury-retry').onclick=load;}}
    }
    load();
  };
})();
