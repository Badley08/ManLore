/* ============================================
   MANLORE - LOGIC.JS
   Back4App Parse SDK Integration v2.0.1
   ============================================ */

// Configuration Parse SDK
Parse.initialize(
    "vnaPY79T1WzfEYp84Mve2PAoHbexPaATo43qickr",
    "5ehozciKmSQZkc8cmmshKfMbvnCLsc2PDB8K1VGS"
);
Parse.serverURL = 'https://parseapi.back4app.com/';

// Variables globales
let currentUser = null;
let syncQueue = [];
let isOnline = navigator.onLine;
let autoSyncInterval = null;

// ============================================
// AUTHENTIFICATION
// ============================================

/**
 * Inscription d'un nouvel utilisateur
 */
async function signUp(username, email, password) {
    try {
        const user = new Parse.User();
        user.set("username", username);
        user.set("email", email);
        user.set("password", password);
        
        await user.signUp();
        currentUser = user;
        console.log('[Auth] User signed up successfully');
        return { success: true, user };
    } catch (error) {
        console.error('[Auth] Signup error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Connexion utilisateur
 */
async function logIn(usernameOrEmail, password) {
    try {
        // Tenter connexion avec username
        let user;
        try {
            user = await Parse.User.logIn(usernameOrEmail, password);
        } catch (e) {
            // Si échec, tenter avec email
            const query = new Parse.Query(Parse.User);
            query.equalTo("email", usernameOrEmail);
            const userByEmail = await query.first();
            
            if (userByEmail) {
                user = await Parse.User.logIn(userByEmail.get("username"), password);
            } else {
                throw e;
            }
        }
        
        currentUser = user;
        console.log('[Auth] User logged in successfully');
        return { success: true, user };
    } catch (error) {
        console.error('[Auth] Login error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Déconnexion utilisateur
 */
async function logOut() {
    try {
        await Parse.User.logOut();
        currentUser = null;
        console.log('[Auth] User logged out');
        return { success: true };
    } catch (error) {
        console.error('[Auth] Logout error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Vérifier si un utilisateur est connecté
 */
function getCurrentUser() {
    const user = Parse.User.current();
    if (user) {
        currentUser = user;
        return user;
    }
    return null;
}

// ============================================
// GESTION DES ITEMS (CRUD)
// ============================================

/**
 * Créer un nouvel item dans la collection
 */
async function createItem(itemData) {
    try {
        if (!currentUser) {
            throw new Error("Utilisateur non connecté");
        }
        
        const Item = Parse.Object.extend("Items");
        const item = new Item();
        
        // Définir les champs
        item.set("title", itemData.title);
        item.set("type", itemData.type);
        item.set("status", itemData.status);
        item.set("rating", itemData.rating || 0);
        item.set("genres", itemData.genres || []);
        item.set("link", itemData.link || "");
        item.set("image", itemData.image || "");
        item.set("imageUrl", itemData.imageUrl || "");
        item.set("chapters", itemData.chapters || 0);
        item.set("notes", itemData.notes || "");
        item.set("userId", currentUser);
        
        const savedItem = await item.save();
        
        // Sauvegarder aussi en localStorage
        saveToLocalStorage(savedItem);
        
        return { success: true, item: savedItem };
    } catch (error) {
        console.error('[CRUD] Create item error:', error);
        
        // Si offline, ajouter à la queue
        if (!isOnline) {
            addToSyncQueue('create', itemData);
            // Créer un ID temporaire local
            const tempId = 'temp_' + Date.now();
            const tempItem = { id: tempId, ...itemData, createdAt: new Date() };
            saveToLocalStorage(tempItem);
            return { success: true, item: tempItem, offline: true };
        }
        
        return { success: false, error: error.message };
    }
}

/**
 * Récupérer tous les items de l'utilisateur
 */
async function fetchAllItems() {
    try {
        if (!currentUser) {
            // Si pas connecté, charger depuis localStorage
            return { success: true, items: loadFromLocalStorage(), offline: true };
        }
        
        const Item = Parse.Object.extend("Items");
        const query = new Parse.Query(Item);
        query.equalTo("userId", currentUser);
        query.descending("createdAt");
        query.limit(1000); // Limite raisonnable
        
        const results = await query.find();
        
        // Sauvegarder en localStorage
        results.forEach(item => saveToLocalStorage(item));
        
        return { success: true, items: results };
    } catch (error) {
        console.error('[CRUD] Fetch items error:', error);
        
        // Fallback sur localStorage
        const localItems = loadFromLocalStorage();
        return { success: true, items: localItems, offline: true };
    }
}

/**
 * Mettre à jour un item existant
 */
async function updateItem(itemId, updates) {
    try {
        if (!currentUser) {
            throw new Error("Utilisateur non connecté");
        }
        
        // Vérifier si c'est un ID temporaire
        if (itemId.startsWith('temp_')) {
            // Mettre à jour en localStorage seulement
            updateInLocalStorage(itemId, updates);
            addToSyncQueue('create', { ...updates, tempId: itemId });
            return { success: true, offline: true };
        }
        
        const Item = Parse.Object.extend("Items");
        const query = new Parse.Query(Item);
        const item = await query.get(itemId);
        
        // Mettre à jour les champs
        if (updates.title !== undefined) item.set("title", updates.title);
        if (updates.type !== undefined) item.set("type", updates.type);
        if (updates.status !== undefined) item.set("status", updates.status);
        if (updates.rating !== undefined) item.set("rating", updates.rating);
        if (updates.genres !== undefined) item.set("genres", updates.genres);
        if (updates.link !== undefined) item.set("link", updates.link);
        if (updates.image !== undefined) item.set("image", updates.image);
        if (updates.imageUrl !== undefined) item.set("imageUrl", updates.imageUrl);
        if (updates.chapters !== undefined) item.set("chapters", updates.chapters);
        if (updates.notes !== undefined) item.set("notes", updates.notes);
        
        const savedItem = await item.save();
        
        // Mettre à jour localStorage
        saveToLocalStorage(savedItem);
        
        return { success: true, item: savedItem };
    } catch (error) {
        console.error('[CRUD] Update item error:', error);
        
        // Si offline, ajouter à la queue
        if (!isOnline) {
            addToSyncQueue('update', { id: itemId, ...updates });
            updateInLocalStorage(itemId, updates);
            return { success: true, offline: true };
        }
        
        return { success: false, error: error.message };
    }
}

/**
 * Supprimer un item
 */
async function deleteItem(itemId) {
    try {
        if (!currentUser) {
            throw new Error("Utilisateur non connecté");
        }
        
        // Vérifier si c'est un ID temporaire
        if (itemId.startsWith('temp_')) {
            removeFromLocalStorage(itemId);
            return { success: true, offline: true };
        }
        
        const Item = Parse.Object.extend("Items");
        const query = new Parse.Query(Item);
        const item = await query.get(itemId);
        
        await item.destroy();
        
        // Supprimer de localStorage
        removeFromLocalStorage(itemId);
        
        return { success: true };
    } catch (error) {
        console.error('[CRUD] Delete item error:', error);
        
        // Si offline, ajouter à la queue
        if (!isOnline) {
            addToSyncQueue('delete', { id: itemId });
            removeFromLocalStorage(itemId);
            return { success: true, offline: true };
        }
        
        return { success: false, error: error.message };
    }
}

// ============================================
// GESTION LOCALSTORAGE
// ============================================

/**
 * Sauvegarder un item dans localStorage
 */
function saveToLocalStorage(item) {
    try {
        const items = loadFromLocalStorage();
        const itemData = parseItemToObject(item);
        
        // Vérifier si l'item existe déjà
        const index = items.findIndex(i => i.id === itemData.id);
        
        if (index !== -1) {
            items[index] = itemData;
        } else {
            items.push(itemData);
        }
        
        localStorage.setItem('manlore_items', JSON.stringify(items));
    } catch (error) {
        console.error('[Storage] Save to localStorage error:', error);
    }
}

/**
 * Charger tous les items depuis localStorage
 */
function loadFromLocalStorage() {
    try {
        const data = localStorage.getItem('manlore_items');
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('[Storage] Load from localStorage error:', error);
        return [];
    }
}

/**
 * Mettre à jour un item dans localStorage
 */
function updateInLocalStorage(itemId, updates) {
    try {
        const items = loadFromLocalStorage();
        const index = items.findIndex(i => i.id === itemId);
        
        if (index !== -1) {
            items[index] = { ...items[index], ...updates, updatedAt: new Date().toISOString() };
            localStorage.setItem('manlore_items', JSON.stringify(items));
        }
    } catch (error) {
        console.error('[Storage] Update in localStorage error:', error);
    }
}

/**
 * Supprimer un item de localStorage
 */
function removeFromLocalStorage(itemId) {
    try {
        const items = loadFromLocalStorage();
        const filtered = items.filter(i => i.id !== itemId);
        localStorage.setItem('manlore_items', JSON.stringify(filtered));
    } catch (error) {
        console.error('[Storage] Remove from localStorage error:', error);
    }
}

/**
 * Convertir un Parse Object en objet JavaScript
 */
function parseItemToObject(item) {
    if (item instanceof Parse.Object) {
        return {
            id: item.id,
            title: item.get("title"),
            type: item.get("type"),
            status: item.get("status"),
            rating: item.get("rating") || 0,
            genres: item.get("genres") || [],
            link: item.get("link") || "",
            image: item.get("image") || "",
            imageUrl: item.get("imageUrl") || "",
            chapters: item.get("chapters") || 0,
            notes: item.get("notes") || "",
            createdAt: item.get("createdAt"),
            updatedAt: item.get("updatedAt")
        };
    }
    return item;
}

// ============================================
// SYNCHRONISATION
// ============================================

/**
 * Ajouter une opération à la queue de synchronisation
 */
function addToSyncQueue(operation, data) {
    syncQueue.push({ operation, data, timestamp: Date.now() });
    localStorage.setItem('manlore_sync_queue', JSON.stringify(syncQueue));
}

/**
 * Charger la queue de synchronisation
 */
function loadSyncQueue() {
    try {
        const data = localStorage.getItem('manlore_sync_queue');
        syncQueue = data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('[Sync] Load queue error:', error);
        syncQueue = [];
    }
}

/**
 * Processer la queue de synchronisation
 */
async function processSyncQueue() {
    if (!isOnline || syncQueue.length === 0) return;
    
    console.log('[Sync] Processing queue...', syncQueue.length, 'operations');
    
    const processedQueue = [];
    
    for (const task of syncQueue) {
        try {
            switch (task.operation) {
                case 'create':
                    await createItem(task.data);
                    break;
                case 'update':
                    await updateItem(task.data.id, task.data);
                    break;
                case 'delete':
                    await deleteItem(task.data.id);
                    break;
            }
        } catch (error) {
            console.error('[Sync] Process task error:', error);
            processedQueue.push(task); // Garder en queue si échec
        }
    }
    
    syncQueue = processedQueue;
    localStorage.setItem('manlore_sync_queue', JSON.stringify(syncQueue));
    
    if (syncQueue.length === 0) {
        console.log('[Sync] Synchronization completed');
    }
}

/**
 * Démarrer l'auto-sync
 */
function startAutoSync() {
    if (autoSyncInterval) return;
    
    autoSyncInterval = setInterval(async () => {
        if (isOnline && currentUser) {
            await processSyncQueue();
        }
    }, 30000); // Toutes les 30 secondes
}

/**
 * Arrêter l'auto-sync
 */
function stopAutoSync() {
    if (autoSyncInterval) {
        clearInterval(autoSyncInterval);
        autoSyncInterval = null;
    }
}

// ============================================
// GESTION ONLINE/OFFLINE
// ============================================

/**
 * Mettre à jour le statut online/offline
 */
function updateOnlineStatus(online) {
    isOnline = online;
    
    const statusIndicator = document.getElementById('onlineStatus');
    if (statusIndicator) {
        const dot = statusIndicator.querySelector('.pulse');
        const text = statusIndicator.querySelector('span');
        
        if (online) {
            dot.classList.remove('bg-danger');
            dot.classList.add('bg-success');
            if (text) text.textContent = 'En ligne';
            
            // Processer la queue au retour online
            processSyncQueue();
        } else {
            dot.classList.remove('bg-success');
            dot.classList.add('bg-danger');
            if (text) text.textContent = 'Hors ligne';
        }
    }
}

// Écouter les changements de statut réseau
window.addEventListener('online', () => {
    console.log('[Network] Connection restored');
    updateOnlineStatus(true);
});

window.addEventListener('offline', () => {
    console.log('[Network] Connection lost');
    updateOnlineStatus(false);
});

// ============================================
// INITIALISATION
// ============================================

/**
 * Initialiser la logique Back4App
 */
function initializeBackend() {
    console.log('[Backend] Initializing...');
    
    // Charger la queue de sync
    loadSyncQueue();
    
    // Mettre à jour le statut online
    updateOnlineStatus(navigator.onLine);
    
    // Vérifier l'utilisateur connecté
    const user = getCurrentUser();
    if (user) {
        console.log('[Backend] User connected:', user.get('username'));
        currentUser = user;
        
        // Démarrer l'auto-sync
        startAutoSync();
    }
    
    console.log('[Backend] Initialized successfully');
}

// Initialiser au chargement
document.addEventListener('DOMContentLoaded', initializeBackend);
