import { generateText, gateway } from 'ai';

const SUPABASE_URL = 'https://jxunyxingxubryyugwzn.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_HeE36KA4qTxB3jfo98Uvtg_mQSvG350';

function fallbackOrientation(question) {
  const q = String(question || '').toLowerCase();
  let category = 'générale';
  let steps = [
    'Notez les faits dans l’ordre chronologique : date, heure, lieu, personnes présentes et ce qui s’est passé.',
    'Conservez les preuves disponibles : messages, captures d’écran, reçus, photos, contrats et références de course.',
    'Évitez toute confrontation et privilégiez les échanges écrits, factuels et datés.',
    'Si le problème peut avoir des conséquences importantes, demandez l’avis d’un professionnel du droit ou de l’administration compétente.'
  ];
  let documents = 'Pièce ou document lié à la situation, captures d’écran, reçus, contrat, messages et tout justificatif daté.';
  let contact = 'Le bureau ACVTC-CI peut vous aider à organiser les éléments du dossier avant orientation vers un juriste, un avocat ou l’administration compétente.';

  if (/accident|collision|bless|sinistre|assurance/.test(q)) {
    category = 'accident / sinistre';
    steps = [
      'Assurez d’abord la sécurité des personnes et contactez les secours si nécessaire.',
      'Ne modifiez pas inutilement la scène si cela peut être évité et prenez des photos seulement si vous pouvez le faire sans danger.',
      'Recueillez les informations utiles sur les véhicules, conducteurs, témoins et assurances.',
      'Informez votre assurance et, si nécessaire, les services de police ou de gendarmerie compétents.',
      'Conservez les références de la course et les échanges avec la plateforme VTC.'
    ];
    documents = 'Photos, constat ou procès-verbal s’il existe, certificat médical si nécessaire, police d’assurance, références de course et échanges avec la plateforme.';
    contact = 'Assurance, police/gendarmerie selon la situation, puis juriste ou avocat si un litige apparaît.';
  } else if (/police|gendarmer|contr[oô]le|amende|fourri[eè]re|saisie|permis|interpell|arrest|garde/.test(q)) {
    category = 'contrôle / procédure avec une autorité';
    steps = [
      'Restez calme et évitez toute opposition physique ou verbale.',
      'Demandez, lorsque c’est possible, le motif de la mesure et la référence du document qui vous est remis.',
      'Lisez les documents avant de les signer et demandez une copie lorsque cela est prévu.',
      'Notez l’heure, le lieu et le service concerné, puis conservez tous les justificatifs.',
      'En cas d’interpellation, de détention ou de risque pénal, demandez rapidement l’assistance d’un avocat.'
    ];
    documents = 'Permis, documents du véhicule, reçu ou procès-verbal remis, preuve de paiement éventuelle et chronologie écrite des faits.';
    contact = 'Service concerné, avocat ou juriste. L’ACVTC-CI peut aussi aider à structurer le dossier.';
  } else if (/yango|plateforme|compte|suspend|bloqu|commission|bonus|course|partenaire/.test(q)) {
    category = 'litige avec une plateforme ou un partenaire';
    steps = [
      'Faites des captures d’écran du compte, des messages, des montants et des conditions affichées.',
      'Demandez une explication écrite et précise à la plateforme ou au partenaire.',
      'Conservez les conditions d’utilisation, contrats, relevés de courses et justificatifs de paiement.',
      'Évitez les messages agressifs et formulez une réclamation claire avec les dates et montants concernés.',
      'Si aucune solution n’est trouvée, faites examiner le dossier par un juriste avant toute démarche contentieuse.'
    ];
    documents = 'Contrat ou conditions d’utilisation, captures d’écran, relevés de courses, paiements, messages et réclamations déjà envoyées.';
    contact = 'Service client ou responsable partenaire, ACVTC-CI, puis juriste/avocat si nécessaire.';
  } else if (/dette|paiement|impay|argent|rembourse|pr[eê]t|versement/.test(q)) {
    category = 'paiement / dette';
    steps = [
      'Rassemblez les preuves de la dette ou du paiement : reçu, transfert, contrat, messages ou reconnaissance écrite.',
      'Adressez une demande écrite, calme et précise indiquant le montant, la date et ce qui est demandé.',
      'Conservez une copie de toutes les relances et réponses.',
      'Évitez les menaces, l’exposition publique ou toute méthode de pression illégale.',
      'Si le différend persiste, demandez à un juriste quelle procédure est adaptée au montant et à la situation.'
    ];
    documents = 'Reçus, relevés de transfert, contrat, messages, reconnaissance de dette et historique des paiements.';
    contact = 'Médiation amiable si possible, puis juriste/avocat ou juridiction compétente selon le dossier.';
  }

  return `Mode de secours — orientation générale\n\nLe moteur d’assistance IA est momentanément indisponible, mais le service peut quand même vous donner une première orientation prudente.\n\n1) Compréhension de la situation\nVotre demande semble relever d’une situation de type : ${category}. Cette qualification est seulement indicative et doit être confirmée si le dossier est complexe.\n\n2) Premières démarches prudentes\n- ${steps.join('\n- ')}\n\n3) Documents à conserver\n${documents}\n\n4) Interlocuteur conseillé\n${contact}\n\n5) Limites de cette orientation\nCette réponse est une information générale. Elle ne remplace pas l’analyse d’un avocat, d’un juriste ou d’une autorité compétente et ne permet pas de garantir l’issue d’une procédure. En cas d’urgence, de danger immédiat, d’interpellation ou de blessure, contactez sans délai les services compétents.`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Méthode non autorisée.' });

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Veuillez vous reconnecter.' });

  const authResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` }
  });
  if (!authResponse.ok) return res.status(401).json({ error: 'Session invalide ou expirée.' });

  const question = String(req.body?.question || '').trim().slice(0, 4000);
  if (question.length < 15) return res.status(400).json({ error: 'Décrivez davantage votre situation.' });

  try {
    const { text } = await generateText({
      model: gateway('openai/gpt-5.6-luna'),
      system: `Tu es l'assistant d'orientation juridique de l'ACVTC-CI en Côte d'Ivoire. Réponds en français simple et prudent. Tu fournis uniquement une information générale, jamais une garantie de résultat ni une consultation d'avocat. Ne fabrique pas d'article de loi, de délai, de montant ou d'autorité : si une information précise n'est pas certaine, dis qu'elle doit être vérifiée auprès d'un professionnel ou de l'administration compétente. Structure la réponse avec : 1) compréhension de la situation, 2) premières démarches prudentes, 3) documents à conserver, 4) interlocuteur conseillé, 5) limites de l'orientation. Pour les urgences ou dangers immédiats, invite la personne à contacter les services locaux compétents. Ne demande ni numéro de pièce d'identité, ni coordonnées bancaires, ni mot de passe.`,
      prompt: question
    });
    return res.status(200).json({ answer: text, mode: 'ai' });
  } catch (error) {
    console.error('legal-advice-ai-unavailable', error);
    return res.status(200).json({
      answer: fallbackOrientation(question),
      mode: 'fallback'
    });
  }
}
