/* ============================================
   MANLORE v10.0.0 - LOGIC.JS
   Clean Dedicated Server Architecture (Server B — Fresh)
   Universal Multi-App Export & Archive (com.karlitodev.manlore/exported)
   Instant Stale-While-Revalidate, Row Level Security (RLS) & Offline Sync
   ============================================ */

'use strict';

// ============ SERVEUR OFFICIEL MANLORE CLOUD ============
const BACK4APP_CONFIG = {
    name: 'Serveur ManLore Cloud',
    appId: 'OH5yq9tgEzqkn2TNoegJlF6XVLuzEMH6vKwYg5qu',
    clientKey: 'WPvwJkRsmofv2u480N2f2c2wluTh5zGyBIhkc4dP',
    restApiKey: 'acTOYDhGPdosi5nHVEVuNI7OcO225MId72dJaiIq',
    webhookKey: 'Z6dJFJ9Ul7LCV1fqQID1e7PucuiYVEl8fcyXSzwC',
    filekey: '195026e1-cce2-4e64-a376-f1a923b87e37',
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
        'X-Parse-REST-API-Key': BACK4APP_CONFIG.restApiKey,
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

// Initialisation immédiate de la session utilisateur
currentUser = loadUserSessionFromLocal();

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
class ParseObject {
    constructor(className = 'Items') {
        this.className = className;
        this._attributes = {};
    }
    set(k, v) { this._attributes[k] = v; }
    get(k) { return this._attributes[k]; }
    setACL(acl) { this._attributes.ACL = acl; }
    increment(field, amount = 1) {
        this._attributes[field] = (this._attributes[field] || 0) + amount;
    }
    async save() {
        const res = await back4appApiCall(
            `/classes/${this.className}`,
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
    }
    static extend(className) {
        return class extends ParseObject {
            constructor() {
                super(className);
            }
        };
    }
    static async saveAll(objects) {
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
}
window.Parse.Object = ParseObject;
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

/* ============================================
   MANLORE v7.0.0 - LOGIC.JS
   Data Layer & CRUD Management
   ============================================ */

function generateUniqueUserToken(username) {
    const randomPart = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    const timePart = Date.now().toString(36);
    const cleanUser = (username || 'user').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().substring(0, 8);
    return `ML_${cleanUser}_${timePart}_${randomPart}`;
}

async function initializeBackend() {
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

        return { success: true, user: currentUser };
    }

    const errMsg = res.data?.error || res.error || 'Erreur lors de l\'inscription';
    return { success: false, error: errMsg };
}

async function logIn(usernameOrEmail, password) {
    const cleanInput = usernameOrEmail.trim();

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

        return { success: true, user: currentUser };
    }

    const errMsg = res.data?.error || res.error || 'Identifiants invalides';
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

async function saveUserSettingsToCloud(key, value) {
    if (!currentUser || !currentUser.sessionToken || !isOnline) return;
    try {
        const payload = {};
        if (key === 'theme') payload.preferredTheme = value;
        if (key === 'language') payload.preferredLanguage = value;
        
        await back4appApiCall(`/users/${currentUser.id}`, 'PUT', payload, currentUser.sessionToken);
    } catch {}
}

// ============ GESTION DE LA PHOTO DE PROFIL (BASE64) ============

function getUserAvatar() {
    if (currentUser && currentUser.get('avatarBase64')) {
        return currentUser.get('avatarBase64');
    }
    return localStorage.getItem('manlore_user_avatar') || '';
}

async function updateUserProfileAvatar(base64Data) {
    try {
        localStorage.setItem('manlore_user_avatar', base64Data || '');
        if (currentUser) {
            currentUser.set('avatarBase64', base64Data || '');
            saveUserSessionToLocal(currentUser);

            if (navigator.onLine && currentUser.sessionToken) {
                const endpoint = `/users/${currentUser.id}`;
                const res = await back4appApiCall(
                    endpoint,
                    'PUT',
                    { avatarBase64: base64Data || '' },
                    currentUser.getSessionToken()
                );
            }
        }
        return { success: true, avatar: base64Data };
    } catch (e) {
        console.error('[Avatar Error]', e);
        return { success: false, error: e.message };
    }
}

async function deleteUserProfileAvatar() {
    return await updateUserProfileAvatar('');
}

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
                createdAt: r.originalCreatedAt || r.createdAt || new Date().toISOString(),
                updatedAt: r.updatedAt || new Date().toISOString()
            }));

            localStorage.setItem(getUserItemsStorageKey(), JSON.stringify(parsedItems));
            return { success: true, items: parsedItems };
        }
        return { success: true, items: loadFromLocalStorage(), offline: true };
    } catch (error) {
        console.error('[CRUD] Fetch cloud error:', error);
        return { success: true, items: loadFromLocalStorage(), offline: true };
    }
}

