/* 건강이 스케줄 — 서비스 워커
   앱 껍데기를 캐시에 담아 두어 데이터가 없는 곳에서도 열리게 합니다.
   앱을 고칠 때마다 CACHE 뒤 번호를 올리면 이전 캐시는 자동으로 비워집니다. */
const CACHE = 'kg-schedule-v22';

const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './data.js',
  './data.json',
  './fonts/IBMPlexSansKR-Regular.woff2',
  './fonts/IBMPlexMono-Regular.woff2',
  './lunar.js',
  './app.js',
  './manifest.webmanifest',
  './app-config.js',
  './cloud-store.js',
  './icons/icon-192.png',
  './icons/header-logo.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // 하나가 실패해도 설치 자체는 끝나도록 개별로 담습니다
      .then(c => Promise.allSettled(ASSETS.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  // 폰트·Firebase 같은 외부 요청은 건드리지 않고 브라우저에 맡깁니다
  if (new URL(req.url).origin !== location.origin) return;

  // 화면도 캐시 우선 — 자원과 «같은 버전»의 한 벌로만 뜬다. 새 배포는 새
  // 서비스 워커가 새 캐시를 다 담은 다음 방문에 한꺼번에 바뀐다.
  // 예전엔 화면만 네트워크 우선이라, 배포 직후 «새 화면 + 옛 코드»가 섞여
  // 부팅이 통째로 깨질 수 있었다(찐플래너 테스트 배포에서 실제로 겪음).
  if (req.mode === 'navigate'){
    e.respondWith(
      caches.match('./index.html').then(r => r || fetch(req))
    );
    return;
  }

  // 나머지 자원은 캐시 우선 — 즉시 뜨고, 없으면 받아서 담아 둡니다.
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok){
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(req, copy));
      }
      return res;
    }))
  );
});
