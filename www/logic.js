/* ============================================
   MANLORE v5.0.1 - LOGIC.JS
   Ultra-Resilient Native REST Client for Back4App (Server A & Server B)
   Automatic Server A First -> Silent Failover to Server B
   Diagnostics & Server Failover Logged to Logger
   Instant Stale-While-Revalidate, Row Level Security (RLS) & Offline Sync
   ============================================ */

'use strict';

// ============ MULTI-SERVER BACK4APP CONFIGURATION ============
const BACK4APP_SERVERS = {
    A: {
        id: 'A',
        name: 'Serveur Principal (A)',
        appId: 'vnaPY79T1WzfEYp84Mve2PAoHbexPaATo43qickr',
        clientKey: '0Y9zcO1XB1hAkVKWa72TIamjPR1pnwuw8IsG6TLj',
        url: 'https://parseapi.back4app.com'
    },
    B: {
        id: 'B',
        name: 'Serveur Secondaire (B)',
        appId: 'OH5yq9tgEzqkn2TNoegJlF6XVLuzEMH6vKwYg5qu',
        clientKey: 'WPvwJkRsmofv2u480N2f2c2wluTh5zGyBIhkc4dP',
        url: 'https://parseapi.back4app.com'
    }
};

let currentServerId = localStorage.getItem('manlore_active_server') || 'A';
let currentUser = null;
let syncQueue = [];
let isOnline = navigator.onLine;
let autoSyncInterval = null;
let isGuestMode = false;
let storageMode = 'cloud'; // 'local' | 'cloud'

// ============================================
// NATIVE HTTP REST CLIENT AVEC FAILOVER AUTOMATIQUE
// ============================================

