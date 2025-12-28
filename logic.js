// logic.js - Back4App Database Logic
// Initialize Parse
Parse.initialize("vnaPY79T1WzfEYp84Mve2PAoHbexPaATo43qickr", "5ehozciKmSQZkc8cmmshKfMbvnCLsc2PDB8K1VGS");
Parse.serverURL = 'https://parseapi.back4app.com';

// Global Variables
let currentUser = null;
let items = [];
let syncQueue = [];
let isOnline = navigator.onLine;

// Authentication Functions
async function loginUser(username, password) {
    try {
        currentUser = await Parse.User.logIn(username, password);
        return { success: true, user: currentUser };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function signupUser(username, email, password) {
    try {
        const user = new Parse.User();
        user.set('username', username);
        user.set('email', email);
        user.set('password', password);
        
        currentUser = await user.signUp();
        return { success: true, user: currentUser };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

async function logoutUser() {
    try {
        await Parse.User.logOut();
        currentUser = null;
        items = [];
        localStorage.clear();
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

function getCurrentUser() {
    return Parse.User.current();
}

function isUserLoggedIn() {
    return Parse.User.current() !== null;
}

// Data Loading Functions
async function loadFromCloud() {
    if (!currentUser) {
        throw new Error('No user logged in');
    }
    
    const ItemClass = Parse.Object.extend('Items');
    const query = new Parse.Query(ItemClass);
    query.equalTo('user', currentUser);
    query.descending('createdAt');
    query.limit(1000);
    
    const results = await query.find();
    items = results.map(obj => ({
        id: obj.id,
        title: obj.get('title'),
        type: obj.get('type'),
        status: obj.get('status'),
        rating: obj.get('rating') || 0,
        genres: obj.get('genres') || [],
        link: obj.get('link') || '',
        image: obj.get('image') || '',
        chapters: obj.get('chapters') || 0,
        notes: obj.get('notes') || '',
        createdAt: obj.get('createdAt'),
        updatedAt: obj.get('updatedAt')
    }));
    
    return items;
}

function saveToLocalStorage() {
    localStorage.setItem('manlore_items', JSON.stringify(items));
    localStorage.setItem('manlore_user', currentUser ? currentUser.get('username') : '');
}

function loadFromLocalStorage() {
    const saved = localStorage.getItem('manlore_items');
    if (saved) {
        items = JSON.parse(saved);
    }
    return items;
}

// CRUD Operations
async function createItem(data) {
    const ItemClass = Parse.Object.extend('Items');
    const item = new ItemClass();
    
    item.set('user', currentUser);
    item.set('title', data.title);
    item.set('type', data.type);
    item.set('status', data.status);
    item.set('rating', data.rating);
    item.set('genres', data.genres);
    item.set('chapters', data.chapters);
    item.set('link', data.link);
    item.set('image', data.image);
    item.set('notes', data.notes);
    
    if (isOnline) {
        try {
            const savedItem = await item.save();
            const newItem = {
                id: savedItem.id,
                ...data,
                createdAt: savedItem.get('createdAt'),
                updatedAt: savedItem.get('updatedAt')
            };
            items.push(newItem);
            saveToLocalStorage();
            return { success: true, item: newItem };
        } catch (error) {
            return { success: false, error: error.message };
        }
    } else {
        // Offline mode - save locally
        syncQueue.push({ action: 'create', data: item });
        const tempId = 'temp_' + Date.now();
        const newItem = { id: tempId, ...data, createdAt: new Date(), updatedAt: new Date() };
        items.push(newItem);
        saveToLocalStorage();
        localStorage.setItem('manlore_sync_queue', JSON.stringify(syncQueue));
        return { success: true, item: newItem, offline: true };
    }
}

async function updateItem(id, data) {
    const ItemClass = Parse.Object.extend('Items');
    const query = new Parse.Query(ItemClass);
    
    if (isOnline && !id.startsWith('temp_')) {
        try {
            const item = await query.get(id);
            item.set('title', data.title);
            item.set('type', data.type);
            item.set('status', data.status);
            item.set('rating', data.rating);
            item.set('genres', data.genres);
            item.set('chapters', data.chapters);
            item.set('link', data.link);
            item.set('image', data.image);
            item.set('notes', data.notes);
            
            await item.save();
            
            // Update local array
            const index = items.findIndex(i => i.id === id);
            if (index !== -1) {
                items[index] = { ...items[index], ...data, updatedAt: new Date() };
                saveToLocalStorage();
            }
            
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    } else {
        // Offline or temp item - update locally
        const index = items.findIndex(i => i.id === id);
        if (index !== -1) {
            items[index] = { ...items[index], ...data, updatedAt: new Date() };
            saveToLocalStorage();
        }
        
        if (!isOnline) {
            syncQueue.push({ action: 'update', id, data });
            localStorage.setItem('manlore_sync_queue', JSON.stringify(syncQueue));
        }
        
        return { success: true, offline: true };
    }
}

async function deleteItem(id) {
    const ItemClass = Parse.Object.extend('Items');
    const query = new Parse.Query(ItemClass);
    
    if (isOnline && !id.startsWith('temp_')) {
        try {
            const item = await query.get(id);
            await item.destroy();
            
            // Remove from local array
            items = items.filter(i => i.id !== id);
            saveToLocalStorage();
            
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    } else {
        // Offline or temp item - delete locally
        items = items.filter(i => i.id !== id);
        saveToLocalStorage();
        
        if (!isOnline && !id.startsWith('temp_')) {
            syncQueue.push({ action: 'delete', id });
            localStorage.setItem('manlore_sync_queue', JSON.stringify(syncQueue));
        }
        
        return { success: true, offline: true };
    }
}

// Sync Functions
async function processSyncQueue() {
    if (syncQueue.length === 0) return { success: true, synced: 0 };
    
    let synced = 0;
    const errors = [];
    
    for (const task of syncQueue) {
        try {
            if (task.action === 'create') {
                await task.data.save();
                synced++;
            } else if (task.action === 'update') {
                const ItemClass = Parse.Object.extend('Items');
                const query = new Parse.Query(ItemClass);
                const item = await query.get(task.id);
                
                Object.keys(task.data).forEach(key => {
                    item.set(key, task.data[key]);
                });
                
                await item.save();
                synced++;
            } else if (task.action === 'delete') {
                const ItemClass = Parse.Object.extend('Items');
                const query = new Parse.Query(ItemClass);
                const item = await query.get(task.id);
                await item.destroy();
                synced++;
            }
        } catch (error) {
            errors.push({ task, error: error.message });
            console.error('Sync error:', error);
        }
    }
    
    // Clear successful syncs
    if (synced > 0) {
        syncQueue = errors.map(e => e.task);
        localStorage.setItem('manlore_sync_queue', JSON.stringify(syncQueue));
    }
    
    return { 
        success: errors.length === 0, 
        synced, 
        errors: errors.length,
        remaining: syncQueue.length 
    };
}

async function syncNow() {
    if (!isOnline) {
        return { success: false, error: 'Offline' };
    }
    
    try {
        // Process pending sync queue first
        if (syncQueue.length > 0) {
            await processSyncQueue();
        }
        
        // Then load fresh data from cloud
        await loadFromCloud();
        saveToLocalStorage();
        
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Online/Offline Status
function updateOnlineStatus(online) {
    isOnline = online;
    
    if (online) {
        // Auto-sync when coming back online
        if (syncQueue.length > 0) {
            processSyncQueue().then(result => {
                console.log('Auto-sync completed:', result);
            });
        }
    }
}

function getOnlineStatus() {
    return isOnline;
}

function getSyncQueueLength() {
    return syncQueue.length;
}

// Initialize sync queue from localStorage
function initSyncQueue() {
    const saved = localStorage.getItem('manlore_sync_queue');
    if (saved) {
        try {
            syncQueue = JSON.parse(saved);
        } catch (e) {
            syncQueue = [];
        }
    }
}

// Get all items (for filtering/rendering)
function getAllItems() {
    return items;
}

function getItemById(id) {
    return items.find(i => i.id === id);
}

// Statistics
function getStats() {
    return {
        total: items.length,
        reading: items.filter(i => i.status === 'reading').length,
        completed: items.filter(i => i.status === 'completed').length,
        planToRead: items.filter(i => i.status === 'plan-to-read').length,
        dropped: items.filter(i => i.status === 'dropped').length
    };
}

// Export for import in app.js
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        loginUser,
        signupUser,
        logoutUser,
        getCurrentUser,
        isUserLoggedIn,
        loadFromCloud,
        saveToLocalStorage,
        loadFromLocalStorage,
        createItem,
        updateItem,
        deleteItem,
        processSyncQueue,
        syncNow,
        updateOnlineStatus,
        getOnlineStatus,
        getSyncQueueLength,
        initSyncQueue,
        getAllItems,
        getItemById,
        getStats
    };
}
