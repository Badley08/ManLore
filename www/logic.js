/* ============================================
   MANLORE v2.0.12 - LOGIC.JS
   Back4App Parse SDK + Guest Mode + Storage Mode
   ============================================ */

// ============ PARSE SDK INIT ============
Parse.initialize(
    "vnaPY79T1WzfEYp84Mve2PAoHbexPaATo43qickr",
    "5ehozciKmSQZkc8cmmshKfMbvnCLsc2PDB8K1VGS"
);
Parse.serverURL = 'https://parseapi.back4app.com/';

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
    console.log('[Backend] Initializing v2.0.12...');

    // Load storage mode
    storageMode = localStorage.getItem('manlore_storage_mode') || 'cloud';
    isGuestMode = localStorage.getItem('manlore_guest_mode') === 'true';

    loadSyncQueue();
    updateOnlineStatus(navigator.onLine);

    if (!isGuestMode) {
        const user = Parse.User.current();
        if (user) {
            currentUser = user;
            isGuestMode = false;
            console.log('[Backend] User connected:', user.get('username'));
            startAutoSync();
        }
    } else {
        console.log('[Backend] Guest mode active');
    }

    console.log('[Backend] Storage mode:', storageMode);
    console.log('[Backend] Initialized OK');
}

// ============================================
// AUTHENTIFICATION
// ============================================

async function signUp(username, email, password) {
    try {
        const user = new Parse.User();
        user.set('username', username);
        user.set('email', email);
        user.set('password', password);
        await user.signUp();
        currentUser = user;
        isGuestMode = false;
        localStorage.removeItem('manlore_guest_mode');
        return { success: true, user };
    } catch (error) {
        console.error('[Auth] Signup error:', error);
        return { success: false, error: error.message };
    }
}

async function logIn(usernameOrEmail, password) {
    try {
        let user;
        try {
            user = await Parse.User.logIn(usernameOrEmail, password);
        } catch (e) {
            const query = new Parse.Query(Parse.User);
            query.equalTo('email', usernameOrEmail);
            const userByEmail = await query.first();
            if (userByEmail) {
                user = await Parse.User.logIn(userByEmail.get('username'), password);
            } else {
                throw e;
            }
        }
        currentUser = user;
        isGuestMode = false;
        localStorage.removeItem('manlore_guest_mode');
        startAutoSync();
        return { success: true, user };
    } catch (error) {
        console.error('[Auth] Login error:', error);
        return { success: false, error: error.message };
    }
}

async function logOut() {
    try {
        if (!isGuestMode) {
            await Parse.User.logOut();
        }
        currentUser = null;
        isGuestMode = false;
        localStorage.removeItem('manlore_guest_mode');
        stopAutoSync();
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
    // Force local storage mode for guests
    setStorageMode('local');
    console.log('[Auth] Guest mode activated');
    return { success: true };
}

function getCurrentUser() {
    if (isGuestMode) return null;
    const user = Parse.User.current();
    if (user) { currentUser = user; return user; }
    return null;
}

// ============================================
// STORAGE MODE
// ============================================

function setStorageMode(mode) {
    storageMode = mode;
    localStorage.setItem('manlore_storage_mode', mode);
    console.log('[Storage] Mode set to:', mode);
}

function getStorageMode() {
    return storageMode;
}

async function migrateLocalToCloud() {
    if (!currentUser || isGuestMode) return { success: false, error: 'Non connecté' };
    const localItems = loadFromLocalStorage();
    if (localItems.length === 0) return { success: true, count: 0 };
    let count = 0;
    for (const item of localItems) {
        try {
            if (!item.id || item.id.startsWith('temp_')) {
                const result = await createItemCloud(item);
                if (result.success) count++;
            }
        } catch (e) { console.error('[Migrate] Error:', e); }
    }
    return { success: true, count };
}

async function migrateCloudToLocal() {
    if (!currentUser || isGuestMode) return { success: false };
    const result = await fetchFromCloud();
    if (result.success) {
        const items = result.items.map(i => parseItemToObject(i));
        localStorage.setItem('manlore_items', JSON.stringify(items));
        return { success: true, count: items.length };
    }
    return { success: false };
}

// ============================================
// CRUD
// ============================================

async function createItem(itemData) {
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
        items.push(item);
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
        saveToLocalStorage(saved);
        return { success: true, item: saved };
    } catch (error) {
        console.error('[CRUD] Create cloud error:', error);
        if (!isOnline) {
            addToSyncQueue('create', itemData);
            return createItemLocal(itemData);
        }
        return { success: false, error: error.message };
    }
}

