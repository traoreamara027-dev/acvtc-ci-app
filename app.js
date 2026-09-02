const SUPABASE_URL = 'https://jxunyxingxubryyugwzn.supabase.co/';
const SUPABASE_KEY = 'sb_publishable_HeE36KA4qTxB3jfo98Uvtg_mQSvG350';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

let profilActuel = null;

function messageConnexion(message, erreur = false) {
  const zone = document.getElementById('login-message');
  if (!zone) return;

  zone.textContent = message;
  zone.style.color = erreur ? '#b91c1c' : '#123b70';
}

async function login() {
  const email = document.getElementById('user').value.trim();
  const password = document.getElementById('pass').value;

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
      email: email,
      password: password
    });

  if (error) {
    messageConnexion(
      'Connexion impossible. Vérifiez votre e-mail et votre mot de passe.',
      true
    );
    return;
  }

  await chargerProfil(data.user);
}

async function chargerProfil(user) {
  const { data: profil, error } = await supabaseClient
    .from('profils')
    .select(
      'identifiant, nom, prénoms, téléphone, section_id, rôle_id, numéro_membre, actif'
    )
    .eq('identifiant', user.id)
    .single();

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

function afficherApplication(profil) {
  document.getElementById('login').classList.add('hide');
  document.getElementById('app').classList.remove('hide');
  document.getElementById('out').classList.remove('hide');

  const nav = document.getElementById('nav');

  let boutons = `
    <button onclick="home()">Accueil</button>
    <button onclick="card()">Ma carte</button>
    <button onclick="dues()">Cotisations</button>
  `;

  if (Number(profil['rôle_id']) === 1) {
    boutons += `
      <button onclick="members()">Membres</button>
      <button onclick="finance()">Finances</button>
    `;
  }

  nav.innerHTML = boutons;

  home();
}

function home() {
  if (!profilActuel) return;

  document.getElementById('content').innerHTML = `
    <div class="card">
      <h2>Bienvenue ${profilActuel['prénoms'] || ''} ${profilActuel['nom'] || ''}</h2>

      <p><b>Numéro membre :</b>
      ${profilActuel['numéro_membre'] || '-'}</p>

      <p><b>Section :</b>
      ${profilActuel['section_id'] || '-'}</p>

      <p><b>Rôle :</b>
      ${profilActuel['rôle_id'] || '-'}</p>

      <p><b>Statut :</b>
      Compte actif</p>
    </div>
  `;
}

function card() {
  if (!profilActuel) return;

  document.getElementById('content').innerHTML = `
    <div class="card">
      <h2>Carte membre ACVTC-CI</h2>

      <h3>
        ${profilActuel['prénoms'] || ''}
        ${profilActuel['nom'] || ''}
      </h3>

      <p>
        Numéro :
        <b>${profilActuel['numéro_membre'] || '-'}</b>
      </p>

      <p>
        Section :
        <b>${profilActuel['section_id'] || '-'}</b>
      </p>
    </div>
  `;
}

function dues() {
  document.getElementById('content').innerHTML = `
    <div class="card">
      <h2>Cotisations</h2>
      <p>Module de cotisations ACVTC-CI.</p>
    </div>
  `;
}

async function members() {
  if (
    !profilActuel ||
    Number(profilActuel['rôle_id']) !== 1
  ) {
    return;
  }

  document.getElementById('content').innerHTML = `
    <div class="card">
      <h2>Gestion des membres</h2>
      <p>Accès administration autorisé.</p>
    </div>
  `;
}

function finance() {
  if (
    !profilActuel ||
    Number(profilActuel['rôle_id']) !== 1
  ) {
    return;
  }

  document.getElementById('content').innerHTML = `
    <div class="card">
      <h2>Finances</h2>
      <p>Module financier ACVTC-CI.</p>
    </div>
  `;
}

async function logout() {
  await supabaseClient.auth.signOut();

  sessionStorage.removeItem('acvtc_profil');

  profilActuel = null;

  location.reload();
}

async function restaurerSession() {
  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  if (session && session.user) {
    await chargerProfil(session.user);
  }
}

restaurerSession();
