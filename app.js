const SUPABASE_URL = 'https://jxunyxingxubryyugwzn.supabase.co';
const SUPABASE_KEY = 'sb_publishable_HeE36KA4qTxB3jfo98Uvtg_mQSvG350';

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let profilActuel = null;
let authUserId = null;
let schemaMode = 'unknown'; // 'v5' ou 'legacy'
let sectionsCache = { 1: 'Abidjan', 2: 'Bouaké', 3: 'Yamoussoukro' };
let rolesCache = { 1: 'Président' };

function echapperHtml(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function sansAccent(v) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normaliserTelephone(v) {
  let s = String(v || '').replace(/[^0-9+]/g, '');
  if (!s) return '';
  if (s.startsWith('+225')) return s;
  if (s.startsWith('225')) return `+${s}`;
  if (s.startsWith('0') && s.length === 10) return `+225${s}`;
  if (/^[0-9]{10}$/.test(s)) return `+225${s}`;
  if (s.startsWith('+')) return s;
  return `+225${s}`;
}

function nomSection(id) {
  return sectionsCache[Number(id)] || `Section ${id || '-'}`;
}

function nomRole(id) {
  return rolesCache[Number(id)] || `Rôle ${id || '-'}`;
}

function nomComplet(p = profilActuel) {
  if (!p) return '';
  return p.nom_complet || [p.prenoms, p.nom].filter(Boolean).join(' ') || 'Membre ACVTC-CI';
}

function droits() {
  const role = sansAccent(profilActuel?.role_nom || nomRole(profilActuel?.role_id));
  const president = profilActuel?.can_manage_admins === true || role === 'president';
  const membre = role === 'membre';
  const admin = profilActuel?.is_admin === true || (!!profilActuel && !membre);
  const secretariat = profilActuel?.can_manage_minutes === true || president || role.includes('secretaire');
  const finance = profilActuel?.can_manage_finances === true || president || role.includes('tresor');
  const messages = profilActuel?.can_manage_messages === true || president || role.includes('secretaire') || role.includes('communication');
  const news = profilActuel?.can_manage_news === true || president || role.includes('secretaire') || role.includes('communication');
  return { role, president, membre, admin, secretariat, finance, messages, news };
}

function toast(message, duree = 3200) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = message;
  el.classList.remove('hide');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.classList.add('hide'), duree);
}

function setAuthMessage(message, erreur = false) {
  const el = document.getElementById('auth-message');
  if (!el) return;
  el.textContent = message;
  el.style.color = erreur ? '#b42318' : '#163F73';
}

async function chargerReferentiels() {
  try {
    const [{ data: sections, error: e1 }, { data: roles, error: e2 }] = await Promise.all([
      supabaseClient.rpc('list_sections'),
      supabaseClient.rpc('list_roles')
    ]);

    if (!e1) {
      (sections || []).forEach(s => {
        sectionsCache[Number(s.id)] = s.nom;
      });
    }

    if (!e2) {
      (roles || []).forEach(r => {
        rolesCache[Number(r.id)] = r.nom;
      });
    }
  } catch (e) {
    console.warn('Référentiels RPC indisponibles', e);
  }
}

async function envoyerCode() {
  const phone = normaliserTelephone(document.getElementById('phone')?.value);

  if (!phone || phone.length < 13) {
    setAuthMessage('Saisissez un numéro ivoirien valide.', true);
    return;
  }

  setAuthMessage('Envoi du code en cours...');

  const { error } = await supabaseClient.auth.signInWithOtp({
    phone,
    options: {
      shouldCreateUser: true
    }
  });

  if (error) {
    console.error(error);

    setAuthMessage(
      "Impossible d'envoyer le SMS. L'accès téléphone doit être activé dans Supabase.",
      true
    );

    return;
  }

  document
    .getElementById('otp-zone')
    ?.classList.remove('hide');

  setAuthMessage(
    'Code envoyé par SMS. Saisissez-le ci-dessous.'
  );
}

async function verifierCode() {
  const phone = normaliserTelephone(
    document.getElementById('phone')?.value
  );

  const token = String(
    document.getElementById('otp')?.value || ''
  ).trim();

  if (!phone || token.length < 6) {
    setAuthMessage(
      'Saisissez le numéro et le code reçu.',
      true
    );
    return;
  }

  setAuthMessage(
    'Vérification en cours...'
  );

  const { data, error } =
    await supabaseClient.auth.verifyOtp({
      phone,
      token,
      type: 'sms'
    });

  if (error || !data?.user) {
    console.error(error);

    setAuthMessage(
      'Code incorrect ou expiré.',
      true
    );

    return;
  }

  await chargerProfil(data.user);
}

async function legacyLogin() {
  const email =
    document
      .getElementById('legacy-email')
      ?.value
      .trim();

  const password =
    document
      .getElementById('legacy-pass')
      ?.value || '';

  if (!email || !password) {
    setAuthMessage(
      "Saisissez l'e-mail et le mot de passe de votre ancien compte.",
      true
    );
    return;
  }

  setAuthMessage(
    'Connexion en cours...'
  );

  const { data, error } =
    await supabaseClient.auth.signInWithPassword({
      email,
      password
    });

  if (error || !data?.user) {
    console.error(error);

    setAuthMessage(
      'Connexion impossible. Vérifiez votre e-mail et votre mot de passe.',
      true
    );

    return;
  }

  await chargerProfil(
    data.user,
    true
  );
}

async function essayerProfilV5(user) {
  try {
    await supabaseClient.rpc(
      'claim_my_v5_account'
    );
  } catch (e) {
    console.warn(
      'claim_my_v5_account non disponible ou non applicable',
      e
    );
  }

  try {
    const { data, error } =
      await supabaseClient.rpc(
        'get_my_v5_profile'
      );

    if (error || !data) {
      return null;
    }

    const row =
      Array.isArray(data)
        ? data[0]
        : data;

    if (!row) {
      return null;
    }

    return {
      ...row,
      role_nom: row.role_nom,
      section_nom: row.section_nom
    };

  } catch (e) {
    console.warn(
      'Profil V5 indisponible',
      e
    );

    return null;
  }
}

async function essayerProfilLegacy(user) {
  try {
    await supabaseClient.rpc(
      'claim_phone_profile'
    );
  } catch (e) {
    console.warn(
      'claim_phone_profile non disponible',
      e
    );
  }

  try {
    const { data: profil, error } =
      await supabaseClient
        .from('profiles')
        .select(
          'id, nom, prenoms, telephone, photo_url, section_id, role_id, numero_membre, actif'
        )
        .eq('id', user.id)
        .single();

    if (error || !profil) {
      return null;
    }

    return profil;

  } catch (e) {
    console.warn(
      'Profil legacy indisponible',
      e
    );

    return null;
  }
}

async function chargerProfil(
  user,
  legacyLoginUsed = false
) {
  authUserId = user.id;

  await chargerReferentiels();

  let profil =
    await essayerProfilV5(user);

  if (profil) {
    schemaMode = 'v5';
  } else {
    profil =
      await essayerProfilLegacy(user);

    if (profil) {
      schemaMode = 'legacy';
    }
  }

  if (!profil) {
    setAuthMessage(
      legacyLoginUsed
        ? "Compte connecté, mais aucun profil ACVTC-CI n'est lié à ce compte."
        : "Votre numéro est reconnu par Supabase, mais aucun profil ACVTC-CI n'est encore lié à ce numéro.",
      true
    );

    await supabaseClient.auth.signOut();

    return;
  }

  if (profil.actif === false) {
    setAuthMessage(
      'Ce compte ACVTC-CI est désactivé.',
      true
    );

    await supabaseClient.auth.signOut();

    return;
  }

  profilActuel = profil;

  afficherApplication();
}

