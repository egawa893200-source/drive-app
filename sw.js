// Service Worker の雛形。キャッシュ処理は段階8で入れる(DESIGN.md 15章)。
// 今はまだ index.html から登録していない。開発中に古いファイルが残らないようにするため。
const CACHE_VERSION = 'v1';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// fetch はまだ横取りしない(段階8でキャッシュ優先方式にする)
