// 飞友之家 PWA Service Worker
const CACHE_NAME = 'feiyou-zhijia-v1';

// 需要缓存的静态资源
const STATIC_CACHE_URLS = [
  '/',
  '/css/style.css',
  '/js/app.js',
  '/js/i18n.js',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// 安装事件 - 预缓存静态资源
self.addEventListener('install', (event) => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets');
      return cache.addAll(STATIC_CACHE_URLS).catch((err) => {
        console.warn('[SW] Some assets failed to cache:', err);
      });
    })
  );
  // 立即激活
  self.skipWaiting();
});

// 激活事件 - 清理旧缓存
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// 请求拦截 - 网络优先策略（聊天应用需要实时数据）
self.addEventListener('fetch', (event) => {
  // 跳过非 GET 请求和 Socket.IO 请求
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('socket.io')) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 只缓存成功的 GET 请求
        if (response.status === 200 && event.request.method === 'GET') {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // 离线时从缓存读取
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // 如果请求的是页面，返回离线页面
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
          return new Response('离线状态，请检查网络连接', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
      })
  );
});
