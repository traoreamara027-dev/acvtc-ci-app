import { createHash } from 'node:crypto';

export const DIRECTORY = 'https://annuaire.gouv.ci/accueil/liste_institution/commissariats-de-police';
const text = html => html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ')
 .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#039;|&apos;/g, "'")
 .replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

// Accept complete ten-digit numbers only. Never infer missing prefixes.
export function parsePhones(raw) {
 const cleaned=text(raw).replace(/\(\+225\)|\+225|\b225(?=[ .-]*[0-9])/g,' ');
 const result=[];
 for (const segment of cleaned.split(/[/|;,\n]+/)) {
  const digits=segment.replace(/\D/g,'');
  if (/^(01|05|07|21|25|27)\d{8}$/.test(digits)) result.push('+225'+digits);
 }
 return [...new Set(result)];
}

export function parseDirectory(html, sourceUrl) {
 if (!html.includes('Commissariats de police')) throw new Error('Unexpected source content');
 const contacts=[];
 for (const block of html.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
  const name=text(block[1].match(/<h5\b[^>]*>([\s\S]*?)<\/h5>/i)?.[1]||'');
  if (!/COMMISSARIAT|POLICE|GENDARMERIE|BRIGADE/i.test(name)) continue;
  const phoneHtml=block[1].match(/<span[^>]*title="Téléphone"[^>]*>([\s\S]*?)<\/span>/i)?.[1]||'';
  const phones=parsePhones(phoneHtml);
  if (!phones.length) continue;
  const location=text(block[1].match(/<span[^>]*title="Adresse géographique"[^>]*>([\s\S]*?)<\/span>/i)?.[1]||'').replace(/^my_location\s*/, '');
  const id=createHash('sha256').update(name+'|'+location).digest('hex').slice(0,32);
  contacts.push({id,name,location,category:/GENDARMERIE|BRIGADE/i.test(name)?'Gendarmerie':'Police',phones:phones.sort(),source_url:sourceUrl});
 }
 return contacts;
}

export async function fetchOfficial(url) {
 const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(15000),headers:{'User-Agent':'ACVTC-CI-OfficialDirectory/7.0'}});
 if (!response.ok) throw new Error('Official source unavailable');
 if (Number(response.headers.get('content-length'))>2000000) throw new Error('Source too large');
 const html=await response.text();
 if(html.length>2000000) throw new Error('Source too large');
 return html;
}

export async function collectDirectory() {
 const contacts=new Map(),status=[];
 // Eight pages are currently linked by the official directory.
 for(let page=1;page<=8;page++) {
  const url=page===1?DIRECTORY:DIRECTORY+'/'+page;
  try {
   const rows=parseDirectory(await fetchOfficial(url),url);
   for(const row of rows) {
    const prior=contacts.get(row.id);
    if(prior) row.phones=[...new Set([...prior.phones,...row.phones])].sort();
    contacts.set(row.id,row);
   }
   status.push({source_url:url,success:rows.length>0,contact_count:rows.length});
  } catch { status.push({source_url:url,success:false,contact_count:0}); }
 }
 // No directory parser is assumed for inaccessible or unrelated institution pages.
 for(const url of ['https://gendarmerie.gouv.ci/','https://www.police.gouv.ci/']) {
  try { await fetchOfficial(url); } catch { /* Keep last accepted contacts. */ }
  status.push({source_url:url,success:false,contact_count:0});
 }
 return {contacts:[...contacts.values()],status};
}