function afficherApplication() {
  document
    .getElementById('auth-screen')
    ?.classList.add('hide');

  document
    .getElementById('verify-screen')
    ?.classList.add('hide');

  document
    .getElementById('app-shell')
    ?.classList.remove('hide');

  const hu =
    document.getElementById(
      'header-user'
    );

  if (hu) {
    hu.innerHTML = `
      <b>${echapperHtml(nomComplet())}</b>
      <span>
        ${echapperHtml(
          profilActuel.role_nom ||
          nomRole(profilActuel.role_id)
        )}
        ·
        ${echapperHtml(
          profilActuel.section_nom ||
          nomSection(profilActuel.section_id)
        )}
      </span>
    `;
  }

  afficherNavigation();

  accueil();
}

function afficherNavigation() {
  const d = droits();

  const nav =
    document.getElementById('nav');

  if (!nav) return;

  const items = [
    ['accueil()', 'Accueil'],
    ['maCarte()', 'Ma carte'],
    ['cotisations()', 'Cotisations'],
    ['actualites()', 'Actualités'],
    ['messages()', 'Messages']
  ];

  if (d.admin) {
    items.push([
      'membres()',
      'Membres'
    ]);
  }

  if (d.secretariat) {
    items.push([
      'procesVerbaux()',
      'PV'
    ]);
  }

  if (d.finance) {
    items.push([
      'finances()',
      'Finances'
    ]);
  }

  nav.innerHTML =
    items
      .map(
        ([fn, label]) =>
          `<button onclick="${fn}">${label}</button>`
      )
      .join('');
}

async function accueil() {
  const content =
    document.getElementById(
      'content'
    );

  const d = droits();

  content.innerHTML = `
    <div class="card hero">

      <h2>
        Bienvenue,
        ${echapperHtml(
          nomComplet()
        )}
      </h2>

      <p>
        ${echapperHtml(
          profilActuel.role_nom ||
          nomRole(
            profilActuel.role_id
          )
        )}
        ·
        ${echapperHtml(
          profilActuel.section_nom ||
          nomSection(
            profilActuel.section_id
          )
        )}
      </p>

      <span class="badge badge-green">
        ● Compte actif
      </span>

    </div>

    <div class="section-title">
      <h2>Mon espace</h2>
    </div>

    <div class="grid dashboard-grid">

      <button
        class="quick navy"
        onclick="messages()"
      >
        <span class="icon">📢</span>
        <b>Messages aux conducteurs</b>
        <small>
          Réunions, convocations
          et informations.
        </small>
      </button>

      <button
        class="quick red"
        onclick="actualites()"
      >
        <span class="icon">🌍</span>
        <b>Actualités VTC</b>
        <small>
          Côte d'Ivoire et monde.
        </small>
      </button>

      <button
        class="quick"
        onclick="maCarte()"
      >
        <span class="icon">🪪</span>
        <b>Ma carte</b>
        <small>
          Photo et QR
          de vérification.
        </small>
      </button>

      <button
        class="quick"
        onclick="cotisations()"
      >
        <span class="icon">💳</span>
        <b>Cotisations</b>
        <small>
          500 FCFA /
          700 FCFA après retard.
        </small>
      </button>

      ${
        d.admin
        ?
        `
        <button
          class="quick"
          onclick="membres()"
        >
          <span class="icon">👥</span>
          <b>Membres</b>
          <small>
            Ajouter et consulter
            les membres.
          </small>
        </button>
        `
        :
        ''
      }

      ${
        d.secretariat
        ?
        `
        <button
          class="quick"
          onclick="procesVerbaux()"
        >
          <span class="icon">📁</span>
          <b>Secrétariat / PV</b>
          <small>
            Archivage des
            procès-verbaux.
          </small>
        </button>
        `
        :
        ''
      }

      ${
        d.finance
        ?
        `
        <button
          class="quick"
          onclick="finances()"
        >
          <span class="icon">📊</span>
          <b>Finances</b>
          <small>
            Suivi financier
            de l'association.
          </small>
        </button>
        `
        :
        ''
      }

    </div>

    <div class="section-title">
      <h2>Informations importantes</h2>
    </div>

    <div
      id="home-messages"
      class="list"
    >
      <div class="empty">
        Chargement...
      </div>
    </div>

    <div class="section-title">
      <h2>Dernières actualités VTC</h2>

      <button
        class="btn btn-light btn-small"
        onclick="actualites()"
      >
        Voir tout
      </button>
    </div>

    <div
      id="home-news"
      class="list"
    >
      <div class="empty">
        Chargement...
      </div>
    </div>
  `;

  await Promise.all([
    chargerMessagesAccueil(),
    chargerActualitesAccueil()
  ]);
}

async function chargerMessagesAccueil() {
  const zone =
    document.getElementById(
      'home-messages'
    );

  if (!zone) return;

  if (schemaMode === 'v5') {

    const { data, error } =
      await supabaseClient.rpc(
        'list_messages_v5',
        {
          p_limit: 4
        }
      );

    if (
      error ||
      !(data || []).length
    ) {

      zone.innerHTML =
        '<div class="empty">Aucun message important pour le moment.</div>';

      return;
    }

    zone.innerHTML =
      data
        .map(m =>
          messageHtmlV5(m)
        )
        .join('');

    return;
  }

  const { data, error } =
    await supabaseClient
      .from('messages')
      .select('*')
      .eq('publie', true)
      .order(
        'created_at',
        {
          ascending: false
        }
      )
      .limit(4);

  if (
    error ||
    !(data || []).length
  ) {

    zone.innerHTML =
      '<div class="empty">Aucun message important pour le moment.</div>';

    return;
  }

  const filtered =
    data.filter(
      m =>
        !m.section_id ||
        Number(
          m.section_id
        ) ===
        Number(
          profilActuel.section_id
        )
    );

  zone.innerHTML =
    filtered.length
    ?
    filtered
      .map(m =>
        messageHtmlLegacy(m)
      )
      .join('')
    :
    '<div class="empty">Aucun message pour votre section.</div>';
}

async function chargerActualitesAccueil() {
  const zone =
    document.getElementById(
      'home-news'
    );

  if (!zone) return;

  if (schemaMode === 'v5') {

    const { data, error } =
      await supabaseClient
        .from('news_v5')
        .select('*')
        .eq(
          'published',
          true
        )
        .order(
          'published_at',
          {
            ascending: false
          }
        )
        .limit(3);

    if (
      error ||
      !(data || []).length
    ) {

      zone.innerHTML =
        '<div class="empty">Les actualités seront publiées ici par le bureau.</div>';

      return;
    }

    zone.innerHTML =
      data
        .map(n =>
          newsHtmlV5(n)
        )
        .join('');

    return;
  }

  const { data, error } =
    await supabaseClient
      .from('vtc_news')
      .select('*')
      .eq(
        'publie',
        true
      )
      .order(
        'published_at',
        {
          ascending: false
        }
      )
      .limit(3);

  if (
    error ||
    !(data || []).length
  ) {

    zone.innerHTML =
      '<div class="empty">Les actualités seront publiées ici par le bureau.</div>';

    return;
  }

  zone.innerHTML =
    data
      .map(n =>
        newsHtmlLegacy(n)
      )
      .join('');
}

function messageHtmlV5(m) {
  return `
    <article class="list-item">
      <div>
        <h4>
          📢 ${echapperHtml(m.title)}
        </h4>

        <p>
          ${echapperHtml(m.body)}
        </p>

        <p>
          ${
            m.section_id
            ?
            echapperHtml(
              m.section_nom ||
              nomSection(m.section_id)
            )
            :
            'Tous les conducteurs'
          }
        </p>
      </div>
    </article>
  `;
}

