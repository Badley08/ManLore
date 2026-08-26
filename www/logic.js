/* ============================================
   MANLORE v5.0.1 - LOGIC.JS
   Clean Dedicated Server Architecture (Server A)
   Universal Multi-App Export & Archive (com.karlitodev.manlore/exported)
   Diagnostic Logs Storage (com.karlitodev.manlore/logs)
   Instant Stale-While-Revalidate, Row Level Security (RLS) & Offline Sync
   ============================================ */

'use strict';

// ============ BACK4APP CONFIGURATION (SERVEUR OFFICIEL) ============
const BACK4APP_CONFIG = {
    name: 'Serveur ManLore Cloud',
    appId: 'vnaPY79T1WzfEYp84Mve2PAoHbexPaATo43qickr',
    clientKey: '0Y9zcO1XB1hAkVKWa72TIamjPR1pnwuw8IsG6TLj',
    url: 'https://parseapi.back4app.com'
};

let currentUser = null;
let syncQueue = [];
let isOnline = navigator.onLine;
let autoSyncInterval = null;
let isGuestMode = false;
let storageMode = 'cloud'; // 'local' | 'cloud'

// ============================================
// CLIENT REST HTTP BACK4APP ULTRA-RÉSILIENT
// ============================================

async function back4appApiCall(endpoint, method = 'GET', data = null, sessionToken = null) {
    const url = BACK4APP_CONFIG.url + endpoint;
    const headers = {
        'X-Parse-Application-Id': BACK4APP_CONFIG.appId,
        'X-Parse-REST-API-Key': BACK4APP_CONFIG.clientKey,
        'X-Parse-Client-Key': BACK4APP_CONFIG.clientKey,
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
            data: json
        };
    } catch (err) {
        clearTimeout(timeoutId);
        return {
            ok: false,
            status: 0,
            error: err.name === 'AbortError' ? 'Délai d\'attente dépassé (timeout 10s)' : err.message
        };
    }
}

// ============================================
// MODÈLE UTILISATEUR COMPATIBLE (PARSE USER INTERFACE)
// ============================================

class UserSession {
    constructor(userData, sessionToken) {
        this.id = userData.objectId || userData.id;
        this.objectId = this.id;
        this.sessionToken = sessionToken || userData.sessionToken;
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

        const res = await back4appApiCall(
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
        const res = await back4appApiCall(
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
        attributes: userSession._attributes
    }));
}

function loadUserSessionFromLocal() {
    try {
        const raw = localStorage.getItem('manlore_user_session');
        if (raw) {
            const parsed = JSON.parse(raw);
            return new UserSession(parsed.attributes || {}, parsed.sessionToken);
        }
    } catch {}
    return null;
}

// ============================================
// COMPATIBILITÉ SDK PARSE GLOBAL
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
    console.log('[Backend] Initialisation v5.0.1 (Serveur Cloud ManLore)...');

    storageMode = localStorage.getItem('manlore_storage_mode') || 'cloud';
    isGuestMode = localStorage.getItem('manlore_guest_mode') === 'true';

    loadSyncQueue();
    updateOnlineStatus(navigator.onLine);

    if (!isGuestMode) {
        const savedUser = loadUserSessionFromLocal();
        if (savedUser && savedUser.sessionToken) {
            currentUser = savedUser;
            startAutoSync();

            setTimeout(async () => {
                try {
                    await currentUser.fetch();
                    if (window.questManager) {
                        window.questManager.syncFromCloud();
                    }
                } catch {
                    console.warn('[Backend] Session token à renouveler');
                }
            }, 1000);
        }
    }
}

// ============================================
// AUTHENTIFICATION HAUTE FIABILITÉ
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
        exp: 0,
        rank: 'E'
    };

    console.log('[Auth] Inscription sur le serveur Cloud...');
    const res = await back4appApiCall('/users', 'POST', payload);

    if (res.ok) {
        const userData = {
            objectId: res.data.objectId,
            username: cleanUser,
            email: cleanEmail,
            userUniqueToken: userToken,
            exp: 0,
            rank: 'E'
        };
        currentUser = new UserSession(userData, res.data.sessionToken);
        saveUserSessionToLocal(currentUser);
        isGuestMode = false;
        localStorage.removeItem('manlore_guest_mode');
        localStorage.setItem('manlore_user_token', userToken);

        if (window.questManager) {
            window.questManager.syncFromCloud();
        }

        if (window.appLogger) {
            window.appLogger.trackNetwork('signUp', Date.now() - startTime, 200);
            window.appLogger.log('auth_success', 'Compte créé avec succès', { username: cleanUser });
        }

        return { success: true, user: currentUser };
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

    console.log('[Auth] Connexion au compte...');
    const endpoint = `/login?username=${encodeURIComponent(cleanInput)}&password=${encodeURIComponent(password)}`;

    const res = await back4appApiCall(endpoint, 'GET');

    if (res.ok && res.data?.sessionToken) {
        const userData = { ...res.data };

        if (!userData.userUniqueToken) {
            userData.userUniqueToken = generateUniqueUserToken(userData.username);
        }

        currentUser = new UserSession(userData, res.data.sessionToken);
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
            window.appLogger.log('auth_success', 'Connexion réussie', { username: userData.username });
        }

        return { success: true, user: currentUser };
    }

    const errMsg = res.data?.error || res.error || 'Identifiants invalides';
    if (window.appLogger) {
        window.appLogger.log('auth_error', `Échec de connexion : ${errMsg}`, { input: cleanInput });
    }
    return { success: false, error: errMsg };
}