async function executeBack4AppRequest(server, endpoint, method = 'GET', data = null, sessionToken = null) {
    const url = server.url + endpoint;
    const headers = {
        'X-Parse-Application-Id': server.appId,
        'X-Parse-REST-API-Key': server.clientKey,
        'X-Parse-Client-Key': server.clientKey,
        'X-Parse-Revocable-Session': '1',
        'Content-Type': 'application/json'
    };

    if (sessionToken) {
        headers['X-Parse-Session-Token'] = sessionToken;
    }

    const options = {
        method,
        headers,
        mode: 'cors'
    };

    if (data && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(data);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    options.signal = controller.signal;

    try {
        const response = await fetch(url, options);
        clearTimeout(timeoutId);

        let json = null;
        try {
            json = await response.json();
        } catch {
            json = {};
        }

        return {
            ok: response.ok,
            status: response.status,
            data: json,
            server: server.id
        };
    } catch (err) {
        clearTimeout(timeoutId);
        return {
            ok: false,
            status: 0,
            error: err.name === 'AbortError' ? 'Délai d\'attente dépassé (timeout 10s)' : err.message,
            server: server.id
        };
    }
}

// Appel intelligent : Serveur A en priorité -> Basculement silencieux sur Serveur B si erreur
async function back4appApiCall(endpoint, method = 'GET', data = null, sessionToken = null, preferredServer = null) {
    const firstServerId = preferredServer || currentServerId || 'A';
    const secondServerId = firstServerId === 'A' ? 'B' : 'A';

    const server1 = BACK4APP_SERVERS[firstServerId];
    const server2 = BACK4APP_SERVERS[secondServerId];

    // 1. Tentative sur le premier serveur
    const res1 = await executeBack4AppRequest(server1, endpoint, method, data, sessionToken);

    if (res1.ok) {
        if (currentServerId !== firstServerId) {
            currentServerId = firstServerId;
            localStorage.setItem('manlore_active_server', firstServerId);
        }
        return res1;
    }

    // 2. Si échec (404, 400, 401, network) -> Basculement silencieux sur le second serveur
    console.log(`[Failover] Requête échouée sur ${server1.name} (Code: ${res1.status}), basculement silencieux vers ${server2.name}...`);
    if (window.appLogger) {
        window.appLogger.log('server_failover', `Basculement de ${server1.id} vers ${server2.id}`, {
            endpoint,
            method,
            reason: res1.data?.error || res1.error || `HTTP ${res1.status}`
        });
    }

    const res2 = await executeBack4AppRequest(server2, endpoint, method, data, sessionToken);
    if (res2.ok) {
        currentServerId = secondServerId;
        localStorage.setItem('manlore_active_server', secondServerId);
        console.log(`[Failover] Succès sur le ${server2.name} ! Serveur actif mémorisé.`);
        return res2;
    }

    // Si les deux échouent, on retourne la réponse d'origine
    return res1.status !== 0 ? res1 : res2;
}

// ============================================
// MODÈLE UTILISATEUR COMPATIBLE (PARSE USER INTERFACE)
// ============================================

class UserSession {
    constructor(userData, sessionToken, serverLocation = 'A') {
        this.id = userData.objectId || userData.id;
        this.objectId = this.id;
        this.sessionToken = sessionToken || userData.sessionToken;
        this.serverLocation = serverLocation || userData.serverLocation || currentServerId;
        this._attributes = { ...userData };
    }

    get(field) {
        return this._attributes[field];
    }

    set(field, value) {
        this._attributes[field] = value;
    }

    getSessionToken() {
        return this.sessionToken;
    }

    async save() {
        const updatePayload = { ...this._attributes };
        delete updatePayload.objectId;
        delete updatePayload.createdAt;
        delete updatePayload.updatedAt;
        delete updatePayload.sessionToken;

        const res = await executeBack4AppRequest(
            BACK4APP_SERVERS[this.serverLocation] || BACK4APP_SERVERS.A,
            `/users/${this.objectId}`,
            'PUT',
            updatePayload,
            this.sessionToken
        );

        if (res.ok) {
            this._attributes.updatedAt = res.data.updatedAt;
            saveUserSessionToLocal(this);
            return this;
        }
        throw new Error(res.data?.error || 'Erreur sauvegarde utilisateur');
    }

    async fetch() {
        const res = await executeBack4AppRequest(
            BACK4APP_SERVERS[this.serverLocation] || BACK4APP_SERVERS.A,
            `/users/${this.objectId}`,
            'GET',
            null,
            this.sessionToken
        );

        if (res.ok) {
            this._attributes = { ...this._attributes, ...res.data };
            saveUserSessionToLocal(this);
            return this;
        }
        throw new Error(res.data?.error || 'Erreur chargement utilisateur');
    }
}

function saveUserSessionToLocal(userSession) {
    if (!userSession) {
        localStorage.removeItem('manlore_user_session');
        return;
    }
    localStorage.setItem('manlore_user_session', JSON.stringify({
        objectId: userSession.id,
        sessionToken: userSession.sessionToken,
        serverLocation: userSession.serverLocation,
        attributes: userSession._attributes
    }));
}

function loadUserSessionFromLocal() {
    try {
        const raw = localStorage.getItem('manlore_user_session');
        if (raw) {
            const parsed = JSON.parse(raw);
            const user = new UserSession(parsed.attributes || {}, parsed.sessionToken, parsed.serverLocation);
            return user;
        }
    } catch {}
    return null;
}

// ============================================
// COMPATIBILITÉ AVEC LE SDK PARSE GLOBAL
// ============================================

window.Parse = window.Parse || {};
window.Parse.User = {
    current: () => currentUser,
    logIn: (u, p) => logIn(u, p),
    logOut: () => logOut(),
    signUp: (u, e, p) => signUp(u, e, p)
};
window.Parse.Object = {
    extend: (className) => {
        return function () {
            this.className = className;
            this._attributes = {};
            this.set = (k, v) => { this._attributes[k] = v; };
            this.get = (k) => this._attributes[k];
            this.setACL = (acl) => { this._attributes.ACL = acl; };
            this.save = async () => {
                const res = await back4appApiCall(
                    `/classes/${className}`,
                    'POST',
                    this._attributes,
                    currentUser?.getSessionToken()
                );
                if (res.ok) {
                    this.id = res.data.objectId;
                    this.objectId = res.data.objectId;
                    return this;
                }
                throw new Error(res.data?.error || 'Erreur sauvegarde objet');
            };
        };
    },
    saveAll: async (objects) => {
        if (!Array.isArray(objects) || objects.length === 0) return [];
        const results = [];
        for (const obj of objects) {
            try {
                results.push(await obj.save());
            } catch (e) {
                console.warn('[ParseCompat] saveAll item note:', e);
            }
        }
        return results;
    }
};
window.Parse.ACL = class {
    constructor(user) {
        this.permissions = {};
        if (user && user.id) {
            this.permissions[user.id] = { read: true, write: true };
        }
    }
    setPublicReadAccess(val) {
        if (!this.permissions['*']) this.permissions['*'] = {};
        this.permissions['*'].read = val;
    }
    setPublicWriteAccess(val) {
        if (!this.permissions['*']) this.permissions['*'] = {};
        this.permissions['*'].write = val;
    }
};
window.Parse.Query = class {
    constructor(objectClass) {
        this.className = objectClass?.prototype?.className || 'Items';
        this.filters = {};
    }
    equalTo(key, val) {
        if (val && val.id) {
            this.filters[key] = { __type: 'Pointer', className: '_User', objectId: val.id };
        } else {
            this.filters[key] = val;
        }
    }
    descending(field) {
        this.order = '-' + field;
    }
    limit(num) {
        this.limitNum = num;
    }
    async find() {
        const params = new URLSearchParams();
        if (Object.keys(this.filters).length > 0) {
            params.set('where', JSON.stringify(this.filters));
        }
        if (this.order) params.set('order', this.order);
        if (this.limitNum) params.set('limit', String(this.limitNum));

        const endpoint = `/classes/${this.className}?${params.toString()}`;
        const res = await back4appApiCall(endpoint, 'GET', null, currentUser?.getSessionToken());
        if (res.ok && res.data?.results) {
            return res.data.results.map(r => ({
                id: r.objectId,
                objectId: r.objectId,
                createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
                updatedAt: r.updatedAt ? new Date(r.updatedAt) : new Date(),
                get: (k) => r[k]
            }));
        }
        return [];
    }
};

// ============================================
// INITIALISATION DU BACKEND
// ============================================

function generateUniqueUserToken(username) {
    const randomPart = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    const timePart = Date.now().toString(36);
    const cleanUser = (username || 'user').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().substring(0, 8);
    return `ML_${cleanUser}_${timePart}_${randomPart}`;
}

async function initializeBackend() {
    console.log('[Backend] Initialisation v5.0.1 (Client REST Haute Résilience)...');

    storageMode = localStorage.getItem('manlore_storage_mode') || 'cloud';
    isGuestMode = localStorage.getItem('manlore_guest_mode') === 'true';

    loadSyncQueue();
    updateOnlineStatus(navigator.onLine);

    if (!isGuestMode) {
        const savedUser = loadUserSessionFromLocal();
        if (savedUser && savedUser.sessionToken) {
            currentUser = savedUser;
            currentServerId = savedUser.serverLocation || 'A';
            startAutoSync();

            // Vérification silencieuse de validité en arrière-plan
            setTimeout(async () => {
                try {
                    await currentUser.fetch();
                    if (window.questManager) {
                        window.questManager.syncFromCloud();
                    }
                } catch {
                    // Si session révoquée sur ce serveur, tenter l'autre serveur
                    const otherServer = currentServerId === 'A' ? 'B' : 'A';
                    currentUser.serverLocation = otherServer;
                    try {
                        await currentUser.fetch();
                        currentServerId = otherServer;
                        localStorage.setItem('manlore_active_server', otherServer);
                    } catch {
                        console.warn('[Backend] Session expirée');
                    }
                }
            }, 1000);
        }
    }
}

// ============================================
// AUTHENTIFICATION HAUTE FIABILITÉ (SERVEUR A -> B)
// ============================================

async function signUp(username, email, password) {
    const startTime = Date.now();
    const cleanUser = username.trim();
    const cleanEmail = email.trim().toLowerCase();
    const userToken = generateUniqueUserToken(cleanUser);

    const payload = {
        username: cleanUser,
        email: cleanEmail,
        password: password,
        userUniqueToken: userToken,
        serverLocation: 'A',
        exp: 0,
        rank: 'E'
    };

    // Forcer Serveur A d'abord, puis basculer silencieusement sur B en cas d'erreur
    console.log('[Auth] Inscription : Tentative prioritaire sur Serveur A...');
    let res = await back4appApiCall('/users', 'POST', payload, null, 'A');

    if (res.ok) {
        const userData = {
            objectId: res.data.objectId,
            username: cleanUser,
            email: cleanEmail,
            userUniqueToken: userToken,
            serverLocation: res.server || 'A',
            exp: 0,
            rank: 'E'
        };
        currentUser = new UserSession(userData, res.data.sessionToken, res.server || 'A');
        saveUserSessionToLocal(currentUser);
        isGuestMode = false;
        localStorage.removeItem('manlore_guest_mode');
        localStorage.setItem('manlore_user_token', userToken);

        if (window.questManager) {
            window.questManager.syncFromCloud();
        }

        if (window.appLogger) {
            window.appLogger.trackNetwork('signUp', Date.now() - startTime, 200);
            window.appLogger.log('auth_success', `Compte créé avec succès sur Serveur ${res.server}`, { username: cleanUser });
        }

        return { success: true, user: currentUser, server: res.server };
    }

    const errMsg = res.data?.error || res.error || 'Erreur lors de l\'inscription';
    if (window.appLogger) {
        window.appLogger.log('auth_error', `Échec d'inscription : ${errMsg}`, { username: cleanUser });
    }
    return { success: false, error: errMsg };
}

async function logIn(usernameOrEmail, password) {
    const startTime = Date.now();
    const cleanInput = usernameOrEmail.trim();

    console.log('[Auth] Connexion : Recherche prioritaire sur Serveur A...');
    const endpoint = `/login?username=${encodeURIComponent(cleanInput)}&password=${encodeURIComponent(password)}`;

    // Forcer Serveur A en premier -> Basculement automatique sur Serveur B si non trouvé
    let res = await back4appApiCall(endpoint, 'GET', null, null, 'A');

    if (res.ok && res.data?.sessionToken) {
        const userData = {
            ...res.data,
            serverLocation: res.server || 'A'
        };

        if (!userData.userUniqueToken) {
            userData.userUniqueToken = generateUniqueUserToken(userData.username);
        }

        currentUser = new UserSession(userData, res.data.sessionToken, res.server || 'A');
        saveUserSessionToLocal(currentUser);
        isGuestMode = false;
        localStorage.removeItem('manlore_guest_mode');
        localStorage.setItem('manlore_user_token', userData.userUniqueToken);

        startAutoSync();

        if (window.questManager) {
            window.questManager.syncFromCloud();
        }

        if (window.appLogger) {
            window.appLogger.trackNetwork('logIn', Date.now() - startTime, 200);
            window.appLogger.log('auth_success', `Connexion réussie sur Serveur ${res.server}`, { username: userData.username });
        }

        return { success: true, user: currentUser, server: res.server };
    }

    const errMsg = res.data?.error || res.error || 'Identifiants invalides (compte non trouvé)';
    if (window.appLogger) {
        window.appLogger.log('auth_error', `Échec de connexion : ${errMsg}`, { input: cleanInput });
    }
    return { success: false, error: errMsg };
}

async function logOut() {
    try {
        if (currentUser && currentUser.sessionToken) {
            executeBack4AppRequest(
                BACK4APP_SERVERS[currentUser.serverLocation] || BACK4APP_SERVERS.A,
                '/logout',
                'POST',
                {},
                currentUser.sessionToken
            ).catch(() => {});
        }
        currentUser = null;
        isGuestMode = false;
        saveUserSessionToLocal(null);
        localStorage.removeItem('manlore_guest_mode');
        localStorage.removeItem('manlore_user_token');
        stopAutoSync();

        if (window.questManager) {
            window.questManager.onLogout();
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

function loginAsGuest() {
    currentUser = null;
    isGuestMode = true;
    localStorage.setItem('manlore_guest_mode', 'true');
    setStorageMode('local');
    return { success: true };
}

function getCurrentUser() {
    if (isGuestMode) return null;
    return currentUser;
}

// ============ STORAGE MODE & INSTANT LOCAL CACHE ============

function setStorageMode(mode) {
    storageMode = mode;
    localStorage.setItem('manlore_storage_mode', mode);
}

function getStorageMode() {
    return storageMode;
}

// ============================================
// CRUD AVEC RENDU INSTANTANÉ & ROW LEVEL SECURITY (RLS)
// ============================================

async function fetchAllItems() {
    const localItems = loadFromLocalStorage();

    if (storageMode === 'local' || isGuestMode || !navigator.onLine) {
        return { success: true, items: localItems, offline: true };
    }

    try {
        const cloudResult = await fetchFromCloud();
        if (cloudResult.success && cloudResult.items) {
            return cloudResult;
        }
    } catch (e) {
        console.warn('[CRUD] Cloud fetch fallback to local:', e);
    }

    return { success: true, items: localItems, offline: true };
}

async function fetchFromCloud() {
    try {
        if (!currentUser) return { success: true, items: loadFromLocalStorage(), offline: true };

        const params = new URLSearchParams();
        params.set('where', JSON.stringify({
            userId: { __type: 'Pointer', className: '_User', objectId: currentUser.id }
        }));
        params.set('order', '-createdAt');
        params.set('limit', '2000');

        const endpoint = `/classes/Items?${params.toString()}`;
        const res = await back4appApiCall(endpoint, 'GET', null, currentUser.getSessionToken(), currentUser.serverLocation);

        if (res.ok && res.data?.results) {
            const parsedItems = res.data.results.map(r => ({
                id: r.objectId,
                title: r.title || '',
                type: r.type || 'manga',
                status: r.status || 'reading',
                rating: r.rating || 0,
                genres: r.genres || [],
                link: r.link || '',
                image: r.image || '',
                imageUrl: r.imageUrl || '',
                chapters: r.chapters || 0,
                notes: r.notes || '',
                malId: r.malId || '',
                createdAt: r.createdAt || new Date().toISOString(),
                updatedAt: r.updatedAt || new Date().toISOString()
            }));

            localStorage.setItem('manlore_items', JSON.stringify(parsedItems));
            return { success: true, items: parsedItems };
        }
        return { success: true, items: loadFromLocalStorage(), offline: true };
    } catch (error) {
        console.error('[CRUD] Fetch cloud error:', error);
        return { success: true, items: loadFromLocalStorage(), offline: true };
    }
}

async function createItem(itemData) {
    if (window.questManager) {
        window.questManager.onTitleAdded();
    }

    if (storageMode === 'local' || isGuestMode || !navigator.onLine) {
        return createItemLocal(itemData);
    }
    return createItemCloud(itemData);
}

function createItemLocal(itemData) {
    try {
        const tempId = 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        const item = {
            id: tempId,
            ...itemData,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        const items = loadFromLocalStorage();
        items.unshift(item);
        localStorage.setItem('manlore_items', JSON.stringify(items));
        if (storageMode === 'cloud' && !isGuestMode && !navigator.onLine) {
            addToSyncQueue('create', itemData);
        }
        return { success: true, item, offline: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function createItemCloud(itemData) {
    try {
        if (!currentUser) throw new Error('Non connecté');

        const payload = {
            title: itemData.title,
            type: itemData.type,
            status: itemData.status,
            rating: itemData.rating || 0,
            genres: itemData.genres || [],
            link: itemData.link || '',
            image: itemData.image || '',
            imageUrl: itemData.imageUrl || '',
            chapters: itemData.chapters || 0,
            notes: itemData.notes || '',
            malId: itemData.malId || '',
            userId: { __type: 'Pointer', className: '_User', objectId: currentUser.id },
            ACL: {
                [currentUser.id]: { read: true, write: true }
            }
        };

        const res = await back4appApiCall('/classes/Items', 'POST', payload, currentUser.getSessionToken(), currentUser.serverLocation);

        if (res.ok) {
            const plain = {
                id: res.data.objectId,
                ...payload,
                createdAt: res.data.createdAt || new Date().toISOString(),
                updatedAt: res.data.createdAt || new Date().toISOString()
            };
            saveToLocalStorage(plain);
            return { success: true, item: plain };
        }
        throw new Error(res.data?.error || 'Erreur création serveur');
    } catch (error) {
        console.error('[CRUD] Create cloud error:', error);
        addToSyncQueue('create', itemData);
        return createItemLocal(itemData);
    }
}

async function updateItem(itemId, updates) {
    if (updates.chapters && window.questManager) {
        const items = loadFromLocalStorage();
        const existing = items.find(i => String(i.id) === String(itemId));
        if (existing && updates.chapters > (existing.chapters || 0)) {
            const diff = updates.chapters - (existing.chapters || 0);
            window.questManager.onChapterRead(diff);
        }
    }

    if (updates.rating && window.questManager) {
        window.questManager.onTitleRated();
    }

    updateInLocalStorage(itemId, updates);

    if (storageMode === 'local' || isGuestMode || itemId.startsWith('local_') || itemId.startsWith('temp_')) {
        if (!isGuestMode && !itemId.startsWith('local_')) addToSyncQueue('create', { ...updates });
        return { success: true, offline: true };
    }

    if (!navigator.onLine) {
        addToSyncQueue('update', { id: itemId, ...updates });
        return { success: true, offline: true };
    }

    try {
        const res = await back4appApiCall(
            `/classes/Items/${itemId}`,
            'PUT',
            updates,
            currentUser?.getSessionToken(),
            currentUser?.serverLocation
        );
        return { success: res.ok };
    } catch (error) {
        console.error('[CRUD] Update cloud error:', error);
        addToSyncQueue('update', { id: itemId, ...updates });
        return { success: true, offline: true };
    }
}

async function deleteItem(itemId) {
    if (window.questManager) {
        window.questManager.onTitleDeleted();
    }

    deleteFromLocalStorage(itemId);

    if (storageMode === 'local' || isGuestMode || itemId.startsWith('local_') || itemId.startsWith('temp_')) {
        return { success: true, offline: true };
    }

    if (!navigator.onLine) {
        addToSyncQueue('delete', { id: itemId });
        return { success: true, offline: true };
    }

    try {
        const res = await back4appApiCall(
            `/classes/Items/${itemId}`,
            'DELETE',
            null,
            currentUser?.getSessionToken(),
            currentUser?.serverLocation
        );
        return { success: res.ok };
    } catch (error) {
        console.error('[CRUD] Delete cloud error:', error);
        addToSyncQueue('delete', { id: itemId });
        return { success: true, offline: true };
    }
}

// ============ GESTION DU STOCKAGE LOCAL ============

function loadFromLocalStorage() {
    try {
        const data = localStorage.getItem('manlore_items');
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

function saveToLocalStorage(item) {
    const items = loadFromLocalStorage();
    const index = items.findIndex(i => String(i.id) === String(item.id));
    if (index >= 0) {
        items[index] = item;
    } else {
        items.unshift(item);
    }
    localStorage.setItem('manlore_items', JSON.stringify(items));
}

function updateInLocalStorage(itemId, updates) {
    const items = loadFromLocalStorage();
    const index = items.findIndex(i => String(i.id) === String(itemId));
    if (index >= 0) {
        items[index] = { ...items[index], ...updates, updatedAt: new Date().toISOString() };
        localStorage.setItem('manlore_items', JSON.stringify(items));
    }
}

function deleteFromLocalStorage(itemId) {
    const items = loadFromLocalStorage();
    const filtered = items.filter(i => String(i.id) !== String(itemId));
    localStorage.setItem('manlore_items', JSON.stringify(filtered));
}

// ============ FILE D'ATTENTE DE SYNCHRONISATION HORS-LIGNE ============

function loadSyncQueue() {
    try {
        const data = localStorage.getItem('manlore_sync_queue');
        syncQueue = data ? JSON.parse(data) : [];
    } catch (e) {
        syncQueue = [];
    }
}

function saveSyncQueue() {
    localStorage.setItem('manlore_sync_queue', JSON.stringify(syncQueue));
}

function addToSyncQueue(action, data) {
    syncQueue.push({ action, data, timestamp: Date.now() });
    saveSyncQueue();
}

async function processSyncQueue() {
    if (syncQueue.length === 0 || !navigator.onLine || isGuestMode || !currentUser) return;

    const queue = [...syncQueue];
    syncQueue = [];
    saveSyncQueue();

    for (const item of queue) {
        try {
            if (item.action === 'create') await createItemCloud(item.data);
            else if (item.action === 'update') await updateItem(item.data.id, item.data);
            else if (item.action === 'delete') await deleteItem(item.data.id);
        } catch (e) {
            console.warn('[Sync] Échec tâche différée:', e);
            syncQueue.push(item);
        }
    }
    saveSyncQueue();
}

function startAutoSync() {
    if (autoSyncInterval) clearInterval(autoSyncInterval);
    autoSyncInterval = setInterval(() => {
        if (navigator.onLine && !isGuestMode) {
            processSyncQueue();
        }
    }, 15000);
}

function stopAutoSync() {
    if (autoSyncInterval) {
        clearInterval(autoSyncInterval);
        autoSyncInterval = null;
    }
}

function updateOnlineStatus(online) {
    isOnline = online;
    if (online) {
        processSyncQueue();
    }
}

window.addEventListener('online', () => updateOnlineStatus(true));
window.addEventListener('offline', () => updateOnlineStatus(false));

console.log('[Logic v5.0.1] Resilient REST Client & Dual-Server Router loaded');