function messageHtmlLegacy(m) {
  return `
    <article class="list-item">
      <div>
        <h4>
          ${
            m.important
            ?
            '🔴 '
            :
            '📢 '
          }
          ${echapperHtml(m.titre)}
        </h4>

        <p>
          ${echapperHtml(m.contenu)}
        </p>

        <p>
          ${
            m.section_id
            ?
            echapperHtml(
              nomSection(m.section_id)
            )
            :
            'Tous les conducteurs'
          }
        </p>
      </div>
    </article>
  `;
}

function newsHtmlV5(n) {
  const lien =
    n.source_url
    ?
    `
      <a
        class="news-source"
        href="${echapperHtml(n.source_url)}"
        target="_blank"
        rel="noopener"
      >
        Voir la source ↗
      </a>
    `
    :
    '';

  return `
    <article class="list-item">
      <div>

        <h4>
          🌍 ${echapperHtml(n.title)}
        </h4>

        <p>
          <b>
            ${echapperHtml(
              n.country ||
              'International'
            )}
          </b>
          ·
          ${echapperHtml(
            n.category ||
            'Actualité VTC'
          )}
        </p>

        <p>
          ${echapperHtml(
            n.summary ||
            ''
          )}
        </p>

        ${lien}

      </div>
    </article>
  `;
}

function newsHtmlLegacy(n) {
  const lien =
    n.source_url
    ?
    `
      <a
        class="news-source"
        href="${echapperHtml(n.source_url)}"
        target="_blank"
        rel="noopener"
      >
        Voir la source ↗
      </a>
    `
    :
    '';

  return `
    <article class="list-item">
      <div>

        <h4>
          🌍 ${echapperHtml(n.titre)}
        </h4>

        <p>
          <b>
            ${echapperHtml(
              n.pays ||
              'International'
            )}
          </b>
          ·
          ${echapperHtml(
            n.categorie ||
            'Actualité VTC'
          )}
        </p>

        <p>
          ${echapperHtml(
            n.resume ||
            ''
          )}
        </p>

        ${lien}

      </div>
    </article>
  `;
}

async function maCarte() {
  const content =
    document.getElementById(
      'content'
    );

  const photo =
    profilActuel.photo_url
    ?
    `
      <img
        class="profile-photo"
        src="${echapperHtml(
          profilActuel.photo_url
        )}"
        alt="Photo du membre"
      >
    `
    :
    `
      <div class="photo-placeholder">
        👤
      </div>
    `;

  const token =
    profilActuel.verification_token ||
    '';

  content.innerHTML = `
    <div class="section-title">
      <h2>Ma carte de membre</h2>
    </div>

    <div
      id="member-card"
      class="member-card"
    >

      <div class="member-card-head">
        <img
          src="/logo-acvtc.png"
          alt="ACVTC-CI"
        >

        <div>
          <b>
            ASSOCIATION DES CHAUFFEURS
            DE VTC CÔTE D'IVOIRE
          </b>

          <div class="note">
            On travaille aujourd'hui
            pour le bonheur de demain.
          </div>
        </div>
      </div>

      <div class="member-card-body">

        <div>
          ${photo}

          <div
            id="qrcode"
            class="qrbox"
            style="margin-top:10px"
          ></div>
        </div>

        <div>
          <h2>
            ${echapperHtml(
              nomComplet()
            )}
          </h2>

          <p>
            <b>N° membre :</b>
            ${echapperHtml(
              profilActuel.numero_membre ||
              'En cours d’attribution'
            )}
          </p>

          <p>
            <b>Section :</b>
            ${echapperHtml(
              profilActuel.section_nom ||
              nomSection(
                profilActuel.section_id
              )
            )}
          </p>

          <p>
            <b>Statut :</b>
            <span class="badge badge-green">
              Actif
            </span>
          </p>

          <p>
            <b>Rôle :</b>
            ${echapperHtml(
              profilActuel.role_nom ||
              nomRole(
                profilActuel.role_id
              )
            )}
          </p>

          <p class="note">
            Scannez le QR code
            pour vérifier l'authenticité
            de la carte.
          </p>
        </div>

      </div>

      <div class="member-card-foot">
        <b>ACVTC-CI</b>
        <span>
          Plus qu'une association,
          une grande famille.
        </span>
      </div>

    </div>

    <div class="card-actions">

      <label
        class="btn btn-light"
        style="text-align:center"
      >
        📷 Ajouter / modifier ma photo

        <input
          id="photo-input"
          class="hide"
          type="file"
          accept="image/*"
          onchange="televerserPhoto(this.files[0])"
        >
      </label>

      <button
        class="btn btn-secondary"
        onclick="telechargerCarte()"
      >
        ⬇ Télécharger ma carte
      </button>

    </div>
  `;

  if (
    token &&
    window.QRCode
  ) {

    const url =
      `${window.location.origin}${window.location.pathname}?verify=${encodeURIComponent(token)}`;

    new QRCode(
      document.getElementById(
        'qrcode'
      ),
      {
        text: url,
        width: 112,
        height: 112,
        correctLevel:
          QRCode.CorrectLevel.H
      }
    );
  }
}

async function televerserPhoto(file) {
  if (!file) return;

  if (
    !file.type.startsWith(
      'image/'
    )
  ) {

    toast(
      'Choisissez une image.'
    );

    return;
  }

  if (
    file.size >
    5 * 1024 * 1024
  ) {

    toast(
      'La photo doit faire moins de 5 Mo.'
    );

    return;
  }

  const ext =
    (
      file.name
        .split('.')
        .pop() ||
      'jpg'
    )
    .toLowerCase();

  const dossier =
    authUserId ||
    profilActuel.id;

  const path =
    `${dossier}/profil-${Date.now()}.${ext}`;

  toast(
    'Envoi de la photo...'
  );

  const { error } =
    await supabaseClient
      .storage
      .from(
        'member-photos'
      )
      .upload(
        path,
        file,
        {
          upsert: true
        }
      );

  if (error) {

    console.error(error);

    toast(
      "Impossible d'envoyer la photo."
    );

    return;
  }

  const { data } =
    supabaseClient
      .storage
      .from(
        'member-photos'
      )
      .getPublicUrl(path);

  const url =
    data.publicUrl;

  let e2 = null;

  if (
    schemaMode === 'v5'
  ) {

    const rep =
      await supabaseClient.rpc(
        'update_my_photo_v5',
        {
          p_photo_url: url
        }
      );

    e2 = rep.error;

  } else {

    const rep =
      await supabaseClient.rpc(
        'set_my_photo_url',
        {
          p_url: url
        }
      );

    e2 = rep.error;
  }

  if (e2) {

    console.error(e2);

    toast(
      'Photo envoyée mais profil non mis à jour.'
    );

    return;
  }

  profilActuel.photo_url =
    url;

  toast(
    'Photo mise à jour.'
  );

  maCarte();
}

async function telechargerCarte() {
  const el =
    document.getElementById(
      'member-card'
    );

  if (
    !el ||
    !window.html2canvas ||
    !window.jspdf
  ) {
    return;
  }

  toast(
    'Préparation de la carte...'
  );

  const canvas =
    await html2canvas(
      el,
      {
        scale: 2,
        backgroundColor:
          '#ffffff',
        useCORS: true
      }
    );

  const img =
    canvas.toDataURL(
      'image/png'
    );

  const { jsPDF } =
    window.jspdf;

  const pdf =
    new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: [
        85.6,
        54
      ]
    });

  pdf.addImage(
    img,
    'PNG',
    0,
    0,
    85.6,
    54
  );

  pdf.save(
    `Carte-${(
      profilActuel.numero_membre ||
      'ACVTC-CI'
    ).replaceAll(
      '/',
      '-'
    )}.pdf`
  );
}