// ============ DUPLICATE DETECTION & MERGING (CASE-INSENSITIVE a = A) ============
function normalizeTitle(t) {
    if (!t) return '';
    return String(t)
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s]/gi, '')
        .replace(/\s+/g, ' ');
}

async function autoRemoveDuplicates(items) {
    if (!items || items.length === 0) return items;
    const grouped = {};
    const toDelete = [];
    const keptItems = [];

    // Group by normalized title
    for (const item of items) {
        const norm = normalizeTitle(item.title);
        if (!norm) {
            keptItems.push(item);
            continue;
        }
        if (!grouped[norm]) {
            grouped[norm] = [];
        }
        grouped[norm].push(item);
    }

    // Process groups
    for (const norm in grouped) {
        const group = grouped[norm];
        if (group.length === 1) {
            keptItems.push(group[0]);
        } else {
            // Sort by chapters descending, then updated/createdAt descending to keep the most recent/advanced one
            group.sort((a, b) => {
                const chapDiff = (b.chapters || 0) - (a.chapters || 0);
                if (chapDiff !== 0) return chapDiff;
                const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
                const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
                return dateB - dateA;
            });

            // Keep the first one, mark others for deletion
            const kept = group[0];
            keptItems.push(kept);
            for (let i = 1; i < group.length; i++) {
                toDelete.push(group[i]);
            }
        }
    }

    // Perform deletions
    if (toDelete.length > 0) {
        for (const item of toDelete) {
            try {
                await deleteItem(item.id || item.objectId);
            } catch {}
        }
        if (window.showToast) {
            window.showToast(`${toDelete.length} doublons supprimés automatiquement.`, 'info');
        }
    }

    return keptItems;
}
window.normalizeTitle = normalizeTitle;

async function deduplicateCollection() {
    const items = loadFromLocalStorage();
    const map = new Map();
    const toDelete = [];
    let mergedCount = 0;

    for (const item of items) {
        const norm = normalizeTitle(item.title);
        if (!norm) continue;

        if (map.has(norm)) {
            const existing = map.get(norm);
            // Merge into existing
            const highestChapters = Math.max(existing.chapters || 0, item.chapters || 0);
            const bestRating = Math.max(existing.rating || 0, item.rating || 0);
            const bestImage = existing.image || existing.imageUrl || item.image || item.imageUrl || '';
            const mergedNotes = (item.notes && item.notes.length > (existing.notes || '').length) ? item.notes : existing.notes;
            const mergedGenres = Array.from(new Set([...(existing.genres || []), ...(item.genres || [])]));
            const oldestDate = (existing.createdAt && item.createdAt && new Date(item.createdAt) < new Date(existing.createdAt)) ? item.createdAt : existing.createdAt;

            existing.chapters = highestChapters;
            existing.rating = bestRating;
            existing.image = bestImage;
            existing.imageUrl = bestImage;
            existing.notes = mergedNotes;
            existing.genres = mergedGenres;
            existing.createdAt = oldestDate;

            toDelete.push(item.id);
            mergedCount++;
        } else {
            map.set(norm, { ...item });
        }
    }

    if (mergedCount > 0) {
        // Save cleaned items
        const cleanList = Array.from(map.values());
        localStorage.setItem('manlore_items', JSON.stringify(cleanList));

        // Delete cloud duplicates
        for (const id of toDelete) {
            try {
                if (currentUser && !String(id).startsWith('local_')) {
                    await back4appApiCall(`/classes/Items/${id}`, 'DELETE', null, currentUser.getSessionToken());
                }
            } catch (e) {

            }
        }

        // Update keepers on cloud
        for (const item of cleanList) {
            try {
                if (currentUser && !String(item.id).startsWith('local_')) {
                    await updateItem(item.id, item);
                }
            } catch (e) {}
        }


        if (window.showToast) {
            window.showToast(`✨ Nettoyage : ${mergedCount} doublon(s) fusionné(s) sans perte de données`, 'success');
        }
    }

    return { mergedCount, totalRemaining: map.size };
}
window.deduplicateCollection = deduplicateCollection;

// ============================================
// PUSH NOTIFICATIONS & RAPPELS PROACTIFS
// ============================================
async function requestPushPermissions() {
    try {
        if ('Notification' in window) {
            const perm = await Notification.requestPermission();
            if (perm === 'granted') {
                if (window.showToast) window.showToast('🔔 Notifications activées', 'success');
                return true;
            }
        }
    } catch (e) {

    }
    return false;
}
window.requestPushPermissions = requestPushPermissions;

