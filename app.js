// app.js - UI and Application Logic
// Global UI Variables
let currentEditId = null;
let allGenres = new Set();

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
    initSyncQueue();
    checkUserSession();
    setupEventListeners();
    setupOnlineOfflineListeners();
    registerServiceWorker();
});

// Check User Session
async function checkUserSession() {
    const user = getCurrentUser();
    
    if (!user) {
        showAuthModal();
    } else {
        document.getElementById('usernameDisplay').textContent = user.get('username');
        hideAuthModal();
        showMainApp();
        await loadAllData();
    }
}

// Load All Data
async function loadAllData() {
    try {
        const online = getOnlineStatus();
        
        if (online) {
            const items = await loadFromCloud();
            updateGenresFromItems(items);
        } else {
            const items = loadFromLocalStorage();
            updateGenresFromItems(items);
        }
        
        updateGenreFilter();
        renderItems();
        updateStats();
        updateSyncStatusUI();
    } catch (error) {
        console.error('Error loading data:', error);
        const items = loadFromLocalStorage();
        updateGenresFromItems(items);
        updateGenreFilter();
        renderItems();
        updateStats();
    }
}

// Update Genres Set
function updateGenresFromItems(items) {
    allGenres.clear();
    items.forEach(item => {
        if (item.genres) {
            item.genres.forEach(genre => allGenres.add(genre));
        }
    });
}

// Show/Hide Auth Modal
function showAuthModal() {
    document.getElementById('authModal').classList.remove('hidden');
    document.getElementById('authModal').classList.add('flex');
}

function hideAuthModal() {
    document.getElementById('authModal').classList.add('hidden');
    document.getElementById('authModal').classList.remove('flex');
}

function showMainApp() {
    document.getElementById('mainApp').classList.remove('hidden');
}

// Auth Tab Functions
window.showLogin = function() {
    document.getElementById('loginForm').classList.remove('hidden');
    document.getElementById('signupForm').classList.add('hidden');
    document.getElementById('loginTab').classList.add('bg-gradient-to-r', 'from-neon-blue', 'to-neon-purple');
    document.getElementById('signupTab').classList.remove('bg-gradient-to-r', 'from-neon-blue', 'to-neon-purple');
}

window.showSignup = function() {
    document.getElementById('signupForm').classList.remove('hidden');
    document.getElementById('loginForm').classList.add('hidden');
    document.getElementById('signupTab').classList.add('bg-gradient-to-r', 'from-neon-blue', 'to-neon-purple');
    document.getElementById('loginTab').classList.remove('bg-gradient-to-r', 'from-neon-blue', 'to-neon-purple');
}

// Setup Event Listeners
function setupEventListeners() {
    // Auth Forms
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('signupForm').addEventListener('submit', handleSignup);
    
    // Menu
    document.getElementById('menuBtn').addEventListener('click', toggleSidebar);
    document.getElementById('closeSidebar').addEventListener('click', toggleSidebar);
    document.getElementById('searchBtn').addEventListener('click', toggleSearch);
    
    // Filters
    document.getElementById('filterType').addEventListener('change', applyFilters);
    document.getElementById('filterStatus').addEventListener('change', applyFilters);
    document.getElementById('filterGenre').addEventListener('change', applyFilters);
    document.getElementById('sortBy').addEventListener('change', applyFilters);
    document.getElementById('searchInput').addEventListener('input', debounce(applyFilters, 300));
    
    // Item Form
    document.getElementById('itemForm').addEventListener('submit', handleItemSubmit);
    document.getElementById('itemImage').addEventListener('input', handleImagePreview);
    
    // Rating Stars
    document.querySelectorAll('#ratingStars i').forEach(star => {
        star.addEventListener('click', handleRatingClick);
        star.addEventListener('mouseenter', handleRatingHover);
    });
    document.getElementById('ratingStars').addEventListener('mouseleave', resetRatingHover);
}

// Handle Login
async function handleLogin(e) {
    e.preventDefault();
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    
    const result = await loginUser(username, password);
    
    if (result.success) {
        showToast('Login successful!', 'success');
        document.getElementById('usernameDisplay').textContent = result.user.get('username');
        hideAuthModal();
        showMainApp();
        await loadAllData();
    } else {
        showAuthError(result.error);
    }
}

