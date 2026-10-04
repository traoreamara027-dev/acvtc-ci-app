// ACVTC-CI V6 — interface, annuaire, pilotage et accès sécurisés.

(function () {
  'use strict';

  let annuaireV6Cache = [];

  function q(id) {
    return document.getElementById(id);
  }

  function injecterStylesV6() {
    if (q('acvtc-v6-styles')) return;
    const style = document.createElement('style');
    style.id = 'acvtc-v6-styles';
    style.textContent = `
      .v6-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin:14px 0}
      .v6-kpi{padding:16px;border-radius:16px;background:#fff;border:1px solid #e7eaf0;box-shadow:0 4px 18px rgba(13,27,61,.06)}
      .v6-kpi b{display:block;font-size:1.65rem;color:#0D1B3D;margin-bottom:4px}
      .v6-kpi span{font-size:.86rem;color:#667085}
      .v6-tools{display:grid;grid-template-columns:minmax(0,1fr) 180px;gap:10px;margin:14px 0}
      .v6-member{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:14px;align-items:center}
      .v6-member-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      .v6-member-meta{display:flex;gap:7px;flex-wrap:wrap;margin:7px 0}
      .v6-access-ok{background:#ecfdf3;color:#067647}
      .v6-access-wait{background:#fff7ed;color:#b54708}
      .v6-section-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
      .v6-section-card{padding:14px;border:1px solid #e7eaf0;border-radius:14px;background:#fff}
      .v6-section-card b{display:block;font-size:1.25rem;color:#0D1B3D}
      .v6-audit-row{padding:10px 0;border-bottom:1px solid #eef0f4}
      .v6-audit-row:last-child{border-bottom:0}
      .v6-inline-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}
      .v6-badge{display:inline-flex;align-items:center;padding:4px 9px;border-radius:999px;font-size:.78rem;font-weight:700}
      .v6-note{font-size:.88rem;color:#667085}
      @media(max-width:720px){
        .v6-tools{grid-template-columns:1fr}
        .v6-member{grid-template-columns:1fr}
        .v6-member-actions{justify-content:flex-start}
      }
    `;
    document.head.appendChild(style);
  }

  function appliquerMarqueV6() {
    document.title = 'ACVTC-CI V6';
    document.querySelectorAll('.auth-footer span').forEach((el) => {
      if (/ACVTC-CI V5/i.test(el.textContent || '')) el.textContent = 'ACVTC-CI V6';
    });
  }

  async function connexionV6() {
    const email = q('legacy-email')?.value.trim().toLowerCase();
    const password = q('legacy-pass')?.value || '';
    if (!email || !password) {
      setAuthMessage('Saisissez votre e-mail et votre mot de passe.', true);
      return;
    }
    setAuthMessage('Connexion en cours...');
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error || !data?.user) {
      console.error(error);
      setAuthMessage('Connexion impossible. Vérifiez votre e-mail et votre mot de passe.', true);
      return;
    }
    await chargerProfil(data.user, true);
  }

  async function envoyerLienMotDePasseV6() {
    const email = q('legacy-email')?.value.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setAuthMessage('Saisissez d’abord votre adresse e-mail.', true);
      return;
    }
    setAuthMessage('Envoi du lien sécurisé...');
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      console.error(error);
      setAuthMessage("Impossible d'envoyer le lien sécurisé. Réessayez.", true);
      return;
    }
    setAuthMessage('Un lien sécurisé de réinitialisation vient de vous être envoyé par e-mail.');
  }

  function optionSectionsV6() {
    return Object.entries(sectionsCache)
      .map(([id, nom]) => `<option value="${Number(id)}">${echapperHtml(nom)}</option>`)
      .join('');
  }

  function optionRolesV6() {
    return Object.entries(rolesCache)
      .filter(([, nom]) => sansAccent(nom) !== 'membre')
      .map(([id, nom]) => `<option value="${Number(id)}">${echapperHtml(nom)}</option>`)
      .join('');
  }

  async function membresV6() {
    const content = q('content');
    if (!content) return;
    const d = droits();
    if (!d.admin) {
      content.innerHTML = '<div class="card"><h2>Accès refusé</h2><p>Cette rubrique est réservée aux administrateurs.</p></div>';
      return;
    }

    content.innerHTML = `
      <div class="section-title"><h2>Membres — V6</h2></div>

      <div class="card">
        <h3>Ajouter un membre</h3>
        <p class="v6-note">Étape 1 : enregistrer le membre. Étape 2 : créer son accès depuis l’annuaire.</p>
        <div class="form-grid">
          <div class="full"><label>Nom complet</label><input id="m-nom" maxlength="180" placeholder="Nom et prénoms"></div>
          <div><label>Téléphone</label><input id="m-phone" inputmode="tel" placeholder="07 00 00 00 00"></div>
          <div><label>Adresse e-mail</label><input id="m-email" type="email" autocomplete="email" placeholder="membre@email.com"></div>
          <div><label>Section</label><select id="m-section">${optionSectionsV6()}</select></div>
        </div>
        <button class="btn btn-primary" onclick="ajouterMembreSimple()">Enregistrer le membre</button>
      </div>

      ${d.president ? `
      <div class="card">
        <h3>Ajouter un responsable</h3>
        <p class="v6-note">Réservé au Président. L’accès sera créé séparément depuis l’annuaire.</p>
        <div class="form-grid">
          <div class="full"><label>Nom complet</label><input id="a-nom" maxlength="180"></div>
          <div><label>Téléphone</label><input id="a-phone" inputmode="tel"></div>
          <div><label>Adresse e-mail</label><input id="a-email" type="email"></div>
          <div><label>Section</label><select id="a-section">${optionSectionsV6()}</select></div>
          <div><label>Rôle</label><select id="a-role">${optionRolesV6()}</select></div>
        </div>
        <button class="btn btn-primary" onclick="ajouterResponsableV6()">Enregistrer le responsable</button>
      </div>` : ''}

      <div class="section-title"><h3>Annuaire administratif</h3></div>
      <div id="v6-member-kpis" class="v6-kpis"></div>
      <div class="v6-tools">
        <input id="v6-member-search" placeholder="Rechercher nom, téléphone, e-mail, numéro…" oninput="filtrerAnnuaireV6()">
        <select id="v6-member-section" onchange="filtrerAnnuaireV6()"><option value="">Toutes les sections</option>${optionSectionsV6()}</select>
      </div>
      <div id="v6-members-list" class="list"><div class="empty">Chargement…</div></div>
    `;

    await chargerAnnuaireV6();
  }

  async function ajouterMembreV6() {
    const nom = q('m-nom')?.value.trim();
    const phone = normaliserTelephone(q('m-phone')?.value);
    const email = q('m-email')?.value.trim().toLowerCase();
    const section = Number(q('m-section')?.value);
    if (!nom || !phone || !email || !email.includes('@') || !section) {
      toast('Complétez le nom, le téléphone, l’e-mail et la section.');
      return;
    }
    const { data, error } = await supabaseClient.rpc('admin_create_member_v5', {
      p_nom_complet: nom,
      p_phone: phone,
      p_email: email,
      p_section_id: section
    });
    if (error) {
      console.error(error);
      toast(error.message || 'Création impossible.', 6000);
      return;
    }
    toast(data ? `Membre enregistré : ${data}` : 'Membre enregistré.');
    ['m-nom', 'm-phone', 'm-email'].forEach((id) => { if (q(id)) q(id).value = ''; });
    await chargerAnnuaireV6();
  }

  async function ajouterResponsableV6() {
    const nom = q('a-nom')?.value.trim();
    const phone = normaliserTelephone(q('a-phone')?.value);
    const email = q('a-email')?.value.trim().toLowerCase();
    const section = Number(q('a-section')?.value);
    const role = Number(q('a-role')?.value);
    if (!nom || !phone || !email || !email.includes('@') || !section || !role) {
      toast('Complétez toutes les informations du responsable.');
      return;
    }
    const { data, error } = await supabaseClient.rpc('president_create_admin_v5', {
      p_nom_complet: nom,
      p_phone: phone,
      p_email: email,
      p_section_id: section,
      p_role_id: role
    });
    if (error) {
      console.error(error);
      toast(error.message || 'Création impossible.', 6000);
      return;
    }
    toast(data ? `Responsable enregistré : ${data}` : 'Responsable enregistré.');
    ['a-nom', 'a-phone', 'a-email'].forEach((id) => { if (q(id)) q(id).value = ''; });
    await chargerAnnuaireV6();
  }

  async function chargerAnnuaireV6() {
    const zone = q('v6-members-list');
    if (!zone) return;
    const { data, error } = await supabaseClient.rpc('list_members_v6_admin');
    if (error) {
      console.error(error);
      zone.innerHTML = '<div class="empty">Impossible de charger l’annuaire V6.</div>';
      return;
    }
    annuaireV6Cache = data || [];
    rendreKpisMembresV6();
    filtrerAnnuaireV6();
  }

  function rendreKpisMembresV6() {
    const zone = q('v6-member-kpis');
    if (!zone) return;
    const total = annuaireV6Cache.length;
    const actifs = annuaireV6Cache.filter((m) => m.actif !== false).length;
    const comptes = annuaireV6Cache.filter((m) => m.has_auth).length;
    const sansAcces = annuaireV6Cache.filter((m) => !m.has_auth).length;
    zone.innerHTML = `
      <div class="v6-kpi"><b>${total}</b><span>Membres</span></div>
      <div class="v6-kpi"><b>${actifs}</b><span>Comptes actifs</span></div>
      <div class="v6-kpi"><b>${comptes}</b><span>Accès créés</span></div>
      <div class="v6-kpi"><b>${sansAcces}</b><span>Accès à créer</span></div>
    `;
  }

  function filtrerAnnuaireV6() {
    const recherche = sansAccent(q('v6-member-search')?.value || '');
    const section = Number(q('v6-member-section')?.value || 0);
    const liste = annuaireV6Cache.filter((m) => {
      if (section && Number(m.section_id) !== section) return false;
      if (!recherche) return true;
      const texte = sansAccent([
        m.nom_complet,
        m.telephone,
        m.email,
        m.numero_membre,
        m.section_nom,
        m.role_nom
      ].filter(Boolean).join(' '));
      return texte.includes(recherche);
    });
    rendreAnnuaireV6(liste);
  }

  function rendreAnnuaireV6(liste) {
    const zone = q('v6-members-list');
    if (!zone) return;
    if (!liste.length) {
      zone.innerHTML = '<div class="empty">Aucun membre trouvé.</div>';
      return;
    }
    zone.innerHTML = liste.map((m) => {
      const email = m.email || '';
      const acces = m.has_auth
        ? '<span class="v6-badge v6-access-ok">Accès actif</span>'
        : '<span class="v6-badge v6-access-wait">Accès à créer</span>';
      const action = !email
        ? '<span class="v6-note">E-mail manquant</span>'
        : m.has_auth
          ? `<button class="btn btn-light" onclick="reinitialiserAccesV6('${encodeURIComponent(email)}')">Réinitialiser par lien sécurisé</button>`
          : `<button class="btn btn-primary" onclick="creerAccesV6('${encodeURIComponent(email)}')">Créer l’accès</button>`;
      return `
        <article class="list-item v6-member">
          <div>
            <h4>${echapperHtml(m.nom_complet || 'Membre ACVTC-CI')}</h4>
            <div class="v6-member-meta">
              <span class="badge badge-blue">${echapperHtml(m.section_nom || nomSection(m.section_id))}</span>
              <span class="badge badge-green">${echapperHtml(m.role_nom || nomRole(m.role_id))}</span>
              ${acces}
              ${m.actif === false ? '<span class="v6-badge" style="background:#fef3f2;color:#b42318">Désactivé</span>' : ''}
            </div>
            <p>${echapperHtml(m.numero_membre || 'Sans numéro')} · ${echapperHtml(m.telephone || 'Téléphone non renseigné')}</p>
            <p class="v6-note">${echapperHtml(email || 'E-mail non renseigné')}</p>
          </div>
          <div class="v6-member-actions">${action}</div>
        </article>`;
    }).join('');
  }

  async function creerAccesV6(emailEncode) {
    const email = decodeURIComponent(emailEncode || '').trim().toLowerCase();
    if (!email) return toast('Adresse e-mail manquante.');
    toast('Création de l’accès en cours...');
    const { data, error } = await supabaseClient.functions.invoke('create-temporary-access-v5', {
      body: { email }
    });
    if (error || data?.error) {
      console.error(error || data?.error);
      toast(data?.error || error?.message || "Impossible de créer l’accès.", 6000);
      return;
    }
    if (typeof afficherLienInvitationPermanent === 'function') {
      afficherLienInvitationPermanent(data);
    }
    toast(data?.message || 'Accès créé. Copiez les informations pour le membre.', 5000);
    await chargerAnnuaireV6();
  }

  async function reinitialiserAccesV6(emailEncode) {
    const email = decodeURIComponent(emailEncode || '').trim().toLowerCase();
    if (!email) return toast('Adresse e-mail manquante.');
    const redirectTo = window.location.origin + window.location.pathname;
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) {
      console.error(error);
      toast(error.message || "Impossible d’envoyer le lien sécurisé.", 6000);
      return;
    }
    toast(`Lien sécurisé envoyé à ${email}.`, 5000);
  }

  async function pilotageV6() {
    const content = q('content');
    if (!content) return;
    const d = droits();
    if (!d.admin) {
      content.innerHTML = '<div class="card"><h2>Accès refusé</h2></div>';
      return;
    }
    content.innerHTML = `
      <div class="section-title"><h2>Pilotage V6</h2></div>
      <div id="v6-pilot-kpis" class="v6-kpis"><div class="empty">Chargement…</div></div>
      <div class="card"><h3>Répartition par section</h3><div id="v6-sections" class="v6-section-grid"></div></div>
      <div id="v6-audit-card" class="card hide"><h3>Dernières opérations d’accès</h3><div id="v6-audit"></div></div>
    `;

    const { data, error } = await supabaseClient.rpc('list_members_v6_admin');
    if (error) {
      q('v6-pilot-kpis').innerHTML = '<div class="empty">Impossible de charger les statistiques.</div>';
      return;
    }
    const membres = data || [];
    const total = membres.length;
    const actifs = membres.filter((m) => m.actif !== false).length;
    const comptes = membres.filter((m) => m.has_auth).length;
    const responsables = membres.filter((m) => sansAccent(m.role_nom) !== 'membre').length;
    q('v6-pilot-kpis').innerHTML = `
      <div class="v6-kpi"><b>${total}</b><span>Membres enregistrés</span></div>
      <div class="v6-kpi"><b>${actifs}</b><span>Membres actifs</span></div>
      <div class="v6-kpi"><b>${comptes}</b><span>Accès créés</span></div>
      <div class="v6-kpi"><b>${responsables}</b><span>Responsables</span></div>
    `;

    const parSection = {};
    membres.forEach((m) => {
      const nom = m.section_nom || nomSection(m.section_id);
      if (!parSection[nom]) parSection[nom] = { total: 0, acces: 0 };
      parSection[nom].total += 1;
      if (m.has_auth) parSection[nom].acces += 1;
    });
    q('v6-sections').innerHTML = Object.entries(parSection).map(([nom, info]) => `
      <div class="v6-section-card"><b>${info.total}</b><span>${echapperHtml(nom)}</span><p class="v6-note">${info.acces} accès créé(s)</p></div>
    `).join('') || '<div class="empty">Aucune donnée.</div>';

    if (d.president) await chargerAuditV6();
  }

  async function chargerAuditV6() {
    const { data, error } = await supabaseClient.rpc('list_access_audit_v6', { p_limit: 30 });
    if (error) return;
    const card = q('v6-audit-card');
    const zone = q('v6-audit');
    if (!card || !zone) return;
    card.classList.remove('hide');
    if (!(data || []).length) {
      zone.innerHTML = '<div class="empty">Aucune opération enregistrée.</div>';
      return;
    }
    zone.innerHTML = data.map((a) => `
      <div class="v6-audit-row">
        <b>${echapperHtml(a.action || 'Opération')}</b>
        <div class="v6-note">${echapperHtml(a.target_member_name || a.target_email || 'Membre')} · ${new Date(a.created_at).toLocaleString('fr-FR')}</div>
        ${a.actor_member_name ? `<div class="v6-note">Par ${echapperHtml(a.actor_member_name)}</div>` : ''}
      </div>
    `).join('');
  }

  function navigationV6() {
    const d = droits();
    const nav = q('nav');
    if (!nav) return;
    const items = [
      ['accueil()', 'Accueil'],
      ['maCarte()', 'Ma carte'],
      ['cotisations()', 'Cotisations'],
      ['suggestions()', 'Suggestions'],
      ['conseilJuridique()', 'Conseil juridique'],
      ['agenda()', 'Agenda'],
      ['actualites()', 'Actualités'],
      ['messages()', 'Messages']
    ];
    if (d.admin) {
      items.push(['membres()', 'Membres']);
      items.push(['pilotageV6()', 'Pilotage']);
    }
    if (d.secretariat) items.push(['procesVerbaux()', 'PV']);
    if (d.finance) items.push(['finances()', 'Finances']);
    nav.innerHTML = items.map(([fn, label]) => `<button onclick="${fn}">${label}</button>`).join('');
  }

  async function suggestionsV6() {
    const content = q('content');
    content.innerHTML = `
      <div class="section-title"><h2>Suggestions et remarques</h2></div>
      <div class="card">
        <p class="note">Votre nom sera visible par tous les membres avec votre publication.</p>
        <div class="form-grid">
          <div><label for="suggestion-type">Type</label><select id="suggestion-type"><option value="suggestion">Suggestion d'amélioration</option><option value="remarque">Remarque concernant un bureau</option></select></div>
          <div><label for="suggestion-bureau">Bureau concerné (facultatif)</label><input id="suggestion-bureau" maxlength="120" placeholder="Bureau national, Bouaké, Yamoussoukro…"></div>
          <div class="full"><label for="suggestion-titre">Titre</label><input id="suggestion-titre" maxlength="160" placeholder="Résumez votre proposition"></div>
          <div class="full"><label for="suggestion-contenu">Votre message</label><textarea id="suggestion-contenu" maxlength="3000" placeholder="Expliquez clairement votre suggestion ou votre remarque."></textarea></div>
        </div>
        <button class="btn btn-primary" onclick="envoyerSuggestion()">Publier</button>
      </div>
      <div class="section-title"><h3>Publications des membres</h3></div>
      <div id="suggestions-list" class="list"><div class="empty">Chargement…</div></div>`;
    await chargerSuggestionsV6();
  }

  async function envoyerSuggestionV6() {
    const type = q('suggestion-type')?.value;
    const bureau = q('suggestion-bureau')?.value.trim();
    const titre = q('suggestion-titre')?.value.trim();
    const contenu = q('suggestion-contenu')?.value.trim();
    if (!titre || !contenu) return toast('Ajoutez un titre et un message.');
    const { error } = await supabaseClient.from('suggestions').insert({
      auteur_id: authUserId,
      auteur_nom: nomComplet(),
      type,
      bureau_concerne: bureau || null,
      titre,
      contenu
    });
    if (error) return toast(error.message || "Impossible d'envoyer la suggestion.", 6000);
    toast('Votre publication a été ajoutée.');
    await suggestionsV6();
  }

  async function chargerSuggestionsV6() {
    const zone = q('suggestions-list');
    const { data, error } = await supabaseClient.from('suggestions')
      .select('id,auteur_nom,type,bureau_concerne,titre,contenu,statut,created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return zone.innerHTML = '<div class="empty">Impossible de charger les publications.</div>';
    if (!(data || []).length) return zone.innerHTML = '<div class="empty">Aucune suggestion pour le moment.</div>';
    zone.innerHTML = data.map((s) => `<article class="list-item suggestion-item"><div><div class="item-meta"><span class="badge badge-blue">${echapperHtml(s.type === 'remarque' ? 'Remarque' : 'Suggestion')}</span><span class="badge badge-green">${echapperHtml(s.statut || 'Reçue')}</span></div><h4>${echapperHtml(s.titre)}</h4><p><b>${echapperHtml(s.auteur_nom || 'Membre')}</b> · ${new Date(s.created_at).toLocaleDateString('fr-FR')}</p>${s.bureau_concerne ? `<p>Bureau concerné : ${echapperHtml(s.bureau_concerne)}</p>` : ''}<div class="publication-text">${echapperHtml(s.contenu)}</div></div></article>`).join('');
  }

  function conseilJuridiqueV6() {
    const content = q('content');
    content.innerHTML = `
      <div class="section-title"><h2>Conseil juridique assisté par IA</h2></div>
      <div class="card legal-card">
        <div class="legal-warning"><b>Orientation générale uniquement</b><p>Ce service ne remplace pas un avocat, un juriste, la police ou une décision de justice. Ne saisissez pas de numéro de pièce, de compte bancaire ou d'autres données très sensibles.</p></div>
        <label for="legal-question">Expliquez votre situation</label>
        <textarea id="legal-question" maxlength="4000" placeholder="Exemple : contrôle routier, contrat avec une plateforme, accident, litige, dette ou problème personnel…"></textarea>
        <button id="legal-submit" class="btn btn-primary" onclick="demanderConseilJuridique()">Obtenir une orientation</button>
      </div><div id="legal-response" class="card legal-response hide"></div>`;
  }

  async function demanderConseilJuridiqueV6() {
    const question = q('legal-question')?.value.trim();
    const bouton = q('legal-submit');
    const zone = q('legal-response');
    if (!question || question.length < 15) return toast('Décrivez la situation avec un peu plus de précision.');
    bouton.disabled = true;
    bouton.textContent = 'Analyse en cours…';
    zone.classList.remove('hide');
    zone.innerHTML = '<div class="empty">Préparation de votre orientation…</div>';
    try {
      const { data: sessionData } = await supabaseClient.auth.getSession();
      const token = sessionData?.session?.access_token;
      const response = await fetch('/api/legal-advice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` },
        body: JSON.stringify({ question })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Service momentanément indisponible.');
      zone.innerHTML = `<h3>Votre orientation</h3><div class="legal-answer">${echapperHtml(data.answer)}</div>`;
    } catch (e) {
      zone.innerHTML = `<div class="empty">${echapperHtml(e.message || 'Impossible de joindre le service.')}</div>`;
    } finally {
      bouton.disabled = false;
      bouton.textContent = 'Obtenir une orientation';
    }
  }

  async function agendaV6() {
    const content = q('content');
    const d = droits();
    content.innerHTML = `<div class="section-title"><h2>Agenda ACVTC-CI</h2></div>${d.admin ? `<div class="card"><h3>Ajouter un événement</h3><div class="form-grid"><div class="full"><label for="event-title">Titre</label><input id="event-title" maxlength="180"></div><div><label for="event-start">Date et heure</label><input id="event-start" type="datetime-local"></div><div><label for="event-location">Lieu</label><input id="event-location" maxlength="180"></div><div class="full"><label for="event-description">Description</label><textarea id="event-description" maxlength="4000"></textarea></div><div class="full"><label for="event-image">Image de l'événement (facultative)</label><input id="event-image" type="file" accept="image/jpeg,image/png,image/webp"></div></div><button class="btn btn-primary" onclick="ajouterEvenement()">Ajouter à l'agenda</button></div>` : ''}<div class="section-title"><h3>Événements</h3></div><div id="agenda-list" class="grid"><div class="empty">Chargement…</div></div>`;
    await chargerAgendaV6();
  }

  async function ajouterEvenementV6() {
    const titre = q('event-title')?.value.trim();
    const dateDebut = q('event-start')?.value;
    const lieu = q('event-location')?.value.trim();
    const description = q('event-description')?.value.trim();
    const fichier = q('event-image')?.files?.[0];
    if (!titre || !dateDebut || !description) return toast('Le titre, la date et la description sont obligatoires.');
    if (fichier && fichier.size > 5 * 1024 * 1024) return toast("L'image ne doit pas dépasser 5 Mo.");
    let imagePath = null;
    if (fichier) {
      const ext = (fichier.name.split('.').pop() || 'jpg').toLowerCase();
      imagePath = `${authUserId}/${Date.now()}.${ext}`;
      const upload = await supabaseClient.storage.from('event-images').upload(imagePath, fichier, { upsert: false });
      if (upload.error) return toast(upload.error.message || "Impossible d'ajouter l'image.", 6000);
    }
    const { error } = await supabaseClient.from('events').insert({
      titre,
      description,
      lieu: lieu || null,
      date_debut: new Date(dateDebut).toISOString(),
      image_path: imagePath,
      created_by: authUserId,
      created_by_name: nomComplet()
    });
    if (error) return toast(error.message || "Impossible d'ajouter l'événement.", 6000);
    toast("L'événement a été ajouté.");
    await agendaV6();
  }

  async function chargerAgendaV6() {
    const zone = q('agenda-list');
    const { data, error } = await supabaseClient.from('events')
      .select('id,titre,description,lieu,date_debut,image_path,created_by_name')
      .order('date_debut', { ascending: true })
      .limit(100);
    if (error) return zone.innerHTML = '<div class="empty">Impossible de charger l’agenda.</div>';
    if (!(data || []).length) return zone.innerHTML = '<div class="empty">Aucun événement programmé.</div>';
    const withUrls = await Promise.all(data.map(async (event) => {
      if (!event.image_path) return { ...event, image_url: null };
      const signed = await supabaseClient.storage.from('event-images').createSignedUrl(event.image_path, 3600);
      return { ...event, image_url: signed.data?.signedUrl || null };
    }));
    const peutGerer = droits().admin;
    zone.innerHTML = withUrls.map((e) => `<article class="card event-card">${e.image_url ? `<img src="${echapperHtml(e.image_url)}" alt="Image de l'événement">` : ''}<div class="event-body"><span class="badge badge-blue">${new Date(e.date_debut).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}</span><h3>${echapperHtml(e.titre)}</h3>${e.lieu ? `<p>📍 ${echapperHtml(e.lieu)}</p>` : ''}<div class="publication-text">${echapperHtml(e.description)}</div><p class="note">Ajouté par ${echapperHtml(e.created_by_name || 'le bureau')}</p>${peutGerer ? `<div class="list-actions"><button class="btn btn-light btn-small" style="color:#b42318;border-color:#f4b4ae" onclick="supprimerEvenement('${encodeURIComponent(String(e.id))}','${encodeURIComponent(e.image_path || '')}')">🗑️ Supprimer</button></div>` : ''}</div></article>`).join('');
  }

  async function supprimerEvenementV6(idEncode, imageEncode) {
    if (!droits().admin) {
      toast("Vous n'êtes pas autorisé à supprimer cet événement.");
      return;
    }

    const id = decodeURIComponent(String(idEncode || ''));
    const imagePath = decodeURIComponent(String(imageEncode || ''));
    if (!id) return;

    if (!window.confirm("Supprimer définitivement cet événement de l'agenda ?")) {
      return;
    }

    const { error } = await supabaseClient
      .from('events')
      .delete()
      .eq('id', id);

    if (error) {
      console.error(error);
      toast("Impossible de supprimer l'événement.", 6000);
      return;
    }

    if (imagePath) {
      const nettoyage = await supabaseClient.storage
        .from('event-images')
        .remove([imagePath]);
      if (nettoyage.error) console.warn('Image non supprimée du stockage', nettoyage.error);
    }

    toast("L'événement a été supprimé.");
    await chargerAgendaV6();
  }

  function installerV6() {
    injecterStylesV6();
    appliquerMarqueV6();

    window.legacyLogin = connexionV6;
    window.envoyerLienMotDePasse = envoyerLienMotDePasseV6;

    window.membres = membresV6;
    window.ajouterMembreSimple = ajouterMembreV6;
    window.ajouterResponsableV6 = ajouterResponsableV6;
    window.chargerAnnuaireV6 = chargerAnnuaireV6;
    window.filtrerAnnuaireV6 = filtrerAnnuaireV6;
    window.creerAccesV6 = creerAccesV6;
    window.reinitialiserAccesV6 = reinitialiserAccesV6;
    window.pilotageV6 = pilotageV6;
    window.afficherNavigation = navigationV6;

    window.suggestions = suggestionsV6;
    window.envoyerSuggestion = envoyerSuggestionV6;
    window.chargerSuggestions = chargerSuggestionsV6;
    window.conseilJuridique = conseilJuridiqueV6;
    window.demanderConseilJuridique = demanderConseilJuridiqueV6;
    window.agenda = agendaV6;
    window.ajouterEvenement = ajouterEvenementV6;
    window.chargerAgenda = chargerAgendaV6;
    window.supprimerEvenement = supprimerEvenementV6;

    if (q('app-shell') && !q('app-shell').classList.contains('hide')) {
      navigationV6();
    }
  }

  if (document.readyState === 'complete') installerV6();
  else window.addEventListener('load', installerV6, { once: true });
})();
