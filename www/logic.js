/* ============================================
   MANLORE v5.0.1 - LOGIC.JS
   Dual Server Back4App Architecture (Server A & Server B)
   Smart Cross-Server Failover, Unique User Token,
   Parse Row Level Security (RLS) & Offline Sync
   ============================================ */

'use strict';

// ============ MULTI-SERVER CONFIGURATION ============
const BACK4APP_SERVERS = {
    A: {
        id: 'A',
        name: 'Serveur Principal (A)',
        appId: 'vnaPY79T1WzfEYp84Mve2PAoHbexPaATo43qickr',
        clientKey: '0Y9zcO1XB1hAkVKWa72TIamjPR1pnwuw8IsG6TLj',
        serverURL: 'https://parseapi.back4app.com/'
    },
    B: {
        id: 'B',
        name: 'Serveur Secondaire (B)',
        appId: 'OH5yq9tgEzqkn2TNoegJlF6XVLuzEMH6vKwYg5qu',
        clientKey: 'WPvwJkRsmofv2u480N2f2c2wluTh5zGyBIhkc4dP',
        serverURL: 'https://parseapi.back4app.com/'
    }
};

let currentServerId = localStorage.getItem('manlore_active_server') || 'A';

function applyParseServer(serverId) {
    const config = BACK4APP_SERVERS[serverId] || BACK4APP_SERVERS.A;
    try {
        if (typeof Parse !== 'undefined') {
            Parse.initialize(config.appId);
            if (Parse.CoreManager) {
                Parse.CoreManager.set('APPLICATION_ID', config.appId);
                Parse.CoreManager.set('CLIENT_KEY', config.clientKey);
                Parse.CoreManager.set('JAVASCRIPT_KEY', null);
            }
            Parse.serverURL = config.serverURL;
        }
        currentServerId = config.id;
        localStorage.setItem('manlore_active_server', config.id);
        console.log(`[Backend] Connecté au ${config.name} (${config.appId.substr(0, 8)}...)`);
    } catch (e) {
        console.warn('[Backend] Erreur initialisation Parse Server:', e);
    }
}

// Initialisation immédiate sur le serveur mémorisé
applyParseServer(currentServerId);

// ============ GLOBALS ============
let currentUser = null;
let syncQueue = [];
let isOnline = navigator.onLine;
let autoSyncInterval = null;
let isGuestMode = false;
let storageMode = 'cloud'; // 'local' | 'cloud'

// Générateur de Token Unique Utilisateur
function generateUniqueUserToken(username) {
    const randomPart = Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
    const timePart = Date.now().toString(36);
    const cleanUser = (username || 'user').replace(/[^a-zA-Z0-9]/g, '').toLowerCase().substring(0, 8);
    return `ML_${cleanUser}_${timePart}_${randomPart}`;
}

// ============================================
// INITIALISATION DU BACKEND AVEC FAILOVER
// ============================================

async function initializeBackend() {
    console.log('[Backend] Initialisation v5.0.1 multi-serveur...');

    storageMode = localStorage.getItem('manlore_storage_mode') || 'cloud';
    isGuestMode = localStorage.getItem('manlore_guest_mode') === 'true';

    loadSyncQueue();
    updateOnlineStatus(navigator.onLine);

    if (!isGuestMode && typeof Parse !== 'undefined') {
        try {
            let user = Parse.User.current();
            if (user && user.getSessionToken()) {
                // Vérifier la validité de la session sur le serveur actif
                try {
                    await user.fetch();
                    currentUser = user;
                    isGuestMode = false;
                    startAutoSync();
                    if (window.questManager) {
                        window.questManager.syncFromCloud();
                    }
                    return;
                } catch (fetchErr) {
                    console.warn('[Backend] Session token invalide sur le serveur', currentServerId, '-> Test sur l\'autre serveur');
                    // Si la session échoue sur le serveur actuel, test de l'autre serveur
                    const otherServerId = currentServerId === 'A' ? 'B' : 'A';
                    applyParseServer(otherServerId);
                    user = Parse.User.current();
                    if (user && user.getSessionToken()) {
                        await user.fetch().catch(() => {});
                        currentUser = user;
                        isGuestMode = false;
                        startAutoSync();
                        if (window.questManager) {
                            window.questManager.syncFromCloud();
                        }
                        return;
                    }
                }
            }
        } catch (e) {
            console.warn('[Backend] Parse.User.current check note:', e);
        }
    }
}

