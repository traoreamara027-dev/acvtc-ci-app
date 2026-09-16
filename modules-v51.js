// ACVTC-CI V5.1 — Suggestions, conseil juridique assisté par IA et agenda.

async function suggestions() {
  const content = document.getElementById('content');
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
  await chargerSuggestions();
}

async function envoyerSuggestion() {
  const type = document.getElementById('suggestion-type')?.value;
  const bureau = document.getElementById('suggestion-bureau')?.value.trim();
  const titre = document.getElementById('suggestion-titre')?.value.trim();
  const contenu = document.getElementById('suggestion-contenu')?.value.trim();
  if (!titre || !contenu) return toast('Ajoutez un titre et un message.');
  const { error } = await supabaseClient.from('suggestions').insert({ auteur_id: authUserId, auteur_nom: nomComplet(), type, bureau_concerne: bureau || null, titre, contenu });
  if (error) return toast(error.message || "Impossible d'envoyer la suggestion.", 6000);
  toast('Votre publication a été ajoutée.');
  await suggestions();
}

async function chargerSuggestions() {
  const zone = document.getElementById('suggestions-list');
  const { data, error } = await supabaseClient.from('suggestions').select('id,auteur_nom,type,bureau_concerne,titre,contenu,statut,created_at').order('created_at', { ascending: false }).limit(100);
  if (error) return zone.innerHTML = '<div class="empty">Impossible de charger les publications.</div>';
  if (!(data || []).length) return zone.innerHTML = '<div class="empty">Aucune suggestion pour le moment.</div>';
  zone.innerHTML = data.map(s => `<article class="list-item suggestion-item"><div><div class="item-meta"><span class="badge badge-blue">${echapperHtml(s.type === 'remarque' ? 'Remarque' : 'Suggestion')}</span><span class="badge badge-green">${echapperHtml(s.statut || 'Reçue')}</span></div><h4>${echapperHtml(s.titre)}</h4><p><b>${echapperHtml(s.auteur_nom || 'Membre')}</b> · ${new Date(s.created_at).toLocaleDateString('fr-FR')}</p>${s.bureau_concerne ? `<p>Bureau concerné : ${echapperHtml(s.bureau_concerne)}</p>` : ''}<div class="publication-text">${echapperHtml(s.contenu)}</div></div></article>`).join('');
}

function conseilJuridique() {
  const content = document.getElementById('content');
  content.innerHTML = `
    <div class="section-title"><h2>Conseil juridique assisté par IA</h2></div>
    <div class="card legal-card">
      <div class="legal-warning"><b>Orientation générale uniquement</b><p>Ce service ne remplace pas un avocat, un juriste, la police ou une décision de justice. Ne saisissez pas de numéro de pièce, de compte bancaire ou d'autres données très sensibles.</p></div>
      <label for="legal-question">Expliquez votre situation</label>
      <textarea id="legal-question" maxlength="4000" placeholder="Exemple : contrôle routier, contrat avec une plateforme, accident, litige, dette ou problème personnel…"></textarea>
      <button id="legal-submit" class="btn btn-primary" onclick="demanderConseilJuridique()">Obtenir une orientation</button>
    </div><div id="legal-response" class="card legal-response hide"></div>`;
}

