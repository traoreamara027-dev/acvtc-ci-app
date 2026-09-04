const SUPABASE_URL = 'https://jxunyxingxubryyugwzn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_HeE36KA4qTxB3jfo98Uvtg_mQSvG350';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

let profilActuel = null;

let sectionsCache = {
  1: 'Abidjan',
  2: 'Bouaké',
  3: 'Yamoussoukro'
};

let rolesCache = {
  1: 'Président'
};

function echapperHtml(valeur) {
  return String(valeur ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function nomSection(sectionId) {
  return sectionsCache[Number(sectionId)] || `Section ${sectionId || '-'}`;
}

function nomRole(roleId) {
  return rolesCache[Number(roleId)] || `Rôle ${roleId || '-'}`;
}

async function chargerReferentiels() {
  const { data: sections, error: erreurSections } =
    await supabaseClient.rpc('list_sections');

  if (!erreurSections && Array.isArray(sections)) {
    sections.forEach((s) => {
      sectionsCache[Number(s.id)] = s.nom;
    });
  }

  const { data: roles, error: erreurRoles } =
    await supabaseClient.rpc('list_roles');

  if (!erreurRoles && Array.isArray(roles)) {
    roles.forEach((r) => {
      rolesCache[Number(r.id)] = r.nom;
    });
  }
}

/* =========================
   MESSAGE DE CONNEXION
========================= */

function messageConnexion(message, erreur = false) {
  const zone = document.getElementById('login-message');

  if (!zone) return;

  zone.textContent = message;
  zone.style.color = erreur ? '#b91c1c' : '#123b70';
}

/* =========================
   CONNEXION
========================= */

async function renvoyerConfirmation() {
  const email = document.getElementById('user').value.trim();

  const { error } = await supabaseClient.auth.resend({
    type: 'signup',
    email: email
  });

  if (error) {
    alert("Erreur : " + error.message);
  } else {
    alert("Un nouvel e-mail de confirmation a été envoyé.");
  }
}
async function login() {
  const champEmail = document.getElementById('user');
  const champPass = document.getElementById('pass');

  if (!champEmail || !champPass) return;

  const email = champEmail.value.trim();
  const password = champPass.value;

  if (!email || !password) {
    messageConnexion(
      'Veuillez saisir votre adresse e-mail et votre mot de passe.',
      true
    );
    return;
  }

  messageConnexion('Connexion en cours...');

  const { data, error } =
    await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

  if (error) {
    console.error(error);

    messageConnexion(
      'Connexion impossible. Vérifiez votre adresse e-mail et votre mot de passe.',
      true
    );
    return;
  }

  if (!data?.user) {
    messageConnexion('Utilisateur introuvable.', true);
    return;
  }

  await chargerProfil(data.user);
}

/* =========================
   PROFIL
========================= */

async function chargerProfil(user) {
  await chargerReferentiels();

  const { data: profil, error } =
    await supabaseClient
      .from('profiles')
      .select(
        'id, nom, prenoms, telephone, photo_url, section_id, role_id, numero_membre, actif'
      )
      .eq('id', user.id)
      .single();

  if (error || !profil) {
    console.error(error);

    messageConnexion(
      'Compte connecté, mais le profil ACVTC-CI est introuvable.',
      true
    );

    await supabaseClient.auth.signOut();
    return;
  }

  if (profil.actif === false) {
    messageConnexion(
      'Ce compte ACVTC-CI est désactivé.',
      true
    );

    await supabaseClient.auth.signOut();
    return;
  }

  profilActuel = profil;

  sessionStorage.setItem(
    'acvtc_profil',
    JSON.stringify(profil)
  );

  afficherApplication(profil);
}

/* =========================
   APPLICATION
========================= */

function afficherApplication(profil) {
  const loginZone = document.getElementById('login');
  const appZone = document.getElementById('app');
  const boutonOut = document.getElementById('out');
  const nav = document.getElementById('nav');

  if (loginZone) loginZone.classList.add('hide');
  if (appZone) appZone.classList.remove('hide');
  if (boutonOut) boutonOut.classList.remove('hide');

  if (!nav) return;

  let boutons = `
    <button onclick="home()">Accueil</button>
    <button onclick="card()">Ma carte</button>
    <button onclick="dues()">Cotisations</button>
  `;

  if (Number(profil.role_id) === 1) {
    boutons += `
      <button onclick="members()">Membres</button>
      <button onclick="finance()">Finances</button>
    `;
  }

  nav.innerHTML = boutons;

  home();
}

/* =========================
   ACCUEIL
========================= */

function home() {
  if (!profilActuel) return;

  const content = document.getElementById('content');
  if (!content) return;

  content.innerHTML = `
    <div class="card">
      <h2>
        Bienvenue
        ${echapperHtml(profilActuel.prenoms || '')}
        ${echapperHtml(profilActuel.nom || '')}
      </h2>

      <p>
        <b>Numéro membre :</b>
        ${echapperHtml(profilActuel.numero_membre || '-')}
      </p>

      <p>
        <b>Téléphone :</b>
        ${echapperHtml(profilActuel.telephone || '-')}
      </p>

      <p>
        <b>Section :</b>
        ${echapperHtml(nomSection(profilActuel.section_id))}
      </p>

      <p>
        <b>Rôle :</b>
        ${echapperHtml(nomRole(profilActuel.role_id))}
      </p>

      <p><b>Statut :</b> Compte actif</p>
    </div>
  `;
}

/* =========================
   CARTE
========================= */

function card() {
  if (!profilActuel) return;

  const content = document.getElementById('content');
  if (!content) return;

  const photo = profilActuel.photo_url
    ? `
      <img
        src="${echapperHtml(profilActuel.photo_url)}"
        alt="Photo membre"
        style="
          width:120px;
          height:120px;
          object-fit:cover;
          border-radius:12px;
          margin-bottom:15px;
        "
      >
    `
    : '';

  content.innerHTML = `
    <div class="card">
      <h2>Carte membre ACVTC-CI</h2>

      ${photo}

      <h3>
        ${echapperHtml(profilActuel.prenoms || '')}
        ${echapperHtml(profilActuel.nom || '')}
      </h3>

      <p>
        <b>Numéro :</b>
        ${echapperHtml(profilActuel.numero_membre || '-')}
      </p>

      <p>
        <b>Téléphone :</b>
        ${echapperHtml(profilActuel.telephone || '-')}
      </p>

      <p>
        <b>Section :</b>
        ${echapperHtml(nomSection(profilActuel.section_id))}
      </p>

      <p>
        <b>Rôle :</b>
        ${echapperHtml(nomRole(profilActuel.role_id))}
      </p>

      <p><b>Statut :</b> ACTIF</p>
    </div>
  `;
}

/* =========================
   COTISATIONS
========================= */

function dues() {
  if (!profilActuel) return;

  const content = document.getElementById('content');
  if (!content) return;

  content.innerHTML = `
    <div class="card">
      <h2>Cotisations ACVTC-CI</h2>

      <p>
        <b>Membre :</b>
        ${echapperHtml(profilActuel.prenoms || '')}
        ${echapperHtml(profilActuel.nom || '')}
      </p>

      <p>
        <b>Numéro membre :</b>
        ${echapperHtml(profilActuel.numero_membre || '-')}
      </p>

      <p>Cotisation mensuelle : <b>500 FCFA</b></p>

      <p>
        Après deux semaines de retard :
        <b>700 FCFA</b>
      </p>
    </div>
  `;
}

/* =========================
   MEMBRES
========================= */

async function members() {
  if (!profilActuel) return;
  if (Number(profilActuel.role_id) !== 1) return;

  const content = document.getElementById('content');
  if (!content) return;

  content.innerHTML = `
    <div class="card">
      <h2>Membres ACVTC-CI</h2>
      <p>Chargement...</p>
    </div>
  `;

  await chargerReferentiels();

  const { data: membres, error } =
    await supabaseClient
      .from('profiles')
      .select(
        'id, nom, prenoms, telephone, section_id, role_id, numero_membre, actif'
      )
      .order('nom', { ascending: true })
      .order('prenoms', { ascending: true });

  if (error) {
    console.error(error);

    content.innerHTML = `
      <div class="card">
        <h2>Membres ACVTC-CI</h2>
        <p style="color:#b91c1c;">
          Impossible de charger la liste des membres.
        </p>
      </div>
    `;
    return;
  }

  const liste = Array.isArray(membres) ? membres : [];

  const lignes = liste.map((membre) => `
    <div
      style="
        border:1px solid #d8dee9;
        border-radius:12px;
        padding:14px;
        margin:12px 0;
        background:#ffffff;
      "
    >
      <h3 style="margin:0 0 8px 0;">
        ${echapperHtml(membre.prenoms || '')}
        ${echapperHtml(membre.nom || '')}
      </h3>

      <p style="margin:5px 0;">
        <b>N° membre :</b>
        ${echapperHtml(membre.numero_membre || '-')}
      </p>

      <p style="margin:5px 0;">
        <b>Téléphone :</b>
        ${echapperHtml(membre.telephone || '-')}
      </p>

      <p style="margin:5px 0;">
        <b>Section :</b>
        ${echapperHtml(nomSection(membre.section_id))}
      </p>

      <p style="margin:5px 0;">
        <b>Rôle :</b>
        ${echapperHtml(nomRole(membre.role_id))}
      </p>

      <p style="margin:5px 0;">
        <b>Statut :</b>
        ${membre.actif === false ? 'Désactivé' : 'Actif'}
      </p>
    </div>
  `).join('');

  content.innerHTML = `
    <div class="card">
      <h2>Membres ACVTC-CI</h2>

      <button
        onclick="afficherFormulaireInvitation()"
        style="margin-bottom:16px;"
      >
        + Ajouter un membre
      </button>

      <p><b>Total :</b> ${liste.length}</p>

      ${lignes || '<p>Aucun membre enregistré.</p>'}
    </div>
  `;
}

/* =========================
   FORMULAIRE INVITATION
========================= */

async function afficherFormulaireInvitation() {
  if (!profilActuel || Number(profilActuel.role_id) !== 1) return;

  const content = document.getElementById('content');
  if (!content) return;

  content.innerHTML = `
    <div class="card">
      <h2>Ajouter un membre</h2>
      <p>Chargement des sections et des rôles...</p>
    </div>
  `;

  const { data: sections, error: erreurSections } =
    await supabaseClient.rpc('list_sections');

  const { data: roles, error: erreurRoles } =
    await supabaseClient.rpc('list_roles');

  if (erreurSections || erreurRoles) {
    console.error(erreurSections || erreurRoles);

    content.innerHTML = `
      <div class="card">
        <h2>Ajouter un membre</h2>
        <p style="color:#b91c1c;">
          Impossible de charger les sections ou les rôles.
        </p>
        <button onclick="members()">Retour</button>
      </div>
    `;
    return;
  }

  (sections || []).forEach((s) => {
    sectionsCache[Number(s.id)] = s.nom;
  });

  (roles || []).forEach((r) => {
    rolesCache[Number(r.id)] = r.nom;
  });

  const optionsSections = (sections || [])
    .map(
      (s) =>
        `<option value="${Number(s.id)}">${echapperHtml(s.nom)}</option>`
    )
    .join('');

  const optionsRoles = (roles || [])
    .map(
      (r) =>
        `<option value="${Number(r.id)}">${echapperHtml(r.nom)}</option>`
    )
    .join('');

  content.innerHTML = `
    <div class="card">
      <h2>Ajouter un membre</h2>

      <p>
        Le lien d'invitation sera valable pendant 7 jours.
      </p>

      <label><b>Adresse e-mail</b></label>
      <input
        id="invite-email"
        type="email"
        placeholder="exemple@gmail.com"
        style="
          width:100%;
          box-sizing:border-box;
          margin:8px 0 14px;
        "
      >

      <label><b>Téléphone</b></label>
      <input
        id="invite-telephone"
        type="tel"
        placeholder="07xxxxxxxx"
        style="
          width:100%;
          box-sizing:border-box;
          margin:8px 0 14px;
        "
      >

      <label><b>Section</b></label>
      <select
        id="invite-section"
        style="
          width:100%;
          box-sizing:border-box;
          margin:8px 0 14px;
          padding:12px;
        "
      >
        ${optionsSections}
      </select>

      <label><b>Rôle</b></label>
      <select
        id="invite-role"
        style="
          width:100%;
          box-sizing:border-box;
          margin:8px 0 14px;
          padding:12px;
        "
      >
        ${optionsRoles}
      </select>

      <button onclick="creerInvitation()">
        Générer le lien d'invitation
      </button>

      <button
        onclick="members()"
        style="margin-left:8px;"
      >
        Annuler
      </button>

      <div
        id="invite-result"
        style="margin-top:18px;"
      ></div>
    </div>
  `;
}

/* =========================
   CRÉER INVITATION
========================= */

async function creerInvitation() {
  const email =
    document.getElementById('invite-email')?.value.trim() || '';

  const telephone =
    document.getElementById('invite-telephone')?.value.trim() || '';

  const sectionId =
    Number(document.getElementById('invite-section')?.value);

  const roleId =
    Number(document.getElementById('invite-role')?.value);

  const zone = document.getElementById('invite-result');

  if (!zone) return;

  if (!email || !sectionId || !roleId) {
    zone.innerHTML = `
      <p style="color:#b91c1c;">
        Renseignez l'e-mail, la section et le rôle.
      </p>
    `;
    return;
  }

  zone.innerHTML = '<p>Création de l’invitation...</p>';

  const { data: token, error } =
    await supabaseClient.rpc(
      'create_invitation',
      {
        p_email: email,
        p_telephone: telephone || null,
        p_role_id: roleId,
        p_section_id: sectionId
      }
    );

  if (error || !token) {
    console.error(error);

    zone.innerHTML = `
      <p style="color:#b91c1c;">
        Impossible de créer l'invitation.
      </p>
    `;
    return;
  }

  const lien =
    `${window.location.origin}${window.location.pathname}` +
    `?invite=${encodeURIComponent(token)}`;

  zone.innerHTML = `
    <p><b>Invitation créée ✅</b></p>

    <p>Envoyez ce lien au membre :</p>

    <input
      id="invitation-link"
      value="${echapperHtml(lien)}"
      readonly
      style="
        width:100%;
        box-sizing:border-box;
        margin:8px 0 12px;
      "
    >

    <button onclick="copierLienInvitation()">
      Copier le lien
    </button>
  `;
}

async function copierLienInvitation() {
  const champ = document.getElementById('invitation-link');
  if (!champ) return;

  try {
    await navigator.clipboard.writeText(champ.value);
    alert('Lien copié.');
  } catch (e) {
    champ.focus();
    champ.select();
    document.execCommand('copy');
    alert('Lien copié.');
  }
}

/* =========================
   PAGE INSCRIPTION
========================= */

async function afficherInscriptionInvitation(token) {
  const loginZone = document.getElementById('login');
  const appZone = document.getElementById('app');
  const boutonOut = document.getElementById('out');

  if (!loginZone) return;

  if (appZone) appZone.classList.add('hide');
  if (boutonOut) boutonOut.classList.add('hide');

  loginZone.classList.remove('hide');

  loginZone.innerHTML = `
    <h2>Invitation ACVTC-CI</h2>
    <p>Vérification de l'invitation...</p>
  `;

  const { data, error } =
    await supabaseClient.rpc(
      'invitation_info',
      { p_token: token }
    );

  if (
    error ||
    !Array.isArray(data) ||
    data.length === 0
  ) {
    console.error(error);

    loginZone.innerHTML = `
      <h2>Invitation ACVTC-CI</h2>

      <p style="color:#b91c1c;">
        Ce lien est invalide, expiré ou déjà utilisé.
      </p>

      <button onclick="retourConnexion()">
        Retour à la connexion
      </button>
    `;
    return;
  }

  const invitation = data[0];

  loginZone.innerHTML = `
    <h2>Créer mon compte ACVTC-CI</h2>

    <p>
      <b>Section :</b>
      ${echapperHtml(invitation.section_nom)}
      <br>
      <b>Rôle :</b>
      ${echapperHtml(invitation.role_nom)}
    </p>

    <label><b>Nom</b></label>
    <input
      id="signup-nom"
      type="text"
      style="
        width:100%;
        box-sizing:border-box;
        margin:8px 0 14px;
      "
    >

    <label><b>Prénoms</b></label>
    <input
      id="signup-prenoms"
      type="text"
      style="
        width:100%;
        box-sizing:border-box;
        margin:8px 0 14px;
      "
    >

    <label><b>E-mail</b></label>
    <input
      id="signup-email"
      type="email"
      value="${echapperHtml(invitation.email)}"
      readonly
      style="
        width:100%;
        box-sizing:border-box;
        margin:8px 0 14px;
      "
    >

    <label><b>Téléphone</b></label>
    <input
      id="signup-telephone"
      type="tel"
      value="${echapperHtml(invitation.telephone || '')}"
      style="
        width:100%;
        box-sizing:border-box;
        margin:8px 0 14px;
      "
    >

    <label><b>Mot de passe</b></label>
    <input
      id="signup-password"
      type="password"
      minlength="6"
      style="
        width:100%;
        box-sizing:border-box;
        margin:8px 0 14px;
      "
    >

    <label><b>Confirmer le mot de passe</b></label>
    <input
      id="signup-password2"
      type="password"
      minlength="6"
      style="
        width:100%;
        box-sizing:border-box;
        margin:8px 0 14px;
      "
    >

    <button
      id="signup-button"
      onclick="creerCompteInvitation()"
    >
      Créer mon compte
    </button>

    <button
      onclick="retourConnexion()"
      style="margin-left:8px;"
    >
      Annuler
    </button>

    <p id="signup-message"></p>
  `;

  loginZone.dataset.invitationToken = token;
}

/* =========================
   CRÉER COMPTE INVITÉ
========================= */

async function creerCompteInvitation() {
  const loginZone = document.getElementById('login');
  const zone = document.getElementById('signup-message');

  if (!loginZone || !zone) return;

  const token = loginZone.dataset.invitationToken || '';

  const nom =
    document.getElementById('signup-nom')?.value.trim() || '';

  const prenoms =
    document.getElementById('signup-prenoms')?.value.trim() || '';

  const email =
    document.getElementById('signup-email')?.value.trim() || '';

  const telephone =
    document.getElementById('signup-telephone')?.value.trim() || '';

  const password =
    document.getElementById('signup-password')?.value || '';

  const password2 =
    document.getElementById('signup-password2')?.value || '';

  if (!nom || !prenoms || !email || !password) {
    zone.style.color = '#b91c1c';
    zone.textContent =
      'Veuillez compléter tous les champs obligatoires.';
    return;
  }

  if (password.length < 6) {
    zone.style.color = '#b91c1c';
    zone.textContent =
      'Le mot de passe doit contenir au moins 6 caractères.';
    return;
  }

  if (password !== password2) {
    zone.style.color = '#b91c1c';
    zone.textContent =
      'Les deux mots de passe sont différents.';
    return;
  }

  zone.style.color = '#123b70';
  zone.textContent = 'Création du compte en cours...';

  const { data, error } =
    await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo:
          `${window.location.origin}${window.location.pathname}`,
        data: {
          invitation_token: token,
          nom,
          prenoms,
          telephone
        }
      }
    });

  if (error) {
    console.error(error);

    zone.style.color = '#b91c1c';
    zone.textContent =
      `Inscription impossible : ${error.message}`;
    return;
  }

  if (data?.session && data?.user) {
    history.replaceState(
      {},
      '',
      window.location.pathname
    );

    await chargerProfil(data.user);
    return;
  }

  zone.style.color = '#123b70';

  zone.innerHTML = `
    Compte créé.
    Vérifiez votre e-mail pour confirmer votre inscription,
    puis revenez vous connecter.
    <br><br>
    <button onclick="retourConnexion()">
      Aller à la connexion
    </button>
  `;
}