// ============================================
// AUTHENTIFICATION INTELLIGENTE CROSS-SERVEUR
// ============================================

async function signUp(username, email, password) {
    const startTime = Date.now();
    try {
        // Inscription sur le serveur actif (défaut A)
        const targetServerId = currentServerId || 'A';
        applyParseServer(targetServerId);

        // Déconnexion préventive d'une éventuelle session résiduelle
        if (typeof Parse !== 'undefined' && Parse.User.current()) {
            await Parse.User.logOut().catch(() => {});
        }

        const user = new Parse.User();
        const userToken = generateUniqueUserToken(username);

        user.set('username', username.trim());
        user.set('email', email.trim().toLowerCase());
        user.set('password', password);
        user.set('userUniqueToken', userToken);
        user.set('serverLocation', targetServerId);
        user.set('exp', 0);
        user.set('rank', 'E');

        await Promise.race([
            user.signUp(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Délai d\'attente dépassé (timeout 10s)')), 10000))
        ]);

        currentUser = user;
        isGuestMode = false;
        localStorage.removeItem('manlore_guest_mode');
        localStorage.setItem('manlore_user_token', userToken);
        localStorage.setItem('manlore_active_server', targetServerId);

        if (window.questManager) {
            window.questManager.syncFromCloud();
        }

        if (window.appLogger) {
            window.appLogger.trackNetwork('signUp', Date.now() - startTime, 200);
        }

        return { success: true, user, server: targetServerId, userToken };
    } catch (error) {
        console.error('[Auth] Signup error:', error);
        if (window.appLogger) {
            window.appLogger.log('auth', 'Erreur création de compte', { error: error.message });
        }
        return { success: false, error: error.message || 'Erreur lors de l\'inscription' };
    }
}

async function logIn(usernameOrEmail, password) {
    const startTime = Date.now();
    const cleanInput = usernameOrEmail.trim();

    // 1. Tenter la connexion sur le premier serveur
    const primaryServer = currentServerId || 'A';
    const secondaryServer = primaryServer === 'A' ? 'B' : 'A';

    console.log(`[Auth] Tentative de connexion sur le serveur ${primaryServer}...`);
    applyParseServer(primaryServer);

    let loginResult = await tryServerLogin(cleanInput, password, primaryServer);

    // 2. Si échec sur le premier serveur, tenter automatiquement sur le second serveur
    if (!loginResult.success) {
        console.log(`[Auth] Échec sur le serveur ${primaryServer}, basculement automatique sur le serveur ${secondaryServer}...`);
        applyParseServer(secondaryServer);
        loginResult = await tryServerLogin(cleanInput, password, secondaryServer);

        if (loginResult.success) {
            console.log(`[Auth] Connexion réussie sur le serveur secondaire ${secondaryServer} !`);
            localStorage.setItem('manlore_active_server', secondaryServer);
        } else {
            // Remettre le serveur initial
            applyParseServer(primaryServer);
        }
    }

    if (loginResult.success) {
        currentUser = loginResult.user;
        isGuestMode = false;
        localStorage.removeItem('manlore_guest_mode');

        // Générer et mémoriser le token unique si non existant
        let userToken = currentUser.get('userUniqueToken');
        if (!userToken) {
            userToken = generateUniqueUserToken(currentUser.get('username'));
            currentUser.set('userUniqueToken', userToken);
            currentUser.set('serverLocation', currentServerId);
            currentUser.save().catch(() => {});
        }
        localStorage.setItem('manlore_user_token', userToken);

        startAutoSync();

        if (window.questManager) {
            window.questManager.syncFromCloud();
        }

        if (window.appLogger) {
            window.appLogger.trackNetwork('logIn', Date.now() - startTime, 200);
        }

        return { success: true, user: currentUser, server: currentServerId, userToken };
    }

    return { success: false, error: loginResult.error || 'Identifiants invalides (utilisateur non trouvé)' };
}

