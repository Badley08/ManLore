/* ============================================
   MANLORE - SERVICE WORKER
   Gestion du cache et mode offline
   ============================================ */

const CACHE_VERSION = 'manlore-v1.0.7';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;

// Fichiers à mettre en cache lors de l'installation
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.css',
    '/app.js',
    '/logic.js',
    '/manifest.json',
    '/manlore.png',
    'https://cdn.tailwindcss.com',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800;900&display=swap',
    'https://npmcdn.com/parse@3.4.4/dist/parse.min.js'
];

// Installation du Service Worker
self.addEventListener('install', event => {
    console.log('🔧 Service Worker: Installation...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                console.log('📦 Mise en cache des assets statiques');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
            .catch(err => console.error('❌ Erreur cache installation:', err))
    );
});

// Activation du Service Worker
self.addEventListener('activate', event => {
    console.log('✅ Service Worker: Activation');
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(name => name.startsWith('manlore-') && name !== STATIC_CACHE && name !== DYNAMIC_CACHE)
                        .map(name => {
                            console.log('🗑️ Suppression ancien cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => self.clients.claim())
    );
});

// Interception des requêtes
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Ignorer les requêtes non-GET et les requêtes API Parse
    if (request.method !== 'GET' || url.origin === 'https://parseapi.back4app.com') {
        return;
    }
    
    // Stratégie Cache-First pour les assets statiques
    if (isStaticAsset(request.url)) {
        event.respondWith(cacheFirst(request));
    } 
    // Stratégie Network-First pour le reste
    else {
        event.respondWith(networkFirst(request));
    }
});

// Stratégie Cache-First (assets statiques)
async function cacheFirst(request) {
    try {
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        const networkResponse = await fetch(request);
        
        // Mettre en cache la réponse si réussie
        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(STATIC_CACHE);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.error('❌ Cache-First error:', error);
        
        // Retourner une page offline si disponible
        const cachedResponse = await caches.match('/index.html');
        if (cachedResponse) {
            return cachedResponse;
        }
        
        return new Response('Offline - Aucune donnée en cache', {
            status: 503,
            statusText: 'Service Unavailable'
        });
    }
}

// Stratégie Network-First (contenu dynamique)
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);
        
        // Mettre en cache la réponse si réussie
        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('📴 Réseau indisponible, utilisation du cache');
        
        const cachedResponse = await caches.match(request);
        if (cachedResponse) {
            return cachedResponse;
        }
        
        return new Response('Offline - Ressource non disponible', {
            status: 503,
            statusText: 'Service Unavailable'
        });
    }
}

// Vérifier si une URL est un asset statique
function isStaticAsset(url) {
    const staticPatterns = [
        /\.css$/,
        /\.js$/,
        /\.png$/,
        /\.jpg$/,
        /\.jpeg$/,
        /\.gif$/,
        /\.svg$/,
        /\.woff$/,
        /\.woff2$/,
        /\.ttf$/,
        /fonts\.googleapis\.com/,
        /cdn\.tailwindcss\.com/,
        /cdnjs\.cloudflare\.com/,
        /npmcdn\.com/
    ];
    
    return staticPatterns.some(pattern => pattern.test(url));
}

// Écouter les messages depuis l'app
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        console.log('⏭️ Skip waiting activé');
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CACHE_URLS') {
        event.waitUntil(
            caches.open(DYNAMIC_CACHE)
                .then(cache => cache.addAll(event.data.urls))
        );
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys()
                .then(names => Promise.all(names.map(name => caches.delete(name))))
                .then(() => console.log('🗑️ Cache vidé'))
        );
    }
});

// Notification de mise à jour
self.addEventListener('controllerchange', () => {
    console.log('🔄 Service Worker mis à jour');
});

console.log('🚀 Service Worker ManLore v1.0.7 chargé');