// Handle Signup
async function handleSignup(e) {
    e.preventDefault();
    const username = document.getElementById('signupUsername').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const password = document.getElementById('signupPassword').value;
    
    const result = await signupUser(username, email, password);
    
    if (result.success) {
        showToast('Account created successfully!', 'success');
        document.getElementById('usernameDisplay').textContent = result.user.get('username');
        hideAuthModal();
        showMainApp();
        await loadAllData();
    } else {
        showAuthError(result.error);
    }
}

// Show Auth Error
function showAuthError(message) {
    const errorDiv = document.getElementById('authError');
    errorDiv.textContent = message;
    errorDiv.classList.remove('hidden');
    setTimeout(() => errorDiv.classList.add('hidden'), 3000);
}

// Logout
window.logout = async function() {
    if (confirm('Are you sure you want to logout?')) {
        await logoutUser();
        location.reload();
    }
}

// Handle Item Submit
async function handleItemSubmit(e) {
    e.preventDefault();
    
    const itemData = {
        title: document.getElementById('itemTitle').value.trim(),
        type: document.getElementById('itemType').value,
        status: document.getElementById('itemStatus').value,
        rating: parseInt(document.getElementById('itemRating').value),
        genres: document.getElementById('itemGenres').value.split(',').map(g => g.trim()).filter(g => g),
        chapters: parseInt(document.getElementById('itemChapters').value) || 0,
        link: document.getElementById('itemLink').value.trim(),
        image: document.getElementById('itemImage').value.trim(),
        notes: document.getElementById('itemNotes').value.trim()
    };
    
    itemData.genres.forEach(genre => allGenres.add(genre));
    
    let result;
    if (currentEditId) {
        result = await updateItem(currentEditId, itemData);
        if (result.success) {
            showToast('Item updated successfully!', 'success');
        }
    } else {
        result = await createItem(itemData);
        if (result.success) {
            showToast('Item added successfully!', 'success');
        }
    }
    
    if (!result.success) {
        showToast('Error: ' + result.error, 'error');
        return;
    }
    
    if (result.offline) {
        showToast('Saved offline. Will sync when online.', 'warning');
    }
    
    closeItemModal();
    updateGenreFilter();
    renderItems();
    updateStats();
    updateSyncStatusUI();
}

// Open Add Modal
window.openAddModal = function() {
    currentEditId = null;
    document.getElementById('modalTitle').textContent = 'Add Title';
    document.getElementById('itemForm').reset();
    document.getElementById('itemRating').value = '0';
    resetRating();
    document.getElementById('imagePreview').classList.add('hidden');
    document.getElementById('itemModal').classList.remove('hidden');
    document.getElementById('itemModal').classList.add('flex');
}

// Open Edit Modal
window.openEditModal = function(id) {
    const item = getItemById(id);
    if (!item) return;
    
    currentEditId = id;
    document.getElementById('modalTitle').textContent = 'Edit Title';
    document.getElementById('itemTitle').value = item.title;
    document.getElementById('itemType').value = item.type;
    document.getElementById('itemStatus').value = item.status;
    document.getElementById('itemRating').value = item.rating;
    document.getElementById('itemGenres').value = (item.genres || []).join(', ');
    document.getElementById('itemChapters').value = item.chapters || 0;
    document.getElementById('itemLink').value = item.link || '';
    document.getElementById('itemImage').value = item.image || '';
    document.getElementById('itemNotes').value = item.notes || '';
    
    setRating(item.rating);
    
    if (item.image) {
        document.getElementById('previewImg').src = item.image;
        document.getElementById('imagePreview').classList.remove('hidden');
    }
    
    document.getElementById('itemModal').classList.remove('hidden');
    document.getElementById('itemModal').classList.add('flex');
}

// Close Item Modal
window.closeItemModal = function() {
    document.getElementById('itemModal').classList.add('hidden');
    document.getElementById('itemModal').classList.remove('flex');
    currentEditId = null;
}

