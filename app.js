const SUPABASE_URL = 'https://jxunyxingxubryyugwzn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_HeE36KA4qTxB3jfo98Uvtg_mQSvG350';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

let profilActuel = null;

function nomSection(sectionId) {
  const sections = {
    1: 'Abidjan',
    2: 'Bouaké',
    3: 'Yamoussoukro'
  };

  return sections[Number(sectionId)] || `Section ${sectionId || '-'}`;
}

function nomRole(roleId) {
  const roles = {
    1: 'Président'
  };

  return roles[Number(roleId)] || `Rôle ${roleId || '-'}`;
}

function echapperHtml(valeur) {
  return String(valeur ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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

async function login() {
  const email = document
    .getElementById('user')
    .value
    .trim();

  const password = document
    .getElementById('pass')
    .value;

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
    console.error('Erreur connexion :', error);

    messageConnexion(
      'Connexion impossible. Vérifiez votre adresse e-mail et votre mot de passe.',
      true
    );
    return;
  }

  if (!data || !data.user) {
    messageConnexion('Utilisateur introuvable.', true);
    return;
  }

  await chargerProfil(data.user);
}

/* =========================
   CHARGEMENT DU PROFIL
========================= */

async function chargerProfil(user) {
  const { data: profil, error } =
    await supabaseClient
      .from('profiles')
      .select(
        'id, nom, prenoms, telephone, photo_url, section_id, role_id, numero_membre, actif'
      )
      .eq('id', user.id)
      .single();

  if (error) {
    console.error('Erreur profil :', error);
  }

  if (error || !profil) {
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
   AFFICHAGE APPLICATION
========================= */

function afficherApplication(profil) {
  const loginZone = document.getElementById('login');
  const appZone = document.getElementById('app');
  const boutonDeconnexion = document.getElementById('out');

  if (loginZone) loginZone.classList.add('hide');
  if (appZone) appZone.classList.remove('hide');
  if (boutonDeconnexion) boutonDeconnexion.classList.remove('hide');

  const nav = document.getElementById('nav');
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
        Bienvenue ${echapperHtml(profilActuel.prenoms || '')}
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

      <p>
        <b>Statut :</b>
        Compte actif
      </p>
    </div>
  `;
}

/* =========================
   CARTE DE MEMBRE
========================= */

function card() {
  if (!profilActuel) return;

  const content = document.getElementById('content');
  if (!content) return;

  let photo = '';

  if (profilActuel.photo_url) {
    photo = `
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
    `;
  }

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

      <p>
        <b>Statut :</b>
        ACTIF
      </p>
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

      <p>
        Cotisation mensuelle :
        <b>500 FCFA</b>
      </p>

      <p>
        Après deux semaines de retard :
        <b>700 FCFA</b>
      </p>

      <p>
        Le suivi automatique des paiements
        sera connecté à la base de données
        dans l'étape suivante.
      </p>
    </div>
  `;
}

/* =========================
   GESTION DES MEMBRES
   PRÉSIDENT UNIQUEMENT
========================= */

async function members() {
  if (!profilActuel) return;
  if (Number(profilActuel.role_id) !== 1) return;

  const content = document.getElementById('content');
  if (!content) return;

  content.innerHTML = `
    <div class="card">
      <h2>Membres ACVTC-CI</h2>
      <p>Chargement de la liste des membres...</p>
    </div>
  `;

  const { data: membres, error } =
    await supabaseClient
      .from('profiles')
      .select(
        'id, nom, prenoms, telephone, section_id, role_id, numero_membre, actif'
      )
      .order('nom', { ascending: true })
      .order('prenoms', { ascending: true });

  if (error) {
    console.error('Erreur membres :', error);

    content.innerHTML = `
      <div class="card">
        <h2>Membres ACVTC-CI</h2>

        <p style="color:#b91c1c;">
          Impossible de charger la liste des membres.
        </p>

        <p>
          Vérifiez que la politique Supabase
          « Président lit tous les profils »
          a bien été installée.
        </p>
      </div>
    `;
    return;
  }

  if (!membres || membres.length === 0) {
    content.innerHTML = `
      <div class="card">
        <h2>Membres ACVTC-CI</h2>
        <p>Aucun membre enregistré.</p>
      </div>
    `;
    return;
  }

  const lignes = membres.map((membre) => {
    const actif = membre.actif !== false;

    return `
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
          ${actif ? 'Actif' : 'Désactivé'}
        </p>
      </div>
    `;
  }).join('');

  content.innerHTML = `
    <div class="card">
      <h2>Membres ACVTC-CI</h2>

      <p>
        <b>Total :</b> ${membres.length}
      </p>

      ${lignes}
    </div>
  `;
}

/* =========================
   FINANCES
   PRÉSIDENT UNIQUEMENT
========================= */

function finance() {
  if (!profilActuel) return;
  if (Number(profilActuel.role_id) !== 1) return;

  const content = document.getElementById('content');
  if (!content) return;

  content.innerHTML = `
    <div class="card">
      <h2>Finances ACVTC-CI</h2>

      <p>
        Tableau de gestion financière de l'association.
      </p>

      <p>• les cotisations</p>
      <p>• les paiements</p>
      <p>• les retards</p>
      <p>• les recettes</p>
      <p>• les synthèses financières</p>
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

  const appZone = document.getElementById('app');
  const loginZone = document.getElementById('login');
  const boutonDeconnexion = document.getElementById('out');

  if (appZone) appZone.classList.add('hide');
  if (boutonDeconnexion) boutonDeconnexion.classList.add('hide');
  if (loginZone) loginZone.classList.remove('hide');

  messageConnexion('');
}

/* =========================
   VÉRIFICATION SESSION
========================= */

async function verifierSession() {
  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  if (session && session.user) {
    await chargerProfil(session.user);
    return;
  }

  profilActuel = null;
  sessionStorage.removeItem('acvtc_profil');
}

/* =========================
   LANCEMENT
========================= */

verifierSession();
