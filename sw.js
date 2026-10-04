const CACHE='acvtc-v6-6';
const ASSETS=['/','/index.html','/style.css','/app.js?v=20261004-delete-v6-3','/modules-v51.js?v=20261004-delete-v6-3','/v6.js?v=20261004-delete-v6-3','/v6-extras.js','/v6-notifications.js','/logo-acvtc.png','/icon-192.png','/icon-512.png','/manifest.json'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)))});
self.addEventListener('activate',e=>e.waitUntil(Promise.all([self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))])));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(cache=>cache.put(e.request,c));return r;}).catch(()=>caches.match(e.request)))});
self.addEventListener('push',event=>{
  let data={};
  try{data=event.data?event.data.json():{};}catch(e){data={title:'ACVTC-CI',body:'Une nouvelle information est disponible.'};}
  const title=data.title||'ACVTC-CI';
  const options={body:data.body||'Une nouvelle information est disponible dans l’application.',icon:data.icon||'/icon-192.png',badge:data.badge||'/icon-192.png',data:data.data||{},tag:data.data?.notification_id||'acvtc-info',renotify:true};
  event.waitUntil(self.registration.showNotification(title,options));
});
self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=event.notification.data?.target||'accueil';
  event.waitUntil((async()=>{
    const list=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of list){
      try{client.postMessage({type:'OPEN_NOTIFICATION',target});await client.focus();return;}catch(e){}
    }
    if(clients.openWindow) await clients.openWindow('/?open='+encodeURIComponent(target));
  })());
});
