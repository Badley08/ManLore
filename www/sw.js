/* ============================================
   MANLORE v5.0.1 - SERVICE WORKER
   Offline PWA Support & Relative Scope Routing
   ============================================ */

const CACHE_NAME = 'manlore-v5.0.1-cache';
const STATIC_ASSETS = [
    './',
    './index.html',
    './styles.css',
    './app.css',
    './i18n.js',
    './jikan.js',
    './logic.js',
    './analyse.js',
    './wishlist.js',
    './quests.js',
    './logger.js',
    './app.js',
    './manifest.json',
    './manlore_fr-quests_xp.json',
    './manlore_en-quests_xp.json',
    './manlore_es-quests_xp.json',
    './manlore-logo.png',
    './manlore-logo-48.png',
    './manlore-logo-72.png',
    './manlore-logo-96.png',
    './manlore-logo-128.png',
    './manlore-logo-144.png',
    './manlore-logo-192.png',
    './manlore-logo-256.png',
    './manlore-logo-384.png',
    './manlore-logo-512.png',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Orbitron:wght@400;600;700;800;900&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://cdnjs.cloudflare.com/ajax/libs/parse/3.4.4/parse.min.js'
];

// Install
self.addEventListener('install', event => {
    console.log('[SW] Installing v5.0.1...');
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return Promise.allSettled(
                STATIC_ASSETS.map(url => cache.add(url).catch(e => console.warn('[SW] Cache note:', url, e.message)))
            );
        }).then(() => self.skipWaiting())
    );
});

// Activate — clean old caches
self.addEventListener('activate', event => {
    console.log('[SW] Activating v5.0.1...');
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => {
                console.log('[SW] Deleting old cache:', k);
                return caches.delete(k);
            }))
        ).then(() => self.clients.claim())
    );
});

// Fetch — network first for API, cache first for static
self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Skip non-GET
    if (event.request.method !== 'GET') return;

    // API calls — network only (with offline fallback)
    if (url.hostname.includes('parseapi.back4app.com') ||
        url.hostname.includes('api.jikan.moe') ||
        url.hostname.includes('kitsu.io') ||
        url.hostname.includes('api.mangadex.org')) {
        event.respondWith(
            fetch(event.request).catch(() =>
                new Response(JSON.stringify({ error: 'offline' }), {
                    headers: { 'Content-Type': 'application/json' }
                })
            )
        );
        return;
    }

    // Google Fonts — cache first
    if (url.hostname.includes('fonts.googleapis.com') ||
        url.hostname.includes('fonts.gstatic.com')) {
        event.respondWith(
            caches.match(event.request).then(cached => cached ||
                fetch(event.request).then(response => {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                    return response;
                })
            )
        );
        return;
    }

    // Static assets — network first, fallback to cache
    event.respondWith(
        fetch(event.request).then(response => {
            if (response.ok) {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            }
            return response;
        }).catch(() =>
            caches.match(event.request).then(cached => {
                if (cached) return cached;
                if (event.request.destination === 'document') {
                    return caches.match('./index.html') || caches.match('index.html');
                }
                return new Response('Offline', { status: 503 });
            })
        )
    );
});

// ============ PUSH NOTIFICATIONS & MESSAGES ============
self.addEventListener('push', event => {
    let data = { title: 'ManLore', body: 'New notification from ManLore' };
    try {
        if (event.data) {
            data = event.data.json();
        }
    } catch {
        if (event.data) data.body = event.data.text();
    }

    let finalTitle = data.title || 'ManLore';
    let finalBody = data.body || '';

    // Support multilingue avec fallback Anglais si la langue n'est pas disponible
    const clientLang = (self.navigator?.language || 'en').split('-')[0].toLowerCase();
    if (data[clientLang] && typeof data[clientLang] === 'object') {
        finalTitle = data[clientLang].title || finalTitle;
        finalBody = data[clientLang].body || finalBody;
    } else if (data.en && typeof data.en === 'object') {
        finalTitle = data.en.title || finalTitle;
        finalBody = data.en.body || finalBody;
    } else if (data.fr && typeof data.fr === 'object') {
        finalTitle = data.fr.title || finalTitle;
        finalBody = data.fr.body || finalBody;
    } else if (data.es && typeof data.es === 'object') {
        finalTitle = data.es.title || finalTitle;
        finalBody = data.es.body || finalBody;
    }

    const options = {
        body: finalBody,
        icon: './manlore-logo-192.png',
        badge: './manlore-logo-96.png',
        vibrate: [100, 50, 100],
        data: data,
        tag: data.tag || 'manlore-notification'
    };

    event.waitUntil(
        self.registration.showNotification(finalTitle, options)
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
            for (const client of clientList) {
                if (client.url && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow('./');
            }
        })
    );
});

self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SHOW_NOTIFICATION') {
        const { title, body, tag } = event.data;
        self.registration.showNotification(title || 'ManLore', {
            body: body || '',
            icon: './manlore-logo-192.png',
            badge: './manlore-logo-96.png',
            tag: tag || 'manlore-msg'
        });
    }
});

console.log('[SW] Service Worker v6.0.1 loaded with Push Notification support');