function retourConnexion() {
  window.location.href =
    `${window.location.origin}${window.location.pathname}`;
}

/* =========================
   FINANCES
========================= */

function finance() {
  if (!profilActuel) return;
  if (Number(profilActuel.role_id) !== 1) return;

  const content = document.getElementById('content');
  if (!content) return;

  content.innerHTML = `
    <div class="card">
      <h2>Finances ACVTC-CI</h2>
      <p>Tableau de gestion financière de l'association.</p>
      <p>• Cotisations</p>
      <p>• Paiements</p>
      <p>• Retards</p>
      <p>• Recettes</p>
      <p>• Synthèses financières</p>
    </div>
  `;
}

/* =========================
   DÉCONNEXION
========================= */

async function logout() {
  await supabaseClient.auth.signOut();

  profilActuel = null;

  sessionStorage.removeItem('acvtc_profil');

  window.location.href =
    `${window.location.origin}${window.location.pathname}`;
}

/* =========================
   SESSION
========================= */

async function verifierSession() {
  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  if (session?.user) {
    await chargerProfil(session.user);
    return;
  }

  profilActuel = null;
  sessionStorage.removeItem('acvtc_profil');
}

/* =========================
   DÉMARRAGE
========================= */

async function demarrerApplication() {
  const params =
    new URLSearchParams(window.location.search);

  const tokenInvitation =
    params.get('invite');

  if (tokenInvitation) {
    await afficherInscriptionInvitation(tokenInvitation);
    return;
  }

  await verifierSession();
}

demarrerApplication();