async function cotisations() {
  const content =
    document.getElementById(
      'content'
    );

  const today =
    new Date();

  const period =
    new Date(
      today.getFullYear(),
      today.getMonth(),
      1
    );

  const periodIso =
    period
      .toISOString()
      .slice(0, 10);

  let due = {
    base_amount: 500,
    penalty: 0,
    total_amount: 500,
    grace_end: null
  };

  if (
    schemaMode === 'v5'
  ) {

    const { data } =
      await supabaseClient.rpc(
        'monthly_due_v5',
        {
          p_period:
            periodIso,
          p_as_of:
            new Date()
              .toISOString()
              .slice(0, 10)
        }
      );

    const row =
      Array.isArray(data)
        ?
        data[0]
        :
        data;

    if (row) {
      due = row;
    }
  }

  content.innerHTML = `
    <div class="section-title">
      <h2>Mes cotisations</h2>
    </div>

    <div class="grid">

      <div class="kpi">
        <small>Cotisation du mois</small>
        <b>
          ${Number(
            due.total_amount ||
            500
          )} FCFA
        </b>
      </div>

      <div class="kpi">
        <small>Règle</small>
        <b>
          500 + 200 FCFA
          après 2 semaines
        </b>
      </div>

    </div>

    ${
      schemaMode === 'v5'
      ?
      `
        <div
          class="card"
          style="margin-top:14px"
        >

          <h3>
            PAYER MA COTISATION
          </h3>

          <p>
            Effectuez votre transfert par
            <b>Wave</b>
            ou
            <b>Orange Money</b>
            sur le numéro officiel
            de l'association.
          </p>

          <div class="form-grid">

            <div>
              <label>
                Moyen de paiement
              </label>

              <select id="pay-method">
                <option value="WAVE">
                  Wave
                </option>

                <option value="ORANGE_MONEY">
                  Orange Money
                </option>
              </select>
            </div>

            <div>
              <label>
                Référence de transaction
              </label>

              <input
                id="pay-reference"
                placeholder="Référence reçue après le transfert"
              >
            </div>

            <div class="full">
              <button
                class="btn btn-primary"
                onclick="declarerPaiement('${periodIso}')"
              >
                J'ai effectué le paiement
              </button>
            </div>

          </div>

          <p class="note">
            Votre paiement restera
            <b>EN ATTENTE</b>
            jusqu'à confirmation
            par le Président
            ou la Trésorerie.
          </p>

        </div>
      `
      :
      `
        <div
          class="card"
          style="margin-top:14px"
        >
          <p class="note">
            Ancien module de cotisation
            en consultation.
          </p>
        </div>
      `
    }

    <div
      id="cotis-list"
      class="list"
      style="margin-top:14px"
    >
      <div class="empty">
        Chargement...
      </div>
    </div>
  `;

  const z =
    document.getElementById(
      'cotis-list'
    );

  if (
    schemaMode === 'v5'
  ) {

    const [
      {
        data: confirmed,
        error: e1
      },
      {
        data: declared,
        error: e2
      }
    ] =
      await Promise.all([
        supabaseClient
          .from(
            'contributions_v5'
          )
          .select('*')
          .eq(
            'member_id',
            profilActuel.id
          )
          .order(
            'period',
            {
              ascending: false
            }
          )
          .limit(12),

        supabaseClient
          .from(
            'payment_declarations_v5'
          )
          .select('*')
          .eq(
            'member_id',
            profilActuel.id
          )
          .order(
            'period',
            {
              ascending: false
            }
          )
          .limit(12)
      ]);

    if (
      e1 ||
      e2
    ) {

      z.innerHTML =
        '<div class="empty">Impossible de charger vos cotisations.</div>';

      return;
    }

    const byPeriod =
      new Map();

    (declared || [])
      .forEach(d =>
        byPeriod.set(
          d.period,
          {
            ...d,
            source:
              'declared'
          }
        )
      );

    (confirmed || [])
      .forEach(c =>
        byPeriod.set(
          c.period,
          {
            ...c,
            source:
              'confirmed'
          }
        )
      );

    const rows =
      [...byPeriod.values()]
        .sort(
          (a, b) =>
            String(
              b.period
            )
            .localeCompare(
              String(
                a.period
              )
            )
        );

    if (!rows.length) {

      z.innerHTML =
        '<div class="empty">Aucune cotisation enregistrée pour le moment.</div>';

      return;
    }

    z.innerHTML =
      rows
        .map(c => {

          const total =
            c.total_amount ??
            (
              Number(
                c.amount ||
                0
              )
              +
              Number(
                c.penalty ||
                0
              )
            );

          const st =
            String(
              c.status ||
              ''
            )
            .toUpperCase();

          const label =
            st === 'CONFIRMED'
            ||
            sansAccent(
              c.status
            ) === 'paye'
            ?
            '✅ Payée'
            :
            st === 'REJECTED'
            ?
            '❌ Rejetée'
            :
            '⏳ En attente';

          return `
            <div class="list-item">
              <div>

                <h4>
                  ${
                    new Date(
                      c.period
                    )
                    .toLocaleDateString(
                      'fr-FR',
                      {
                        month:
                          'long',
                        year:
                          'numeric'
                      }
                    )
                  }
                </h4>

                <p>
                  ${label}
                  ·
                  ${total}
                  FCFA
                </p>

                <p>
                  ${echapperHtml(
                    c.payment_method ||
                    ''
                  )}
                </p>

                ${
                  c.transaction_reference
                  ?
                  `
                    <p>
                      Réf. :
                      ${echapperHtml(
                        c.transaction_reference
                      )}
                    </p>
                  `
                  :
                  ''
                }

              </div>
            </div>
          `;
        })
        .join('');

    return;
  }

  const { data, error } =
    await supabaseClient
      .from('cotisations')
      .select('*')
      .eq(
        'membre_id',
        profilActuel.id
      )
      .order(
        'mois',
        {
          ascending: false
        }
      )
      .limit(12);

  if (
    error ||
    !(data || []).length
  ) {

    z.innerHTML =
      '<div class="empty">Aucune cotisation enregistrée pour le moment.</div>';

    return;
  }

  z.innerHTML =
    data
      .map(c => `
        <div class="list-item">
          <div>

            <h4>
              ${
                new Date(
                  c.mois
                )
                .toLocaleDateString(
                  'fr-FR',
                  {
                    month:
                      'long',
                    year:
                      'numeric'
                  }
                )
              }
            </h4>

            <p>
              ${
                sansAccent(
                  c.statut
                ) === 'payee'
                ||
                sansAccent(
                  c.statut
                ) === 'paye'
                ?
                '✅ Payée'
                :
                '⏳ En attente'
              }

              ·
              ${c.montant_total}
              FCFA
            </p>

          </div>
        </div>
      `)
      .join('');
}

async function declarerPaiement(
  periodIso
) {
  if (
    schemaMode !== 'v5'
  ) {
    return;
  }

  const method =
    document
      .getElementById(
        'pay-method'
      )
      ?.value;

  const reference =
    document
      .getElementById(
        'pay-reference'
      )
      ?.value
      .trim();

  if (!reference) {

    toast(
      'Ajoutez la référence de transaction.'
    );

    return;
  }

  const { error } =
    await supabaseClient.rpc(
      'declare_payment_v5',
      {
        p_period:
          periodIso,

        p_payment_method:
          method,

        p_transaction_reference:
          reference
      }
    );

  if (error) {

    console.error(error);

    toast(
      error.message ||
      'Déclaration impossible.'
    );

    return;
  }

  toast(
    'Paiement déclaré. Il est maintenant en attente de validation.'
  );

  await cotisations();
}