function sendPushNotification(title, body, tag = 'manlore-alert') {
    try {
        if ('Notification' in window && Notification.permission === 'granted') {
            if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
                navigator.serviceWorker.controller.postMessage({
                    type: 'SHOW_NOTIFICATION',
                    title: title || 'ManLore',
                    body: body || '',
                    tag: tag
                });
                return;
            }
            new Notification(title || 'ManLore', {
                body: body || '',
                icon: 'manlore-logo-192.png',
                tag: tag
            });
        }
    } catch (e) {

    }
}
window.sendPushNotification = sendPushNotification;

async function createItem(itemData) {
    if (!itemData || !itemData.title) return { success: false, error: 'Titre manquant' };

    // --- VÉRIFICATION ANTI-DUPLICATION AVEC FUSION INTELLIGENTE ---
    const normNew = normalizeTitle(itemData.title);
    const existingList = typeof allItems !== 'undefined' && allItems.length > 0 ? allItems : loadFromLocalStorage();
    const existing = existingList.find(i => normalizeTitle(i.title) === normNew);

    if (existing) {
        const oldChapters = existing.chapters || 0;
        const incomingChapters = typeof itemData.chapters === 'number' ? itemData.chapters : (parseInt(itemData.chapters, 10) || 0);
        const maxChapters = Math.max(oldChapters, incomingChapters);
        const chaptersDiff = maxChapters - oldChapters;

        const mergedUpdates = {
            chapters: maxChapters,
            rating: itemData.rating || existing.rating || 0,
            status: itemData.status || existing.status,
            genres: Array.from(new Set([...(existing.genres || []), ...(itemData.genres || [])])),
            image: itemData.image || itemData.imageUrl || existing.image || existing.imageUrl || '',
            imageUrl: itemData.imageUrl || itemData.image || existing.imageUrl || existing.image || '',
            link: itemData.link || existing.link || '',
            notes: (itemData.notes && itemData.notes.length > (existing.notes || '').length) ? itemData.notes : (existing.notes || ''),
            malId: itemData.malId || existing.malId || '',
            updatedAt: new Date().toISOString()
        };

        await updateItem(existing.id, mergedUpdates);

        if (chaptersDiff > 0 && window.questManager) {
            window.questManager.onChapterRead(chaptersDiff);
        }

        const mergedItem = { ...existing, ...mergedUpdates };
        const idx = existingList.findIndex(i => String(i.id) === String(existing.id));
        if (idx !== -1) existingList[idx] = mergedItem;

        return { 
            success: true, 
            item: mergedItem, 
            isDuplicateMerged: true, 
            oldChapters, 
            newChapters: maxChapters,
            message: `Titre existant détecté : chapitres mis à jour (${oldChapters} → ${maxChapters})`
        };
    }

    // Si nouveau titre unique
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
        const tempId = itemData.id || ('local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6));
        const item = {
            ...itemData,
            id: tempId,
            createdAt: itemData.createdAt || new Date().toISOString(),
            updatedAt: itemData.updatedAt || new Date().toISOString()
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
            type: itemData.type || 'Manga',
            status: itemData.status || 'En cours',
            rating: itemData.rating || 0,
            genres: itemData.genres || [],
            link: itemData.link || '',
            image: itemData.image || itemData.imageUrl || '',
            imageUrl: itemData.imageUrl || itemData.image || '',
            chapters: itemData.chapters || 0,
            notes: itemData.notes || '',
            malId: itemData.malId || '',
            originalCreatedAt: itemData.createdAt || null,
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
                createdAt: itemData.createdAt || res.data.createdAt || new Date().toISOString(),
                updatedAt: itemData.updatedAt || res.data.createdAt || new Date().toISOString()
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

// ============ HELPER DE CONVERSION ============
function parseItemToObject(item) {
    if (!item) return null;
    if (typeof item.get !== 'function') return item;
    const originalCreated = item.get('originalCreatedAt');
    return {
        id: item.id || item.objectId,
        title: item.get('title') || '',
        type: item.get('type') || 'manga',
        status: item.get('status') || 'reading',
        rating: item.get('rating') || 0,
        genres: item.get('genres') || [],
        link: item.get('link') || '',
        image: item.get('image') || '',
        imageUrl: item.get('imageUrl') || '',
        chapters: item.get('chapters') || 0,
        notes: item.get('notes') || '',
        malId: item.get('malId') || '',
        createdAt: originalCreated || (item.createdAt ? (typeof item.createdAt.toISOString === 'function' ? item.createdAt.toISOString() : item.createdAt) : new Date().toISOString()),
        updatedAt: item.updatedAt ? (typeof item.updatedAt.toISOString === 'function' ? item.updatedAt.toISOString() : item.updatedAt) : new Date().toISOString()
    };
}
window.parseItemToObject = parseItemToObject;


// ============================================
// EXPORT / IMPORT UNIVERSEL MULTI-APPLICATIONS
// (WhatsApp, Telegram, Google Drive, ZArchiver, etc.)
// Sauvegarde locale archivée dans : com.karlitodev.manlore/exported
// ============================================
// FORMATS DE SÉRIALISATION ULTRA-OPTIMISÉS (TOON & STRICT JSON)
// ============================================

// Échappement pour le format TOON
function escapeToonField(val) {
    if (val === null || val === undefined) return '';
    return String(val)
        .replace(/\\/g, '\\\\')
        .replace(/\|/g, '\\|')
        .replace(/\r?\n/g, '\\n');
}

function unescapeToonField(val) {
    if (!val) return '';
    return String(val)
        .replace(/\\n/g, '\n')
        .replace(/\\\|/g, '|')
        .replace(/\\\\/g, '\\');
}

// 1. SÉRIALISATION TOON (Token-Optimized Object Notation)
function serializeToToon(payload) {
    const lines = [];
    lines.push('#TOON:MANLORE:v10');
    lines.push('@META');
    lines.push(`app=${escapeToonField(payload.app || 'ManLore')}`);
    lines.push(`version=${escapeToonField(payload.version || '10.0.0')}`);
    lines.push(`userRank=${escapeToonField(payload.userRank || 'F-Rank')}`);
    lines.push(`userEmail=${escapeToonField(payload.userEmail || 'anonyme')}`);
    lines.push(`exportedAt=${escapeToonField(payload.exportedAt || new Date().toISOString())}`);
    lines.push(`exp=${payload.progression?.exp || 0}`);
    lines.push(`itemsCount=${payload.items?.length || 0}`);

    lines.push('@SCHEMA');
    lines.push('id|title|type|status|rating|chapters|genres|link|image|notes|malId');

    lines.push('@ITEMS');
    if (Array.isArray(payload.items)) {
        for (const it of payload.items) {
            const genresStr = Array.isArray(it.genres) ? it.genres.join(',') : (it.genres || '');
            const row = [
                escapeToonField(it.id || it.objectId || ''),
                escapeToonField(it.title || ''),
                escapeToonField(it.type || 'Manga'),
                escapeToonField(it.status || 'En cours'),
                escapeToonField(it.rating ?? 0),
                escapeToonField(it.chapters ?? 0),
                escapeToonField(genresStr),
                escapeToonField(it.link || ''),
                escapeToonField(it.image || it.imageUrl || ''),
                escapeToonField(it.notes || ''),
                escapeToonField(it.malId || '')
            ].join('|');
            lines.push(row);
        }
    }
    lines.push('#END');
    return lines.join('\n');
}

// DÉCODEUR TOON
function parseToon(toonStr) {
    const lines = toonStr.split(/\r?\n/);
    let section = null;
    const meta = {};
    const items = [];

    for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith('#')) {
            if (line === '#END') break;
            continue;
        }

        if (line.startsWith('@')) {
            section = line.substring(1);
            continue;
        }

        if (section === 'META') {
            const eqIdx = line.indexOf('=');
            if (eqIdx !== -1) {
                const key = line.substring(0, eqIdx).trim();
                const val = unescapeToonField(line.substring(eqIdx + 1).trim());
                meta[key] = val;
            }
        } else if (section === 'ITEMS') {
            // Découpage en respectant les \| échappés
            const tokens = [];
            let curr = '';
            let escaped = false;
            for (let i = 0; i < line.length; i++) {
                const ch = line[i];
                if (escaped) {
                    curr += ch;
                    escaped = false;
                } else if (ch === '\\') {
                    escaped = true;
                    curr += ch;
                } else if (ch === '|') {
                    tokens.push(unescapeToonField(curr));
                    curr = '';
                } else {
                    curr += ch;
                }
            }
            tokens.push(unescapeToonField(curr));

            const [id, title, type, status, rating, chapters, genres, link, image, notes, malId] = tokens;
            if (title || id) {
                items.push({
                    id: id || ('import_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)),
                    title: title || 'Sans titre',
                    type: type || 'Manga',
                    status: status || 'En cours',
                    rating: parseFloat(rating) || 0,
                    chapters: parseInt(chapters, 10) || 0,
                    genres: genres ? genres.split(',').map(g => g.trim()).filter(Boolean) : [],
                    link: link || '',
                    image: image || '',
                    imageUrl: image || '',
                    notes: notes || '',
                    malId: malId || ''
                });
            }
        }
    }

    return {
        app: meta.app || 'ManLore',
        version: meta.version || '10.0.0',
        userRank: meta.userRank || 'F-Rank',
        userEmail: meta.userEmail || 'anonyme',
        progression: meta.exp ? { exp: parseInt(meta.exp, 10) || 0 } : null,
        items
    };
}

// 2. SÉRIALISATION JSON STRICT (Ultra-minimaliste / Compact)
function serializeToStrictJson(payload) {
    const compactItems = (payload.items || []).map(it => [
        it.id || it.objectId || '',
        it.title || '',
        it.type || 'Manga',
        it.status || 'En cours',
        typeof it.rating === 'number' ? it.rating : (parseFloat(it.rating) || 0),
        typeof it.chapters === 'number' ? it.chapters : (parseInt(it.chapters, 10) || 0),
        Array.isArray(it.genres) ? it.genres : [],
        it.link || '',
        it.image || it.imageUrl || '',
        it.notes || '',
        it.malId || ''
    ]);

    const strictObj = {
        $t: 'ML_STRICT',
        v: payload.version || '10.0.0',
        r: payload.userRank || 'F-Rank',
        e: payload.userEmail || 'anonyme',
        d: payload.exportedAt || new Date().toISOString(),
        x: payload.progression?.exp || 0,
        s: ['id','title','type','status','rating','chapters','genres','link','image','notes','malId'],
        i: compactItems
    };

    return JSON.stringify(strictObj);
}

// DÉCODEUR JSON STRICT
function parseStrictJson(obj) {
    const items = (obj.i || []).map(row => ({
        id: row[0] || ('import_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)),
        title: row[1] || 'Sans titre',
        type: row[2] || 'Manga',
        status: row[3] || 'En cours',
        rating: typeof row[4] === 'number' ? row[4] : (parseFloat(row[4]) || 0),
        chapters: typeof row[5] === 'number' ? row[5] : (parseInt(row[5], 10) || 0),
        genres: Array.isArray(row[6]) ? row[6] : (row[6] ? String(row[6]).split(',') : []),
        link: row[7] || '',
        image: row[8] || '',
        imageUrl: row[8] || '',
        notes: row[9] || '',
        malId: row[10] || ''
    }));

    return {
        app: 'ManLore',
        version: obj.v || '10.0.0',
        userRank: obj.r || 'F-Rank',
        userEmail: obj.e || 'anonyme',
        progression: obj.x !== undefined ? { exp: parseInt(obj.x, 10) || 0 } : null,
        items
    };
}

// ============================================
// EXPORTATION UNIVERSELLE MULTI-FORMATS
// ============================================

async function exportData(items, filename, format = 'toon') {
    try {
        const date = new Date().toISOString().split('T')[0];
        const userRank = window.questManager?.getCurrentRank?.()?.name || window.questManager?.data?.rank || 'F-Rank';
        const userEmail = (currentUser && currentUser.email) || 
                          (currentUser && currentUser.username && currentUser.username.includes('@') ? currentUser.username : (currentUser?.username || 'anonyme'));

        const exportPayload = {
            app: 'ManLore',
            version: '10.0.0',
            package: 'com.karlitodev.manlore',
            exportedAt: new Date().toISOString(),
            userRank: userRank,
            userEmail: userEmail,
            format: format,
            itemsCount: items ? items.length : 0,
            progression: window.questManager?.data || null,
            items: items || []
        };

        let fileContent = '';
        let mimeType = 'application/json';
        let defaultExt = '.json';

        if (format === 'toon') {
            fileContent = serializeToToon(exportPayload);
            mimeType = 'text/plain';
            defaultExt = '.toon';
        } else if (format === 'strict') {
            fileContent = serializeToStrictJson(exportPayload);
            mimeType = 'application/json';
            defaultExt = '.min.json';
        } else {
            // 'pure' JSON
            fileContent = JSON.stringify(exportPayload, null, 2);
            mimeType = 'application/json';
            defaultExt = '.json';
        }

        let baseName = filename ? filename.replace(/\.(json|toon|min\.json)$/i, '') : `manlore_export_${date}`;
        let finalFilename = baseName + defaultExt;

        const blob = new Blob([fileContent], { type: mimeType });

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
            userRank: userRank,
            userEmail: userEmail,
            format: format,
            itemsCount: exportPayload.itemsCount,
            data: exportPayload
        });

        if (archiveList.length > 15) archiveList = archiveList.slice(0, 15);
        localStorage.setItem(EXPORT_STORAGE_KEY, JSON.stringify(archiveList));

        // 3. Téléchargement direct universel Web (HTML5 Blob Download)
        let downloaded = false;
        try {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = finalFilename;
            a.setAttribute('download', finalFilename);
            document.body.appendChild(a);
            a.click();
            setTimeout(() => {
                try {
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                } catch {}
            }, 1500);
            downloaded = true;
        } catch (dlErr) {
            console.warn('[Web Export Download]', dlErr);
        }

        // 4. Partage Mobile Web Share API optionnel si disponible sur mobile
        let sharedViaSheet = false;
        if (navigator.share && /android|iphone|ipad|mobile/i.test(navigator.userAgent || '')) {
            try {
                const file = new File([blob], finalFilename, { type: mimeType });
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        title: 'Sauvegarde ManLore',
                        text: `Exportation ManLore (${format.toUpperCase()} - ${exportPayload.itemsCount} titres - Rang: ${userRank})`,
                        files: [file]
                    });
                    sharedViaSheet = true;
                }
            } catch (shareErr) {
                // Annulation utilisateur ou non-support du partage de fichier
            }
        }

        return {
            success: true,
            filename: finalFilename,
            format,
            archiveLocation: 'com.karlitodev.manlore/exported',
            userRank,
            userEmail,
            sharedViaSheet
        };
    } catch (e) {
        console.error('[Export Error]', e);
        return { success: false, error: e.message };
    }
}