async function demanderConseilJuridique() {
  const question = document.getElementById('legal-question')?.value.trim();
  const bouton = document.getElementById('legal-submit');
  const zone = document.getElementById('legal-response');
  if (!question || question.length < 15) return toast('Décrivez la situation avec un peu plus de précision.');
  bouton.disabled = true; bouton.textContent = 'Analyse en cours…';
  zone.classList.remove('hide'); zone.innerHTML = '<div class="empty">Préparation de votre orientation…</div>';
  try {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const token = sessionData?.session?.access_token;
    const response = await fetch('/api/legal-advice', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token || ''}` }, body: JSON.stringify({ question }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Service momentanément indisponible.');
    zone.innerHTML = `<h3>Votre orientation</h3><div class="legal-answer">${echapperHtml(data.answer)}</div>`;
  } catch (e) {
    zone.innerHTML = `<div class="empty">${echapperHtml(e.message || 'Impossible de joindre le service.')}</div>`;
  } finally {
    bouton.disabled = false; bouton.textContent = 'Obtenir une orientation';
  }
}

async function agenda() {
  const content = document.getElementById('content');
  const d = droits();
  content.innerHTML = `<div class="section-title"><h2>Agenda ACVTC-CI</h2></div>${d.admin ? `<div class="card"><h3>Ajouter un événement</h3><div class="form-grid"><div class="full"><label for="event-title">Titre</label><input id="event-title" maxlength="180"></div><div><label for="event-start">Date et heure</label><input id="event-start" type="datetime-local"></div><div><label for="event-location">Lieu</label><input id="event-location" maxlength="180"></div><div class="full"><label for="event-description">Description</label><textarea id="event-description" maxlength="4000"></textarea></div><div class="full"><label for="event-image">Image de l'événement (facultative)</label><input id="event-image" type="file" accept="image/jpeg,image/png,image/webp"></div></div><button class="btn btn-primary" onclick="ajouterEvenement()">Ajouter à l'agenda</button></div>` : ''}<div class="section-title"><h3>Événements</h3></div><div id="agenda-list" class="grid"><div class="empty">Chargement…</div></div>`;
  await chargerAgenda();
}

async function ajouterEvenement() {
  const titre = document.getElementById('event-title')?.value.trim();
  const dateDebut = document.getElementById('event-start')?.value;
  const lieu = document.getElementById('event-location')?.value.trim();
  const description = document.getElementById('event-description')?.value.trim();
  const fichier = document.getElementById('event-image')?.files?.[0];
  if (!titre || !dateDebut || !description) return toast('Le titre, la date et la description sont obligatoires.');
  if (fichier && fichier.size > 5 * 1024 * 1024) return toast("L'image ne doit pas dépasser 5 Mo.");
  let imagePath = null;
  if (fichier) {
    const ext = (fichier.name.split('.').pop() || 'jpg').toLowerCase();
    imagePath = `${authUserId}/${Date.now()}.${ext}`;
    const upload = await supabaseClient.storage.from('event-images').upload(imagePath, fichier, { upsert: false });
    if (upload.error) return toast(upload.error.message || "Impossible d'ajouter l'image.", 6000);
  }
  const { error } = await supabaseClient.from('events').insert({ titre, description, lieu: lieu || null, date_debut: new Date(dateDebut).toISOString(), image_path: imagePath, created_by: authUserId, created_by_name: nomComplet() });
  if (error) return toast(error.message || "Impossible d'ajouter l'événement.", 6000);
  toast("L'événement a été ajouté."); await agenda();
}

async function chargerAgenda() {
  const zone = document.getElementById('agenda-list');
  const { data, error } = await supabaseClient.from('events').select('id,titre,description,lieu,date_debut,image_path,created_by_name').order('date_debut', { ascending: true }).limit(100);
  if (error) return zone.innerHTML = '<div class="empty">Impossible de charger l’agenda.</div>';
  if (!(data || []).length) return zone.innerHTML = '<div class="empty">Aucun événement programmé.</div>';
  const withUrls = await Promise.all(data.map(async event => {
    if (!event.image_path) return { ...event, image_url: null };
    const signed = await supabaseClient.storage.from('event-images').createSignedUrl(event.image_path, 3600);
    return { ...event, image_url: signed.data?.signedUrl || null };
  }));
  zone.innerHTML = withUrls.map(e => `<article class="card event-card">${e.image_url ? `<img src="${echapperHtml(e.image_url)}" alt="Image de l'événement">` : ''}<div class="event-body"><span class="badge badge-blue">${new Date(e.date_debut).toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' })}</span><h3>${echapperHtml(e.titre)}</h3>${e.lieu ? `<p>📍 ${echapperHtml(e.lieu)}</p>` : ''}<div class="publication-text">${echapperHtml(e.description)}</div><p class="note">Ajouté par ${echapperHtml(e.created_by_name || 'le bureau')}</p></div></article>`).join('');
}