async function membres() {
  const d =
    droits();

  if (!d.admin) {
    return;
  }

  await chargerReferentiels();

  const content =
    document.getElementById(
      'content'
    );

  const optionsSections =
    Object.entries(
      sectionsCache
    )
    .map(
      ([id, nom]) =>
        `
          <option value="${id}">
            ${echapperHtml(nom)}
          </option>
        `
    )
    .join('');

  let optionsRoles = '';

  if (
    schemaMode === 'v5'
    &&
    d.president
  ) {

    const { data } =
      await supabaseClient.rpc(
        'list_admin_roles_v5'
      );

    optionsRoles =
      (data || [])
        .map(
          r =>
            `
              <option value="${r.id}">
                ${echapperHtml(
                  r.nom
                )}
              </option>
            `
        )
        .join('');

  } else {

    optionsRoles =
      Object.entries(
        rolesCache
      )
      .filter(
        ([, nom]) => {

          const r =
            sansAccent(nom);

          return (
            r !== 'membre'
            &&
            r !== 'president'
          );
        }
      )
      .map(
        ([id, nom]) =>
          `
            <option value="${id}">
              ${echapperHtml(nom)}
            </option>
          `
      )
      .join('');
  }

  content.innerHTML = `
    <div class="section-title">
      <h2>
        Gestion des membres
      </h2>
    </div>

    <div class="card">

      <h3>
        + Ajouter un membre simple
      </h3>

      <p class="note">
        Tous les administrateurs peuvent
        enregistrer un membre simple.
      </p>

      <div class="form-grid">

        <div>
          <label>
            Nom complet
          </label>

          <input
            id="m-nom"
            placeholder="Ex. Kouassi Jean Marc"
          >
        </div>

        <div>
          <label>
            Téléphone
          </label>

          <input
            id="m-phone"
            type="tel"
            placeholder="07 XX XX XX XX"
          >
        </div>

        <div>
          <label>
            Section
          </label>

          <select id="m-section">
            ${optionsSections}
          </select>
        </div>

        <div
          style="
            display:flex;
            align-items:end
          "
        >
          <button
            class="btn btn-primary"
            onclick="ajouterMembreSimple()"
          >
            Enregistrer le membre
          </button>
        </div>

      </div>
    </div>

    ${
      d.president
      ?
      `
        <div
          class="card"
          style="margin-top:14px"
        >

          <h3>
            Créer un administrateur
          </h3>

          <p class="note">
            Réservé au Président.
          </p>

          <div class="form-grid">

            <div>
              <label>
                Nom complet
              </label>
              <input id="a-nom">
            </div>

            <div>
              <label>
                Téléphone
              </label>
              <input
                id="a-phone"
                type="tel"
              >
            </div>

            <div>
              <label>
                Section
              </label>
              <select id="a-section">
                ${optionsSections}
              </select>
            </div>

            <div>
              <label>
                Rôle
              </label>
              <select id="a-role">
                ${optionsRoles}
              </select>
            </div>

            <div class="full">
              <button
                class="btn btn-secondary"
                onclick="ajouterAdministrateur()"
              >
                Créer l'administrateur
              </button>
            </div>

          </div>
        </div>
      `
      :
      ''
    }

    <div class="section-title">
      <h3>
        Liste des membres
      </h3>
    </div>

    <div
      id="members-list"
      class="list"
    >
      <div class="empty">
        Chargement...
      </div>
    </div>
  `;

  await chargerListeMembres();
}

async function ajouterMembreSimple() {
  const nom =
    document
      .getElementById(
        'm-nom'
      )
      ?.value
      .trim();

  const phone =
    normaliserTelephone(
      document
        .getElementById(
          'm-phone'
        )
        ?.value
    );

  const section =
    Number(
      document
        .getElementById(
          'm-section'
        )
        ?.value
    );

  if (
    !nom ||
    !phone ||
    !section
  ) {

    toast(
      'Complétez le nom, le téléphone et la section.'
    );

    return;
  }

  const fn =
    schemaMode === 'v5'
    ?
    'admin_create_member_v5'
    :
    'admin_create_member';

  const params = {
    p_nom_complet: nom,
    p_phone: phone,
    p_section_id: section
  };

  const { data, error } =
    await supabaseClient.rpc(
      fn,
      params
    );

  if (error) {

    console.error(error);

    toast(
      error.message ||
      'Création impossible.'
    );

    return;
  }

  toast(
    data
    ?
    `Membre enregistré : ${data}`
    :
    'Membre enregistré.'
  );

  document
    .getElementById(
      'm-nom'
    )
    .value = '';

  document
    .getElementById(
      'm-phone'
    )
    .value = '';

  chargerListeMembres();
}

async function ajouterAdministrateur() {
  if (
    !droits().president
  ) {
    return;
  }

  const nom =
    document
      .getElementById(
        'a-nom'
      )
      ?.value
      .trim();

  const phone =
    normaliserTelephone(
      document
        .getElementById(
          'a-phone'
        )
        ?.value
    );

  const section =
    Number(
      document
        .getElementById(
          'a-section'
        )
        ?.value
    );

  const role =
    Number(
      document
        .getElementById(
          'a-role'
        )
        ?.value
    );

  if (
    !nom ||
    !phone ||
    !section ||
    !role
  ) {

    toast(
      'Complétez tous les champs.'
    );

    return;
  }

  const fn =
    schemaMode === 'v5'
    ?
    'president_create_admin_v5'
    :
    'president_create_admin';

  const { data, error } =
    await supabaseClient.rpc(
      fn,
      {
        p_nom_complet:
          nom,
        p_phone:
          phone,
        p_section_id:
          section,
        p_role_id:
          role
      }
    );

  if (error) {

    console.error(error);

    toast(
      error.message ||
      'Création impossible.'
    );

    return;
  }

  toast(
    data
    ?
    `Administrateur enregistré : ${data}`
    :
    'Administrateur enregistré.'
  );

  chargerListeMembres();
}

async function chargerListeMembres() {
  const zone =
    document.getElementById(
      'members-list'
    );

  if (!zone) {
    return;
  }

  const fn =
    schemaMode === 'v5'
    ?
    'list_members_v5'
    :
    'admin_list_members';

  const { data, error } =
    await supabaseClient.rpc(
      fn
    );

  if (error) {

    console.error(error);

    zone.innerHTML =
      '<div class="empty">Impossible de charger les membres.</div>';

    return;
  }

  zone.innerHTML =
    (data || []).length
    ?
    data
      .map(m => `
        <div class="list-item">

          <div>
            <h4>
              ${echapperHtml(
                m.nom_complet ||
                [
                  m.prenoms,
                  m.nom
                ]
                .filter(Boolean)
                .join(' ')
              )}
            </h4>

            <p>
              ${echapperHtml(
                m.numero_membre ||
                'Numéro en attente'
              )}
              ·
              ${echapperHtml(
                m.section_nom ||
                nomSection(
                  m.section_id
                )
              )}
            </p>

            <p>
              ${echapperHtml(
                m.telephone ||
                m.phone_e164 ||
                ''
              )}
              ·
              ${echapperHtml(
                m.role_nom ||
                nomRole(
                  m.role_id
                )
              )}
            </p>
          </div>

          <span
            class="badge ${
              m.actif === false
              ?
              'badge-red'
              :
              'badge-green'
            }"
          >
            ${
              m.actif === false
              ?
              'Désactivé'
              :
              'Actif'
            }
          </span>

        </div>
      `)
      .join('')
    :
    '<div class="empty">Aucun membre.</div>';
}

