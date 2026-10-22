// Finances par section : les autorisations sont également contrôlées par RLS.
(function () {
  const $ = id => document.getElementById(id);
  const esc = echapperHtml;
  const fmt = n => Number(n || 0).toLocaleString('fr-FR') + ' FCFA';
  const globalRead = () => [1, 2, 5].includes(Number(profilActuel?.role_id));
  const write = () => [1, 5, 6].includes(Number(profilActuel?.role_id));
  const canEditPaymentNumber = () => [1, 5].includes(Number(profilActuel?.role_id));
  const globalWrite = () => [1, 5].includes(Number(profilActuel?.role_id));
  let selectedSection = null;
  let summaries = [];
  let entryPage = 0;

  window.afficherNumeroSectionV6 = async function () {
    const zone = $('section-payment-contact');
    if (!zone) return;
    const { data, error } = await supabaseClient.from('treasury_settings_v6')
      .select('treasurer_phone').eq('id', 1).maybeSingle();
    if (!zone.isConnected) return;
    if (error) { zone.textContent = 'Impossible de charger le numéro. Réessayez.'; return; }
    const phone = data?.treasurer_phone;
    zone.innerHTML = phone ? `<p><b>${esc(phone)}</b></p><button class="btn btn-primary" onclick="copierNumeroSectionV6()">Copier le numéro</button>` : '<p>Le numéro officiel de paiement n’est pas encore renseigné.</p>';
    zone.dataset.phone = phone || '';
  };
  window.copierNumeroSectionV6 = async function () {
    const phone = $('section-payment-contact')?.dataset.phone;
    if (!phone) return;
    try { await navigator.clipboard.writeText(phone); toast('Numéro copié.'); }
    catch (_) { toast('Appuyez longuement sur le numéro pour le copier.'); }
  };
  const anciennesCotisations = window.cotisations;
  window.cotisations = async function () {
    await anciennesCotisations();
    await window.afficherNumeroSectionV6();
  };

  function summaryHtml(rows) {
    const sum = key => rows.reduce((total, r) => total + Number(r[key]), 0);
    return `<div class="grid"><div class="kpi"><small>Entrées d’argent</small><b>${fmt(sum('income'))}</b></div><div class="kpi"><small>Dépenses</small><b>${fmt(sum('expense'))}</b></div><div class="kpi"><small>Solde disponible</small><b>${fmt(sum('balance'))}</b></div></div>`;
  }
  const ancienAccueil = window.accueil;
  window.accueil = async function () {
    await ancienAccueil();
    if (!droits().finance) return;
    const content = $('content');
    const box = document.createElement('div');
    box.className = 'card dashboard-finance';
    box.innerHTML = '<h3>Résumé financier</h3><p>Chargement…</p>';
    const home = content.querySelector('.dashboard-home');
    if (!home) return;
    home.querySelector('.hero').after(box);
    const { data, error } = await supabaseClient.rpc('finance_summary_v6');
    if (!box.isConnected) return;
    box.innerHTML = '<h3>Résumé financier — ' + esc(globalRead() ? 'Toutes les sections' : nomSection(profilActuel.section_id)) + '</h3>' + (error ? '<p>Résumé indisponible. Réessayez.</p>' : summaryHtml(data || [])) + '<button class="btn btn-light" onclick="finances()">Consulter les finances</button>';
  };

  const anciennesFinances = window.finances;
  window.finances = async function () {
    if (!droits().finance) return toast('Accès financier non autorisé.');
    const content = $('content');
    if (write()) await anciennesFinances();
    else content.innerHTML = '<div class="section-title"><h2>Finances ACVTC-CI</h2></div>';
    const box = document.createElement('div'); box.id = 'cash-section-panel'; box.className = 'card';
    box.innerHTML = '<h2>Caisse et dépenses</h2><p>Chargement…</p>'; content.prepend(box);
    const rep = await supabaseClient.rpc('finance_summary_v6');
    if (!box.isConnected) return;
    if (rep.error) { box.innerHTML = '<p>Impossible de charger les finances. Réessayez.</p>'; return; }
    summaries = rep.data || [];
    if (!globalRead()) selectedSection = Number(profilActuel.section_id);
    if (selectedSection && !summaries.some(s => Number(s.section_id) === selectedSection)) selectedSection = null;
    box.innerHTML = `<h2>Caisse et dépenses</h2>${globalRead() ? `<label for="cash-filter">Section consultée</label><select id="cash-filter" onchange="changerSectionFinancesV6(this.value)"><option value="">Toutes les sections</option>${summaries.map(s => `<option value="${Number(s.section_id)}" ${Number(s.section_id) === selectedSection ? 'selected' : ''}>${esc(s.section_name)}</option>`).join('')}</select>` : `<h3>${esc(nomSection(profilActuel.section_id))}</h3>`}<div id="cash-summary"></div><p class="note">Les cotisations confirmées sont incluses dans les entrées. Ne les saisissez pas une deuxième fois dans la caisse. Le solde initial est un ajustement complémentaire aux cotisations déjà enregistrées.</p>${canEditPaymentNumber() ? `<details><summary>Numéro officiel de paiement</summary><form id="cash-phone-form"><label for="cash-phone">Numéro de paiement</label><input id="cash-phone" type="tel" inputmode="tel" required placeholder="Exemple : 0700000000"><button class="btn btn-primary" type="submit">Enregistrer le numéro</button><p id="cash-phone-current"></p></form></details><details open><summary>Ajouter une opération de caisse</summary><form id="cash-entry-form"><div class="form-grid"><div><label for="cash-entry-section">Section</label><select id="cash-entry-section" ${globalWrite() ? '' : 'disabled'}>${summaries.map(s => `<option value="${Number(s.section_id)}" ${Number(s.section_id) === (selectedSection || Number(profilActuel.section_id)) ? 'selected' : ''}>${esc(s.section_name)}</option>`).join('')}</select></div><div><label for="cash-kind">Opération</label><select id="cash-kind"><option value="income">Entrée d’argent</option><option value="expense">Dépense</option><option value="opening">Solde initial complémentaire</option></select></div><div><label for="cash-amount">Montant (FCFA)</label><input id="cash-amount" type="number" min="1" max="1000000000000" step="1" required></div><div><label for="cash-date">Date</label><input id="cash-date" type="date" required value="${new Date().toISOString().slice(0,10)}"></div><div class="full"><label for="cash-reason">Motif</label><input id="cash-reason" required maxlength="500"></div><div class="full"><label for="cash-details">Détails</label><textarea id="cash-details" maxlength="3000"></textarea></div><div class="full"><label for="cash-receipt">Référence du reçu / justificatif</label><input id="cash-receipt" maxlength="500"></div></div><button class="btn btn-primary" type="submit">Enregistrer l’opération</button></form></details>` : ''}<h3>Journal des opérations de caisse</h3><div id="cash-entries"></div><div id="cash-pagination"></div>`;
    $('cash-phone-form')?.addEventListener('submit', savePhone);
    $('cash-entry-form')?.addEventListener('submit', saveEntry);
    if (write()) {
      const cotis = document.createElement('details');
      cotis.innerHTML = `<summary>Enregistrer une cotisation reçue</summary><form id="cash-contribution-form"><label for="cash-member">Membre</label><select id="cash-member" required><option value="">Chargement…</option></select><label for="cash-period">Mois de cotisation</label><input id="cash-period" type="month" required value="${new Date().toISOString().slice(0,7)}"><label for="cash-contribution-amount">Cotisation (FCFA)</label><input id="cash-contribution-amount" type="number" min="1" max="2147483647" step="1" required value="500"><label for="cash-penalty">Pénalité (FCFA)</label><input id="cash-penalty" type="number" min="0" max="2147483647" step="1" required value="0"><label for="cash-method">Moyen de paiement</label><select id="cash-method"><option value="WAVE">Wave</option><option value="ORANGE_MONEY">Orange Money</option><option value="ESPECES">Espèces</option></select><button class="btn btn-primary" type="submit">Confirmer la cotisation reçue</button></form>`;
      box.append(cotis);
      $('cash-contribution-form').addEventListener('submit', saveContribution);
      await loadContributionMembers();
    }
    if (!write()) {
      const history = document.createElement('div'); history.id = 'cash-contributions-read';
      box.append(history);
      await loadReadContributions();
    }
    entryPage = 0;
    await Promise.all([refreshJournal(), canEditPaymentNumber() ? loadPhone() : Promise.resolve()]);
  };
  async function loadContributionMembers() {
    const select = $('cash-member'); if (!select) return;
    let query = supabaseClient.from('members_v5').select('id,nom_complet,section_id').eq('actif',true).order('nom_complet');
    if (!globalWrite()) query = query.eq('section_id', profilActuel.section_id);
    const rep = await query;
    if (!select.isConnected) return;
    select.innerHTML = '<option value="">Choisir un membre</option>' + (rep.data || []).map(m => `<option value="${esc(m.id)}">${esc(m.nom_complet)} — ${esc(nomSection(m.section_id))}</option>`).join('');
    if (rep.error) toast('Liste des membres indisponible.');
  }
  async function saveContribution(e) {
    e.preventDefault(); const button = e.target.querySelector('button'); button.disabled = true;
    try {
      const rep = await supabaseClient.rpc('record_contribution_v5', {p_member_id:$('cash-member').value,p_period:$('cash-period').value+'-01',p_amount:Number($('cash-contribution-amount').value),p_penalty:Number($('cash-penalty').value),p_status:'payé',p_payment_method:$('cash-method').value});
      if (rep.error) return toast('Cotisation refusée : '+rep.error.message,6000);
      toast('Cotisation confirmée et intégrée au solde.'); await window.finances();
    } finally { button.disabled = false; }
  }
  async function loadReadContributions() {
    const zone = $('cash-contributions-read'); if (!zone) return;
    const rep = await supabaseClient.from('contributions_v5').select('period,amount,penalty,status,members_v5(nom_complet,section_id)').eq('status','payé').order('period',{ascending:false}).limit(100);
    if (!zone.isConnected) return;
    zone.innerHTML = '<h3>Dernières cotisations confirmées</h3>' + (rep.error ? '<p>Historique indisponible.</p>' : (rep.data || []).map(c => `<div class="card"><b>${esc(c.members_v5?.nom_complet)}</b><p>${esc(c.period)} · ${esc(nomSection(c.members_v5?.section_id))} · ${fmt(Number(c.amount)+Number(c.penalty))}</p></div>`).join('') || '<p>Aucune cotisation confirmée.</p>');
  }
  async function loadPhone() {
    const zone = $('cash-phone-current'); if (!zone) return;
    const rep = await supabaseClient.from('treasury_settings_v6').select('treasurer_phone').eq('id',1).maybeSingle();
    if (!zone.isConnected) return;
    zone.textContent = rep.error ? 'Numéro indisponible.' : 'Numéro actuel : ' + (rep.data?.treasurer_phone || 'Non renseigné');
    $('cash-phone').value = rep.data?.treasurer_phone || '';
  }
  async function savePhone(e) {
    e.preventDefault();
    if (!canEditPaymentNumber()) return toast('Modification réservée au Président et au Trésorier général.');
    const button = e.target.querySelector('button'); button.disabled = true;
    try {
      const phone = normaliserTelephone($('cash-phone').value);
      if (!/^\+225[0-9]{10}$/.test(phone)) return toast('Saisissez un numéro ivoirien de 10 chiffres.');
      const rep = await supabaseClient.from('treasury_settings_v6').upsert({id:1,treasurer_phone:phone,updated_at:new Date().toISOString()});
      if (rep.error) return toast('Enregistrement refusé : ' + rep.error.message, 6000);
      toast('Numéro officiel enregistré.'); await loadPhone();
    } finally { button.disabled = false; }
  }
  async function saveEntry(e) {
    e.preventDefault(); const button = e.target.querySelector('button'); button.disabled = true;
    try {
      const amount = Number($('cash-amount').value), reason = $('cash-reason').value.trim();
      if (!Number.isSafeInteger(amount) || amount <= 0 || !reason) return toast('Vérifiez le montant et le motif.');
      const rep = await supabaseClient.from('cash_entries_v6').insert({section_id:Number($('cash-entry-section').value),kind:$('cash-kind').value,amount,entry_date:$('cash-date').value,reason,details:$('cash-details').value.trim(),receipt_reference:$('cash-receipt').value.trim()});
      if (rep.error) return toast('Enregistrement refusé : ' + rep.error.message, 6000);
      toast('Opération enregistrée.'); await window.finances();
    } finally { button.disabled = false; }
  }
  window.changerSectionFinancesV6 = async value => { selectedSection = value ? Number(value) : null; entryPage = 0; await refreshJournal(); };
  window.pageCaisseV6 = async direction => { entryPage = Math.max(0, entryPage + direction); await refreshJournal(); };
  async function refreshJournal() {
    const summary = $('cash-summary'), zone = $('cash-entries'), pagination = $('cash-pagination');
    if (!zone) return;
    summary.innerHTML = summaryHtml(summaries.filter(s => !selectedSection || Number(s.section_id) === selectedSection));
    zone.textContent = 'Chargement…';
    let query = supabaseClient.from('cash_entries_v6').select('*', {count:'exact'}).order('entry_date', {ascending:false}).order('created_at', {ascending:false}).order('id').range(entryPage*50,entryPage*50+49);
    const requestSection = selectedSection, requestPage = entryPage;
    if (selectedSection) query = query.eq('section_id', selectedSection);
    const rep = await query;
    if (!zone.isConnected || requestSection !== selectedSection || requestPage !== entryPage) return;
    if (rep.error) {zone.textContent='Journal indisponible. Réessayez.';return;}
    const labels = {income:'Entrée',expense:'Dépense',opening:'Solde initial complémentaire'};
    zone.innerHTML = (rep.data || []).map(r => `<div class="card"><b>${esc(labels[r.kind])} — ${fmt(r.amount)}</b><p>${esc(r.entry_date)} · ${esc(nomSection(r.section_id))}</p><p><b>${esc(r.reason)}</b></p>${r.details ? `<p style="white-space:pre-wrap">${esc(r.details)}</p>` : ''}${r.receipt_reference ? `<p>Justificatif : ${esc(r.receipt_reference)}</p>` : ''}</div>`).join('') || '<p>Aucune opération de caisse enregistrée.</p>';
    pagination.innerHTML = `<button class="btn btn-light" onclick="pageCaisseV6(-1)" ${entryPage === 0 ? 'disabled' : ''}>Précédent</button> <span>Page ${entryPage+1}</span> <button class="btn btn-light" onclick="pageCaisseV6(1)" ${(entryPage+1)*50 >= rep.count ? 'disabled' : ''}>Suivant</button>`;
  }
  if (profilActuel && !$('app-shell')?.classList.contains('hide')) window.accueil();
})();
