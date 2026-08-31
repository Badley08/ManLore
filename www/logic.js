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

// Initialisation immédiate de la session utilisateur
currentUser = loadUserSessionFromLocal();
if (currentUser) {
    console.log('[Auth] Session active restaurée pour :', currentUser.get('username') || currentUser.id);
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

async function saveUserSettingsToCloud(key, value) {
    if (!currentUser || !currentUser.sessionToken || !isOnline) return;
    try {
        const payload = {};
        if (key === 'theme') payload.preferredTheme = value;
        if (key === 'language') payload.preferredLanguage = value;
        
        await back4appApiCall(`/users/${currentUser.id}`, 'PUT', payload, currentUser.sessionToken);
    } catch (e) {
        console.error('[Cloud] Error saving user settings:', e);
    }
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
                if (res.ok) {
                    console.log('[Avatar] Photo de profil synchronisée avec Back4App avec succès');
                }
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

            localStorage.setItem('manlore_items', JSON.stringify(parsedItems));
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
        console.log(`[Deduplication] Found ${toDelete.length} duplicates. Deleting...`);
        for (const item of toDelete) {
            try {
                await deleteItem(item.id || item.objectId);
                console.log(`[Deduplication] Deleted duplicate: ${item.title}`);
            } catch (e) {
                console.warn(`[Deduplication] Failed to delete ${item.title}:`, e);
            }
        }
        if (window.showToast) {
            window.showToast(`${toDelete.length} doublons supprimés automatiquement.`, 'info');
        }
    }

    return keptItems;
}
window.normalizeTitle = normalizeTitle;

async function deduplicateCollection() {
    console.log('[Deduplication] Analyse des doublons dans la collection...');
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
                console.warn('[Deduplication] Note delete duplicate cloud:', id, e);
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

        console.log(`[Deduplication] ${mergedCount} doublons fusionnés et nettoyés avec succès.`);
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
                console.log('[Push] Permissions notifications accordées');
                if (window.showToast) window.showToast('🔔 Notifications activées', 'success');
                return true;
            }
        }
    } catch (e) {
        console.warn('[Push] Notification permission note:', e);
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
        console.log('[Push Notification Note]', e);
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

        let rawItems = [];
        if (Array.isArray(parsed)) {
            rawItems = parsed;
        } else if (parsed && Array.isArray(parsed.items)) {
            rawItems = parsed.items;
            if (parsed.progression && window.questManager) {
                window.questManager.data.exp = Math.max(window.questManager.data.exp || 0, parsed.progression.exp || 0);
                window.questManager.saveProgression(true);
            }
        } else {
            return { success: false, count: 0, error: 'Format invalide' };
        }

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

console.log('[Logic v6.0.1] Dedicated Cloud Engine & Universal Exporter loaded');
