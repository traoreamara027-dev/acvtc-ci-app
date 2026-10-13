// ACVTC-CI V6 — modules complémentaires : aides sociales, votes et paiements temporaires.
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (v) => typeof echapperHtml === 'function' ? echapperHtml(v) : String(v ?? '');
  const fmt = (n) => Number(n || 0).toLocaleString('fr-FR');

  function injectStyles() {
    if ($('acvtc-v6-extra-styles')) return;
    const style = document.createElement('style');
    style.id = 'acvtc-v6-extra-styles';
    style.textContent = `
      .v6x-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}
      .v6x-card{background:#fff;border:1px solid #e5e9f0;border-radius:18px;padding:18px;margin-bottom:14px;box-shadow:0 4px 16px rgba(13,27,61,.05)}
      .v6x-card h3,.v6x-card h4{margin-top:0;color:#0D1B3D}
      .v6x-meta{display:flex;gap:7px;flex-wrap:wrap;margin:8px 0 12px}
      .v6x-pill{display:inline-flex;padding:5px 9px;border-radius:999px;background:#eef4ff;color:#163F73;font-size:.78rem;font-weight:800}
      .v6x-pill.ok{background:#ecfdf3;color:#067647}.v6x-pill.warn{background:#fff7ed;color:#b54708}.v6x-pill.bad{background:#fef3f2;color:#b42318}
      .v6x-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:12px}
      .v6x-actions .btn{width:auto;margin-top:0}
      .v6x-help{color:#667085;font-size:.9rem;line-height:1.45}
      .v6x-result{padding:12px;border-radius:12px;background:#f8fafc;margin-top:9px}
      .v6x-option{display:flex;align-items:center;gap:10px;border:1px solid #e6e9ef;border-radius:12px;padding:12px;margin:8px 0}
      .v6x-countdown{font-weight:800;color:#b54708}
      .v6x-sensitive{border-left:4px solid #b54708;padding-left:12px}
      .v6x-file-list{font-size:.86rem;color:#667085;margin-top:8px}
      .v6x-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
      @media(max-width:720px){.v6x-two{grid-template-columns:1fr}.v6x-actions .btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function labelSocial(status) {
    return ({recu:'Demande reçue',en_etude:'En étude',prise_en_charge:'Prise en charge',resolue:'Résolue',rejetee:'Non retenue'})[status] || status;
  }
  function classeSocial(status) {
    if (status === 'resolue' || status === 'prise_en_charge') return 'ok';
    if (status === 'rejetee') return 'bad';
    return 'warn';
  }
  function catSocial(cat) {
    return ({accident:'Accident',deces:'Décès',naissance:'Naissance',maladie:'Maladie',sinistre:'Sinistre',autre:'Autre'})[cat] || cat;
  }

  async function aidesSocialesV6() {
    const content = $('content');
    if (!content) return;
    content.innerHTML = `
      <div class="section-title"><h2>Aides sociales</h2></div>
      <div class="v6x-card">
        <h3>Faire une demande d’aide</h3>
        <p class="v6x-help">La demande et son état d’avancement sont visibles par les membres. Les justificatifs et détails confidentiels restent réservés au demandeur et aux responsables autorisés.</p>
        <div class="form-grid">
          <div><label>Nature du besoin</label><select id="social-category"><option value="accident">Accident</option><option value="deces">Décès</option><option value="naissance">Naissance</option><option value="maladie">Maladie</option><option value="sinistre">Sinistre</option><option value="autre">Autre</option></select></div>
          <div><label>Date de l’événement</label><input id="social-date" type="date"></div>
          <div class="full"><label>Résumé visible par les membres</label><textarea id="social-summary" maxlength="600" placeholder="Décrivez brièvement le besoin sans information trop personnelle."></textarea></div>
          <div class="full"><label>Détails confidentiels</label><textarea id="social-private" maxlength="2500" placeholder="Informations destinées au bureau chargé d’étudier la demande."></textarea></div>
          <div class="full"><label>Justificatifs (photo ou PDF, 10 Mo maximum par fichier)</label><input id="social-files" type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf"><div class="v6x-help">Exemples : photo d’un accident, document de sinistre, extrait de naissance. Évitez d’ajouter des données sans rapport avec la demande.</div></div>
        </div>
        <button class="btn btn-primary" onclick="soumettreAideSocialeV6()">Envoyer ma demande</button>
      </div>
      <div class="section-title"><h3>Demandes et prises en charge</h3></div>
      <div id="social-list"><div class="empty">Chargement…</div></div>`;
    await chargerAidesSocialesV6();
  }

  async function soumettreAideSocialeV6() {
    const category = $('social-category')?.value;
    const publicSummary = $('social-summary')?.value.trim();
    const privateDetails = $('social-private')?.value.trim() || null;
    const eventDate = $('social-date')?.value || null;
    const files = Array.from($('social-files')?.files || []);
    if (!publicSummary || publicSummary.length < 5) return toast('Ajoutez un résumé de votre situation.');
    if (files.some(f => f.size > 10 * 1024 * 1024)) return toast('Chaque justificatif doit faire 10 Mo maximum.');

    const { data: requestId, error } = await supabaseClient.rpc('submit_social_request_v6', {
      p_category: category,
      p_public_summary: publicSummary,
      p_private_details: privateDetails,
      p_event_date: eventDate
    });
    if (error) return toast(error.message || 'Impossible d’enregistrer la demande.', 6000);

    let uploaded = 0;
    for (const file of files) {
      try {
        const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${profilActuel.id}/${requestId}/${Date.now()}-${Math.random().toString(36).slice(2,7)}-${cleanName}`;
        const up = await supabaseClient.storage.from('social-evidence-v6').upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (up.error) throw up.error;
        const link = await supabaseClient.rpc('add_social_evidence_v6', {
          p_request_id: requestId,
          p_storage_path: path,
          p_file_name: file.name,
          p_mime_type: file.type || null
        });
        if (link.error) throw link.error;
        uploaded++;
      } catch (e) {
        console.error('social-evidence', e);
      }
    }
    toast(files.length ? `Demande enregistrée. ${uploaded}/${files.length} justificatif(s) ajouté(s).` : 'Demande d’aide sociale enregistrée.', 5000);
    await aidesSocialesV6();
  }

  async function chargerAidesSocialesV6() {
    const zone = $('social-list');
    if (!zone) return;
    const { data, error } = await supabaseClient.rpc('list_social_requests_v6');
    if (error) return zone.innerHTML = `<div class="empty">${esc(error.message || 'Impossible de charger les demandes.')}</div>`;
    if (!(data || []).length) return zone.innerHTML = '<div class="empty">Aucune demande d’aide sociale pour le moment.</div>';
    const admin = droits().admin;
    zone.innerHTML = data.map(r => `
      <article class="v6x-card">
        <div class="v6x-meta"><span class="v6x-pill">${esc(catSocial(r.category))}</span><span class="v6x-pill ${classeSocial(r.status)}">${esc(labelSocial(r.status))}</span>${r.evidence_count ? `<span class="v6x-pill">${r.evidence_count} justificatif(s)</span>` : ''}</div>
        <h3>${esc(r.member_name)}</h3>
        <p>${esc(r.public_summary)}</p>
        <p class="v6x-help">Déposée le ${new Date(r.created_at).toLocaleDateString('fr-FR')}${r.event_date ? ` · événement du ${new Date(r.event_date+'T12:00:00').toLocaleDateString('fr-FR')}` : ''}</p>
        ${r.aid_amount ? `<div class="v6x-result"><b>Aide accordée : ${fmt(r.aid_amount)} FCFA</b></div>` : ''}
        ${r.resolution_summary ? `<div class="v6x-result"><b>Suite donnée :</b> ${esc(r.resolution_summary)}</div>` : ''}
        ${(r.is_owner || admin) ? `<div class="v6x-actions"><button class="btn btn-light" onclick="voirDossierSocialV6('${r.id}')">Voir mon dossier / justificatifs</button>${admin ? `<button class="btn btn-secondary" onclick="gererAideSocialeV6('${r.id}','${esc(r.member_name)}')">Traiter</button>` : ''}</div>` : ''}
      </article>`).join('');
  }

  async function voirDossierSocialV6(id) {
    const { data, error } = await supabaseClient.rpc('get_social_request_private_v6', { p_request_id: id });
    if (error) return toast(error.message || 'Accès impossible.', 5000);
    const row = Array.isArray(data) ? data[0] : data;
    const ev = row?.evidence || [];
    let html = `<div class="v6x-card v6x-sensitive"><h3>Détails confidentiels</h3><p>${esc(row?.private_details || 'Aucun détail confidentiel.')}</p><h4>Justificatifs</h4>`;
    if (!ev.length) html += '<p class="v6x-help">Aucun justificatif.</p>';
    for (const e of ev) {
      const signed = await supabaseClient.storage.from('social-evidence-v6').createSignedUrl(e.storage_path, 600);
      if (signed.data?.signedUrl) html += `<p><a class="btn btn-light" style="display:inline-block;width:auto" target="_blank" rel="noopener" href="${esc(signed.data.signedUrl)}">Ouvrir ${esc(e.file_name)}</a></p>`;
    }
    html += '<button class="btn btn-light" onclick="chargerAidesSocialesV6()">Fermer</button></div>';
    $('social-list').insertAdjacentHTML('afterbegin', html);
  }

  function gererAideSocialeV6(id, nom) {
    const zone = $('social-list');
    if (!zone) return;
    zone.insertAdjacentHTML('afterbegin', `<div class="v6x-card" id="social-admin-editor"><h3>Traiter la demande — ${esc(nom)}</h3><div class="form-grid"><div><label>Statut</label><select id="social-admin-status"><option value="en_etude">En étude</option><option value="prise_en_charge">Prise en charge</option><option value="resolue">Résolue</option><option value="rejetee">Non retenue</option></select></div><div><label>Montant accordé (FCFA, facultatif)</label><input id="social-admin-amount" type="number" min="0" step="1"></div><div class="full"><label>Résumé public de la décision</label><textarea id="social-admin-resolution" maxlength="1000" placeholder="Ex. : aide accordée pour les frais liés à l’accident."></textarea></div></div><div class="v6x-actions"><button class="btn btn-primary" onclick="validerAideSocialeV6('${id}')">Enregistrer</button><button class="btn btn-light" onclick="document.getElementById('social-admin-editor')?.remove()">Annuler</button></div></div>`);
    $('social-admin-editor')?.scrollIntoView({behavior:'smooth',block:'start'});
  }

  async function validerAideSocialeV6(id) {
    const status = $('social-admin-status')?.value;
    const amountRaw = $('social-admin-amount')?.value;
    const amount = amountRaw === '' ? null : Number(amountRaw);
    const resolution = $('social-admin-resolution')?.value.trim() || null;
    const { error } = await supabaseClient.rpc('update_social_request_v6', { p_request_id:id, p_status:status, p_aid_amount:amount, p_resolution_summary:resolution });
    if (error) return toast(error.message || 'Mise à jour impossible.', 5000);
    toast('Dossier social mis à jour.');
    await chargerAidesSocialesV6();
  }

  async function votesSondagesV6() {
    const content = $('content');
    if (!content) return;
    const admin = droits().admin;
    content.innerHTML = `<div class="section-title"><h2>Votes & sondages</h2></div>
      ${admin ? `<div class="v6x-card"><h3>Créer une consultation</h3><div class="form-grid"><div><label>Type</label><select id="poll-type"><option value="decision">Vote de décision</option><option value="election">Élection</option><option value="sondage">Sondage</option></select></div><div><label>Mode</label><select id="poll-secret"><option value="true">Vote secret</option><option value="false">Vote nominatif</option></select></div><div class="full"><label>Titre</label><input id="poll-title" maxlength="220"></div><div class="full"><label>Description</label><textarea id="poll-description" maxlength="1500"></textarea></div><div><label>Ouverture</label><input id="poll-start" type="datetime-local"></div><div><label>Clôture</label><input id="poll-end" type="datetime-local"></div><div class="full"><label>Choix / candidats (un par ligne)</label><textarea id="poll-options" placeholder="Oui\nNon\nAbstention"></textarea></div></div><button class="btn btn-primary" onclick="creerVoteV6()">Créer le vote</button></div>` : ''}
      <div id="poll-list"><div class="empty">Chargement…</div></div>`;
    await chargerVotesV6();
  }

  async function creerVoteV6() {
    const options = ($('poll-options')?.value || '').split(/\n+/).map(x=>x.trim()).filter(Boolean);
    const title = $('poll-title')?.value.trim();
    const start = $('poll-start')?.value;
    const end = $('poll-end')?.value;
    if (!title || !start || !end || options.length < 2) return toast('Ajoutez le titre, les dates et au moins deux choix.');
    const { error } = await supabaseClient.rpc('create_poll_v6', {
      p_poll_type:$('poll-type')?.value,
      p_title:title,
      p_description:$('poll-description')?.value.trim() || null,
      p_starts_at:new Date(start).toISOString(),
      p_ends_at:new Date(end).toISOString(),
      p_secret_ballot:$('poll-secret')?.value === 'true',
      p_options:options
    });
    if (error) return toast(error.message || 'Création impossible.', 5000);
    toast('Vote créé.');
    await votesSondagesV6();
  }

  async function chargerVotesV6() {
    const zone = $('poll-list');
    if (!zone) return;
    const { data, error } = await supabaseClient.rpc('list_polls_v6');
    if (error) return zone.innerHTML = `<div class="empty">${esc(error.message || 'Impossible de charger les votes.')}</div>`;
    if (!(data || []).length) return zone.innerHTML = '<div class="empty">Aucun vote ou sondage pour le moment.</div>';
    const now = Date.now();
    zone.innerHTML = data.map(p => {
      const start = new Date(p.starts_at).getTime(), end = new Date(p.ends_at).getTime();
      const open = p.active && now >= start && now < end;
      const status = now < start ? 'À venir' : open ? 'Ouvert' : 'Clôturé';
      const options = p.options || [];
      const choices = options.map(o => p.results_visible
        ? `<div class="v6x-option"><span>${esc(o.label)}</span><b style="margin-left:auto">${fmt(o.votes)} vote(s)</b></div>`
        : `<label class="v6x-option"><input type="radio" name="poll-${p.id}" value="${o.id}" ${(!open || p.has_voted)?'disabled':''}><span>${esc(o.label)}</span></label>`).join('');
      return `<article class="v6x-card"><div class="v6x-meta"><span class="v6x-pill">${esc(p.poll_type)}</span><span class="v6x-pill ${open?'ok':'warn'}">${status}</span><span class="v6x-pill">${p.secret_ballot?'Secret':'Nominatif'}</span></div><h3>${esc(p.title)}</h3>${p.description?`<p>${esc(p.description)}</p>`:''}<p class="v6x-help">Du ${new Date(p.starts_at).toLocaleString('fr-FR')} au ${new Date(p.ends_at).toLocaleString('fr-FR')} · ${fmt(p.total_votes)} votant(s)</p>${choices}${p.has_voted?'<p class="v6x-pill ok">Votre vote a été enregistré.</p>':''}${open && !p.has_voted?`<button class="btn btn-primary" onclick="voterV6('${p.id}')">Valider mon vote</button>`:''}${droits().admin && open?`<div class="v6x-actions"><button class="btn btn-light" onclick="cloreVoteV6('${p.id}')">Clore maintenant</button></div>`:''}</article>`;
    }).join('');
  }

  async function voterV6(pollId) {
    const selected = document.querySelector(`input[name="poll-${pollId}"]:checked`);
    if (!selected) return toast('Choisissez une réponse avant de valider.');
    if (!confirm('Confirmer ce vote ? Il ne pourra pas être modifié.')) return;
    const { error } = await supabaseClient.rpc('cast_vote_v6', { p_poll_id:pollId, p_option_id:selected.value });
    if (error) return toast(error.message || 'Vote impossible.', 5000);
    toast('Votre vote a été enregistré.');
    await chargerVotesV6();
  }

  async function cloreVoteV6(id) {
    if (!confirm('Clore ce vote maintenant ?')) return;
    const { error } = await supabaseClient.rpc('close_poll_v6', { p_poll_id:id });
    if (error) return toast(error.message || 'Clôture impossible.', 5000);
    toast('Vote clôturé.');
    await chargerVotesV6();
  }

  function dureeTexte(expiresAt) {
    const ms = new Date(expiresAt).getTime() - Date.now();
    if (ms <= 0) return 'Expiré';
    const min = Math.ceil(ms / 60000);
    if (min < 60) return `${min} min`;
    const h = Math.floor(min / 60), r = min % 60;
    return `${h} h${r ? ` ${r} min` : ''}`;
  }

  async function paiementsTemporairesV6() {
    const content = $('content');
    content.innerHTML = '<div class="section-title"><h2>Paiement des cotisations</h2></div><div class="card"><h3>Trésorier de ma section</h3><div id="section-payment-contact">Chargement…</div></div>';
    await window.afficherNumeroSectionV6?.();
  }

  function ajouterBoutonsNavigation() {
    const nav = $('nav'); if (!nav) return;
    const add = (label, fn, key) => {
      if (nav.querySelector(`[data-v6x="${key}"]`)) return;
      const b = document.createElement('button');
      b.dataset.v6x = key; b.textContent = label; b.onclick = fn; nav.appendChild(b);
    };
    add('Aides sociales', aidesSocialesV6, 'social');
    add('Votes & sondages', votesSondagesV6, 'polls');
    add('Paiements', paiementsTemporairesV6, 'payments');
  }

  function installer() {
    injectStyles();
    window.aidesSocialesV6 = aidesSocialesV6;
    window.soumettreAideSocialeV6 = soumettreAideSocialeV6;
    window.chargerAidesSocialesV6 = chargerAidesSocialesV6;
    window.voirDossierSocialV6 = voirDossierSocialV6;
    window.gererAideSocialeV6 = gererAideSocialeV6;
    window.validerAideSocialeV6 = validerAideSocialeV6;
    window.votesSondagesV6 = votesSondagesV6;
    window.creerVoteV6 = creerVoteV6;
    window.chargerVotesV6 = chargerVotesV6;
    window.voterV6 = voterV6;
    window.cloreVoteV6 = cloreVoteV6;
    window.paiementsTemporairesV6 = paiementsTemporairesV6;

    const ancienneNav = window.afficherNavigation;
    if (typeof ancienneNav === 'function' && !window.__v6ExtraNavWrapped) {
      window.__v6ExtraNavWrapped = true;
      window.afficherNavigation = function () { ancienneNav(); ajouterBoutonsNavigation(); };
    }
    if ($('app-shell') && !$('app-shell').classList.contains('hide')) ajouterBoutonsNavigation();
  }

  if (document.readyState === 'complete') installer();
  else window.addEventListener('load', installer, {once:true});
})();
