/* ============================================
   MANLORE v5.0.1 - LOGIC.JS
   Back4App Parse SDK + Instant Stale-While-Revalidate + Offline Sync
   ============================================ */

'use strict';

// ============ PARSE SDK INIT ============
try {
    Parse.initialize(
        "vnaPY79T1WzfEYp84Mve2PAoHbexPaATo43qickr",
        "0Y9zcO1XB1hAkVKWa72TIamjPR1pnwuw8IsG6TLj"
    );
    Parse.serverURL = 'https://parseapi.back4app.com/';
} catch (e) {
    console.warn('[Backend] Parse init fallback', e);
}

// ============ GLOBALS ============
let currentUser = null;
let syncQueue = [];
let isOnline = navigator.onLine;
let autoSyncInterval = null;
let isGuestMode = false;
let storageMode = 'cloud'; // 'local' | 'cloud'

// ============================================
// INIT
// ============================================

function initializeBackend() {
    console.log('[Backend] Initializing v5.0.1...');

    storageMode = localStorage.getItem('manlore_storage_mode') || 'cloud';
    isGuestMode = localStorage.getItem('manlore_guest_mode') === 'true';

    loadSyncQueue();
    updateOnlineStatus(navigator.onLine);

    if (!isGuestMode) {
        try {
            const user = Parse.User.current();
            if (user) {
                currentUser = user;
                isGuestMode = false;
                startAutoSync();
                if (window.questManager) {
                    window.questManager.syncFromCloud();
                }
            }
        } catch (e) {
            console.warn('[Backend] Parse.User.current error:', e);
        }
    }
}

// ============================================
// AUTHENTIFICATION ULTRA-RÉACTIVE
// ============================================

async function signUp(username, email, password) {
    const startTime = Date.now();
    try {
        const user = new Parse.User();
        user.set('username', username.trim());
        user.set('email', email.trim().toLowerCase());
        user.set('password', password);
        
        await Promise.race([
            user.signUp(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Délai d\'attente dépassé (timeout 10s)')), 10000))
        ]);

        currentUser = user;
        isGuestMode = false;
        localStorage.removeItem('manlore_guest_mode');
        
        if (window.questManager) {
            window.questManager.syncFromCloud();
        }

        if (window.appLogger) {
            window.appLogger.trackNetwork('signUp', Date.now() - startTime, 200);
        }

        return { success: true, user };
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
    try {
        const cleanInput = usernameOrEmail.trim();
        let user;

        // Connexion directe avec timeout de sécurité
        const loginPromise = (async () => {
            return await Parse.User.logIn(cleanInput, password);
        })();

        user = await Promise.race([
            loginPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Délai de connexion dépassé (timeout 10s)')), 10000))
        ]);

        currentUser = user;
        isGuestMode = false;
        localStorage.removeItem('manlore_guest_mode');
        startAutoSync();

        if (window.questManager) {
            window.questManager.syncFromCloud();
        }

        if (window.appLogger) {
            window.appLogger.trackNetwork('logIn', Date.now() - startTime, 200);
        }

        return { success: true, user };
    } catch (error) {
        console.error('[Auth] Login error:', error);
        if (window.appLogger) {
            window.appLogger.log('auth', 'Erreur de connexion', { error: error.message });
        }
        return { success: false, error: error.message || 'Identifiants invalides' };
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

// ============================================
// STORAGE MODE & INSTANT LOCAL CACHE
// ============================================

function setStorageMode(mode) {
    storageMode = mode;
    localStorage.setItem('manlore_storage_mode', mode);
}

function getStorageMode() {
    return storageMode;
}

// ============================================
// CRUD AVEC RENDU INSTANTANÉ (STALE-WHILE-REVALIDATE)
// ============================================

async function fetchAllItems() {
    // 1. Retourne instantanément le cache local (<5ms)
    const localItems = loadFromLocalStorage();

    if (storageMode === 'local' || isGuestMode || !navigator.onLine) {
        return { success: true, items: localItems, offline: true };
    }

    // 2. Si mode cloud, on charge les données distantes
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
    // Quête & EXP
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
    // Si des chapitres ont été augmentés, on ajoute de l'EXP
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
        Object.entries(updates).forEach(([k, v]) => {
            if (v !== undefined) item.set(k, v);
        });
        const saved = await item.save();
        saveToLocalStorage(parseItemToObject(saved));
        return { success: true, item: parseItemToObject(saved) };
    } catch (error) {
        console.error('[CRUD] Update cloud error:', error);
        addToSyncQueue('update', { id: itemId, ...updates });
        return { success: true, offline: true };
    }
}