// View Item
window.viewItem = function(id) {
    const item = getItemById(id);
    if (!item) return;
    
    document.getElementById('viewTitle').textContent = item.title;
    
    const statusColors = {
        'reading': 'text-neon-blue',
        'completed': 'text-neon-purple',
        'plan-to-read': 'text-neon-pink',
        'dropped': 'text-red-500'
    };
    
    const statusLabels = {
        'reading': 'Reading',
        'completed': 'Completed',
        'plan-to-read': 'Plan to Read',
        'dropped': 'Dropped'
    };
    
    let content = '';
    
    if (item.image) {
        content += `<img src="${item.image}" alt="${escapeHtml(item.title)}" class="w-full max-h-96 object-cover rounded-lg mb-6">`;
    }
    
    content += `
        <div class="grid grid-cols-2 gap-4">
            <div>
                <p class="text-sm text-gray-400 mb-1">Type</p>
                <p class="font-semibold text-neon-cyan">${item.type.toUpperCase()}</p>
            </div>
            <div>
                <p class="text-sm text-gray-400 mb-1">Status</p>
                <p class="font-semibold ${statusColors[item.status]}">${statusLabels[item.status]}</p>
            </div>
            <div>
                <p class="text-sm text-gray-400 mb-1">Rating</p>
                <p class="star-rating">${'★'.repeat(item.rating)}${'☆'.repeat(5-item.rating)}</p>
            </div>
            <div>
                <p class="text-sm text-gray-400 mb-1">Chapters</p>
                <p class="font-semibold">${item.chapters || 0}</p>
            </div>
        </div>
    `;
    
    if (item.genres && item.genres.length > 0) {
        content += `
            <div class="mt-4">
                <p class="text-sm text-gray-400 mb-2">Genres</p>
                <div class="flex flex-wrap gap-2">
                    ${item.genres.map(g => `<span class="px-3 py-1 rounded-full glass text-sm">${escapeHtml(g)}</span>`).join('')}
                </div>
            </div>
        `;
    }
    
    if (item.link) {
        content += `
            <div class="mt-4">
                <a href="${escapeHtml(item.link)}" target="_blank" class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-neon-blue to-neon-purple hover:neon-glow transition-all">
                    <i class="fas fa-external-link-alt"></i>
                    Open Link
                </a>
            </div>
        `;
    }
    
    if (item.notes) {
        content += `
            <div class="mt-4">
                <p class="text-sm text-gray-400 mb-2">Notes</p>
                <p class="glass p-4 rounded-lg">${escapeHtml(item.notes)}</p>
            </div>
        `;
    }
    
    content += `
        <div class="flex gap-3 mt-6">
            <button onclick="closeViewModal(); openEditModal('${item.id}')" class="flex-1 py-3 rounded-lg bg-gradient-to-r from-neon-blue to-neon-purple hover:neon-glow transition-all">
                <i class="fas fa-edit mr-2"></i>Edit
            </button>
            <button onclick="handleDeleteItem('${item.id}')" class="flex-1 py-3 rounded-lg bg-red-500 bg-opacity-20 hover:bg-opacity-40 transition-all">
                <i class="fas fa-trash mr-2"></i>Delete
            </button>
        </div>
    `;
    
    document.getElementById('viewContent').innerHTML = content;
    document.getElementById('viewModal').classList.remove('hidden');
    document.getElementById('viewModal').classList.add('flex');
}

// Close View Modal
window.closeViewModal = function() {
    document.getElementById('viewModal').classList.add('hidden');
    document.getElementById('viewModal').classList.remove('flex');
}

// Delete Item
window.handleDeleteItem = async function(id) {
    if (!confirm('Are you sure you want to delete this item?')) return;
    
    const result = await deleteItem(id);
    
    if (result.success) {
        showToast('Item deleted successfully!', 'success');
        closeViewModal();
        renderItems();
        updateStats();
        updateSyncStatusUI();
    } else {
        showToast('Error deleting item: ' + result.error, 'error');
    }
}

// Rating Functions
function handleRatingClick(e) {
    const rating = parseInt(e.target.dataset.rating);
    document.getElementById('itemRating').value = rating;
    setRating(rating);
}

function handleRatingHover(e) {
    const rating = parseInt(e.target.dataset.rating);
    const stars = document.querySelectorAll('#ratingStars i');
    stars.forEach((star, index) => {
        if (index < rating) {
            star.classList.remove('far');
            star.classList.add('fas', 'text-yellow-400');
        } else {
            star.classList.remove('fas', 'text-yellow-400');
            star.classList.add('far');
        }
    });
}

function resetRatingHover() {
    const rating = parseInt(document.getElementById('itemRating').value);
    setRating(rating);
}

