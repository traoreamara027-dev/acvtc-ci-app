// ACVTC-CI V6 — notifications push et centre de notifications.
(function(){
  'use strict';

  const $ = (id) => document.getElementById(id);
  const esc = (v) => typeof echapperHtml === 'function' ? echapperHtml(v) : String(v ?? '');

  function b64ToUint8(base64String){
    const padding='='.repeat((4-base64String.length%4)%4);
    const base64=(base64String+padding).replace(/-/g,'+').replace(/_/g,'/');
    const raw=atob(base64);
    return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
  }

  async function abonnementActuel(){
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
    const reg = await navigator.serviceWorker.ready;
    return await reg.pushManager.getSubscription();
  }

  async function activerNotificationsV6(){
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return toast('Les notifications push ne sont pas prises en charge sur ce navigateur.', 6000);
    }
    let permission = Notification.permission;
    if (permission === 'default') permission = await Notification.requestPermission();
    if (permission !== 'granted') return toast('Autorisation de notification non accordée.', 6000);

    const { data: publicKey, error:keyError } = await supabaseClient.rpc('get_push_public_key_v6');
    if (keyError || !publicKey) return toast('Configuration des notifications indisponible.', 6000);

    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:b64ToUint8(publicKey) });
    }
    const json = sub.toJSON();
    const { error } = await supabaseClient.rpc('upsert_push_subscription_v6', {
      p_endpoint: sub.endpoint,
      p_p256dh: json.keys?.p256dh || '',
      p_auth: json.keys?.auth || '',
      p_user_agent: navigator.userAgent
    });
    if (error) return toast(error.message || 'Impossible d’activer les notifications.',6000);
    toast('Notifications activées sur cet appareil.');
    await centreNotificationsV6();
  }

  async function desactiverNotificationsV6(){
    const sub = await abonnementActuel();
    if (!sub) return toast('Aucun abonnement actif sur cet appareil.');
    await supabaseClient.rpc('disable_push_subscription_v6',{p_endpoint:sub.endpoint});
    await sub.unsubscribe();
    toast('Notifications désactivées sur cet appareil.');
    await centreNotificationsV6();
  }

  async function chargerNotificationsV6(){
    const zone=$('notification-list');
    if(!zone) return;
    const {data,error}=await supabaseClient.rpc('list_notifications_v6',{p_limit:50});
    if(error) return zone.innerHTML=`<div class="empty">${esc(error.message || 'Chargement impossible.')}</div>`;
    const items=data||[];
    mettreAJourBadgeNotifications(items.filter(n=>!n.is_read).length);
    if(!items.length) return zone.innerHTML='<div class="empty">Aucune notification pour le moment.</div>';
    zone.innerHTML=items.map(n=>`<article class="card" style="border-left:4px solid ${n.is_read?'#d0d5dd':'#163F73'}"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><h3 style="margin:0 0 6px">${esc(n.title)}</h3>${n.body?`<p>${esc(n.body)}</p>`:''}<p style="font-size:.85rem;color:#667085">${new Date(n.created_at).toLocaleString('fr-FR')}</p></div>${n.is_read?'':'<span class="badge badge-red">Nouveau</span>'}</div><div style="display:flex;gap:8px;flex-wrap:wrap">${n.target_path?`<button class="btn btn-primary" onclick="ouvrirNotificationV6('${n.id}','${esc(n.target_path)}')">Ouvrir</button>`:''}${n.is_read?'':`<button class="btn btn-light" onclick="marquerNotificationLueV6('${n.id}')">Marquer comme lue</button>`}</div></article>`).join('');
  }

  async function marquerNotificationLueV6(id){
    await supabaseClient.rpc('mark_notification_read_v6',{p_notification_id:id});
    await chargerNotificationsV6();
  }

  async function ouvrirNotificationV6(id,target){
    await supabaseClient.rpc('mark_notification_read_v6',{p_notification_id:id});
    ouvrirCibleNotification(target);
  }

  function ouvrirCibleNotification(target){
    const map={messages:()=>window.messages?.(),actualites:()=>window.actualites?.(),agenda:()=>window.agenda?.(),social:()=>window.aidesSocialesV6?.(),polls:()=>window.votesSondagesV6?.(),payments:()=>window.paiementsTemporairesV6?.()};
    (map[target]||(()=>window.accueil?.()))();
  }

  async function centreNotificationsV6(){
    const content=$('content');
    if(!content) return;
    let actif=false;
    try{ actif=!!(await abonnementActuel()); }catch(e){}
    content.innerHTML=`<div class="section-title"><h2>🔔 Notifications</h2></div><div class="card"><h3>Notifications sur mon téléphone</h3><p>Recevez une alerte lorsqu’une nouvelle information ACVTC-CI est publiée, même lorsque l’application n’est pas ouverte.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" onclick="activerNotificationsV6()">${actif?'Réactiver / synchroniser':'Activer les notifications'}</button>${actif?'<button class="btn btn-light" onclick="desactiverNotificationsV6()">Désactiver sur cet appareil</button>':''}</div><p style="font-size:.85rem;color:#667085;margin-top:10px">L’autorisation du téléphone reste obligatoire. Vous pouvez la retirer à tout moment dans les réglages du navigateur.</p></div><div class="section-title"><h3>Historique</h3></div><div id="notification-list"><div class="empty">Chargement…</div></div>`;
    await chargerNotificationsV6();
  }

  function mettreAJourBadgeNotifications(nb){
    let b=document.querySelector('[data-v6-notifications]');
    if(!b) return;
    b.textContent=nb>0?`🔔 Notifications (${nb})`:'🔔 Notifications';
  }

  async function actualiserBadgeNotifications(){
    if(!profilActuel) return;
    const {data}=await supabaseClient.rpc('list_notifications_v6',{p_limit:50});
    if(data) mettreAJourBadgeNotifications(data.filter(n=>!n.is_read).length);
  }

  function ajouterBoutonNotifications(){
    const nav=$('nav');
    if(!nav || nav.querySelector('[data-v6-notifications]')) return;
    const b=document.createElement('button');
    b.dataset.v6Notifications='1';
    b.textContent='🔔 Notifications';
    b.onclick=centreNotificationsV6;
    nav.insertBefore(b,nav.firstChild);
    actualiserBadgeNotifications();
  }

  async function envoyerPushApresPublication(kind,title,body,sectionId,target){
    try{
      const payload={kind,title,body,target_path:target};
      if(sectionId) payload.section_id=Number(sectionId);
      const {error}=await supabaseClient.functions.invoke('send-push-v6',{body:payload});
      if(error) console.warn('Notification push non envoyée',error);
      await actualiserBadgeNotifications();
    }catch(e){ console.warn('Notification push',e); }
  }

  function envelopperPublications(){
    if(typeof window.publierMessage==='function' && !window.publierMessage.__v6push){
      const original=window.publierMessage;
      const wrapped=async function(){
        const titre=$('msg-title')?.value.trim();
        const contenu=$('msg-body')?.value.trim();
        const section=$('msg-section')?.value;
        let succes=false;
        const oldToast=window.toast;
        window.toast=function(msg,...args){ if(String(msg).includes('Message publié')) succes=true; return oldToast(msg,...args); };
        try{ await original(); } finally { window.toast=oldToast; }
        if(succes && titre) await envoyerPushApresPublication('message',titre,contenu,section||null,'messages');
      };
      wrapped.__v6push=true;
      window.publierMessage=wrapped;
    }
    if(typeof window.publierActualite==='function' && !window.publierActualite.__v6push){
      const original=window.publierActualite;
      const wrapped=async function(){
        const titre=$('news-title')?.value.trim();
        const contenu=$('news-summary')?.value.trim() || 'Une nouvelle actualité est disponible dans l’application.';
        let succes=false;
        const oldToast=window.toast;
        window.toast=function(msg,...args){ if(String(msg).includes('Actualité publiée')) succes=true; return oldToast(msg,...args); };
        try{ await original(); } finally { window.toast=oldToast; }
        if(succes && titre) await envoyerPushApresPublication('actualite',titre,contenu,null,'actualites');
      };
      wrapped.__v6push=true;
      window.publierActualite=wrapped;
    }
  }

  navigator.serviceWorker?.addEventListener('message',(event)=>{
    if(event.data?.type==='OPEN_NOTIFICATION') ouvrirCibleNotification(event.data.target);
  });

  window.activerNotificationsV6=activerNotificationsV6;
  window.desactiverNotificationsV6=desactiverNotificationsV6;
  window.centreNotificationsV6=centreNotificationsV6;
  window.chargerNotificationsV6=chargerNotificationsV6;
  window.marquerNotificationLueV6=marquerNotificationLueV6;
  window.ouvrirNotificationV6=ouvrirNotificationV6;

  const observer=new MutationObserver(()=>{ ajouterBoutonNotifications(); envelopperPublications(); });
  observer.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(()=>{ajouterBoutonNotifications();envelopperPublications();},500);
  setInterval(actualiserBadgeNotifications,60000);

  const target=new URLSearchParams(location.search).get('open');
  if(target){ setTimeout(()=>ouvrirCibleNotification(target),1800); }
})();
