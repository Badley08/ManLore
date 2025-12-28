/* ============================================
   MANLORE - APP.JS
   Logique de l'application
   ============================================ */

// Variables globales
let allItems = [];
let filteredItems = [];
let currentEditingId = null;

// ============================================
// INITIALISATION
// ============================================

document.addEventListener('DOMContentLoaded', async () => {
    console.log('🎬 Démarrage ManLore...');
    
    // Vérifier si utilisateur connecté
    const user = getCurrentUser();
    
    if (user) {
        showApp(user);
        await loadItems();
    } else {
        showAuth();
    }
    
    // Initialiser les event listeners
    initializeEventListeners();
});

/**
 * Afficher l'écran d'authentification
 */
function showAuth() {
    document.getElementById('authScreen').classList.remove('hidden');
    document.getElementById('appContainer').classList.add('hidden');
}

/**
 * Afficher l'application principale
 */
function showApp(user) {
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');
    document.getElementById('currentUsername').textContent = user.get('username');
}

// ============================================
// EVENT LISTENERS
// ============================================

function initializeEventListeners() {
    // Auth Forms
    document.getElementById('loginForm').addEventListener('submit', handleLogin);
    document.getElementById('signupForm').addEventListener('submit', handleSignup);
    document.getElementById('showSignup').addEventListener('click', toggleAuthForms);
    document.getElementById('showLogin').addEventListener('click', toggleAuthForms);
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);
    
    // Navigation
    document.getElementById('menuToggle')?.addEventListener('click', toggleSidebar);
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', handleNavigation);
    });
    
    // Items
    document.getElementById('addBtn').addEventListener('click', () => openItemModal());
    document.getElementById('itemForm').addEventListener('submit', handleItemSubmit);
    
    // Filters & Search
    document.getElementById('searchInput').addEventListener('input', debounce(applyFilters, 300));
    document.getElementById('filterType').addEventListener('change', applyFilters);
    document.getElementById('filterStatus').addEventListener('change', applyFilters);
    document.getElementById('filterGenre').addEventListener('change', applyFilters);
    document.getElementById('sortBy').addEventListener('change', applyFilters);
    
    // Rating Input
    document.querySelectorAll('#ratingInput i').forEach(star => {
        star.addEventListener('click', handleRatingClick);
        star.addEventListener('mouseenter', handleRatingHover);
    });
    document.getElementById('ratingInput').addEventListener('mouseleave', resetRatingHover);
    
    // Image Previews
    document.getElementById('itemImageUrl').addEventListener('input', debounce(updateImagePreview, 500));
    document.getElementById('itemImageFile').addEventListener('change', handleImageUpload);
    
    // Export/Import
    document.getElementById('exportBtn')?.addEventListener('click', exportData);
    document.getElementById('importBtn')?.addEventListener('click', () => {
        document.getElementById('importFile').click();
    });
    document.getElementById('importFile')?.addEventListener('change', importData);
    
    // Close modals on outside click
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal.id);
            }
        });
    });
}

// ============================================
// AUTHENTIFICATION
// ============================================

async function handleLogin(e) {
    e.preventDefault();
    showLoading(true);
    
    const username = document.getElementById('loginUsername').value;
    const password = document.getElementById('loginPassword').value;
    
    const result = await logIn(username, password);
    
    showLoading(false);
    
    if (result.success) {
        showToast('Connexion réussie !', 'success');
        showApp(result.user);
        await loadItems();
    } else {
        showToast('Erreur: ' + result.error, 'error');
    }
}

async function handleSignup(e) {
    e.preventDefault();
    showLoading(true);
    
    const username = document.getElementById('signupUsername').value;
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    
    const result = await signUp(username, email, password);
    
    showLoading(false);
    
    if (result.success) {
        showToast('Compte créé avec succès !', 'success');
        showApp(result.user);
    } else {
        showToast('Erreur: ' + result.error, 'error');
    }
}