async function messages() {
  const d =
    droits();

  const content =
    document.getElementById(
      'content'
    );

  const optionsSections = `
    <option value="">
      Tous les conducteurs
    </option>

    ${
      Object.entries(
        sectionsCache
      )
      .map(
        ([id, nom]) =>
          `
            <option value="${id}">
              ${echapperHtml(nom)}
            </option>
          `
      )
      .join('')
    }
  `;

  content.innerHTML = `
    <div class="section-title">
      <h2>
        Messages aux conducteurs
      </h2>
    </div>

    ${
      d.messages
      ?
      `
        <div class="card">

          <h3>
            Publier un message
          </h3>

          <div class="form-grid">

            <div>
              <label>
                Titre
              </label>
              <input id="msg-title">
            </div>

            <div>
              <label>
                Destinataires
              </label>

              <select id="msg-section">
                ${optionsSections}
              </select>
            </div>

            <div class="full">
              <label>
                Message
              </label>
              <textarea id="msg-body"></textarea>
            </div>

            <div
              style="
                display:flex;
                align-items:end
              "
            >
              <button
                class="btn btn-primary"
                onclick="publierMessage()"
              >
                Publier
              </button>
            </div>

          </div>
        </div>
      `
      :
      ''
    }

    <div class="section-title">
      <h3>
        Messages publiés
      </h3>
    </div>

    <div
      id="messages-list"
      class="list"
    >
      <div class="empty">
        Chargement...
      </div>
    </div>
  `;

  await chargerMessages();
}

async function chargerMessages() {
  const zone =
    document.getElementById(
      'messages-list'
    );

  if (
    schemaMode === 'v5'
  ) {

    const { data, error } =
      await supabaseClient.rpc(
        'list_messages_v5',
        {
          p_limit: 30
        }
      );

    if (
      error ||
      !(data || []).length
    ) {

      zone.innerHTML =
        '<div class="empty">Aucun message publié.</div>';

      return;
    }

    zone.innerHTML =
      data
        .map(
          messageHtmlV5
        )
        .join('');

    return;
  }

  const { data, error } =
    await supabaseClient
      .from('messages')
      .select('*')
      .eq(
        'publie',
        true
      )
      .order(
        'created_at',
        {
          ascending: false
        }
      )
      .limit(30);

  if (
    error ||
    !(data || []).length
  ) {

    zone.innerHTML =
      '<div class="empty">Aucun message publié.</div>';

    return;
  }

  const visible =
    data.filter(
      m =>
        droits().admin
        ||
        !m.section_id
        ||
        Number(
          m.section_id
        ) ===
        Number(
          profilActuel.section_id
        )
    );

  zone.innerHTML =
    visible
      .map(
        messageHtmlLegacy
      )
      .join('');
}

async function publierMessage() {
  if (
    !droits().messages
  ) {
    return;
  }

  const titre =
    document
      .getElementById(
        'msg-title'
      )
      ?.value
      .trim();

  const contenu =
    document
      .getElementById(
        'msg-body'
      )
      ?.value
      .trim();

  const section =
    document
      .getElementById(
        'msg-section'
      )
      ?.value;

  if (
    !titre ||
    !contenu
  ) {

    toast(
      'Ajoutez un titre et un message.'
    );

    return;
  }

  let error = null;

  if (
    schemaMode === 'v5'
  ) {

    const rep =
      await supabaseClient
        .from('messages_v5')
        .insert({
          title:
            titre,
          body:
            contenu,
          section_id:
            section
            ?
            Number(section)
            :
            null
        });

    error = rep.error;

  } else {

    const rep =
      await supabaseClient
        .from('messages')
        .insert({
          titre,
          contenu,
          section_id:
            section
            ?
            Number(section)
            :
            null,
          important:
            false,
          publie:
            true,
          created_by:
            profilActuel.id
        });

    error = rep.error;
  }

  if (error) {

    console.error(error);

    toast(
      'Publication impossible.'
    );

    return;
  }

  toast(
    'Message publié.'
  );

  messages();
}

async function actualites() {
  const d =
    droits();

  const content =
    document.getElementById(
      'content'
    );

  content.innerHTML = `
    <div class="section-title">
      <h2>
        Actualités VTC –
        Côte d'Ivoire & Monde
      </h2>
    </div>

    ${
      d.news
      ?
      `
        <div class="card">

          <h3>
            Publier une actualité
          </h3>

          <div class="form-grid">

            <div>
              <label>
                Titre
              </label>
              <input id="news-title">
            </div>

            <div>
              <label>
                Pays
              </label>

              <input
                id="news-country"
                placeholder="Côte d'Ivoire, France, Sénégal..."
              >
            </div>

            <div>
              <label>
                Catégorie
              </label>

              <input
                id="news-cat"
                placeholder="Réglementation, sécurité, innovation..."
              >
            </div>

            <div>
              <label>
                Lien source
              </label>

              <input
                id="news-url"
                type="url"
                placeholder="https://..."
              >
            </div>

            <div class="full">
              <label>
                Résumé
              </label>

              <textarea
                id="news-summary"
              ></textarea>
            </div>

            <div class="full">
              <button
                class="btn btn-primary"
                onclick="publierActualite()"
              >
                Publier l'actualité
              </button>
            </div>

          </div>
        </div>
      `
      :
      ''
    }

    <div class="section-title">
      <h3>
        Fil d'actualités
      </h3>
    </div>

    <div
      id="news-list"
      class="list"
    >
      <div class="empty">
        Chargement...
      </div>
    </div>
  `;

  await chargerActualites();
}

async function chargerActualites() {
  const zone =
    document.getElementById(
      'news-list'
    );

  if (
    schemaMode === 'v5'
  ) {

    const { data, error } =
      await supabaseClient
        .from('news_v5')
        .select('*')
        .order(
          'published_at',
          {
            ascending: false
          }
        )
        .limit(50);

    if (
      error ||
      !(data || []).length
    ) {

      zone.innerHTML =
        '<div class="empty">Aucune actualité publiée pour le moment.</div>';

      return;
    }

    zone.innerHTML =
      data
        .map(
          newsHtmlV5
        )
        .join('');

    return;
  }

  const { data, error } =
    await supabaseClient
      .from('vtc_news')
      .select('*')
      .eq(
        'publie',
        true
      )
      .order(
        'published_at',
        {
          ascending: false
        }
      )
      .limit(50);

  if (
    error ||
    !(data || []).length
  ) {

    zone.innerHTML =
      '<div class="empty">Aucune actualité publiée pour le moment.</div>';

    return;
  }

  zone.innerHTML =
    data
      .map(
        newsHtmlLegacy
      )
      .join('');
}

async function publierActualite() {
  if (
    !droits().news
  ) {
    return;
  }

  const titre =
    document
      .getElementById(
        'news-title'
      )
      ?.value
      .trim();

  const pays =
    document
      .getElementById(
        'news-country'
      )
      ?.value
      .trim();

  const categorie =
    document
      .getElementById(
        'news-cat'
      )
      ?.value
      .trim();

  const source_url =
    document
      .getElementById(
        'news-url'
      )
      ?.value
      .trim()
      ||
      null;

  const resume =
    document
      .getElementById(
        'news-summary'
      )
      ?.value
      .trim();

  if (
    !titre ||
    !resume
  ) {

    toast(
      'Ajoutez un titre et un résumé.'
    );

    return;
  }

  let error = null;

  if (
    schemaMode === 'v5'
  ) {

    const rep =
      await supabaseClient
        .from('news_v5')
        .insert({
          title:
            titre,
          country:
            pays ||
            'International',
          category:
            categorie ||
            'Actualité',
          source_url,
          summary:
            resume,
          published:
            true
        });

    error = rep.error;

  } else {

    const rep =
      await supabaseClient
        .from('vtc_news')
        .insert({
          titre,
          pays,
          categorie,
          source_url,
          resume,
          publie:
            true,
          created_by:
            profilActuel.id,
          published_at:
            new Date()
              .toISOString()
        });

    error = rep.error;
  }

  if (error) {

    console.error(error);

    toast(
      'Publication impossible.'
    );

    return;
  }

  toast(
    'Actualité publiée.'
  );

  actualites();
}