function setRating(rating) {
    const stars = document.querySelectorAll('#ratingStars i');
    stars.forEach((star, index) => {
        if (index < rating) {
            star.classList.remove('far');
            star.classList.add('fas', 'text-yellow-400');
        } else {
            star.classList.remove('fas', 'text-yellow-400');
            star.classList.add('far');
        }
    });
}

function resetRating() {
    setRating(0);
}

// Image Preview
function handleImagePreview() {
    const url = document.getElementById('itemImage').value.trim();
    const preview = document.getElementById('imagePreview');
    const img = document.getElementById('previewImg');
    
    if (url) {
        img.src = url;
        preview.classList.remove('hidden');
        img.onerror = () => preview.classList.add('hidden');
    } else {
        preview.classList.add('hidden');
    }
}

// Render Items
function renderItems() {
    const filtered = getFilteredItems();
    const grid = document.getElementById('itemsGrid');
    const empty = document.getElementById('emptyState');
    
    if (filtered.length === 0) {
        grid.innerHTML = '';
        empty.classList.remove('hidden');
        return;
    }
    
    empty.classList.add('hidden');
    
    const statusColors = {
        'reading': 'bg-blue-500',
        'completed': 'bg-purple-500',
        'plan-to-read': 'bg-pink-500',
        'dropped': 'bg-red-500'
    };
    
    grid.innerHTML = filtered.map(item => `
        <div class="glass rounded-xl overflow-hidden hover:neon-glow transition-all cursor-pointer group" onclick="viewItem('${item.id}')">
            ${item.image 
                ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" class="w-full h-64 object-cover group-hover:scale-105 transition-transform duration-300">` 
                : `<div class="w-full h-64 bg-gradient-to-br from-neon-blue to-neon-purple flex items-center justify-center">
                     <i class="fas fa-book text-6xl opacity-30"></i>
                   </div>`
            }
            <div class="p-4">
                <h3 class="text-lg font-bold mb-2 truncate">${escapeHtml(item.title)}</h3>
                <div class="flex items-center justify-between mb-2">
                    <span class="text-xs px-2 py-1 rounded-full ${statusColors[item.status]} bg-opacity-20 border border-current">${item.status.replace('-', ' ')}</span>
                    <span class="text-xs text-neon-cyan">${item.type.toUpperCase()}</span>
                </div>
                ${item.rating > 0 ? `<div class="star-rating text-sm mb-2">${'★'.repeat(item.rating)}${'☆'.repeat(5-item.rating)}</div>` : ''}
                ${item.genres && item.genres.length > 0 ? `
                    <div class="flex flex-wrap gap-1 mt-2">
                        ${item.genres.slice(0, 3).map(g => `<span class="text-xs px-2 py-1 rounded-full glass">${escapeHtml(g)}</span>`).join('')}
                        ${item.genres.length > 3 ? `<span class="text-xs px-2 py-1 rounded-full glass">+${item.genres.length - 3}</span>` : ''}
                    </div>
                ` : ''}
            </div>
        </div>
    `).join('');
}

// Get Filtered Items
function getFilteredItems() {
    let filtered = [...getAllItems()];
    
    const type = document.getElementById('filterType').value;
    if (type !== 'all') {
        filtered = filtered.filter(i => i.type === type);
    }
    
    const status = document.getElementById('filterStatus').value;
    if (status !== 'all') {
        filtered = filtered.filter(i => i.status === status);
    }
    
    const genre = document.getElementById('filterGenre').value;
    if (genre !== 'all') {
        filtered = filtered.filter(i => i.genres && i.genres.includes(genre));
    }
    
    const search = document.getElementById('searchInput').value.toLowerCase();
    if (search) {
        filtered = filtered.filter(i => 
            i.title.toLowerCase().includes(search) ||
            (i.genres && i.genres.some(g => g.toLowerCase().includes(search))) ||
            (i.notes && i.notes.toLowerCase().includes(search))
        );
    }
    
    const sort = document.getElementById('sortBy').value;
    filtered.sort((a, b) => {
        switch(sort) {
            case 'date-desc': return new Date(b.createdAt) - new Date(a.createdAt);
            case 'date-asc': return new Date(a.createdAt) - new Date(b.createdAt);
            case 'title-asc': return a.title.localeCompare(b.title);
            case 'title-desc': return b.title.localeCompare(a.title);
            case 'rating-desc': return (b.rating || 0) - (a.rating || 0);
            case 'rating-asc': return (a.rating || 0) - (b.rating || 0);
            default: return 0;
        }
    });
    
    return filtered;
}

// Apply Filters
function applyFilters() {
    renderItems();
}

// Update Stats
function updateStats() {
    const stats = getStats();
    document.getElementById('totalCount').textContent = stats.total;
    document.getElementById('readingCount').textContent = stats.reading;
    document.getElementById('completedCount').textContent = stats.completed;
    document.getElementById('planCount').textContent = stats.planToRead;
}

// Update Genre Filter
function updateGenreFilter() {
    const select = document.getElementById('filterGenre');
    const current = select.value;
    
    select.innerHTML = '<option value="all">All</option>';
    [...allGenres].sort().forEach(genre => {
        const option = document.createElement('option');
        option.value = genre;
        option.textContent = genre;
        select.appendChild(option);
    });
    
    if (allGenres.has(current)) {
        select.value = current;
    }
}

// Toggle Sidebar
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('-translate-x-full');
}

// Toggle Search
function toggleSearch() {
    const searchBar = document.getElementById('searchBar');
    searchBar.classList.toggle('hidden');
    if (!searchBar.classList.contains('hidden')) {
        document.getElementById('searchInput').focus();
    }
}

// Export Data
window.exportData = function() {
    const items = getAllItems();
    const data = JSON.stringify(items, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `manlore-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Data exported successfully!', 'success');
}