async function handleLogout(e) {
    e.preventDefault();
    
    if (confirm('Voulez-vous vraiment vous déconnecter ?')) {
        showLoading(true);
        const result = await logOut();
        showLoading(false);
        
        if (result.success) {
            allItems = [];
            filteredItems = [];
            showToast('Déconnexion réussie', 'success');
            showAuth();
            stopAutoSync();
        }
    }
}

function toggleAuthForms(e) {
    e.preventDefault();
    document.getElementById('loginForm').classList.toggle('hidden');
    document.getElementById('signupForm').classList.toggle('hidden');
}

// ============================================
// NAVIGATION
// ============================================

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('active');
}

function handleNavigation(e) {
    e.preventDefault();
    
    // Update active state
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });
    e.currentTarget.classList.add('active');
    
    // Show corresponding page
    const page = e.currentTarget.dataset.page;
    if (page) {
        document.querySelectorAll('.page').forEach(p => {
            p.classList.remove('active');
        });
        document.getElementById(page + 'Page').classList.add('active');
    }
    
    // Close sidebar on mobile
    if (window.innerWidth < 1024) {
        document.getElementById('sidebar').classList.remove('active');
    }
}

// ============================================
// GESTION DES ITEMS
// ============================================

async function loadItems() {
    showLoading(true);
    
    const result = await fetchAllItems();
    
    if (result.success) {
        allItems = result.items.map(item => parseItemToObject(item));
        filteredItems = [...allItems];
        
        updateGenreFilter();
        applyFilters();
        updateStats();
        
        if (result.offline) {
            showToast('Chargement depuis le cache local', 'info');
        }
    } else {
        showToast('Erreur de chargement: ' + result.error, 'error');
    }
    
    showLoading(false);
}

