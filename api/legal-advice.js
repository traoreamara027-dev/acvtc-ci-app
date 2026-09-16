import { generateText, gateway } from 'ai';

const SUPABASE_URL = 'https://jxunyxingxubryyugwzn.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_HeE36KA4qTxB3jfo98Uvtg_mQSvG350';

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
  if (!process.env.AI_GATEWAY_API_KEY) return res.status(503).json({ error: "Le service juridique IA n'est pas encore activé par l'administrateur." });

  try {
    const { text } = await generateText({
      model: gateway('openai/gpt-5.6-luna'),
      system: `Tu es l'assistant d'orientation juridique de l'ACVTC-CI en Côte d'Ivoire. Réponds en français simple et prudent. Tu fournis uniquement une information générale, jamais une garantie de résultat ni une consultation d'avocat. Ne fabrique pas d'article de loi, de délai, de montant ou d'autorité : si une information précise n'est pas certaine, dis qu'elle doit être vérifiée auprès d'un professionnel ou de l'administration compétente. Structure la réponse avec : 1) compréhension de la situation, 2) premières démarches prudentes, 3) documents à conserver, 4) interlocuteur conseillé, 5) limites de l'orientation. Pour les urgences ou dangers immédiats, invite la personne à contacter les services locaux compétents. Ne demande ni numéro de pièce d'identité, ni coordonnées bancaires, ni mot de passe.`,
      prompt: question
    });
    return res.status(200).json({ answer: text });
  } catch (error) {
    console.error('legal-advice', error);
    return res.status(500).json({ error: "Le service n'a pas pu répondre pour le moment." });
  }
}