async function procesVerbaux() {
  if (
    !droits().secretariat
  ) {
    return;
  }

  const content =
    document.getElementById(
      'content'
    );

  content.innerHTML = `
    <div class="section-title">
      <h2>
        Secrétariat / Procès-verbaux
      </h2>
    </div>

    <div class="card">

      <h3>
        Archiver un PV
      </h3>

      <div class="form-grid">

        <div>
          <label>
            Titre du PV
          </label>

          <input
            id="pv-title"
            placeholder="PV réunion du bureau"
          >
        </div>

        <div>
          <label>
            Date de la réunion
          </label>

          <input
            id="pv-date"
            type="date"
          >
        </div>

        <div>
          <label>
            Type de réunion
          </label>

          <input
            id="pv-type"
            placeholder="Bureau, AG, rencontre..."
          >
        </div>

        <div>
          <label>
            Document
          </label>

          <input
            id="pv-file"
            type="file"
            accept=".pdf,.doc,.docx"
          >
        </div>

        <div class="full">
          <label>
            Résumé
          </label>

          <textarea
            id="pv-summary"
          ></textarea>
        </div>

        <div class="full">
          <button
            class="btn btn-primary"
            onclick="archiverPV()"
          >
            Archiver le PV
          </button>
        </div>

      </div>
    </div>

    <div class="section-title">
      <h3>
        Archives
      </h3>
    </div>

    <div
      id="pv-list"
      class="list"
    >
      <div class="empty">
        Chargement...
      </div>
    </div>
  `;

  await chargerPV();
}

async function archiverPV() {
  if (
    !droits().secretariat
  ) {
    return;
  }

  const titre =
    document
      .getElementById(
        'pv-title'
      )
      ?.value
      .trim();

  const date =
    document
      .getElementById(
        'pv-date'
      )
      ?.value;

  const resume =
    document
      .getElementById(
        'pv-summary'
      )
      ?.value
      .trim()
      ||
      null;

  const meetingType =
    document
      .getElementById(
        'pv-type'
      )
      ?.value
      .trim()
      ||
      null;

  const file =
    document
      .getElementById(
        'pv-file'
      )
      ?.files?.[0];

  if (
    !titre ||
    !date ||
    !file
  ) {

    toast(
      'Ajoutez le titre, la date et le document.'
    );

    return;
  }

  const safe =
    file.name.replace(
      /[^a-zA-Z0-9._-]/g,
      '_'
    );

  const path =
    `${new Date().getFullYear()}/${authUserId || profilActuel.id}/${Date.now()}-${safe}`;

  const bucket =
    schemaMode === 'v5'
    ?
    'minutes-docs'
    :
    'pv-files';

  toast(
    'Envoi du document...'
  );

  const {
    error: e1
  } =
    await supabaseClient
      .storage
      .from(bucket)
      .upload(
        path,
        file,
        {
          upsert: false
        }
      );

  if (e1) {

    console.error(e1);

    toast(
      "Impossible d'envoyer le fichier."
    );

    return;
  }

  let e2 = null;

  if (
    schemaMode === 'v5'
  ) {

    const rep =
      await supabaseClient
        .from('minutes_v5')
        .insert({
          title:
            titre,
          meeting_date:
            date,
          meeting_type:
            meetingType,
          summary:
            resume,
          file_path:
            path
        });

    e2 = rep.error;

  } else {

    const rep =
      await supabaseClient
        .from('pv_documents')
        .insert({
          titre,
          date_reunion:
            date,
          type_pv:
            meetingType ||
            'Réunion',
          resume,
          file_path:
            path,
          file_name:
            file.name,
          created_by:
            profilActuel.id
        });

    e2 = rep.error;
  }

  if (e2) {

    console.error(e2);

    toast(
      'Fichier envoyé mais archivage impossible.'
    );

    return;
  }

  toast(
    'PV archivé.'
  );

  procesVerbaux();
}

async function chargerPV() {
  const zone =
    document.getElementById(
      'pv-list'
    );

  if (
    schemaMode === 'v5'
  ) {

    const { data, error } =
      await supabaseClient
        .from('minutes_v5')
        .select('*')
        .order(
          'meeting_date',
          {
            ascending: false
          }
        )
        .limit(60);

    if (
      error ||
      !(data || []).length
    ) {

      zone.innerHTML =
        '<div class="empty">Aucun PV archivé.</div>';

      return;
    }

    zone.innerHTML =
      data
        .map(p => `
          <div class="list-item">

            <div>

              <h4>
                📄
                ${echapperHtml(
                  p.title
                )}
              </h4>

              <p>
                ${
                  new Date(
                    p.meeting_date
                  )
                  .toLocaleDateString(
                    'fr-FR'
                  )
                }
                ·
                ${echapperHtml(
                  p.meeting_type ||
                  ''
                )}
              </p>

              <p>
                ${echapperHtml(
                  p.summary ||
                  ''
                )}
              </p>

            </div>

            <div class="list-actions">

              ${
                p.file_path
                ?
                `
                  <button
                    class="btn btn-light btn-small"
                    onclick="ouvrirPV('${echapperHtml(
                      p.file_path
                    )}')"
                  >
                    Ouvrir
                  </button>
                `
                :
                ''
              }

            </div>

          </div>
        `)
        .join('');

    return;
  }

  const { data, error } =
    await supabaseClient
      .from('pv_documents')
      .select('*')
      .order(
        'date_reunion',
        {
          ascending: false
        }
      )
      .limit(60);

  if (
    error ||
    !(data || []).length
  ) {

    zone.innerHTML =
      '<div class="empty">Aucun PV archivé.</div>';

    return;
  }

  zone.innerHTML =
    data
      .map(p => `
        <div class="list-item">

          <div>

            <h4>
              📄
              ${echapperHtml(
                p.titre
              )}
            </h4>

            <p>
              ${
                new Date(
                  p.date_reunion
                )
                .toLocaleDateString(
                  'fr-FR'
                )
              }
              ·
              ${echapperHtml(
                p.type_pv ||
                ''
              )}
            </p>

            <p>
              ${echapperHtml(
                p.resume ||
                ''
              )}
            </p>

          </div>

          <div class="list-actions">

            <button
              class="btn btn-light btn-small"
              onclick="ouvrirPV('${echapperHtml(
                p.file_path
              )}')"
            >
              Ouvrir
            </button>

          </div>

        </div>
      `)
      .join('');
}

async function ouvrirPV(path) {
  const bucket =
    schemaMode === 'v5'
    ?
    'minutes-docs'
    :
    'pv-files';

  const { data, error } =
    await supabaseClient
      .storage
      .from(bucket)
      .createSignedUrl(
        path,
        300
      );

  if (
    error ||
    !data?.signedUrl
  ) {

    toast(
      'Impossible d’ouvrir le document.'
    );

    return;
  }

  window.open(
    data.signedUrl,
    '_blank',
    'noopener'
  );
}