function renderItems() {
    const grid = document.getElementById('itemsGrid');
    const emptyState = document.getElementById('emptyState');
    
    if (filteredItems.length === 0) {
        grid.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }
    
    emptyState.classList.add('hidden');
    
    grid.innerHTML = filteredItems.map(item => `
        <div class="item-card" onclick="viewItem('${item.id}')">
            <div class="item-image">
                ${item.image || item.imageUrl 
                    ? `<img src="${item.image || item.imageUrl}" alt="${item.title}">`
                    : `<div class="item-image-placeholder"><i class="fas fa-book"></i></div>`
                }
                <span class="item-type-badge">${item.type}</span>
            </div>
            <div class="item-content">
                <h3 class="item-title">${escapeHtml(item.title)}</h3>
                
                <div class="item-meta">
                    <span class="item-status ${getStatusClass(item.status)}">${item.status}</span>
                </div>
                
                <div class="item-rating">
                    ${renderStars(item.rating)}
                </div>
                
                ${item.genres && item.genres.length > 0 ? `
                    <div class="item-genres">
                        ${item.genres.slice(0, 3).map(genre => 
                            `<span class="genre-tag">${escapeHtml(genre)}</span>`
                        ).join('')}
                        ${item.genres.length > 3 ? `<span class="genre-tag">+${item.genres.length - 3}</span>` : ''}
                    </div>
                ` : ''}
                
                <div class="item-footer">
                    <span class="item-chapters">
                        <i class="fas fa-bookmark mr-1"></i>
                        ${item.chapters || 0} ch.
                    </span>
                    <div class="item-actions">
                        <button class="item-action-btn" onclick="event.stopPropagation(); editItem('${item.id}')" title="Modifier">
                            <i class="fas fa-edit"></i>
                        </button>
                        <button class="item-action-btn delete" onclick="event.stopPropagation(); confirmDelete('${item.id}')" title="Supprimer">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

function viewItem(itemId) {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;
    
    const content = document.getElementById('viewContent');
    document.getElementById('viewTitle').textContent = item.title;
    
    content.innerHTML = `
        <div class="view-modal-content">
            <div class="view-image-section">
                ${item.image || item.imageUrl 
                    ? `<img src="${item.image || item.imageUrl}" alt="${item.title}">`
                    : `<div class="view-image-placeholder"><i class="fas fa-book"></i></div>`
                }
            </div>
            
            <div class="view-info-section">
                <div class="view-info-group">
                    <div class="view-info-label">Type</div>
                    <div class="view-info-value">${item.type}</div>
                </div>
                
                <div class="view-info-group">
                    <div class="view-info-label">Statut</div>
                    <div class="view-info-value">
                        <span class="item-status ${getStatusClass(item.status)}">${item.status}</span>
                    </div>
                </div>
                
                <div class="view-info-group">
                    <div class="view-info-label">Note</div>
                    <div class="view-rating-large">
                        ${renderStars(item.rating, true)}
                    </div>
                </div>
                
                ${item.chapters ? `
                    <div class="view-info-group">
                        <div class="view-info-label">Chapitres lus</div>
                        <div class="view-info-value">${item.chapters}</div>
                    </div>
                ` : ''}
                
                ${item.genres && item.genres.length > 0 ? `
                    <div class="view-info-group">
                        <div class="view-info-label">Genres</div>
                        <div class="item-genres">
                            ${item.genres.map(genre => 
                                `<span class="genre-tag">${escapeHtml(genre)}</span>`
                            ).join('')}
                        </div>
                    </div>
                ` : ''}
                
                ${item.link ? `
                    <div class="view-info-group">
                        <div class="view-info-label">Lien</div>
                        <a href="${item.link}" target="_blank" class="view-link">
                            <i class="fas fa-external-link-alt"></i>
                            Ouvrir le lien
                        </a>
                    </div>
                ` : ''}
                
                ${item.notes ? `
                    <div class="view-info-group">
                        <div class="view-info-label">Notes</div>
                        <div class="view-notes">${escapeHtml(item.notes)}</div>
                    </div>
                ` : ''}
                
                <div class="view-actions">
                    <button class="btn-edit" onclick="closeModal('viewModal'); editItem('${item.id}')">
                        <i class="fas fa-edit"></i> Modifier
                    </button>
                    <button class="btn-delete" onclick="confirmDelete('${item.id}')">
                        <i class="fas fa-trash"></i> Supprimer
                    </button>
                </div>
            </div>
        </div>
    `;
    
    openModal('viewModal');
}

function openItemModal(itemId = null) {
    currentEditingId = itemId;
    const modal = document.getElementById('itemModal');
    const form = document.getElementById('itemForm');
    const title = document.getElementById('modalTitle');
    
    form.reset();
    document.getElementById('itemId').value = '';
    document.getElementById('itemRating').value = '0';
    updateRatingDisplay(0);
    hideImagePreview();
    
    if (itemId) {
        const item = allItems.find(i => i.id === itemId);
        if (item) {
            title.textContent = 'Modifier le titre';
            document.getElementById('itemId').value = item.id;
            document.getElementById('itemTitle').value = item.title;
            document.getElementById('itemType').value = item.type;
            document.getElementById('itemStatus').value = item.status;
            document.getElementById('itemRating').value = item.rating || 0;
            updateRatingDisplay(item.rating || 0);
            document.getElementById('itemChapters').value = item.chapters || '';
            document.getElementById('itemGenres').value = item.genres ? item.genres.join(', ') : '';
            document.getElementById('itemLink').value = item.link || '';
            document.getElementById('itemImageUrl').value = item.imageUrl || '';
            document.getElementById('itemNotes').value = item.notes || '';
            
            if (item.image || item.imageUrl) {
                showImagePreview(item.image || item.imageUrl);
            }
        }
    } else {
        title.textContent = 'Ajouter un titre';
    }
    
    openModal('itemModal');
}

async function handleItemSubmit(e) {
    e.preventDefault();
    showLoading(true);
    
    const itemId = document.getElementById('itemId').value;
    const genresText = document.getElementById('itemGenres').value;
    
    const itemData = {
        title: document.getElementById('itemTitle').value,
        type: document.getElementById('itemType').value,
        status: document.getElementById('itemStatus').value,
        rating: parseInt(document.getElementById('itemRating').value) || 0,
        chapters: parseInt(document.getElementById('itemChapters').value) || 0,
        genres: genresText ? genresText.split(',').map(g => g.trim()).filter(g => g) : [],
        link: document.getElementById('itemLink').value,
        imageUrl: document.getElementById('itemImageUrl').value,
        image: document.getElementById('itemImageUrl').value, // Utiliser imageUrl comme image
        notes: document.getElementById('itemNotes').value
    };
    
    let result;
    if (itemId) {
        result = await updateItem(itemId, itemData);
    } else {
        result = await createItem(itemData);
    }
    
    showLoading(false);
    
    if (result.success) {
        showToast(itemId ? 'Titre modifié !' : 'Titre ajouté !', 'success');
        closeModal('itemModal');
        await loadItems();
    } else {
        showToast('Erreur: ' + result.error, 'error');
    }
}

function editItem(itemId) {
    openItemModal(itemId);
}

async function confirmDelete(itemId) {
    if (confirm('Voulez-vous vraiment supprimer ce titre ?')) {
        showLoading(true);
        const result = await deleteItem(itemId);
        showLoading(false);
        
        if (result.success) {
            showToast('Titre supprimé', 'success');
            closeModal('viewModal');
            await loadItems();
        } else {
            showToast('Erreur: ' + result.error, 'error');
        }
    }
}

// ============================================
// FILTRES & RECHERCHE
// ============================================

function applyFilters() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const typeFilter = document.getElementById('filterType').value;
    const statusFilter = document.getElementById('filterStatus').value;
    const genreFilter = document.getElementById('filterGenre').value;
    const sortBy = document.getElementById('sortBy').value;
    
    filteredItems = allItems.filter(item => {
        const matchesSearch = !searchTerm || 
            item.title.toLowerCase().includes(searchTerm) ||
            (item.notes && item.notes.toLowerCase().includes(searchTerm)) ||
            (item.genres && item.genres.some(g => g.toLowerCase().includes(searchTerm)));
        
        const matchesType = !typeFilter || item.type === typeFilter;
        const matchesStatus = !statusFilter || item.status === statusFilter;
        const matchesGenre = !genreFilter || (item.genres && item.genres.includes(genreFilter));
        
        return matchesSearch && matchesType && matchesStatus && matchesGenre;
    });
    
    // Tri
    switch (sortBy) {
        case 'date-desc':
            filteredItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            break;
        case 'date-asc':
            filteredItems.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
            break;
        case 'title-asc':
            filteredItems.sort((a, b) => a.title.localeCompare(b.title));
            break;
        case 'title-desc':
            filteredItems.sort((a, b) => b.title.localeCompare(a.title));
            break;
        case 'rating-desc':
            filteredItems.sort((a, b) => (b.rating || 0) - (a.rating || 0));
            break;
        case 'rating-asc':
            filteredItems.sort((a, b) => (a.rating || 0) - (b.rating || 0));
            break;
    }
    
    renderItems();
}

function updateGenreFilter() {
    const genreFilter = document.getElementById('filterGenre');
    const allGenres = new Set();
    
    allItems.forEach(item => {
        if (item.genres) {
            item.genres.forEach(genre => allGenres.add(genre));
        }
    });
    
    const sortedGenres = Array.from(allGenres).sort();
    
    // Garder l'option "Tous les genres"
    genreFilter.innerHTML = '<option value="">Tous les genres</option>';
    sortedGenres.forEach(genre => {
        const option = document.createElement('option');
        option.value = genre;
        option.textContent = genre;
        genreFilter.appendChild(option);
    });
}

// ============================================
// STATISTIQUES
// ============================================

function updateStats() {
    document.getElementById('statTotal').textContent = allItems.length;
    document.getElementById('statInProgress').textContent = 
        allItems.filter(i => i.status === 'En cours').length;
    document.getElementById('statCompleted').textContent = 
        allItems.filter(i => i.status === 'Terminé').length;
    document.getElementById('statToRead').textContent = 
        allItems.filter(i => i.status === 'À lire').length;
}

// ============================================
// RATING
// ============================================

function handleRatingClick(e) {
    const rating = parseInt(e.target.dataset.rating);
    document.getElementById('itemRating').value = rating;
    updateRatingDisplay(rating);
}

function handleRatingHover(e) {
    const rating = parseInt(e.target.dataset.rating);
    updateRatingDisplay(rating, true);
}

function resetRatingHover() {
    const currentRating = parseInt(document.getElementById('itemRating').value) || 0;
    updateRatingDisplay(currentRating);
}

function updateRatingDisplay(rating, isHover = false) {
    document.querySelectorAll('#ratingInput i').forEach((star, index) => {
        if (index < rating) {
            star.classList.remove('far');
            star.classList.add('fas', 'active');
        } else {
            star.classList.remove('fas', 'active');
            star.classList.add('far');
        }
    });
}

function renderStars(rating, large = false) {
    let html = '';
    for (let i = 1; i <= 5; i++) {
        if (i <= rating) {
            html += '<i class="fas fa-star"></i>';
        } else {
            html += '<i class="far fa-star"></i>';
        }
    }
    return html;
}

// ============================================
// IMAGES
// ============================================

function updateImagePreview() {
    const url = document.getElementById('itemImageUrl').value;
    if (url) {
        showImagePreview(url);
    } else {
        hideImagePreview();
    }
}

async function handleImageUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    // Vérifier la taille (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
        showToast('Image trop grande (max 5MB)', 'error');
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
        const base64 = event.target.result;
        document.getElementById('itemImageUrl').value = base64;
        showImagePreview(base64);
    };
    reader.readAsDataURL(file);
}

function showImagePreview(url) {
    const preview = document.getElementById('imagePreview');
    const img = preview.querySelector('img');
    img.src = url;
    preview.classList.remove('hidden');
}

function hideImagePreview() {
    const preview = document.getElementById('imagePreview');
    preview.classList.add('hidden');
}

// ============================================
// EXPORT/IMPORT
// ============================================

async function exportData() {
    try {
        const data = {
            version: '1.0.7',
            exportDate: new Date().toISOString(),
            username: currentUser ? currentUser.get('username') : 'unknown',
            items: allItems
        };
        
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `manlore-export-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        
        showToast('Export réussi !', 'success');
    } catch (error) {
        showToast('Erreur d\'export: ' + error.message, 'error');
    }
}

