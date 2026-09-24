// Service Worker(DESIGN.md 15章)。キャッシュ優先。
// 機内モードでも、一度開いたことがあれば遊べるようにする。
// CACHE_VERSION を上げると、古いキャッシュを消して入れ直す。
const CACHE_VERSION = 'v2';   // v2: 段階9・10のファイルを足した
const CACHE = `drive-${CACHE_VERSION}`;

// アプリのファイル。assets/ はここに書かない。
// 素材はまだ揃っていないことがあり、cache.addAll は1つでも取れないと
// 全部が失敗するため。素材は走りながら、取れた物だけ貯める
const SHELL = [
  './',
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'js/main.js',
  'js/config.js',
  'js/orientation.js',
  'js/road.js',
  'js/player.js',
  'js/input.js',
  'js/audio.js',
  'js/assets.js',
  'js/scenery.js',
  'js/obstacles.js',
  'js/settings.js',
  'js/ending.js',
  'js/reactions.js',
  'js/crossing.js',
  'js/debug.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // 1つずつ入れる。取れない物があっても、残りは入る
    await Promise.all(SHELL.map((url) => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

// キャッシュにあればそれを返し、裏で新しい物を取り直して入れ替えておく。
// 表示はいつでも速く、次に開いたときには新しいファイルになる
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;

  const fresh = fetch(req).then(async (res) => {
    if (res && res.ok) {
      const cache = await caches.open(CACHE);
      await cache.put(req, res.clone());
    }
    return res;
  }).catch(() => null);

  event.waitUntil(fresh);      // 返したあとも取り直しを続けさせる
  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    const res = await fresh;
    if (res) return res;
    // 機内モードで、まだ貯めていないページを開いたとき
    if (req.mode === 'navigate') {
      const shell = await caches.match('index.html');
      if (shell) return shell;
    }
    return Response.error();
  })());
});