async function fetchAllItems() {
    if (storageMode === 'local' || isGuestMode) {
        return { success: true, items: loadFromLocalStorage(), offline: true };
    }

    if (!navigator.onLine) {
        const local = loadFromLocalStorage();
        return { success: true, items: local, offline: true };
    }

    return fetchFromCloud();
}

async function fetchFromCloud() {
    try {
        if (!currentUser) return { success: true, items: loadFromLocalStorage(), offline: true };
        const Item = Parse.Object.extend('Items');
        const query = new Parse.Query(Item);
        query.equalTo('userId', currentUser);
        query.descending('createdAt');
        query.limit(2000);
        const results = await query.find();
        results.forEach(item => saveToLocalStorage(item));
        return { success: true, items: results };
    } catch (error) {
        console.error('[CRUD] Fetch cloud error:', error);
        return { success: true, items: loadFromLocalStorage(), offline: true };
    }
}

async function updateItem(itemId, updates) {
    if (storageMode === 'local' || isGuestMode) {
        updateInLocalStorage(itemId, updates);
        return { success: true, offline: true };
    }

    if (itemId.startsWith('local_') || itemId.startsWith('temp_')) {
        updateInLocalStorage(itemId, updates);
        if (!isGuestMode) addToSyncQueue('create', { ...updates });
        return { success: true, offline: true };
    }

    if (!navigator.onLine) {
        updateInLocalStorage(itemId, updates);
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
        saveToLocalStorage(saved);
        return { success: true, item: saved };
    } catch (error) {
        console.error('[CRUD] Update cloud error:', error);
        updateInLocalStorage(itemId, updates);
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

// ============================================
// PASSWORD CHANGE
// ============================================

async function changePassword(currentPwd, newPwd) {
    if (isGuestMode || !currentUser) {
        return { success: false, error: 'Non connecté' };
    }
    try {
        // Re-authenticate
        const username = currentUser.get('username');
        await Parse.User.logIn(username, currentPwd);
        currentUser.set('password', newPwd);
        await currentUser.save();
        return { success: true };
    } catch (error) {
        console.error('[Auth] Password change error:', error);
        return { success: false, error: error.message };
    }
}

// ============================================
// DELETE ALL / ACCOUNT
// ============================================

async function deleteAllItems() {
    const items = loadFromLocalStorage();
    if (storageMode === 'cloud' && !isGuestMode && navigator.onLine) {
        for (const item of items) {
            if (!item.id.startsWith('local_') && !item.id.startsWith('temp_')) {
                try { await deleteItem(item.id); } catch (e) { }
            }
        }
    }
    localStorage.removeItem('manlore_items');
    return { success: true };
}

async function deleteUserAccount() {
    if (isGuestMode || !currentUser) return { success: false };
    try {
        await deleteAllItems();
    } catch (e) {
        console.warn('[Delete] deleteAllItems error:', e);
    }
    try {
        await currentUser.destroy();
    } catch (e) {
        console.warn('[Delete] Parse user destruction failed:', e);
    }
    currentUser = null;
    localStorage.clear();
    return { success: true };
}

// ============================================
// LOCALSTORAGE
// ============================================

function saveToLocalStorage(item) {
    try {
        const items = loadFromLocalStorage();
        const obj = parseItemToObject(item);
        const idx = items.findIndex(i => i.id === obj.id);
        if (idx !== -1) items[idx] = obj;
        else items.push(obj);
        localStorage.setItem('manlore_items', JSON.stringify(items));
    } catch (e) { console.error('[Storage]', e); }
}

function loadFromLocalStorage() {
    try {
        const raw = localStorage.getItem('manlore_items');
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function updateInLocalStorage(itemId, updates) {
    try {
        const items = loadFromLocalStorage();
        const idx = items.findIndex(i => i.id === itemId);
        if (idx !== -1) {
            items[idx] = { ...items[idx], ...updates, updatedAt: new Date().toISOString() };
            localStorage.setItem('manlore_items', JSON.stringify(items));
        }
    } catch (e) { console.error('[Storage]', e); }
}

function removeFromLocalStorage(itemId) {
    try {
        const items = loadFromLocalStorage().filter(i => i.id !== itemId);
        localStorage.setItem('manlore_items', JSON.stringify(items));
    } catch (e) { console.error('[Storage]', e); }
}

function parseItemToObject(item) {
    if (item instanceof Parse.Object) {
        return {
            id: item.id,
            title: item.get('title') || '',
            type: item.get('type') || '',
            status: item.get('status') || '',
            rating: item.get('rating') || 0,
            genres: item.get('genres') || [],
            link: item.get('link') || '',
            image: item.get('image') || '',
            imageUrl: item.get('imageUrl') || '',
            chapters: item.get('chapters') || 0,
            notes: item.get('notes') || '',
            malId: item.get('malId') || '',
            createdAt: item.createdAt,
            updatedAt: item.updatedAt
        };
    }
    return item;
}

// ============================================
// EXPORT / IMPORT
// ============================================

async function exportData(allItems, customFilename) {
    const date = new Date().toISOString().split('T')[0];
    const filename = customFilename || `manlore-export-${date}.json`;
    const data = {
        version: '3.0.1',
        exportDate: new Date().toISOString(),
        username: currentUser ? currentUser.get('username') : (isGuestMode ? 'guest' : 'unknown'),
        storageMode,
        items: allItems
    };
    const json = JSON.stringify(data, null, 2);

    // Native Android: save to Cache then Share via Capacitor Share
    if (window.Capacitor && window.Capacitor.isNativePlatform()) {
        try {
            const Filesystem = window.Capacitor.Plugins.Filesystem;
            const Share = window.Capacitor.Plugins.Share;
            if (Filesystem && Share) {
                const res = await Filesystem.writeFile({
                    path: filename,
                    data: json,
                    directory: 'CACHE',
                    encoding: 'utf8'
                });
                await Share.share({
                    title: 'Export ManLore',
                    text: 'Sauvegarde de vos données ManLore',
                    url: res.uri,
                    dialogTitle: 'Enregistrer sous...'
                });
                console.log('[Export] Shared via Intent:', filename);
                return { success: true, native: true, filename };
            }
        } catch (e) {
            console.warn('[Export] Capacitor FS/Share failed, falling back to blob:', e);
        }
    }

    // Web / PWA fallback: trigger browser Save As dialog
    try {
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        console.log('[Export] Blob download triggered:', filename);
        return { success: true, native: false, filename };
    } catch (e) {
        console.error('[Export] Blob download failed:', e);
        return { success: false, error: e.message };
    }
}


async function importDataFromFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const raw = JSON.parse(e.target.result);
                // Support format v1 (array) and v2 (object with .items)
                let items;
                if (Array.isArray(raw)) {
                    items = raw;
                } else if (raw.items && Array.isArray(raw.items)) {
                    items = raw.items;
                } else {
                    reject(new Error('Format invalide'));
                    return;
                }
                resolve({ success: true, items, count: items.length });
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = () => reject(new Error('Lecture impossible'));
        reader.readAsText(file);
    });
}

// ============================================
// SYNC QUEUE
// ============================================

function addToSyncQueue(operation, data) {
    syncQueue.push({ operation, data, timestamp: Date.now() });
    try { localStorage.setItem('manlore_sync_queue', JSON.stringify(syncQueue)); } catch (e) { }
}

function loadSyncQueue() {
    try {
        const raw = localStorage.getItem('manlore_sync_queue');
        syncQueue = raw ? JSON.parse(raw) : [];
    } catch { syncQueue = []; }
}

async function processSyncQueue() {
    if (!isOnline || syncQueue.length === 0 || isGuestMode || storageMode === 'local') return;
    console.log('[Sync] Processing', syncQueue.length, 'operations...');
    const failed = [];
    for (const task of syncQueue) {
        try {
            if (task.operation === 'create') await createItemCloud(task.data);
            else if (task.operation === 'update') await updateItem(task.data.id, task.data);
            else if (task.operation === 'delete') await deleteItem(task.data.id);
        } catch (e) {
            console.error('[Sync] Task failed:', e);
            failed.push(task);
        }
    }
    syncQueue = failed;
    try { localStorage.setItem('manlore_sync_queue', JSON.stringify(syncQueue)); } catch (e) { }
}

function startAutoSync() {
    if (autoSyncInterval) return;
    autoSyncInterval = setInterval(async () => {
        if (isOnline && currentUser && !isGuestMode && storageMode === 'cloud') {
            await processSyncQueue();
        }
    }, 30000);
}

function stopAutoSync() {
    if (autoSyncInterval) { clearInterval(autoSyncInterval); autoSyncInterval = null; }
}

// ============================================
// ONLINE/OFFLINE
// ============================================

function updateOnlineStatus(online) {
    isOnline = online;
    const indicator = document.getElementById('onlineStatus');
    if (!indicator) return;
    const dot = indicator.querySelector('.status-dot');
    const text = indicator.querySelector('.status-text');
    if (dot) { dot.classList.toggle('offline', !online); }
    if (text) { text.textContent = online ? i18n.t('header.online') : i18n.t('header.offline'); }
    if (online && !isGuestMode && storageMode === 'cloud') processSyncQueue();
}

window.addEventListener('online', () => { console.log('[Net] Online'); updateOnlineStatus(true); });
window.addEventListener('offline', () => { console.log('[Net] Offline'); updateOnlineStatus(false); });

document.addEventListener('DOMContentLoaded', initializeBackend);
console.log('[Logic] Module loaded');