async function tryServerLogin(cleanInput, password, serverId) {
    try {
        const loginPromise = (async () => {
            return await Parse.User.logIn(cleanInput, password);
        })();

        const user = await Promise.race([
            loginPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout connexion')), 8000))
        ]);

        return { success: true, user };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

async function logOut() {
    try {
        if (!isGuestMode && typeof Parse !== 'undefined') {
            await Parse.User.logOut().catch(() => {});
        }
        currentUser = null;
        isGuestMode = false;
        localStorage.removeItem('manlore_guest_mode');
        localStorage.removeItem('manlore_user_token');
        stopAutoSync();
        if (window.questManager) {
            window.questManager.onLogout();
        }
        return { success: true };
    } catch (error) {
        console.error('[Auth] Logout error:', error);
        return { success: false, error: error.message };
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
    const user = Parse.User.current();
    if (user) { currentUser = user; return user; }
    return null;
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
// CRUD AVEC PARSE ROW LEVEL SECURITY (RLS)
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
        const Item = Parse.Object.extend('Items');
        const query = new Parse.Query(Item);
        query.equalTo('userId', currentUser);
        query.descending('createdAt');
        query.limit(2000);

        const results = await Promise.race([
            query.find(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Cloud fetch timeout')), 8000))
        ]);

        const parsedItems = results.map(item => parseItemToObject(item));
        localStorage.setItem('manlore_items', JSON.stringify(parsedItems));
        return { success: true, items: parsedItems };
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
        const Item = Parse.Object.extend('Items');
        const item = new Item();
        item.set('title', itemData.title);
        item.set('type', itemData.type);
        item.set('status', itemData.status);
        item.set('rating', itemData.rating || 0);
        item.set('genres', itemData.genres || []);
        item.set('link', itemData.link || '');
        item.set('image', itemData.image || '');
        item.set('imageUrl', itemData.imageUrl || '');
        item.set('chapters', itemData.chapters || 0);
        item.set('notes', itemData.notes || '');
        item.set('malId', itemData.malId || '');
        item.set('userId', currentUser);

        // Row Level Security (RLS) : seul le propriétaire de l'élément a accès en lecture/écriture
        const itemAcl = new Parse.ACL(currentUser);
        itemAcl.setPublicReadAccess(false);
        itemAcl.setPublicWriteAccess(false);
        item.setACL(itemAcl);

        const saved = await item.save();
        const plain = parseItemToObject(saved);
        saveToLocalStorage(plain);
        return { success: true, item: plain };
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
        const Item = Parse.Object.extend('Items');
        const query = new Parse.Query(Item);
        const item = await query.get(itemId);
        if (item) {
            Object.keys(updates).forEach(key => {
                if (key !== 'id') item.set(key, updates[key]);
            });
            await item.save();
        }
        return { success: true };
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
        const Item = Parse.Object.extend('Items');
        const query = new Parse.Query(Item);
        const item = await query.get(itemId);
        if (item) {
            await item.destroy();
        }
        return { success: true };
    } catch (error) {
        console.error('[CRUD] Delete cloud error:', error);
        addToSyncQueue('delete', { id: itemId });
        return { success: true, offline: true };
    }
}

// ============ HELPER CONVERSION PARSE <-> PLAIN OBJECT ============

function parseItemToObject(parseItem) {
    if (!parseItem) return null;
    return {
        id: parseItem.id || parseItem.objectId,
        title: parseItem.get('title') || '',
        type: parseItem.get('type') || 'manga',
        status: parseItem.get('status') || 'reading',
        rating: parseItem.get('rating') || 0,
        genres: parseItem.get('genres') || [],
        link: parseItem.get('link') || '',
        image: parseItem.get('image') || '',
        imageUrl: parseItem.get('imageUrl') || '',
        chapters: parseItem.get('chapters') || 0,
        notes: parseItem.get('notes') || '',
        malId: parseItem.get('malId') || '',
        createdAt: parseItem.createdAt ? parseItem.createdAt.toISOString() : new Date().toISOString(),
        updatedAt: parseItem.updatedAt ? parseItem.updatedAt.toISOString() : new Date().toISOString()
    };
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

console.log('[Logic v5.0.1] Multi-Server Back4App System loaded');
