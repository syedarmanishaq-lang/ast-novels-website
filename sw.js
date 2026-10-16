/* AST Novels service worker — offline-first reading. v2: full app shell + platform JS. */
var CACHE = 'ast-novels-v2';
var SHELL = [
  './',
  './index.html',
  './library.html',
  './novel.html',
  './read.html',
  './about.html',
  './urdu-novels.html',
  './authors.html',
  './stats.html',
  './privacy-policy.html',
  './offline.html',
  './css/style.css',
  './js/main.js',
  './js/site.js',
  './js/reader.js',
  './js/platform.js',
  './manifest.json',
  './data/novels/index.json',
  './img/favicon.svg',
  './img/og.jpg',
  './img/icon-192.png',
  './img/icon-512.png'
];

self.addEventListener('install', function(e){
  e.waitUntil(
    caches.open(CACHE).then(function(c){ return c.addAll(SHELL); })
      .then(function(){ return self.skipWaiting(); })
      .catch(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e){
  e.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.map(function(k){
        if(k !== CACHE) return caches.delete(k);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e){
  var req = e.request;
  if(req.method !== 'GET') return;
  var url = new URL(req.url);

  // Novel data + covers: network-first (fresh content), fall back to cache
  if(url.pathname.indexOf('/data/novels/') !== -1 || url.pathname.indexOf('/img/covers/') !== -1){
    e.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copy); });
        return res;
      }).catch(function(){ return caches.match(req); })
    );
    return;
  }

  // Navigations: network-first, offline page as last resort
  if(req.mode === 'navigate'){
    e.respondWith(
      fetch(req).then(function(res){
        var copy = res.clone();
        caches.open(CACHE).then(function(c){ c.put(req, copy); });
        return res;
      }).catch(function(){
        return caches.match(req).then(function(hit){
          return hit || caches.match('./offline.html');
        });
      })
    );
    return;
  }

  // Everything else (CSS/JS/fonts/images): cache-first, then network
  e.respondWith(
    caches.match(req).then(function(hit){
      if(hit) return hit;
      return fetch(req).then(function(res){
        // only cache same-origin http(s) responses
        if(url.origin === location.origin && res.ok){
          var copy = res.clone();
          caches.open(CACHE).then(function(c){ c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