// ============================================
// IMPORTATION UNIVERSELLE (AUTO-DÉTECTION TOON / STRICT / PUR)
// ============================================

async function importDataFromFile(file) {
    try {
        const text = await file.text();
        let parsedPayload = null;

        // Auto-détection du format
        if (text.trim().startsWith('#TOON')) {
            parsedPayload = parseToon(text);
        } else {
            try {
                const jsonObj = JSON.parse(text);
                if (jsonObj && jsonObj.$t === 'ML_STRICT') {
                    parsedPayload = parseStrictJson(jsonObj);
                } else if (Array.isArray(jsonObj)) {
                    parsedPayload = { items: jsonObj };
                } else if (jsonObj && Array.isArray(jsonObj.items)) {
                    parsedPayload = jsonObj;
                } else {
                    return { success: false, count: 0, error: 'Format JSON non reconnu' };
                }
            } catch (jsonErr) {
                return { success: false, count: 0, error: 'Fichier invalide ou corrompu' };
            }
        }

        // Vérification de l'adresse email si présente
        if (parsedPayload.userEmail && parsedPayload.userEmail !== 'anonyme' && currentUser && !isGuestMode) {
            const currentEmail = currentUser.email || currentUser.username;
            if (currentEmail && parsedPayload.userEmail.toLowerCase() !== currentEmail.toLowerCase()) {
                const msg = (typeof i18n !== 'undefined' && i18n.t)
                    ? i18n.t('import.emailMismatch', { exportEmail: parsedPayload.userEmail, currentEmail: currentEmail })
                    : `Attention : Ce fichier de sauvegarde est associé à "${parsedPayload.userEmail}".\n\nVous êtes connecté avec "${currentEmail}".\n\nSouhaitez-vous quand même importer ces données ?`;
                
                const confirmed = window.confirm(msg);
                if (!confirmed) {
                    return { success: false, cancelled: true, error: 'Importation annulée par l\'utilisateur.' };
                }
            }
        }

        // Restaurer la progression des quêtes / EXP si présente
        if (parsedPayload.progression && window.questManager) {
            window.questManager.data.exp = Math.max(window.questManager.data.exp || 0, parsedPayload.progression.exp || 0);
            window.questManager.saveProgression(true);
        }

        const rawItems = parsedPayload.items || [];
        const items = rawItems.map(item => ({
            id: item.id || item.objectId || ('import_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6)),
            title: (item.title || 'Sans titre').trim(),
            type: item.type || 'Manga',
            status: item.status || 'En cours',
            rating: typeof item.rating === 'number' ? item.rating : (parseFloat(item.rating) || 0),
            genres: Array.isArray(item.genres) ? item.genres : [],
            link: item.link || '',
            image: item.image || item.imageUrl || '',
            imageUrl: item.imageUrl || item.image || '',
            chapters: typeof item.chapters === 'number' ? item.chapters : (parseInt(item.chapters || '0', 10) || 0),
            notes: item.notes || '',
            malId: item.malId || '',
            createdAt: item.createdAt || new Date().toISOString(),
            updatedAt: item.updatedAt || new Date().toISOString()
        }));

        return { 
            success: true, 
            count: items.length, 
            items, 
            userRank: parsedPayload.userRank || null,
            userEmail: parsedPayload.userEmail || null
        };
    } catch (e) {
        return { success: false, count: 0, error: e.message };
    }
}

// ============ MIGRATION VERS LE NOUVEAU SERVEUR (BATCH OPTIMISÉ) ============
async function migrateDataToNewServer(onProgress) {
    if (!currentUser || isGuestMode) {
        return { success: false, error: 'Vous devez être connecté avec un compte pour synchroniser vers le nouveau serveur.' };
    }

    try {
        const localItems = loadFromLocalStorage() || [];
        if (localItems.length === 0) {
            // Synchroniser au moins la progression des quêtes
            if (window.questManager) {
                await window.questManager.saveProgression(true);
            }
            return { success: true, count: 0, message: 'Aucun titre à transférer.' };
        }

        const sessionToken = currentUser.getSessionToken();
        const batchSize = 40;
        let processed = 0;

        for (let i = 0; i < localItems.length; i += batchSize) {
            const chunk = localItems.slice(i, i + batchSize);
            const requests = chunk.map(item => ({
                method: 'POST',
                path: '/1/classes/Items',
                body: {
                    title: (item.title || 'Sans titre').trim(),
                    type: item.type || 'Manga',
                    status: item.status || 'En cours',
                    rating: typeof item.rating === 'number' ? item.rating : (parseFloat(item.rating) || 0),
                    genres: Array.isArray(item.genres) ? item.genres : [],
                    link: item.link || '',
                    image: item.image || item.imageUrl || '',
                    imageUrl: item.imageUrl || item.image || '',
                    chapters: typeof item.chapters === 'number' ? item.chapters : (parseInt(item.chapters || '0', 10) || 0),
                    notes: item.notes || '',
                    malId: item.malId || '',
                    originalCreatedAt: item.createdAt || null,
                    userId: { __type: 'Pointer', className: '_User', objectId: currentUser.id },
                    ACL: {
                        [currentUser.id]: { read: true, write: true }
                    }
                }
            }));

            const batchRes = await back4appApiCall('/batch', 'POST', { requests }, sessionToken);
            if (!batchRes.ok && batchRes.status !== 200) {
                // Si le batch n'est pas disponible, insérer séquentiellement sans flood
                for (const singleItem of chunk) {
                    await createItemCloud(singleItem);
                }
            }

            processed += chunk.length;
            if (typeof onProgress === 'function') {
                onProgress(processed, localItems.length);
            }
        }

        // Synchroniser également la progression des quêtes
        if (window.questManager) {
            await window.questManager.saveProgression(true);
        }

        return { success: true, count: localItems.length };
    } catch (err) {
        console.error('[Server Migration Error]', err);
        return { success: false, error: err.message };
    }
}
window.migrateDataToNewServer = migrateDataToNewServer;

// ============ GESTION DU STOCKAGE LOCAL (ISOLÉ PAR UTILISATEUR) ============

function getUserItemsStorageKey() {
    if (currentUser && currentUser.id) {
        return 'manlore_items_usr_' + currentUser.id;
    }
    if (typeof Parse !== 'undefined' && Parse.User && Parse.User.current()) {
        const u = Parse.User.current();
        if (u && u.id) return 'manlore_items_usr_' + u.id;
    }
    if (localStorage.getItem('manlore_guest_mode') === 'true') {
        return 'manlore_items_guest';
    }
    return 'manlore_items_temp';
}

function loadFromLocalStorage() {
    try {
        const key = getUserItemsStorageKey();
        let data = localStorage.getItem(key);
        // Migration depuis l'ancienne clé globale non isolée si nécessaire
        if (!data) {
            const legacy = localStorage.getItem('manlore_items');
            if (legacy) {
                if (key.startsWith('manlore_items_usr_')) {
                    localStorage.setItem(key, legacy);
                    data = legacy;
                }
                localStorage.removeItem('manlore_items');
            }
        }
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
    localStorage.setItem(getUserItemsStorageKey(), JSON.stringify(items));
}

function updateInLocalStorage(itemId, updates) {
    const items = loadFromLocalStorage();
    const index = items.findIndex(i => String(i.id) === String(itemId));
    if (index >= 0) {
        items[index] = { ...items[index], ...updates, updatedAt: new Date().toISOString() };
        localStorage.setItem(getUserItemsStorageKey(), JSON.stringify(items));
    }
}

function deleteFromLocalStorage(itemId) {
    const items = loadFromLocalStorage();
    const filtered = items.filter(i => String(i.id) !== String(itemId));
    localStorage.setItem(getUserItemsStorageKey(), JSON.stringify(filtered));
}

// ============ CORBEILLE DE SUPPRESSION (15 JOURS) ============
const TRASH_BIN_KEY = 'manlore_trash_bin_v5';

function loadTrashBin() {
    try {
        const raw = localStorage.getItem(TRASH_BIN_KEY);
        const list = raw ? JSON.parse(raw) : [];
        const now = Date.now();
        const maxAgeMs = 15 * 86400 * 1000; // 15 jours
        const valid = list.filter(item => item && item.deletedAt && (now - item.deletedAt) < maxAgeMs);
        if (valid.length !== list.length) {
            localStorage.setItem(TRASH_BIN_KEY, JSON.stringify(valid));
        }
        return valid;
    } catch (e) {
        return [];
    }
}

function moveToTrashBin(item) {
    if (!item) return;
    const trash = loadTrashBin();
    const itemCopy = JSON.parse(JSON.stringify(item));
    itemCopy.deletedAt = Date.now();
    trash.unshift(itemCopy);
    localStorage.setItem(TRASH_BIN_KEY, JSON.stringify(trash));
    syncTrashBinToCloud(trash);
}

function restoreFromTrashBin(itemId) {
    const trash = loadTrashBin();
    const targetIdx = trash.findIndex(i => String(i.id) === String(itemId) || String(i.objectId) === String(itemId));
    if (targetIdx >= 0) {
        const restoredItem = trash.splice(targetIdx, 1)[0];
        delete restoredItem.deletedAt;
        localStorage.setItem(TRASH_BIN_KEY, JSON.stringify(trash));
        syncTrashBinToCloud(trash);
        saveToLocalStorage(restoredItem);
        if (typeof allItems !== 'undefined' && Array.isArray(allItems)) {
            allItems.unshift(restoredItem);
            if (typeof applyFiltersAndRender === 'function') applyFiltersAndRender();
        }
        if (typeof showToast === 'function') {
            showToast(i18n.t('trash.restored') || 'Titre restauré avec succès', 'success');
        }
    }
}

function permanentlyDeleteFromTrash(itemId) {
    const trash = loadTrashBin();
    const filtered = trash.filter(i => String(i.id) !== String(itemId) && String(i.objectId) !== String(itemId));
    localStorage.setItem(TRASH_BIN_KEY, JSON.stringify(filtered));
    syncTrashBinToCloud(filtered);
    if (typeof renderTrashBinModal === 'function') renderTrashBinModal();
}

function emptyTrashBin() {
    localStorage.setItem(TRASH_BIN_KEY, JSON.stringify([]));
    syncTrashBinToCloud([]);
    if (typeof renderTrashBinModal === 'function') renderTrashBinModal();
}

function syncTrashBinToCloud(trashList) {
    try {
        if (typeof Parse !== 'undefined' && Parse.User && Parse.User.current()) {
            const u = Parse.User.current();
            u.set('trashBinData', trashList);
            u.save();
        }
    } catch (e) {}
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

// ============ NOTIFICATIONS SERVEUR MULTILINGUES ============
// Construire un payload push multilingue (fr/en/es) envoyé depuis Back4App
// Format compatible avec sw.js qui sélectionne automatiquement la bonne langue.
// Usage: createMultilingualNotification('streak', 'Votre série expire !', 'Your streak expires!', '¡Tu racha expira!')
function createMultilingualNotification(key, fr, en, es, tag) {
    return {
        tag: tag || key,
        fr: { title: i18n ? i18n.setLang && TRANSLATIONS?.fr?.[`notif.${key}.title`] || fr : fr, body: fr },
        en: { title: en, body: en },
        es: { title: es, body: es },
    };
}

// sendServerAnnouncementNotification — à appeler depuis Back4App Cloud Code
// Format: { key, fr: { title, body }, en: { title, body }, es: { title, body }, tag }
async function sendServerAnnouncementNotification(payload) {
    if (typeof sendPushNotification === 'function') {
        const lang = (i18n && i18n.lang) || 'fr';
        const p = payload[lang] || payload.en || payload.fr || {};
        const title = p.title || 'ManLore';
        const body = p.body || '';
        await sendPushNotification(title, body, payload.tag || 'announcement');
    }
}
window.sendServerAnnouncementNotification = sendServerAnnouncementNotification;