async function finances() {
  if (
    !droits().finance
  ) {
    return;
  }

  const content =
    document.getElementById(
      'content'
    );

  content.innerHTML = `
    <div class="section-title">
      <h2>
        Finances ACVTC-CI
      </h2>
    </div>

    <div class="grid">

      <div class="kpi">
        <small>
          Cotisation mensuelle
        </small>
        <b>
          500 FCFA
        </b>
      </div>

      <div class="kpi">
        <small>
          Retard après 2 semaines
        </small>
        <b>
          700 FCFA
        </b>
      </div>

    </div>

    <div class="section-title">
      <h3>
        Paiements en attente
      </h3>
    </div>

    <div
      id="pending-payments"
      class="list"
    >
      <div class="empty">
        Chargement...
      </div>
    </div>

    <div class="section-title">
      <h3>
        Historique confirmé
      </h3>
    </div>

    <div
      id="finance-list"
      class="list"
    >
      <div class="empty">
        Chargement...
      </div>
    </div>
  `;

  if (
    schemaMode !== 'v5'
  ) {

    document
      .getElementById(
        'pending-payments'
      )
      .innerHTML =
      '<div class="empty">Validation disponible dans la V5.</div>';

    document
      .getElementById(
        'finance-list'
      )
      .innerHTML =
      '<div class="empty">Ancien module financier en consultation.</div>';

    return;
  }

  const [
    {
      data: pending,
      error: ep
    },
    {
      data: confirmed,
      error: ec
    }
  ] =
    await Promise.all([

      supabaseClient
        .from(
          'payment_declarations_v5'
        )
        .select(
          'id,member_id,period,total_amount,payment_method,transaction_reference,status,declared_at,members_v5(nom_complet,numero_membre)'
        )
        .eq(
          'status',
          'PENDING'
        )
        .order(
          'declared_at',
          {
            ascending: true
          }
        )
        .limit(100),

      supabaseClient
        .from(
          'contributions_v5'
        )
        .select(
          'id,member_id,period,amount,penalty,status,payment_method,paid_at,members_v5(nom_complet,numero_membre)'
        )
        .order(
          'period',
          {
            ascending: false
          }
        )
        .limit(100)

    ]);

  const pz =
    document.getElementById(
      'pending-payments'
    );

  if (ep) {

    console.error(ep);

    pz.innerHTML =
      '<div class="empty">Impossible de charger les paiements en attente.</div>';

  } else if (
    !(pending || []).length
  ) {

    pz.innerHTML =
      '<div class="empty">Aucun paiement en attente.</div>';

  } else {

    pz.innerHTML =
      pending
        .map(p => `
          <div class="list-item">

            <div>

              <h4>
                ${echapperHtml(
                  p.members_v5
                    ?.nom_complet
                    ||
                  'Membre'
                )}
              </h4>

              <p>
                ${echapperHtml(
                  p.members_v5
                    ?.numero_membre
                    ||
                  ''
                )}
                ·
                ${
                  new Date(
                    p.period
                  )
                  .toLocaleDateString(
                    'fr-FR',
                    {
                      month:
                        'long',
                      year:
                        'numeric'
                    }
                  )
                }
              </p>

              <p>
                ${p.total_amount}
                FCFA
                ·
                ${echapperHtml(
                  p.payment_method
                )}
                · Réf.
                ${echapperHtml(
                  p.transaction_reference
                )}
              </p>

            </div>

            <div class="list-actions">

              <button
                class="btn btn-primary btn-small"
                onclick="traiterPaiement('${p.id}','CONFIRM')"
              >
                Confirmer
              </button>

              <button
                class="btn btn-light btn-small"
                onclick="traiterPaiement('${p.id}','REJECT')"
              >
                Rejeter
              </button>

            </div>

          </div>
        `)
        .join('');
  }

  const hz =
    document.getElementById(
      'finance-list'
    );

  if (
    ec ||
    !(confirmed || []).length
  ) {

    hz.innerHTML =
      '<div class="empty">Aucun paiement confirmé pour le moment.</div>';

  } else {

    hz.innerHTML =
      confirmed
        .map(c => `
          <div class="list-item">

            <div>

              <h4>
                ${echapperHtml(
                  c.members_v5
                    ?.nom_complet
                    ||
                  'Membre'
                )}
              </h4>

              <p>
                ${echapperHtml(
                  c.members_v5
                    ?.numero_membre
                    ||
                  ''
                )}
                ·
                ${
                  new Date(
                    c.period
                  )
                  .toLocaleDateString(
                    'fr-FR',
                    {
                      month:
                        'long',
                      year:
                        'numeric'
                    }
                  )
                }
              </p>

              <p>
                ✅
                ${
                  Number(
                    c.amount ||
                    0
                  )
                  +
                  Number(
                    c.penalty ||
                    0
                  )
                }
                FCFA
                ·
                ${echapperHtml(
                  c.payment_method ||
                  ''
                )}
              </p>

            </div>

          </div>
        `)
        .join('');
  }
}

async function traiterPaiement(
  id,
  action
) {
  if (
    !droits().finance
    ||
    schemaMode !== 'v5'
  ) {
    return;
  }

  let reason = null;

  if (
    action === 'REJECT'
  ) {

    reason =
      window.prompt(
        'Motif du rejet (facultatif) :'
      )
      ||
      null;
  }

  const { error } =
    await supabaseClient.rpc(
      'review_payment_v5',
      {
        p_declaration_id:
          id,
        p_action:
          action,
        p_reason:
          reason
      }
    );

  if (error) {

    console.error(error);

    toast(
      error.message ||
      'Traitement impossible.'
    );

    return;
  }

  toast(
    action === 'CONFIRM'
    ?
    'Paiement confirmé.'
    :
    'Paiement rejeté.'
  );

  await finances();
}

async function afficherVerification(
  token
) {
  document
    .getElementById(
      'auth-screen'
    )
    ?.classList.add(
      'hide'
    );

  document
    .getElementById(
      'app-shell'
    )
    ?.classList.add(
      'hide'
    );

  document
    .getElementById(
      'verify-screen'
    )
    ?.classList.remove(
      'hide'
    );

  const zone =
    document.getElementById(
      'verify-content'
    );

  let data = null;
  let error = null;

  let rep =
    await supabaseClient.rpc(
      'verify_member_card_v5',
      {
        p_token:
          token
      }
    );

  data =
    rep.data;

  error =
    rep.error;

  if (
    error ||
    !data ||
    !data.length
  ) {

    rep =
      await supabaseClient.rpc(
        'verify_member_card',
        {
          p_token:
            token
        }
      );

    data =
      rep.data;

    error =
      rep.error;
  }

  if (
    error ||
    !data ||
    !data.length
  ) {

    zone.innerHTML = `
      <div class="badge badge-red">
        Carte non reconnue
      </div>

      <p>
        Le QR code est invalide
        ou la carte n’est plus active.
      </p>
    `;

    return;
  }

  const m =
    data[0];

  zone.innerHTML = `
    <div class="verify-person">

      ${
        m.photo_url
        ?
        `
          <img
            src="${echapperHtml(
              m.photo_url
            )}"
            alt="Photo membre"
          >
        `
        :
        `
          <div class="photo-placeholder">
            👤
          </div>
        `
      }

      <h2>
        ${echapperHtml(
          m.nom_complet
        )}
      </h2>

      <div
        class="badge ${
          m.actif
          ?
          'badge-green'
          :
          'badge-red'
        }"
      >
        ${
          m.actif
          ?
          'Carte authentique · membre actif'
          :
          'Membre inactif'
        }
      </div>

      <p>
        <b>N° membre :</b>
        ${echapperHtml(
          m.numero_membre
        )}
      </p>

      <p>
        <b>Section :</b>
        ${echapperHtml(
          m.section_nom
        )}
      </p>

    </div>
  `;
}

async function logout() {
  await supabaseClient
    .auth
    .signOut();

  profilActuel = null;
  authUserId = null;
  schemaMode = 'unknown';

  window.location.href =
    window.location.pathname;
}

async function demarrer() {
  if (
    'serviceWorker'
    in navigator
  ) {

    navigator
      .serviceWorker
      .register(
        '/sw.js'
      )
      .catch(
        () => {}
      );
  }

  const params =
    new URLSearchParams(
      window.location.search
    );

  const verify =
    params.get(
      'verify'
    );

  if (verify) {

    await afficherVerification(
      verify
    );

    return;
  }

  await chargerReferentiels();

  const {
    data: {
      session
    }
  } =
    await supabaseClient
      .auth
      .getSession();

  if (
    session?.user
  ) {

    await chargerProfil(
      session.user
    );
  }
}

demarrer();