async function deleteItem(itemId) {
    removeFromLocalStorage(itemId);

    if (storageMode === 'local' || isGuestMode || itemId.startsWith('local_') || itemId.startsWith('temp_')) {
        return { success: true };
    }

    if (!navigator.onLine) {
        addToSyncQueue('delete', { id: itemId });
        return { success: true, offline: true };
    }

    try {
        const Item = Parse.Object.extend('Items');
        const query = new Parse.Query(Item);
        const item = await query.get(itemId);
        await item.destroy();
        return { success: true };
    } catch (error) {
        console.error('[CRUD] Delete cloud error:', error);
        addToSyncQueue('delete', { id: itemId });
        return { success: true, offline: true };
    }
}

// ============ HELPER STORAGE ============

function loadFromLocalStorage() {
    try {
        const raw = localStorage.getItem('manlore_items');
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function saveToLocalStorage(item) {
    const items = loadFromLocalStorage();
    const idx = items.findIndex(i => String(i.id) === String(item.id));
    if (idx !== -1) items[idx] = item;
    else items.unshift(item);
    localStorage.setItem('manlore_items', JSON.stringify(items));
}

function updateInLocalStorage(id, updates) {
    const items = loadFromLocalStorage();
    const idx = items.findIndex(i => String(i.id) === String(id));
    if (idx !== -1) {
        items[idx] = { ...items[idx], ...updates, updatedAt: new Date().toISOString() };
        localStorage.setItem('manlore_items', JSON.stringify(items));
    }
}

function removeFromLocalStorage(id) {
    let items = loadFromLocalStorage();
    items = items.filter(i => String(i.id) !== String(id));
    localStorage.setItem('manlore_items', JSON.stringify(items));
}

function parseItemToObject(p) {
    if (!p) return null;
    if (!(p instanceof Parse.Object)) return p;
    return {
        id: p.id,
        title: p.get('title') || '',
        type: p.get('type') || 'Manga',
        status: p.get('status') || 'À lire',
        rating: p.get('rating') || 0,
        genres: p.get('genres') || [],
        link: p.get('link') || '',
        image: p.get('image') || '',
        imageUrl: p.get('imageUrl') || p.get('image') || '',
        chapters: p.get('chapters') || 0,
        notes: p.get('notes') || '',
        malId: p.get('malId') || '',
        createdAt: p.createdAt ? p.createdAt.toISOString() : new Date().toISOString(),
        updatedAt: p.updatedAt ? p.updatedAt.toISOString() : new Date().toISOString()
    };
}

// ============ SYNC QUEUE ============

function loadSyncQueue() {
    try {
        const raw = localStorage.getItem('manlore_sync_queue');
        syncQueue = raw ? JSON.parse(raw) : [];
    } catch { syncQueue = []; }
}

function saveSyncQueue() {
    localStorage.setItem('manlore_sync_queue', JSON.stringify(syncQueue));
}

function addToSyncQueue(action, data) {
    syncQueue.push({ action, data, timestamp: Date.now() });
    saveSyncQueue();
}

function startAutoSync() {
    if (autoSyncInterval) clearInterval(autoSyncInterval);
    autoSyncInterval = setInterval(() => {
        if (navigator.onLine && !isGuestMode) processSyncQueue();
    }, 60000);
}

function stopAutoSync() {
    if (autoSyncInterval) { clearInterval(autoSyncInterval); autoSyncInterval = null; }
}

async function processSyncQueue() {
    if (syncQueue.length === 0 || !navigator.onLine || isGuestMode || !currentUser) return;
    const queue = [...syncQueue];
    syncQueue = [];
    saveSyncQueue();

    for (const item of queue) {
        try {
            if (item.action === 'create') await createItemCloud(item.data);
            else if (item.action === 'update' && item.data.id) await updateItem(item.data.id, item.data);
            else if (item.action === 'delete' && item.data.id) await deleteItem(item.data.id);
        } catch (e) {
            syncQueue.push(item);
            saveSyncQueue();
        }
    }
}

function updateOnlineStatus(online) {
    isOnline = online;
    if (online) processSyncQueue();
}

window.addEventListener('online', () => updateOnlineStatus(true));
window.addEventListener('offline', () => updateOnlineStatus(false));

console.log('[Logic v5.0.1] Module loaded');