async function logOut() {
    try {
        if (currentUser && currentUser.sessionToken) {
            back4appApiCall('/logout', 'POST', {}, currentUser.sessionToken).catch(() => {});
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
        const res = await back4appApiCall(endpoint, 'GET', null, currentUser.getSessionToken());

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

        const res = await back4appApiCall('/classes/Items', 'POST', payload, currentUser.getSessionToken());

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
            currentUser?.getSessionToken()
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
            currentUser?.getSessionToken()
        );
        return { success: res.ok };
    } catch (error) {
        console.error('[CRUD] Delete cloud error:', error);
        addToSyncQueue('delete', { id: itemId });
        return { success: true, offline: true };
    }
}

// ============================================
// EXPORT / IMPORT UNIVERSEL MULTI-APPLICATIONS
// (WhatsApp, Telegram, Google Drive, ZArchiver, etc.)
// Sauvegarde locale archivée dans : com.karlitodev.manlore/exported
// ============================================

async function exportData(items, filename) {
    try {
        const date = new Date().toISOString().split('T')[0];
        const finalFilename = filename || `manlore_export_${date}.json`;

        // 1. Structure de sauvegarde complète et enrichie
        const exportPayload = {
            app: 'ManLore',
            version: '5.0.1',
            package: 'com.karlitodev.manlore',
            exportedAt: new Date().toISOString(),
            itemsCount: items ? items.length : 0,
            progression: window.questManager?.data || null,
            items: items || []
        };

        const jsonString = JSON.stringify(exportPayload, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });

        // 2. Archivage automatique dans com.karlitodev.manlore/exported
        const EXPORT_STORAGE_KEY = 'com.karlitodev.manlore/exported';
        let archiveList = [];
        try {
            const rawArchive = localStorage.getItem(EXPORT_STORAGE_KEY);
            if (rawArchive) archiveList = JSON.parse(rawArchive);
        } catch {}

        archiveList.unshift({
            filename: finalFilename,
            timestamp: new Date().toISOString(),
            itemsCount: exportPayload.itemsCount,
            data: exportPayload
        });

        // Conserver les 15 dernières sauvegardes locales
        if (archiveList.length > 15) archiveList = archiveList.slice(0, 15);
        localStorage.setItem(EXPORT_STORAGE_KEY, JSON.stringify(archiveList));
        console.log(`[Export] Copie archivée avec succès dans : ${EXPORT_STORAGE_KEY}`);

        // 3. Partage universel natif (Web Share API pour WhatsApp, Drive, Telegram, ZArchiver, etc.)
        let sharedViaSheet = false;
        try {
            const file = new File([blob], finalFilename, { type: 'application/json' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    title: 'Sauvegarde ManLore',
                    text: `Exportation de votre collection ManLore (${exportPayload.itemsCount} titres)`,
                    files: [file]
                });
                sharedViaSheet = true;
            }
        } catch (shareErr) {
            console.log('[Export] Note partage direct:', shareErr.message);
        }

        // 4. Téléchargement direct (Fallback pour navigateurs de bureau & Webviews)
        if (!sharedViaSheet) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = finalFilename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }

        if (window.appLogger) {
            window.appLogger.log('data_export', 'Exportation des données réussie', {
                filename: finalFilename,
                itemsCount: exportPayload.itemsCount,
                archiveKey: EXPORT_STORAGE_KEY
            });
        }

        return {
            success: true,
            filename: finalFilename,
            archiveLocation: 'com.karlitodev.manlore/exported',
            sharedViaSheet
        };
    } catch (e) {
        console.error('[Export Error]', e);
        return { success: false, error: e.message };
    }
}

async function importDataFromFile(file) {
    try {
        const text = await file.text();
        const parsed = JSON.parse(text);

        let items = [];
        if (Array.isArray(parsed)) {
            items = parsed;
        } else if (parsed && Array.isArray(parsed.items)) {
            items = parsed.items;
            if (parsed.progression && window.questManager) {
                // Restauration facultative de la progression si présente
                window.questManager.data.exp = Math.max(window.questManager.data.exp || 0, parsed.progression.exp || 0);
                window.questManager.saveProgression(true);
            }
        } else {
            return { success: false, count: 0, error: 'Format invalide' };
        }

        return { success: true, count: items.length, items };
    } catch (e) {
        return { success: false, count: 0, error: e.message };
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

console.log('[Logic v5.0.1] Dedicated Cloud Engine & Universal Exporter loaded');