// Import Data
window.importData = function() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
            const text = await file.text();
            const data = JSON.parse(text);
            
            if (!Array.isArray(data)) {
                throw new Error('Invalid file format');
            }
            
            if (confirm(`Import ${data.length} items? This will replace your current data.`)) {
                // This would need to be implemented in logic.js
                showToast('Import feature coming soon!', 'info');
            }
        } catch (error) {
            showToast('Error importing data: ' + error.message, 'error');
        }
    };
    
    input.click();
}

// Sync Now
window.syncNow = async function() {
    if (!getOnlineStatus()) {
        showToast('Cannot sync while offline', 'error');
        return;
    }
    
    showToast('Syncing...', 'info');
    const result = await syncNow();
    
    if (result.success) {
        await loadAllData();
        showToast('Sync complete!', 'success');
    } else {
        showToast('Sync failed: ' + result.error, 'error');
    }
}

// Online/Offline Listeners
function setupOnlineOfflineListeners() {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
}

function handleOnline() {
    updateOnlineStatus(true);
    showToast('Back online!', 'success');
    updateSyncStatusUI();
}

function handleOffline() {
    updateOnlineStatus(false);
    showToast('You are offline', 'warning');
    updateSyncStatusUI();
}

// Update Sync Status UI
function updateSyncStatusUI() {
    const status = document.getElementById('syncStatus');
    const online = getOnlineStatus();
    const queueLength = getSyncQueueLength();
    
    const icon = online ? 'fa-check-circle text-green-400' : 'fa-exclamation-circle text-yellow-400';
    const message = online 
        ? (queueLength > 0 ? `Syncing ${queueLength} items...` : 'Synced') 
        : `Offline (${queueLength} pending)`;
    
    status.innerHTML = `<i class="fas ${icon} mr-1"></i>${message}`;
}

// Navigation Functions
window.navigateHome = function() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

window.showStats = function() {
    document.getElementById('statsSection').scrollIntoView({ behavior: 'smooth' });
}

// Show Toast
function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toastIcon');
    const msg = document.getElementById('toastMessage');
    
    const icons = {
        success: 'fas fa-check-circle text-green-400',
        error: 'fas fa-exclamation-circle text-red-400',
        warning: 'fas fa-exclamation-triangle text-yellow-400',
        info: 'fas fa-info-circle text-blue-400'
    };
    
    icon.className = icons[type] || icons.info;
    msg.textContent = message;
    
    toast.classList.remove('hidden');
    setTimeout(() => toast.classList.add('hidden'), 3000);
}

// Service Worker
function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => console.log('Service Worker registered:', reg))
            .catch(err => console.error('Service Worker error:', err));
    }
}

// Utility Functions
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}