async function importData(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
        const text = await file.text();
        const data = JSON.parse(text);
        
        if (!data.items || !Array.isArray(data.items)) {
            throw new Error('Format invalide');
        }
        
        if (confirm(`Importer ${data.items.length} titres ?`)) {
            showLoading(true);
            
            for (const item of data.items) {
                await createItem(item);
            }
            
            await loadItems();
            showLoading(false);
            showToast('Import réussi !', 'success');
        }
    } catch (error) {
        showLoading(false);
        showToast('Erreur d\'import: ' + error.message, 'error');
    }
    
    e.target.value = '';
}

// ============================================
// UTILITAIRES
// ============================================

function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

function showLoading(show) {
    const spinner = document.getElementById('loadingSpinner');
    if (show) {
        spinner.classList.remove('hidden');
    } else {
        spinner.classList.add('hidden');
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icon = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        warning: 'fa-exclamation-triangle',
        info: 'fa-info-circle'
    }[type] || 'fa-info-circle';
    
    toast.innerHTML = `
        <i class="fas ${icon}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideInRight 0.3s ease reverse';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
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

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getStatusClass(status) {
    return status.toLowerCase().replace(/\s+/g, '-').replace(/é/g, 'e').replace(/à/g, 'a');
}

console.log('✅ ManLore chargé et prêt !');
