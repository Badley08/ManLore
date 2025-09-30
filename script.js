// ManLore - PWA Application
// Data Storage
let items = [];
let currentEditId = null;
let allGenres = new Set();
const APP_VERSION = '1.0.1';

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    loadData();
    initEventListeners();
    updateGenreFilter();
    renderItems();
    updateStats();
    registerServiceWorker();
    checkOnlineStatus();
    displayVersion();
    initSidebar();
});

// Service Worker Registration
let deferredPrompt;
let swRegistration = null;

function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('sw.js')
            .then(reg => {
                console.log('Service Worker enregistré', reg);
                swRegistration = reg;
                
                // Check for updates
                reg.addEventListener('updatefound', () => {
                    const newWorker = reg.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showUpdateNotification();
                        }
                    });
                });
            })
            .catch(err => console.log('Erreur Service Worker', err));
            
        // Check for updates every hour
        setInterval(() => {
            if (swRegistration) {
                swRegistration.update();
            }
        }, 3600000);
    }
}

function showUpdateNotification() {
    if (confirm('Une nouvelle version de ManLore est disponible ! Voulez-vous mettre à jour maintenant ?')) {
        updateApp();
    }
}

// Check Online Status
function checkOnlineStatus() {
    const offlineIndicator = document.getElementById('offlineIndicator');
    
    function updateOnlineStatus() {
        if (navigator.onLine) {
            offlineIndicator.style.display = 'none';
        } else {
            offlineIndicator.style.display = 'block';
        }
    }
    
    window.addEventListener('online', updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    updateOnlineStatus();
}

// Load Data from localStorage
function loadData() {
    const savedData = localStorage.getItem('manlore_items');
    if (savedData) {
        items = JSON.parse(savedData);
        items.forEach(item => {
            if (item.genres) {
                item.genres.forEach(genre => allGenres.add(genre));
            }
        });
    }
}

// Save Data to localStorage
function saveData() {
    localStorage.setItem('manlore_items', JSON.stringify(items));
}

// Initialize Event Listeners
function initEventListeners() {
    // Modal controls
    document.getElementById('openAddModal').addEventListener('click', openAddModal);
    document.getElementById('closeModal').addEventListener('click', closeModal);
    document.getElementById('cancelBtn').addEventListener('click', closeModal);
    document.getElementById('closeViewModal').addEventListener('click', closeViewModal);
    
    // Form submission
    document.getElementById('addForm').addEventListener('submit', handleFormSubmit);
    
    // Rating input
    const stars = document.querySelectorAll('.rating-input .star');
    stars.forEach(star => {
        star.addEventListener('click', handleRatingClick);
        star.addEventListener('mouseenter', handleRatingHover);
    });
    document.querySelector('.rating-input').addEventListener('mouseleave', resetRatingHover);
    
    // Image upload
    document.getElementById('itemImageFile').addEventListener('change', handleImageUpload);
    document.getElementById('itemImage').addEventListener('input', handleImageUrlChange);
    
    // Link preview
    document.getElementById('itemLink').addEventListener('input', debounce(handleLinkPreview, 500));
    
    // Filters
    document.getElementById('filterType').addEventListener('change', applyFilters);
    document.getElementById('filterStatus').addEventListener('change', applyFilters);
    document.getElementById('filterGenre').addEventListener('change', applyFilters);
    document.getElementById('sortBy').addEventListener('change', applyFilters);
    
    // Search
    document.getElementById('searchToggle').addEventListener('click', toggleSearch);
    document.getElementById('searchInput').addEventListener('input', debounce(applyFilters, 300));
    
    // Close modal on backdrop click
    document.getElementById('addModal').addEventListener('click', (e) => {
        if (e.target.id === 'addModal') closeModal();
    });
    document.getElementById('viewModal').addEventListener('click', (e) => {
        if (e.target.id === 'viewModal') closeViewModal();
    });
}

// Sidebar Functions
function initSidebar() {
    const hamburger = document.getElementById('hamburgerMenu');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const closeBtn = document.getElementById('sidebarClose');
    
    hamburger.addEventListener('click', openSidebar);
    closeBtn.addEventListener('click', closeSidebar);
    overlay.addEventListener('click', closeSidebar);
    
    // Menu items
    document.getElementById('menuHome').addEventListener('click', (e) => {
        e.preventDefault();
        closeSidebar();
    });
    
    document.getElementById('menuStats').addEventListener('click', (e) => {
        e.preventDefault();
        scrollToStats();
        closeSidebar();
    });
    
    document.getElementById('menuExport').addEventListener('click', (e) => {
        e.preventDefault();
        exportData();
        closeSidebar();
    });
    
    document.getElementById('menuImport').addEventListener('click', (e) => {
        e.preventDefault();
        importData();
        closeSidebar();
    });
    
    document.getElementById('menuUpdate').addEventListener('click', (e) => {
        e.preventDefault();
        checkForUpdates();
    });
}

function openSidebar() {
    document.getElementById('sidebar').classList.add('active');
    document.getElementById('sidebarOverlay').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('active');
    document.getElementById('sidebarOverlay').classList.remove('active');
    document.body.style.overflow = '';
}

function displayVersion() {
    document.getElementById('appVersion').textContent = APP_VERSION;
}

// Update App Function
function checkForUpdates() {
    if (swRegistration) {
        document.getElementById('menuUpdate').innerHTML = '<span class="menu-icon">⏳</span><span>Vérification...</span>';
        
        swRegistration.update().then(() => {
            setTimeout(() => {
                if (navigator.serviceWorker.controller) {
                    alert('Vous utilisez déjà la dernière version de ManLore v' + APP_VERSION);
                } else {
                    alert('Mise à jour vérifiée. Veuillez recharger la page si une mise à jour est disponible.');
                }
                document.getElementById('menuUpdate').innerHTML = '<span class="menu-icon">🔄</span><span>Mettre à jour</span>';
            }, 1000);
        });
    } else {
        alert('Service Worker non disponible. Veuillez vérifier votre connexion.');
    }
}

function updateApp() {
    if (navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' });
    }
    window.location.reload();
}

// Export Data
function exportData() {
    const dataStr = JSON.stringify(items, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `manlore-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    alert('Données exportées avec succès !');
}

// Import Data
function importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const importedData = JSON.parse(event.target.result);
                    if (Array.isArray(importedData)) {
                        if (confirm(`Importer ${importedData.length} éléments ? Cela remplacera vos données actuelles.`)) {
                            items = importedData;
                            allGenres.clear();
                            items.forEach(item => {
                                if (item.genres) {
                                    item.genres.forEach(genre => allGenres.add(genre));
                                }
                            });
                            saveData();
                            updateGenreFilter();
                            renderItems();
                            updateStats();
                            alert('Données importées avec succès !');
                        }
                    } else {
                        alert('Format de fichier invalide.');
                    }
                } catch (error) {
                    alert('Erreur lors de l\'importation : ' + error.message);
                }
            };
            reader.readAsText(file);
        }
    };
    
    input.click();
}

function scrollToStats() {
    document.getElementById('stats').scrollIntoView({ behavior: 'smooth' });
}

// Modal Functions
function openAddModal() {
    currentEditId = null;
    document.getElementById('modalTitle').textContent = 'Ajouter un titre';
    document.getElementById('addForm').reset();
    document.getElementById('itemId').value = '';
    document.getElementById('itemRating').value = '0';
    resetRating();
    document.getElementById('imagePreview').style.display = 'none';
    document.getElementById('linkPreview').style.display = 'none';
    document.getElementById('addModal').classList.add('active');
}

function openEditModal(id) {
    currentEditId = id;
    const item = items.find(i => i.id === id);
    if (!item) return;
    
    document.getElementById('modalTitle').textContent = 'Modifier le titre';
    document.getElementById('itemId').value = item.id;
    document.getElementById('itemTitle').value = item.title;
    document.getElementById('itemType').value = item.type;
    document.getElementById('itemStatus').value = item.status;
    document.getElementById('itemRating').value = item.rating || 0;
    document.getElementById('itemGenres').value = item.genres ? item.genres.join(', ') : '';
    document.getElementById('itemLink').value = item.link || '';
    document.getElementById('itemImage').value = item.imageUrl || '';
    document.getElementById('itemChapters').value = item.chapters || 0;
    document.getElementById('itemNotes').value = item.notes || '';
    
    setRating(item.rating || 0);
    
    if (item.image) {
        document.getElementById('imagePreviewImg').src = item.image;
        document.getElementById('imagePreview').style.display = 'block';
    }
    
    document.getElementById('addModal').classList.add('active');
}

function closeModal() {
    document.getElementById('addModal').classList.remove('active');
    currentEditId = null;
}

function closeViewModal() {
    document.getElementById('viewModal').classList.remove('active');
}

// Rating Functions
function handleRatingClick(e) {
    const rating = parseInt(e.target.dataset.rating);
    document.getElementById('itemRating').value = rating;
    setRating(rating);
}

function handleRatingHover(e) {
    const rating = parseInt(e.target.dataset.rating);
    const stars = document.querySelectorAll('.rating-input .star');
    stars.forEach((star, index) => {
        if (index < rating) {
            star.textContent = '★';
        } else {
            star.textContent = '☆';
        }
    });
}

function resetRatingHover() {
    const currentRating = parseInt(document.getElementById('itemRating').value);
    setRating(currentRating);
}

function setRating(rating) {
    const stars = document.querySelectorAll('.rating-input .star');
    stars.forEach((star, index) => {
        if (index < rating) {
            star.textContent = '★';
            star.classList.add('active');
        } else {
            star.textContent = '☆';
            star.classList.remove('active');
        }
    });
}

function resetRating() {
    setRating(0);
}

// Image Handling
function handleImageUpload(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            document.getElementById('imagePreviewImg').src = event.target.result;
            document.getElementById('imagePreview').style.display = 'block';
        };
        reader.readAsDataURL(file);
    }
}

function handleImageUrlChange(e) {
    const url = e.target.value;
    if (url) {
        document.getElementById('imagePreviewImg').src = url;
        document.getElementById('imagePreview').style.display = 'block';
    } else {
        document.getElementById('imagePreview').style.display = 'none';
    }
}

// Link Preview
async function handleLinkPreview(e) {
    const url = e.target.value;
    const preview = document.getElementById('linkPreview');
    
    if (!url || !isValidUrl(url)) {
        preview.style.display = 'none';
        return;
    }
    
    try {
        const urlObj = new URL(url);
        document.getElementById('linkPreviewTitle').textContent = urlObj.hostname;
        document.getElementById('linkPreviewImage').src = `https://www.google.com/s2/favicons?domain=${urlObj.hostname}&sz=64`;
        preview.style.display = 'block';
    } catch (error) {
        preview.style.display = 'none';
    }
}

function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// Form Submission
function handleFormSubmit(e) {
    e.preventDefault();
    
    const title = document.getElementById('itemTitle').value.trim();
    const type = document.getElementById('itemType').value;
    const status = document.getElementById('itemStatus').value;
    const rating = parseInt(document.getElementById('itemRating').value);
    const genresInput = document.getElementById('itemGenres').value.trim();
    const genres = genresInput ? genresInput.split(',').map(g => g.trim()).filter(g => g) : [];
    const link = document.getElementById('itemLink').value.trim();
    const imageUrl = document.getElementById('itemImage').value.trim();
    const chapters = parseInt(document.getElementById('itemChapters').value) || 0;
    const notes = document.getElementById('itemNotes').value.trim();
    
    let image = '';
    const imagePreview = document.getElementById('imagePreviewImg').src;
    if (imagePreview && imagePreview !== window.location.href) {
        image = imagePreview;
    }
    
    genres.forEach(genre => allGenres.add(genre));
    
    if (currentEditId) {
        const index = items.findIndex(i => i.id === currentEditId);
        if (index !== -1) {
            items[index] = {
                ...items[index],
                title,
                type,
                status,
                rating,
                genres,
                link,
                imageUrl,
                image,
                chapters,
                notes,
                updatedAt: new Date().toISOString()
            };
        }
    } else {
        const newItem = {
            id: generateId(),
            title,
            type,
            status,
            rating,
            genres,
            link,
            imageUrl,
            image,
            chapters,
            notes,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        items.push(newItem);
    }
    
    saveData();
    updateGenreFilter();
    renderItems();
    updateStats();
    closeModal();
}

// Delete Item
function deleteItem(id) {
    if (confirm('Êtes-vous sûr de vouloir supprimer cet élément ?')) {
        items = items.filter(i => i.id !== id);
        saveData();
        renderItems();
        updateStats();
        updateGenreFilter();
    }
}

// View Item
function viewItem(id) {
    const item = items.find(i => i.id === id);
    if (!item) return;
    
    document.getElementById('viewTitle').textContent = item.title;
    
    const content = `
        ${item.image ? `<img src="${item.image}" alt="${item.title}" class="view-image">` : ''}
        <div class="view-info">
            <div class="info-row">
                <div class="info-label">Type:</div>
                <div class="info-value"><span class="item-type">${item.type.toUpperCase()}</span></div>
            </div>
            <div class="info-row">
                <div class="info-label">Statut:</div>
                <div class="info-value"><span class="item-status status-${item.status}">${getStatusLabel(item.status)}</span></div>
            </div>
            <div class="info-row">
                <div class="info-label">Note:</div>
                <div class="info-value"><span class="item-rating">${'★'.repeat(item.rating || 0)}${'☆'.repeat(5 - (item.rating || 0))}</span></div>
            </div>
            ${item.genres && item.genres.length > 0 ? `
            <div class="info-row">
                <div class="info-label">Genres:</div>
                <div class="info-value">
                    <div class="item-genres">
                        ${item.genres.map(g => `<span class="genre-tag">${g}</span>`).join('')}
                    </div>
                </div>
            </div>
            ` : ''}
            ${item.chapters ? `
            <div class="info-row">
                <div class="info-label">Chapitres lus:</div>
                <div class="info-value">${item.chapters}</div>
            </div>
            ` : ''}
            ${item.link ? `
            <div class="info-row">
                <div class="info-label">Lien:</div>
                <div class="info-value"><a href="${item.link}" target="_blank" class="link-btn">🔗 Ouvrir</a></div>
            </div>
            ` : ''}
            ${item.notes ? `
            <div class="info-row">
                <div class="info-label">Notes:</div>
                <div class="info-value">${item.notes}</div>
            </div>
            ` : ''}
            <div class="info-row">
                <div class="info-label">Ajouté le:</div>
                <div class="info-value">${formatDate(item.createdAt)}</div>
            </div>
            <div class="item-actions" style="margin-top: 20px;">
                <button class="btn-action btn-edit" onclick="closeViewModal(); openEditModal('${item.id}')">✏️ Modifier</button>
                <button class="btn-action btn-delete" onclick="deleteItem('${item.id}'); closeViewModal()">🗑️ Supprimer</button>
            </div>
        </div>
    `;
    
    document.getElementById('viewContent').innerHTML = content;
    document.getElementById('viewModal').classList.add('active');
}

// Render Items
function renderItems() {
    const grid = document.getElementById('itemsGrid');
    const emptyState = document.getElementById('emptyState');
    
    const filteredItems = getFilteredItems();
    
    if (filteredItems.length === 0) {
        grid.innerHTML = '';
        emptyState.style.display = 'block';
        return;
    }
    
    emptyState.style.display = 'none';
    
    grid.innerHTML = filteredItems.map(item => `
        <div class="item-card" onclick="viewItem('${item.id}')">
            ${item.image ? `<img src="${item.image}" alt="${item.title}" class="item-image">` : '<div class="item-image"></div>'}
            <div class="item-content">
                <div class="item-header">
                    <h3 class="item-title">${escapeHtml(item.title)}</h3>
                </div>
                <span class="item-type">${item.type}</span>
                ${item.rating > 0 ? `<div class="item-rating">${'★'.repeat(item.rating)}${'☆'.repeat(5 - item.rating)}</div>` : ''}
                <span class="item-status status-${item.status}">${getStatusLabel(item.status)}</span>
                ${item.genres && item.genres.length > 0 ? `
                <div class="item-genres">
                    ${item.genres.slice(0, 3).map(g => `<span class="genre-tag">${escapeHtml(g)}</span>`).join('')}
                    ${item.genres.length > 3 ? `<span class="genre-tag">+${item.genres.length - 3}</span>` : ''}
                </div>
                ` : ''}
                ${item.link ? `<div class="item-link"><a href="${item.link}" target="_blank" class="link-btn" onclick="event.stopPropagation()">🔗 Lien</a></div>` : ''}
                <div class="item-actions" onclick="event.stopPropagation()">
                    <button class="btn-action btn-edit" onclick="openEditModal('${item.id}')">✏️</button>
                    <button class="btn-action btn-delete" onclick="deleteItem('${item.id}')">🗑️</button>
                </div>
            </div>
        </div>
    `).join('');
}

// Get Filtered Items
function getFilteredItems() {
    let filtered = [...items];
    
    const typeFilter = document.getElementById('filterType').value;
    if (typeFilter !== 'all') {
        filtered = filtered.filter(item => item.type === typeFilter);
    }
    
    const statusFilter = document.getElementById('filterStatus').value;
    if (statusFilter !== 'all') {
        filtered = filtered.filter(item => item.status === statusFilter);
    }
    
    const genreFilter = document.getElementById('filterGenre').value;
    if (genreFilter !== 'all') {
        filtered = filtered.filter(item => item.genres && item.genres.includes(genreFilter));
    }
    
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    if (searchTerm) {
        filtered = filtered.filter(item =>
            item.title.toLowerCase().includes(searchTerm) ||
            (item.genres && item.genres.some(g => g.toLowerCase().includes(searchTerm))) ||
            (item.notes && item.notes.toLowerCase().includes(searchTerm))
        );
    }
    
    const sortBy = document.getElementById('sortBy').value;
    filtered.sort((a, b) => {
        switch (sortBy) {
            case 'date-desc':
                return new Date(b.createdAt) - new Date(a.createdAt);
            case 'date-asc':
                return new Date(a.createdAt) - new Date(b.createdAt);
            case 'title-asc':
                return a.title.localeCompare(b.title);
            case 'title-desc':
                return b.title.localeCompare(a.title);
            case 'rating-desc':
                return (b.rating || 0) - (a.rating || 0);
            case 'rating-asc':
                return (a.rating || 0) - (b.rating || 0);
            default:
                return 0;
        }
    });
    
    return filtered;
}

// Update Stats
function updateStats() {
    const stats = document.querySelectorAll('.stat-number');
    const total = items.length;
    const reading = items.filter(i => i.status === 'reading').length;
    const completed = items.filter(i => i.status === 'completed').length;
    const planToRead = items.filter(i => i.status === 'plan-to-read').length;
    
    stats[0].textContent = total;
    stats[1].textContent = reading;
    stats[2].textContent = completed;
    stats[3].textContent = planToRead;
}

// Update Genre Filter
function updateGenreFilter() {
    const genreFilter = document.getElementById('filterGenre');
    const currentValue = genreFilter.value;
    
    genreFilter.innerHTML = '<option value="all">Tous</option>';
    Array.from(allGenres).sort().forEach(genre => {
        const option = document.createElement('option');
        option.value = genre;
        option.textContent = genre;
        genreFilter.appendChild(option);
    });
    
    if (currentValue && allGenres.has(currentValue)) {
        genreFilter.value = currentValue;
    }
}

// Apply Filters
function applyFilters() {
    renderItems();
}

// Toggle Search
function toggleSearch() {
    const searchContainer = document.getElementById('searchContainer');
    if (searchContainer.style.display === 'none') {
        searchContainer.style.display = 'block';
        document.getElementById('searchInput').focus();
    } else {
        searchContainer.style.display = 'none';
        document.getElementById('searchInput').value = '';
        applyFilters();
    }
}

// Utility Functions
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
    });
}

function getStatusLabel(status) {
    const labels = {
        'reading': 'En cours',
        'completed': 'Terminé',
        'plan-to-read': 'À lire',
        'dropped': 'Abandonné'
    };
    return labels[status] || status;
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Make functions globally available
window.openEditModal = openEditModal;
window.deleteItem = deleteItem;
window.viewItem = viewItem;
window.closeViewModal = closeViewModal;