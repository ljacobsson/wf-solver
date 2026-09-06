const APP_CACHE="wordfeud-app-v5";
const MEDIA_CACHE="wordfeud-shared-v1";
const ROOT=new URL("./",self.registration.scope);
const SHARE_URL=new URL("__shared_screenshot__",ROOT).href;
const APP_SHELL=["","index.html","styles.css","pwa.css","mobile.css","app.js","src/solver.js","src/vision.js","manifest.webmanifest","icons/icon.svg","icons/icon-192.png","icons/icon-512.png"].map(path=>new URL(path,ROOT).href);

self.addEventListener("install",event=>{
  event.waitUntil(caches.open(APP_CACHE).then(cache=>cache.addAll(APP_SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener("activate",event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key.startsWith("wordfeud-app-")&&key!==APP_CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch",event=>{
  const url=new URL(event.request.url);
  const isRemoteDictionary=url.href==="https://raw.githubusercontent.com/kamilmielnik/scrabble-dictionaries/master/english/sowpods.txt";
  if(event.request.method==="POST"&&url.pathname===new URL("share-target",ROOT).pathname){
    event.respondWith(receiveScreenshot(event.request));return;
  }
  if(event.request.method!=="GET"||(url.origin!==ROOT.origin&&!isRemoteDictionary))return;
  if(event.request.mode==="navigate"){
    event.respondWith(fetch(event.request).catch(()=>caches.match(new URL("index.html",ROOT).href)));return;
  }
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(response=>{
    if(response.ok)caches.open(APP_CACHE).then(cache=>cache.put(event.request,response.clone()));
    return response;
  })));
});

async function receiveScreenshot(request){
  try{
    const form=await request.formData(),file=form.get("screenshot");
    if(!(file instanceof Blob)||!file.type.startsWith("image/")||file.size>30*1024*1024)throw new Error("Invalid shared screenshot");
    const cache=await caches.open(MEDIA_CACHE);
    await cache.put(SHARE_URL,new Response(file,{headers:{"content-type":file.type||"image/png"}}));
    return Response.redirect(new URL("?share-target=1",ROOT).href,303);
  }catch{
    return Response.redirect(new URL("?share-error=1",ROOT).href,303);
  }
}
