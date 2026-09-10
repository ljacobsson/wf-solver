const APP_CACHE = "wordfeud-app-v12";
const RUNTIME_CACHE = "wordfeud-runtime-v1";
const MEDIA_CACHE = "wordfeud-shared-v1";
const ROOT = new URL("./", self.registration.scope);
const INDEX_URL = new URL("index.html", ROOT).href;
const SHARE_URL = new URL("__shared_screenshot__", ROOT).href;
const APP_SHELL = [
  "index.html",
  "styles.css",
  "pwa.css",
  "mobile.css",
  "risk.css",
  "loader.css",
  "app.js",
  "src/solver.js",
  "src/vision.js",
  "src/loading-quotes.js",
  "manifest.webmanifest",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png"
].map(path => new URL(path, ROOT).href);
const APP_SHELL_SET = new Set(APP_SHELL);

function hasExpectedType(url, response) {
  if (!response?.ok || response.type === "opaque") return false;
  const type = response.headers.get("content-type")?.toLowerCase() || "";
  const path = new URL(url).pathname;
  if (path.endsWith(".css")) return type.includes("text/css");
  if (path.endsWith(".js")) return type.includes("javascript");
  if (path.endsWith(".webmanifest")) return type.includes("json") || type.includes("manifest");
  if (/\.(?:png|svg)$/.test(path)) return type.startsWith("image/");
  if (path.endsWith(".html")) return type.includes("text/html");
  return true;
}

async function fetchShellAsset(url) {
  const response = await fetch(new Request(url, { cache: "reload" }));
  if (!hasExpectedType(url, response)) throw new Error(`Invalid app asset: ${url}`);
  return response;
}

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(APP_CACHE);
    const entries = await Promise.all(APP_SHELL.map(async url => [url, await fetchShellAsset(url)]));
    await Promise.all(entries.map(([url, response]) => cache.put(url, response)));
    // Keep the current worker active until its pages close, so versions never mix.
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith("wordfeud-app-") && key !== APP_CACHE)
      .map(key => caches.delete(key)));
    // Existing clients keep their original worker until their next launch.
  })());
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  const sharePath = new URL("share-target", ROOT).pathname;
  const isRemoteDictionary = url.href === "https://raw.githubusercontent.com/kamilmielnik/scrabble-dictionaries/master/english/sowpods.txt";

  if (event.request.method === "POST" && url.pathname === sharePath) {
    event.respondWith(receiveScreenshot(event.request));
    return;
  }
  if (event.request.method !== "GET" || (url.origin !== ROOT.origin && !isRemoteDictionary)) return;

  if (event.request.mode === "navigate") {
    event.respondWith(serveAppPage());
    return;
  }
  if (APP_SHELL_SET.has(url.href)) {
    event.respondWith(serveShellAsset(event.request));
    return;
  }
  event.respondWith(serveRuntimeAsset(event.request));
});

async function serveAppPage() {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(INDEX_URL);
  if (cached && hasExpectedType(INDEX_URL, cached)) return cached;
  const response = await fetchShellAsset(INDEX_URL);
  await cache.put(INDEX_URL, response.clone());
  return response;
}

async function serveShellAsset(request) {
  const cache = await caches.open(APP_CACHE);
  const cached = await cache.match(request.url);
  if (cached && hasExpectedType(request.url, cached)) return cached;
  if (cached) await cache.delete(request.url);
  const response = await fetchShellAsset(request.url);
  await cache.put(request.url, response.clone());
  return response;
}

async function serveRuntimeAsset(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function receiveScreenshot(request) {
  try {
    const form = await request.formData();
    const file = form.get("screenshot");
    if (!(file instanceof Blob) || !file.type.startsWith("image/") || file.size > 30 * 1024 * 1024) {
      throw new Error("Invalid shared screenshot");
    }
    const cache = await caches.open(MEDIA_CACHE);
    await cache.put(SHARE_URL, new Response(file, { headers: { "content-type": file.type || "image/png" } }));
    return Response.redirect(new URL("?share-target=1", ROOT).href, 303);
  } catch {
    return Response.redirect(new URL("?share-error=1", ROOT).href, 303);
  }
}
