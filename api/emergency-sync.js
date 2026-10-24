import { timingSafeEqual } from 'node:crypto';
import { collectDirectory } from '../lib/emergency-directory.js';

export const config = { maxDuration: 180 };
export default async function handler(req,res) {
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET') return res.status(405).json({error:'Méthode non autorisée'});
 const supplied=Buffer.from(req.headers.authorization||'');
 const expected=Buffer.from('Bearer '+(process.env.CRON_SECRET||''));
 if(!process.env.CRON_SECRET||supplied.length!==expected.length||!timingSafeEqual(supplied,expected)) return res.status(401).json({error:'Accès refusé'});
 if(!process.env.EMERGENCY_SYNC_SECRET) return res.status(503).json({error:'Synchronisation non configurée'});
 try {
  const {contacts,status}=await collectDirectory();
  const result=await fetch('https://jxunyxingxubryyugwzn.supabase.co/rest/v1/rpc/commit_emergency_sync_v7',{
   method:'POST',headers:{apikey:'sb_publishable_HeE36KA4qTxB3jfo98Uvtg_mQSvG350','Content-Type':'application/json'},
   body:JSON.stringify({p_key:process.env.EMERGENCY_SYNC_SECRET,p_contacts:contacts,p_status:status}),signal:AbortSignal.timeout(15000)
  });
  if(!result.ok) throw new Error('Directory persistence failed');
  const saved=await result.json();
  console.info('emergency-sync-complete',{saved,sources:status.filter(s=>s.success).length});
  return res.status(200).json({saved,sources:status.filter(s=>s.success).length});
 }catch(error){console.error('emergency-sync-failed',error.message);return res.status(502).json({error:'Sources indisponibles. Les derniers contacts sont conservés.'});}
}
