/* ============================================
   MANLORE v8.0.0 - APP.JS
   Logique principale d'application, Gestionnaires d'événements & Navigation PWA
   ============================================ */

'use strict';

// ============ STATE ============
let allItems = [];
let filteredItems = [];
let currentPage = 'home';
let editingItemId = null;
let confirmCallback = null;
let promptCallback = null;

// ============ INIT ============
document.addEventListener('DOMContentLoaded', async () => {
    if (typeof initializeBackend === 'function') {
        await initializeBackend();
    }
    i18n.applyAll();
    applyStoredTheme();
    applyStoredTitleFont();
    applyStoredSettings();
    setupEventListeners();

    // Request notifications after short delay
    if (typeof requestPushPermissions === 'function') {
        setTimeout(requestPushPermissions, 2500);
    }

    // Show auth or app
    const guestMode = localStorage.getItem('manlore_guest_mode') === 'true';
    const user = !guestMode ? (typeof Parse !== 'undefined' && Parse.User ? Parse.User.current() : null) : null;

    if (user || guestMode) {
        await showApp();
        if (typeof deduplicateCollection === 'function') {
            await deduplicateCollection();
        }
    } else {
        showAuth();
    }
});

// ============ AUTH FLOW ============
function showAuth() {
    document.getElementById('authScreen').classList.remove('hidden');
    document.getElementById('appContainer').classList.add('hidden');
}

async function showApp() {
    document.getElementById('authScreen').classList.add('hidden');
    document.getElementById('appContainer').classList.remove('hidden');

    const user = !isGuestMode ? Parse.User.current() : null;

    // Update header
    if (isGuestMode) {
        document.getElementById('guestBadge').classList.remove('hidden');
        document.getElementById('userMenuBtn').classList.add('hidden');
        showGuestSettingsUI();
    } else if (user) {
        document.getElementById('guestBadge').classList.add('hidden');
        const userMenuBtn = document.getElementById('userMenuBtn');
        userMenuBtn.classList.remove('hidden');
        document.getElementById('currentUsername').textContent = user.get('username');
        showUserSettingsUI(user);
    }

    updateStorageModeUI();
    await loadAndRenderItems();
    navigateTo('home');
    checkWhatsNewModal();
}

const WHATS_NEW_VERSION = 'v9.0.1';

function checkWhatsNewModal() {
    const neverShow = localStorage.getItem('manlore_disable_all_whatsnew');
    if (neverShow === 'true') return;
    const dismissed = localStorage.getItem(`manlore_whats_new_dismissed_${WHATS_NEW_VERSION}`);
    if (!dismissed) {
        setTimeout(() => {
            if (typeof openModal === 'function') openModal('whatsNewModal');
        }, 600);
    }
}

function closeWhatsNewModal() {
    const check = document.getElementById('dontShowWhatsNewCheck');
    const neverCheck = document.getElementById('neverShowWhatsNewCheck');
    if (neverCheck && neverCheck.checked) {
        localStorage.setItem('manlore_disable_all_whatsnew', 'true');
    }
    if (check && check.checked) {
        localStorage.setItem(`manlore_whats_new_dismissed_${WHATS_NEW_VERSION}`, 'true');
        try {
            if (typeof Parse !== 'undefined' && Parse.User && Parse.User.current()) {
                const u = Parse.User.current();
                u.set('whatsNewDismissedVersion', WHATS_NEW_VERSION);
                u.save();
            }
        } catch (e) {}
    }
    const modalEl = document.getElementById('whatsNewModal');
    if (modalEl) modalEl.classList.remove('active');
}
window.closeWhatsNewModal = closeWhatsNewModal;

function openChangelogModal() {
    if (typeof openModal === 'function') openModal('changelogModal');
}
window.openChangelogModal = openChangelogModal;

function showGuestSettingsUI() {
    document.getElementById('guestNotice').classList.remove('hidden');
    document.getElementById('accountFields').classList.add('hidden');
    document.getElementById('deleteAccountBtn').classList.add('hidden');
}

function showUserSettingsUI(user) {
    document.getElementById('guestNotice').classList.add('hidden');
    document.getElementById('accountFields').classList.remove('hidden');
    document.getElementById('deleteAccountBtn').classList.remove('hidden');
    const un = document.getElementById('settingsUsername');
    const em = document.getElementById('settingsEmail');
    if (un) un.value = user.get('username') || '';
    if (em) em.value = user.get('email') || '';
    // Load avatar
    if (typeof getUserAvatar === 'function') {
        updateAvatarDisplay(getUserAvatar());
    }
}

function updateAvatarDisplay(base64) {
    const img = document.getElementById('settingsAvatarImg');
    const placeholder = document.getElementById('settingsAvatarPlaceholder');
    const removeBtn = document.getElementById('removeAvatarBtn');
    if (!img) return;
    if (base64) {
        img.src = base64;
        img.style.display = 'block';
        if (placeholder) placeholder.style.display = 'none';
        if (removeBtn) removeBtn.style.display = 'inline-flex';
    } else {
        img.src = '';
        img.style.display = 'none';
        if (placeholder) placeholder.style.display = 'flex';
        if (removeBtn) removeBtn.style.display = 'none';
    }
}
window.updateAvatarDisplay = updateAvatarDisplay;

async function handleRemoveAvatar() {
    showLoading(true, 'Suppression...');
    const result = await deleteUserProfileAvatar();
    showLoading(false);
    if (result.success) {
        updateAvatarDisplay('');
        showToast('Photo de profil supprimée', 'info');
    }
}
window.handleRemoveAvatar = handleRemoveAvatar;

// ============ NAVIGATION ============
function navigateTo(page) {
    currentPage = page;
    document.querySelectorAll('.page').forEach(p => {
        p.classList.remove('active');
        p.classList.add('hidden');
    });
    const target = document.getElementById(`${page}Page`);
    if (target) { target.classList.remove('hidden'); target.classList.add('active'); }

    document.querySelectorAll('.nav-item[data-page]').forEach(el => {
        el.classList.toggle('active', el.dataset.page === page);
    });
    document.querySelectorAll('.bottom-nav-item[data-page]').forEach(el => {
        el.classList.toggle('active', el.dataset.page === page);
    });

    if (page === 'stats') renderStats(allItems);
    if (page === 'wishlist') { renderWishlist(); }
    if (page === 'settings') {
        updateStorageModeUI();
        if (typeof getUserAvatar === 'function') updateAvatarDisplay(getUserAvatar());
    }

    // Close sidebar on mobile
    closeSidebar();
}

// ============ SIDEBAR ============
function openSidebar() {
    document.getElementById('sidebar').classList.add('active');
    document.getElementById('sidebarOverlay').classList.add('active');
}

function closeSidebar() {
    document.getElementById('sidebar').classList.remove('active');
    document.getElementById('sidebarOverlay').classList.remove('active');
}

// ============ LOAD & RENDER ITEMS ============
async function loadAndRenderItems() {
    showLoading(true);
    try {
        const result = await fetchAllItems();
        let items = result.items.map(i => i instanceof Parse.Object ? parseItemToObject(i) : i);
        
        // Auto deduplication (removes lower chapter dupes)
        if (typeof autoRemoveDuplicates === 'function') {
            items = await autoRemoveDuplicates(items);
        }
        
        allItems = items;
        applyFiltersAndRender();
    } catch (e) {
        console.error('[App] Load error:', e);
        showToast('Erreur de chargement', 'error');
    } finally {
        showLoading(false);
    }
}

function applyFiltersAndRender() {
    const search = (document.getElementById('searchInput')?.value || '').toLowerCase().trim();
    const typeF = document.getElementById('filterType')?.value || '';
    const statusF = document.getElementById('filterStatus')?.value || '';
    const genreF = document.getElementById('filterGenre')?.value || '';
    const sortVal = document.getElementById('sortBy')?.value || 'date-desc';

    filteredItems = allItems.filter(item => {
        if (typeF && item.type !== typeF) return false;
        if (statusF && item.status !== statusF) return false;
        if (genreF) {
            const genres = Array.isArray(item.genres) ? item.genres : (item.genres || '').split(',').map(g => g.trim());
            if (!genres.some(g => g.toLowerCase() === genreF.toLowerCase())) return false;
        }
        if (search) {
            const titleMatch = (item.title || '').toLowerCase().includes(search);
            const genreMatch = (Array.isArray(item.genres) ? item.genres.join(' ') : (item.genres || '')).toLowerCase().includes(search);
            const noteMatch = (item.notes || '').toLowerCase().includes(search);
            if (!titleMatch && !genreMatch && !noteMatch) return false;
        }
        return true;
    });

    // Sort
    filteredItems.sort((a, b) => {
        switch (sortVal) {
            case 'date-asc': return new Date(a.createdAt) - new Date(b.createdAt);
            case 'title-asc': return (a.title || '').localeCompare(b.title || '');
            case 'title-desc': return (b.title || '').localeCompare(a.title || '');
            case 'rating-desc': return (parseInt(b.rating) || 0) - (parseInt(a.rating) || 0);
            case 'rating-asc': return (parseInt(a.rating) || 0) - (parseInt(b.rating) || 0);
            default: return new Date(b.createdAt) - new Date(a.createdAt);
        }
    });

    renderItems();
    updateStats();
    updateGenreFilter();
}

function renderItems() {
    const grid = document.getElementById('itemsGrid');
    const empty = document.getElementById('emptyState');
    if (!grid) return;

    if (filteredItems.length === 0) {
        grid.innerHTML = '';
        if (empty) empty.classList.remove('hidden');
        return;
    }
    if (empty) empty.classList.add('hidden');

    grid.innerHTML = filteredItems.map(item => buildItemCard(item)).join('');
}

function buildItemCard(item) {
    const genres = Array.isArray(item.genres)
        ? item.genres
        : (item.genres || '').split(',').map(g => g.trim()).filter(Boolean);
    const rating = parseInt(item.rating) || 0;
    const imgSrc = item.image || item.imageUrl || '';
    const statusClass = 'status-' + (item.status || '').toLowerCase()
        .replace(/\s+/g, '-').replace(/[àâä]/g,'a').replace(/[éèêë]/g,'e').normalize('NFD').replace(/[\u0300-\u036f]/g,'');

    return `<div class="item-card" onclick="openViewModal('${item.id}')">
        <div class="item-cover">
            ${imgSrc
                ? `<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(item.title)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'item-cover-placeholder\\'><i class=\\'fas fa-book\\'></i></div>'">`
                : `<div class="item-cover-placeholder"><i class="fas fa-book"></i></div>`
            }
            <span class="item-type-badge">${escapeHtml(i18n.tType(item.type))}</span>
            ${rating > 0 ? `<span class="item-rating-badge"><i class="fas fa-star"></i>${rating}</span>` : ''}
        </div>
        <div class="item-card-body">
            <h3 class="item-title">${escapeHtml(item.title || '')}</h3>
            <span class="item-status ${statusClass}">${escapeHtml(i18n.tStatus(item.status))}</span>
            ${genres.length > 0 ? `<div class="item-genres">${genres.slice(0,3).map(g => `<span class="genre-tag">${escapeHtml(g)}</span>`).join('')}</div>` : ''}
        </div>
        <div class="item-card-footer">
            <span class="item-chapters"><i class="fas fa-bookmark"></i> Ch.${item.chapters || 0}</span>
            <div class="item-card-actions">
                <button class="btn-icon" title="${escapeHtml(i18n.t('view.btn.edit'))}" onclick="event.stopPropagation();openEditModal('${item.id}')">
                    <i class="fas fa-pen"></i>
                </button>
                <button class="btn-icon delete" title="${escapeHtml(i18n.t('confirm.delete.title'))}" onclick="event.stopPropagation();handleDeleteItem('${item.id}')">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    </div>`;
}

function updateStats() {
    document.getElementById('statTotal').textContent = allItems.length;
    document.getElementById('statInProgress').textContent = allItems.filter(i => i.status === 'En cours').length;
    document.getElementById('statCompleted').textContent = allItems.filter(i => i.status === 'Terminé').length;
    document.getElementById('statToRead').textContent = allItems.filter(i => i.status === 'À lire').length;
}

function updateGenreFilter() {
    const select = document.getElementById('filterGenre');
    if (!select) return;
    const current = select.value;
    const allGenres = new Set();
    allItems.forEach(item => {
        const genres = Array.isArray(item.genres)
            ? item.genres
            : (item.genres || '').split(',').map(g => g.trim());
        genres.forEach(g => { if (g) allGenres.add(g); });
    });
    const sorted = [...allGenres].sort();
    const firstOpt = select.options[0];
    select.innerHTML = '';
    select.appendChild(firstOpt);
    sorted.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g;
        opt.textContent = g;
        if (g === current) opt.selected = true;
        select.appendChild(opt);
    });
}

// ============ ADD/EDIT MODAL ============
function openAddModal() {
    editingItemId = null;
    document.getElementById('modalTitle').textContent = i18n.t('modal.add.title');
    document.getElementById('itemForm').reset();
    document.getElementById('itemId').value = '';
    document.getElementById('itemMalId').value = '';
    document.getElementById('itemRating').value = 0;
    document.getElementById('imagePreview').classList.add('hidden');
    document.getElementById('jikanResults').style.display = 'none';
    resetStarRating();
    updateJikanOfflineNotice();
    openModal('itemModal');
}

function openEditModal(itemId) {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;
    editingItemId = itemId;
    document.getElementById('modalTitle').textContent = i18n.t('modal.edit.title');
    document.getElementById('itemId').value = itemId;
    document.getElementById('itemMalId').value = item.malId || '';
    document.getElementById('itemTitle').value = item.title || '';
    document.getElementById('itemType').value = item.type || '';
    document.getElementById('itemStatus').value = item.status || '';
    document.getElementById('itemChapters').value = item.chapters || 0;
    document.getElementById('itemLink').value = item.link || '';
    document.getElementById('itemImageUrl').value = item.imageUrl || item.image || '';
    document.getElementById('itemNotes').value = item.notes || '';
    document.getElementById('itemRating').value = item.rating || 0;

    const genres = Array.isArray(item.genres)
        ? item.genres.join(', ')
        : (item.genres || '');
    document.getElementById('itemGenres').value = genres;

    setStarRating(parseInt(item.rating) || 0);

    const imgSrc = item.image || item.imageUrl || '';
    if (imgSrc) showImagePreview(imgSrc);
    else document.getElementById('imagePreview').classList.add('hidden');

    document.getElementById('jikanResults').style.display = 'none';
    updateJikanOfflineNotice();
    openModal('itemModal');
}

function openViewModal(itemId) {
    const item = allItems.find(i => i.id === itemId);
    if (!item) return;
    if (window.questManager) {
        window.questManager.onTitleViewed(itemId);
    }
    const genres = Array.isArray(item.genres) ? item.genres : (item.genres || '').split(',').map(g => g.trim()).filter(Boolean);
    const rating = parseInt(item.rating) || 0;
    const imgSrc = item.image || item.imageUrl || '';

    document.getElementById('viewTitle').textContent = item.title || '';
    document.getElementById('viewContent').innerHTML = `
        <div class="view-modal-grid">
            <div>
                <div class="view-cover">
                    ${imgSrc
                        ? `<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(item.title)}" onerror="this.parentElement.innerHTML='<div class=\\'view-cover-placeholder\\'><i class=\\'fas fa-book\\'></i></div>'">`
                        : `<div class="view-cover-placeholder"><i class="fas fa-book"></i></div>`
                    }
                </div>
                <div style="margin-top:1rem;display:flex;gap:0.5rem">
                    <button class="btn-secondary" style="flex:1;font-size:0.8rem" onclick="closeModal('viewModal')">
                        <i class="fas fa-times"></i> ${escapeHtml(i18n.t('modal.form.cancel'))}
                    </button>
                    <button class="btn-secondary danger" style="flex:1;font-size:0.8rem" onclick="closeModal('viewModal');handleDeleteItem('${item.id}')">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>
            <div class="view-info">
                <div class="view-info-row">
                    <span class="view-info-label">${escapeHtml(i18n.t('view.label.type'))}</span>
                    <span class="view-info-value">${escapeHtml(i18n.tType(item.type))}</span>
                </div>
                <div class="view-info-row">
                    <span class="view-info-label">${escapeHtml(i18n.t('view.label.status'))}</span>
                    <span class="item-status status-${(item.status||'').toLowerCase().replace(/\s+/g,'-').normalize('NFD').replace(/[\u0300-\u036f]/g,'')}">${escapeHtml(i18n.tStatus(item.status))}</span>
                </div>
                <div class="view-info-row">
                    <span class="view-info-label">${escapeHtml(i18n.t('view.label.rating'))}</span>
                    <div class="view-stars">
                        ${[1,2,3,4,5].map(i => `<i class="${i <= rating ? 'fas' : 'far'} fa-star"></i>`).join('')}
                        ${rating > 0 ? `<span style="margin-left:0.4rem;font-weight:700">${rating}/5</span>` : ''}
                    </div>
                </div>
                <div class="view-info-row">
                    <span class="view-info-label">${escapeHtml(i18n.t('view.label.chapters'))}</span>
                    <span class="view-info-value">${item.chapters || 0}</span>
                </div>
                ${genres.length > 0 ? `
                <div class="view-info-row">
                    <span class="view-info-label">${escapeHtml(i18n.t('view.label.genres'))}</span>
                    <div class="item-genres">${genres.map(g => `<span class="genre-tag">${escapeHtml(g)}</span>`).join('')}</div>
                </div>` : ''}
                ${item.link ? `
                <div class="view-info-row">
                    <span class="view-info-label">${escapeHtml(i18n.t('view.label.link'))}</span>
                    <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener" class="view-link">
                        <i class="fas fa-external-link-alt"></i> ${escapeHtml(i18n.t('view.btn.openLink'))}
                    </a>
                </div>` : ''}
                ${item.notes ? `
                <div class="view-info-row">
                    <span class="view-info-label">${escapeHtml(i18n.t('view.label.notes'))}</span>
                    <div class="view-notes-text">${escapeHtml(item.notes)}</div>
                </div>` : ''}
                ${item.createdAt ? `
                <div class="view-info-row">
                    <span class="view-info-label">${escapeHtml(i18n.t('view.label.added'))}</span>
                    <span class="view-info-value text-muted text-sm">${new Date(item.createdAt).toLocaleDateString(i18n.lang)}</span>
                </div>` : ''}
            </div>
        </div>
    `;
    openModal('viewModal');
}

// ============ ITEM FORM SUBMIT ============
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('itemForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const title = document.getElementById('itemTitle').value.trim();
        if (!title) return;

        const rawGenres = document.getElementById('itemGenres').value;
        const genres = rawGenres ? rawGenres.split(',').map(g => g.trim()).filter(Boolean) : [];

        const itemData = {
            title,
            type: document.getElementById('itemType').value,
            status: document.getElementById('itemStatus').value,
            rating: parseInt(document.getElementById('itemRating').value) || 0,
            genres,
            link: document.getElementById('itemLink').value.trim(),
            imageUrl: document.getElementById('itemImageUrl').value.trim(),
            image: document.getElementById('itemImageUrl').value.trim(),
            chapters: parseInt(document.getElementById('itemChapters').value) || 0,
            notes: document.getElementById('itemNotes').value.trim(),
            malId: document.getElementById('itemMalId').value.trim(),
        };

        // Handle file upload
        const fileInput = document.getElementById('itemImageFile');
        if (fileInput?.files?.length > 0) {
            const dataUrl = await readFileAsDataURL(fileInput.files[0]);
            itemData.image = dataUrl;
            itemData.imageUrl = dataUrl;
        }

        showLoading(true);
        let result;
        if (editingItemId) {
            result = await updateItem(editingItemId, itemData);
            if (result.success) {
                const idx = allItems.findIndex(i => i.id === editingItemId);
                if (idx !== -1) allItems[idx] = { ...allItems[idx], ...itemData };
                if (window.questManager) window.questManager.onTitleEdited();
                showToast(i18n.t('toast.item.updated'), 'success');
            }
        } else {
            result = await createItem(itemData);
            if (result.success) {
                if (result.isDuplicateMerged) {
                    const idx = allItems.findIndex(i => String(i.id) === String(result.item?.id));
                    if (idx !== -1) allItems[idx] = result.item;
                    showToast(result.message || 'Doublon évité : titre mis à jour avec succès', 'success');
                } else {
                    const newItem = result.item instanceof Parse.Object
                        ? parseItemToObject(result.item)
                        : result.item;
                    allItems.unshift(newItem);
                    showToast(i18n.t('toast.item.added') + (result.offline ? ' (hors ligne)' : ''), 'success');
                }
            }
        }
        showLoading(false);
        if (result.success) {
            closeModal('itemModal');
            applyFiltersAndRender();
        } else {
            showToast(result.error || 'Erreur', 'error');
        }
    });
});

async function handleDeleteItem(itemId) {
    showConfirmDialog(
        i18n.t('confirm.delete.title'),
        i18n.t('trash.notice') || 'Ce titre sera placé dans la corbeille et définitivement supprimé après 15 jours. Vous pourrez le restaurer à tout moment dans la section Statistiques.',
        i18n.t('confirm.delete.yes'),
        i18n.t('confirm.delete.no'),
        'danger',
        async () => {
            showLoading(true);
            const item = allItems.find(i => String(i.id) === String(itemId) || String(i.objectId) === String(itemId));
            if (item && typeof moveToTrashBin === 'function') {
                moveToTrashBin(item);
            }
            const result = await deleteItem(itemId);
            showLoading(false);
            if (result.success) {
                allItems = allItems.filter(i => String(i.id) !== String(itemId) && String(i.objectId) !== String(itemId));
                applyFiltersAndRender();
                showToast(i18n.t('toast.item.deleted') || 'Titre placé dans la corbeille (disponible 15 jours)', 'info');
            } else {
                showToast(result.error || 'Erreur', 'error');
            }
        }
    );
}

// ============ JIKAN INTEGRATION ============
function updateJikanOfflineNotice() {
    const notice = document.getElementById('jikanOfflineNotice');
    if (notice) notice.classList.toggle('hidden', navigator.onLine);
}

document.addEventListener('DOMContentLoaded', () => {
    const jikanBtn = document.getElementById('jikanSearchBtn');
    const jikanInput = document.getElementById('jikanSearchInput');
    const jikanResults = document.getElementById('jikanResults');

    if (jikanBtn && jikanInput) {
        jikanBtn.addEventListener('click', () => performJikanSearch());
        jikanInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); performJikanSearch(); }
        });
        jikanInput.addEventListener('input', () => {
            const type = document.getElementById('itemType')?.value || '';
            jikan.debounceSearch(jikanInput.value, type, renderJikanResults, 600);
        });
    }

    document.getElementById('itemImageUrl')?.addEventListener('input', e => {
        if (e.target.value) showImagePreview(e.target.value);
    });

    document.getElementById('itemImageFile')?.addEventListener('change', async e => {
        if (e.target.files?.[0]) {
            const url = await readFileAsDataURL(e.target.files[0]);
            showImagePreview(url);
        }
    });
});

async function performJikanSearch() {
    const input = document.getElementById('jikanSearchInput');
    if (!input || !input.value.trim()) return;
    if (!navigator.onLine) { showToast(i18n.t('toast.offline'), 'warning'); return; }
    const btn = document.getElementById('jikanSearchBtn');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    const type = document.getElementById('itemType')?.value || '';
    const results = await jikan.search(input.value.trim(), jikan.getJikanType(type));
    renderJikanResults(results);
    btn.disabled = false;
    btn.innerHTML = `<i class="fas fa-search"></i> <span>${i18n.t('modal.form.jikan.btn')}</span>`;
}

function renderJikanResults(results) {
    const container = document.getElementById('jikanResults');
    if (!container) return;
    if (!results || results.length === 0) {
        container.style.display = navigator.onLine ? 'block' : 'none';
        container.innerHTML = navigator.onLine ? '<div style="padding:1rem;text-align:center;color:var(--text-muted);font-size:0.85rem">Aucun résultat</div>' : '';
        return;
    }
    container.style.display = 'block';
    container.innerHTML = results.map(r => `
        <div class="jikan-result-item" onclick="applyJikanResult(${encodeJikanResult(r)})">
            ${r.imageUrl ? `<img src="${r.imageUrl}" class="jikan-result-cover" alt="" onerror="this.style.display='none'">` : '<div class="jikan-result-cover"></div>'}
            <div class="jikan-result-info">
                <p class="jikan-result-title">${escapeHtml(r.title)}</p>
                <p class="jikan-result-meta">${r.type}${r.score ? ' · ' + r.score + '/10' : ''}${r.genres?.length ? ' · ' + r.genres.slice(0,2).join(', ') : ''}</p>
            </div>
        </div>
    `).join('');
}

function encodeJikanResult(r) {
    return "'" + btoa(unescape(encodeURIComponent(JSON.stringify(r)))).replace(/'/g, "\\'") + "'";
}

function applyJikanResult(encoded) {
    try {
        const result = JSON.parse(decodeURIComponent(escape(atob(encoded))));
        jikan.fillForm(result);
        document.getElementById('jikanResults').style.display = 'none';
    } catch (e) { console.error('[Jikan] Apply error:', e); }
}

// ============ STAR RATING ============
document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('#ratingInput i').forEach(star => {
        star.addEventListener('click', () => setStarRating(parseInt(star.dataset.rating)));
        star.addEventListener('mouseenter', () => highlightStars(parseInt(star.dataset.rating)));
        star.addEventListener('mouseleave', () => highlightStars(parseInt(document.getElementById('itemRating').value) || 0));
    });
});

function setStarRating(rating) {
    document.getElementById('itemRating').value = rating;
    highlightStars(rating);
}

function highlightStars(rating) {
    document.querySelectorAll('#ratingInput i').forEach(star => {
        const r = parseInt(star.dataset.rating);
        star.classList.toggle('active', r <= rating);
        star.style.color = r <= rating ? 'var(--color-star)' : '';
    });
}

function resetStarRating() {
    document.getElementById('itemRating').value = 0;
    highlightStars(0);
}

// ============ IMAGE PREVIEW ============
function showImagePreview(src) {
    const preview = document.getElementById('imagePreview');
    const img = document.getElementById('imagePreviewImg');
    if (!preview || !img) return;
    img.src = src;
    img.onerror = () => preview.classList.add('hidden');
    img.onload = () => preview.classList.remove('hidden');
}

async function readFileAsDataURL(file) {
    return new Promise((res, rej) => {
        const reader = new FileReader();
        reader.onload = e => res(e.target.result);
        reader.onerror = rej;
        reader.readAsDataURL(file);
    });
}

// ============ THEME ============
function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('manlore_theme', theme);
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === theme);
    });
    showToast(i18n.t('toast.theme.changed'), 'info');
    if (typeof saveUserSettingsToCloud === 'function') {
        saveUserSettingsToCloud('theme', theme);
    }
}

function applyStoredTheme() {
    const saved = localStorage.getItem('manlore_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === saved);
    });
}

// ============ TITLE FONT ============
function applyTitleFont(font) {
    document.documentElement.setAttribute('data-title-font', font);
    localStorage.setItem('manlore_title_font', font);
    document.querySelectorAll('.font-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.titleFont === font);
    });
    showToast(i18n.t('toast.font.changed'), 'info');
    if (typeof saveUserSettingsToCloud === 'function') {
        saveUserSettingsToCloud('titleFont', font);
    }
}

function applyStoredTitleFont() {
    const saved = localStorage.getItem('manlore_title_font') || 'orbitron';
    document.documentElement.setAttribute('data-title-font', saved);
    document.querySelectorAll('.font-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.titleFont === saved);
    });
}
window.applyTitleFont = applyTitleFont;

// ============ LANGUAGE ============
function applyLanguage(lang) {
    i18n.setLang(lang);
    if (window.questManager) {
        window.questManager.loadQuestDefinitions();
    }
    applyFiltersAndRender();
    if (currentPage === 'wishlist') {
        renderWishlist();
    } else if (currentPage === 'stats') {
        renderStats(allItems);
    }
    showToast(i18n.t('toast.lang.changed'), 'info');
    if (typeof saveUserSettingsToCloud === 'function') {
        saveUserSettingsToCloud('language', lang);
    }
}

// ============ STORAGE MODE UI ============
function updateStorageModeUI() {
    const mode = getStorageMode();
    document.querySelectorAll('.storage-mode-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });
    const migrateToCloud = document.getElementById('migrateToCloudBtn');
    const migrateToLocal = document.getElementById('migrateToLocalBtn');
    if (migrateToCloud && migrateToLocal) {
        if (isGuestMode) {
            migrateToCloud.classList.add('hidden');
            migrateToLocal.classList.add('hidden');
        } else if (mode === 'local') {
            migrateToCloud.classList.remove('hidden');
            migrateToLocal.classList.add('hidden');
        } else {
            migrateToCloud.classList.add('hidden');
            migrateToLocal.classList.remove('hidden');
        }
    }
}

// ============ SETTINGS ============
function applyStoredSettings() {
    const compact = localStorage.getItem('manlore_compact') === 'true';
    const reduced = localStorage.getItem('manlore_reduced_motion') === 'true';
    if (document.getElementById('compactMode')) document.getElementById('compactMode').checked = compact;
    if (document.getElementById('reducedMotion')) document.getElementById('reducedMotion').checked = reduced;
    if (compact) document.body.classList.add('compact');
    if (reduced) document.body.style.setProperty('--transition-base', '0s');

    // Apply language
    const savedLang = localStorage.getItem('manlore_lang') || 'fr';
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.lang === savedLang);
    });
}

// ============ EXPORT / IMPORT ============
async function handleExport() {
    if (allItems.length === 0) { showToast('Aucune donnée à exporter', 'warning'); return; }
    
    const date = new Date().toISOString().split('T')[0];
    const defaultName = `manlore-export-${date}`;

    showPromptDialog(
        i18n.t('nav.settings'), // just using a localized title or plain string
        "Entrez un nom pour votre sauvegarde :",
        defaultName,
        "Exporter",
        async (val) => {
            let filename = val.trim() || defaultName;
            if (!filename.endsWith('.json')) filename += '.json';
            
            showLoading(true, 'Préparation de l\'export...');
            const result = await exportData(allItems, filename);
            showLoading(false);
            if (result.success) {
                showToast(`✓ Export réussi ! Copie archivée dans com.karlitodev.manlore/exported`, 'success');
                if (!result.sharedViaSheet) {
                    showAlertDialog(
                        'Sauvegarde Réussie',
                        `Vos données ont été téléchargées (${filename}).<br><br>📁 Une copie de sauvegarde a été automatiquement archivée dans :<br><strong>com.karlitodev.manlore/exported</strong>`,
                        'OK'
                    );
                }
            } else {
                showToast('Erreur lors de l\'exportation', 'error');
            }
        }
    );
}

function handleImportClick() {
    document.getElementById('importFile')?.click();
}

function showImportProgressModal(show) {
    const modal = document.getElementById('importProgressModal');
    if (!modal) return;
    modal.classList.toggle('hidden', !show);
}

function updateImportProgressUI(processed, total, currentTitle, startTime) {
    const percent = Math.min(100, Math.round((processed / total) * 100));
    const fillEl = document.getElementById('importProgressBarFill');
    const processedEl = document.getElementById('importStatProcessed');
    const remainingEl = document.getElementById('importStatRemaining');
    const timeEl = document.getElementById('importStatTime');
    const titleEl = document.getElementById('importCurrentTitle');

    if (fillEl) fillEl.style.width = `${percent}%`;
    if (processedEl) processedEl.textContent = `${processed} / ${total} (${percent}%)`;
    if (remainingEl) remainingEl.textContent = `${Math.max(0, total - processed)}`;
    if (titleEl && currentTitle) titleEl.textContent = `Importation : "${currentTitle}"`;

    if (timeEl && processed > 0) {
        const elapsedMs = Date.now() - startTime;
        const avgPerItem = elapsedMs / processed;
        const remainingMs = (total - processed) * avgPerItem;
        const remainingSec = Math.ceil(remainingMs / 1000);
        if (remainingSec >= 60) {
            timeEl.textContent = `~${Math.floor(remainingSec / 60)}m ${remainingSec % 60}s`;
        } else {
            timeEl.textContent = `~${Math.max(1, remainingSec)}s`;
        }
    }
}

async function handleImportFile(file) {
    if (!file) return;
    try {
        const parsed = await importDataFromFile(file);
        if (!parsed.success || parsed.count === 0) {
            showToast('Fichier invalide ou vide', 'error');
            return;
        }

        showConfirmDialog(
            i18n.t('confirm.import.title') || 'Confirmation d\'importation',
            `${parsed.count} ${i18n.t('confirm.import.msg') || 'titres détectés. Voulez-vous les importer dans votre collection ?'}`,
            'Importer',
            i18n.t('modal.form.cancel') || 'Annuler',
            'info',
            async () => {
                showImportProgressModal(true);
                const startTime = Date.now();
                const total = parsed.items.length;
                let imported = 0;

                updateImportProgressUI(0, total, 'Démarrage...', startTime);

                for (let i = 0; i < total; i++) {
                    const item = parsed.items[i];
                    updateImportProgressUI(i, total, item.title || 'Titre', startTime);

                    try {
                        const result = await createItem(item);
                        if (result.success) {
                            if (result.isDuplicateMerged) {
                                const idx = allItems.findIndex(i => String(i.id) === String(result.item?.id));
                                if (idx !== -1) allItems[idx] = result.item;
                            } else {
                                const ni = (result.item && typeof result.item.get === 'function') ? parseItemToObject(result.item) : result.item;
                                allItems.unshift(ni);
                            }
                            imported++;
                        }
                    } catch (itemErr) {
                        console.warn('[Import] Item import note:', itemErr);
                    }

                    // Laisser le thread UI respirer et animer la barre de progression
                    if (total > 20 && i % 2 === 0) {
                        await new Promise(r => setTimeout(r, 15));
                    }
                }

                if (typeof deduplicateCollection === 'function') {
                    await deduplicateCollection();
                }

                updateImportProgressUI(total, total, 'Terminé avec succès !', startTime);
                await new Promise(r => setTimeout(r, 400));
                showImportProgressModal(false);

                applyFiltersAndRender();
                showToast(`✓ Importation terminée (${imported}/${total} titres traités avec préservation des dates et fusion)`, 'success');
                if (window.launchRankConfetti && imported > 5) {
                    window.launchRankConfetti();
                }
            }
        );
    } catch (e) {
        showImportProgressModal(false);
        showToast('Erreur: ' + e.message, 'error');
    }
    document.getElementById('importFile').value = '';
}

// ============ PASSWORD CHANGE ============
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('passwordForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const current = document.getElementById('pwdCurrent').value;
        const newPwd = document.getElementById('pwdNew').value;
        const confirm = document.getElementById('pwdConfirm').value;
        if (newPwd !== confirm) { showToast(i18n.t('toast.pwd.error'), 'error'); return; }
        if (newPwd.length < 6) { showToast('Le mot de passe doit avoir au moins 6 caractères', 'warning'); return; }
        showLoading(true);
        const result = await changePassword(current, newPwd);
        showLoading(false);
        if (result.success) {
            showToast(i18n.t('toast.pwd.changed'), 'success');
            closeModal('passwordModal');
            document.getElementById('passwordForm').reset();
        } else {
            showToast(result.error || 'Erreur', 'error');
        }
    });
});

// ============ CUSTOM CONFIRM DIALOG ============
function showConfirmDialog(title, message, yesText, noText, type = 'warning', onYes = null, onNo = null) {
    confirmCallback = onYes;
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmMessage').textContent = message;
    const yesBtn = document.getElementById('confirmYes');
    const noBtn = document.getElementById('confirmNo');
    yesBtn.textContent = yesText;
    noBtn.textContent = noText;

    const icon = document.getElementById('confirmIcon');
    icon.className = 'confirm-icon fas';
    if (type === 'danger') { icon.classList.add('fa-exclamation-triangle', 'danger'); yesBtn.className = 'btn-danger'; }
    else if (type === 'info') { icon.classList.add('fa-info-circle', 'info'); yesBtn.className = 'btn-primary'; }
    else { icon.classList.add('fa-question-circle', 'warning'); yesBtn.className = 'btn-danger'; }

    yesBtn.onclick = () => { const cb = confirmCallback; closeConfirmDialog(); if (cb) cb(); };
    document.getElementById('confirmDialog').classList.add('active');
}

function closeConfirmDialog() {
    document.getElementById('confirmDialog').classList.remove('active');
    confirmCallback = null;
}

function showPromptDialog(title, message, placeholder, confirmText, onConfirm) {
    promptCallback = onConfirm;
    document.getElementById('promptTitle').textContent = title;
    document.getElementById('promptMessage').textContent = message;
    document.getElementById('promptInput').value = '';
    document.getElementById('promptInput').placeholder = placeholder || '';
    document.getElementById('promptConfirm').textContent = confirmText;
    document.getElementById('promptCancel').textContent = i18n.t('modal.form.cancel');
    document.getElementById('promptConfirm').onclick = () => {
        const val = document.getElementById('promptInput').value;
        const cb = promptCallback;
        closePromptDialog();
        if (cb) cb(val);
    };
    document.getElementById('promptDialog').classList.add('active');
    setTimeout(() => document.getElementById('promptInput').focus(), 100);
}

function closePromptDialog() {
    document.getElementById('promptDialog').classList.remove('active');
    promptCallback = null;
}

// ============ MODAL HELPERS ============
function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    if (id === 'whatsNewModal') {
        closeWhatsNewModal();
        return;
    }
    const modalEl = document.getElementById(id);
    if (modalEl) modalEl.classList.remove('active');
}

// ============ TOAST ============
function showToast(message, type = 'info', duration = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', info: 'fa-info-circle', warning: 'fa-exclamation-triangle' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas ${icons[type] || 'fa-info-circle'}"></i><span>${escapeHtml(message)}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.classList.add('leaving');
        setTimeout(() => { if (toast.parentElement) toast.parentElement.removeChild(toast); }, 300);
    }, duration);
}

// ============ LOADING ============
function showLoading(show, text = 'Chargement...') {
    const overlay = document.getElementById('loadingOverlay');
    if (!overlay) return;
    overlay.classList.toggle('hidden', !show);
    const textEl = overlay.querySelector('.loading-text');
    if (textEl) textEl.textContent = text;
}

// ============ ESCAPE ============
function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============ EVENT LISTENERS ============
function setupEventListeners() {

    // Sidebar toggle
    document.getElementById('menuToggle')?.addEventListener('click', () => {
        const sidebar = document.getElementById('sidebar');
        if (sidebar.classList.contains('active')) closeSidebar();
        else openSidebar();
    });
    document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebar);

    // Navigation
    document.querySelectorAll('[data-page]').forEach(el => {
        el.addEventListener('click', e => {
            e.preventDefault();
            navigateTo(el.dataset.page);
        });
    });

    // Auth forms
    document.getElementById('loginForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const u = document.getElementById('loginUsername').value.trim();
        const p = document.getElementById('loginPassword').value;
        if (!u || !p) return;
        showLoading(true, 'Connexion...');
        const result = await logIn(u, p);
        showLoading(false);
        if (result.success) { showToast(i18n.t('toast.login.success'), 'success'); await showApp(); }
        else showToast(result.error || 'Erreur de connexion', 'error');
    });

    document.getElementById('signupForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        const u = document.getElementById('signupUsername').value.trim();
        const em = document.getElementById('signupEmail').value.trim();
        const p = document.getElementById('signupPassword').value;
        if (!u || !em || !p) return;
        showLoading(true, 'Création...');
        const result = await signUp(u, em, p);
        showLoading(false);
        if (result.success) { showToast(i18n.t('toast.signup.success'), 'success'); await showApp(); }
        else showToast(result.error || 'Erreur', 'error');
    });

    function switchAuthTab(tab) {
        const loginForm = document.getElementById('loginForm');
        const signupForm = document.getElementById('signupForm');
        const tabLogin = document.getElementById('tabBtnLogin');
        const tabSignup = document.getElementById('tabBtnSignup');

        if (tab === 'signup') {
            loginForm?.classList.add('hidden');
            signupForm?.classList.remove('hidden');
            if (tabLogin) tabLogin.className = 'btn-secondary';
            if (tabSignup) tabSignup.className = 'btn-primary';
        } else {
            signupForm?.classList.add('hidden');
            loginForm?.classList.remove('hidden');
            if (tabLogin) tabLogin.className = 'btn-primary';
            if (tabSignup) tabSignup.className = 'btn-secondary';
        }
    }
    window.switchAuthTab = switchAuthTab;

    document.getElementById('showSignup')?.addEventListener('click', e => {
        e.preventDefault();
        switchAuthTab('signup');
    });

    document.getElementById('showLogin')?.addEventListener('click', e => {
        e.preventDefault();
        switchAuthTab('login');
    });

    // Guest mode
    document.getElementById('guestModeBtn')?.addEventListener('click', async () => {
        loginAsGuest();
        showToast(i18n.t('auth.guest.warning'), 'info');
        await showApp();
    });

    // Logout — custom confirm, no browser confirm()
    const handleLogout = e => {
        e.preventDefault();
        showConfirmDialog(
            i18n.t('confirm.logout.title'),
            i18n.t('confirm.logout.msg'),
            i18n.t('confirm.logout.yes'),
            i18n.t('confirm.logout.no'),
            'warning',
            async () => {
                await logOut();
                allItems = [];
                filteredItems = [];
                showToast(i18n.t('toast.logout.success'), 'info');
                showAuth();
            }
        );
    };
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);
    document.getElementById('settingsLogoutBtn')?.addEventListener('click', handleLogout);

    // Avatar file upload handler
    document.getElementById('avatarFileInput')?.addEventListener('change', async e => {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 3 * 1024 * 1024) {
            showToast('Image trop grande (max 3 Mo)', 'warning');
            return;
        }
        const base64 = await readFileAsDataURL(file);
        showLoading(true, 'Enregistrement de la photo...');
        const result = await updateUserProfileAvatar(base64);
        showLoading(false);
        if (result.success) {
            updateAvatarDisplay(base64);
            showToast('Photo de profil mise à jour !', 'success');
        } else {
            showToast('Erreur lors de l\'enregistrement', 'error');
        }
    });

    // Add button
    document.getElementById('addBtn')?.addEventListener('click', openAddModal);

    // Filters
    ['searchInput','filterType','filterStatus','filterGenre','sortBy'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', applyFiltersAndRender);
        document.getElementById(id)?.addEventListener('change', applyFiltersAndRender);
    });

    // Theme buttons
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.classList.contains('active')) return;
            showLoading(true, '...');
            setTimeout(() => {
                applyTheme(btn.dataset.theme);
                showLoading(false);
            }, 800);
        });
    });

    // Language buttons
    document.querySelectorAll('.lang-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.classList.contains('active')) return;
            showLoading(true, '...');
            setTimeout(() => {
                applyLanguage(btn.dataset.lang);
                showLoading(false);
            }, 800);
        });
    });

    // Storage mode
    document.querySelectorAll('.storage-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.classList.contains('active')) return;
            if (isGuestMode && btn.dataset.mode === 'cloud') {
                showToast(i18n.t('toast.guest.feature'), 'warning');
                return;
            }
            showLoading(true, '...');
            setTimeout(() => {
                setStorageMode(btn.dataset.mode);
                updateStorageModeUI();
                showToast(i18n.t('toast.storage.changed'), 'info');
                showLoading(false);
            }, 800);
        });
    });

    // Migrate buttons
    document.getElementById('migrateToCloudBtn')?.addEventListener('click', async () => {
        if (isGuestMode) { showToast(i18n.t('toast.guest.feature'), 'warning'); return; }
        showConfirmDialog(
            i18n.t('confirm.migrate.title'),
            i18n.t('confirm.migrate.toCloud'),
            'Migrer', i18n.t('modal.form.cancel'), 'info',
            async () => {
                showLoading(true, 'Migration...');
                const r = await migrateLocalToCloud();
                showLoading(false);
                if (r.success) {
                    setStorageMode('cloud');
                    updateStorageModeUI();
                    showToast(`${i18n.t('toast.migrated')} (${r.count} titres)`, 'success');
                    await loadAndRenderItems();
                } else showToast(r.error || 'Erreur', 'error');
            }
        );
    });

    document.getElementById('migrateToLocalBtn')?.addEventListener('click', async () => {
        showConfirmDialog(
            i18n.t('confirm.migrate.title'),
            i18n.t('confirm.migrate.toLocal'),
            'Télécharger', i18n.t('modal.form.cancel'), 'info',
            async () => {
                showLoading(true);
                const r = await migrateCloudToLocal();
                showLoading(false);
                if (r.success) showToast(`${i18n.t('toast.migrated')} (${r.count} titres)`, 'success');
                else showToast('Erreur', 'error');
            }
        );
    });

    // Password modal
    document.getElementById('changePasswordBtn')?.addEventListener('click', () => {
        document.getElementById('passwordForm').reset();
        openModal('passwordModal');
    });

    // Export / Import
    document.getElementById('exportBtn')?.addEventListener('click', handleExport);
    document.getElementById('importBtn')?.addEventListener('click', handleImportClick);
    document.getElementById('importFile')?.addEventListener('change', e => handleImportFile(e.target.files[0]));

    // Sync
    document.getElementById('syncNowBtn')?.addEventListener('click', async () => {
        if (isGuestMode || storageMode === 'local') {
            showToast('Synchronisation disponible en mode cloud uniquement', 'info');
            return;
        }
        showLoading(true);
        await processSyncQueue();
        await loadAndRenderItems();
        showLoading(false);
        showToast(i18n.t('toast.sync.done'), 'success');
    });

    document.getElementById('clearAppCacheBtn')?.addEventListener('click', () => {
        showConfirmDialog(
            'Supprimer le cache de l\'application',
            'Voulez-vous supprimer l\'intégralité du cache présent (cache PWA Service Worker, requêtes API et stockage temporaire) ? L\'application sera rechargée.',
            'Supprimer', i18n.t('modal.form.cancel'), 'danger',
            async () => {
                try {
                    showLoading(true, 'Suppression du cache...');
                    if ('caches' in window) {
                        const cacheKeys = await caches.keys();
                        await Promise.all(cacheKeys.map(k => caches.delete(k)));
                    }
                    const keysToRemove = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i);
                        if (k && (k.includes('cache') || k.includes('jikan') || k.includes('whats_new') || k.includes('release_tracker'))) {
                            keysToRemove.push(k);
                        }
                    }
                    keysToRemove.forEach(k => localStorage.removeItem(k));

                    if ('serviceWorker' in navigator) {
                        const registrations = await navigator.serviceWorker.getRegistrations();
                        for (let reg of registrations) {
                            await reg.unregister();
                        }
                    }

                    showLoading(false);
                    showToast('Cache de l\'application intégralement supprimé !', 'success');
                    setTimeout(() => {
                        window.location.reload(true);
                    }, 1200);
                } catch (e) {
                    showLoading(false);
                    showToast('Erreur lors de la suppression du cache', 'error');
                }
            }
        );
    });

    document.getElementById('clearCacheBtn')?.addEventListener('click', () => {
        showConfirmDialog('Vider le cache', 'Vider le cache local (les données cloud restent intactes) ?',
            'Vider', i18n.t('modal.form.cancel'), 'warning',
            () => {
                localStorage.removeItem('manlore_items');
                localStorage.removeItem('manlore_jikan_cache');
                allItems = [];
                applyFiltersAndRender();
                showToast(i18n.t('toast.cache.cleared'), 'success');
            }
        );
    });

    // Delete all data
    document.getElementById('deleteAllDataBtn')?.addEventListener('click', () => {
        showPromptDialog(
            i18n.t('confirm.deleteAll.title'),
            i18n.t('confirm.deleteAll.msg'),
            i18n.t('confirm.deleteAll.placeholder'),
            i18n.t('confirm.delete.yes'),
            async val => {
                const confirmWord = i18n.lang === 'en' ? 'DELETE' : i18n.lang === 'es' ? 'ELIMINAR' : 'SUPPRIMER';
                if (val.trim().toUpperCase() !== confirmWord) {
                    showToast('Confirmation incorrecte', 'error');
                    return;
                }
                showLoading(true);
                await deleteAllItems();
                allItems = [];
                applyFiltersAndRender();
                showLoading(false);
                showToast('Données supprimées', 'info');
            }
        );
    });

    // Delete account
    document.getElementById('deleteAccountBtn')?.addEventListener('click', () => {
        if (isGuestMode) { showToast(i18n.t('toast.guest.feature'), 'warning'); return; }
        showConfirmDialog(
            i18n.t('confirm.deleteAccount.title'),
            i18n.t('confirm.deleteAccount.msg'),
            i18n.t('confirm.delete.yes'),
            i18n.t('confirm.delete.no'),
            'danger',
            async () => {
                showLoading(true);
                const r = await deleteUserAccount();
                showLoading(false);
                if (r.success) { showAuth(); showToast('Compte supprimé', 'info'); }
                else showToast(r.error || 'Erreur', 'error');
            }
        );
    });

    // Close modals on backdrop / outside click
    document.querySelectorAll('.modal').forEach(modalEl => {
        modalEl.addEventListener('click', e => {
            if (e.target === modalEl || e.target.classList.contains('modal-backdrop')) {
                closeModal(modalEl.id);
            }
        });
    });

    // Roulette du Destin listeners
    document.getElementById('rouletteBtn')?.addEventListener('click', openRouletteModal);
    document.getElementById('spinRouletteBtn')?.addEventListener('click', spinRoulette);

    // Keyboard ESC
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            document.querySelectorAll('.modal.active').forEach(m => closeModal(m.id));
            closeConfirmDialog();
            closePromptDialog();
            closeSidebar();
        }
    });

    // Online/offline UI update
    window.addEventListener('online', () => updateJikanOfflineNotice());
    window.addEventListener('offline', () => updateJikanOfflineNotice());
}

// ============ ROULETTE DU DESTIN (RANDOM READ & DISCOVERY) ============
let rouletteSelectedId = null;
let rouletteMode = 'local'; // 'local' | 'global'
let rouletteTypeFilter = 'all'; // 'all' | 'manga' | 'manhwa' | 'manhua'
let rouletteGlobalItem = null;

function setRouletteMode(mode) {
    rouletteMode = mode;
    document.getElementById('rouletteModeLocal')?.classList.toggle('active', mode === 'local');
    document.getElementById('rouletteModeGlobal')?.classList.toggle('active', mode === 'global');
    const typeBar = document.getElementById('rouletteGlobalTypeBar');
    if (typeBar) typeBar.style.display = (mode === 'global') ? 'flex' : 'none';
}
window.setRouletteMode = setRouletteMode;

function setRouletteTypeFilter(filter) {
    rouletteTypeFilter = filter;
    document.querySelectorAll('.roulette-type-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === filter);
    });
}
window.setRouletteTypeFilter = setRouletteTypeFilter;

function openRouletteModal() {
    rouletteSelectedId = null;
    rouletteGlobalItem = null;
    setRouletteMode('local');
    document.getElementById('rouletteTitle').textContent = 'Prêt à lancer ?';
    document.getElementById('rouletteSubtitle').textContent = 'Laissez le destin choisir votre prochaine lecture !';
    document.getElementById('rouletteMeta').textContent = '';
    document.getElementById('rouletteImage').src = 'manlore-logo.png';
    const detailBtn = document.getElementById('openRouletteDetailBtn');
    if (detailBtn) {
        detailBtn.disabled = true;
        detailBtn.onclick = null;
    }
    openModal('rouletteModal');
}

async function spinRoulette() {
    const spinBtn = document.getElementById('spinRouletteBtn');
    const imgEl = document.getElementById('rouletteImage');
    const titleEl = document.getElementById('rouletteTitle');
    const metaEl = document.getElementById('rouletteMeta');
    const detailBtn = document.getElementById('openRouletteDetailBtn');
    const wrap = document.getElementById('rouletteCoverContainer');

    if (spinBtn) spinBtn.disabled = true;
    if (detailBtn) detailBtn.disabled = true;
    if (wrap) wrap.classList.add('roulette-spinning');

    if (rouletteMode === 'global') {
        titleEl.textContent = 'Recherche dans les étoiles...';
        metaEl.textContent = 'Consultation des bases Jikan & AniList';
        try {
            const externalWinner = await window.jikan.getRandomDiscovery(rouletteTypeFilter);
            if (wrap) wrap.classList.remove('roulette-spinning');
            if (spinBtn) spinBtn.disabled = false;

            if (!externalWinner) {
                showToast('Aucun résultat trouvé pour ce filtre', 'warning');
                return;
            }
            rouletteGlobalItem = externalWinner;
            titleEl.textContent = externalWinner.title;
            metaEl.textContent = `${externalWinner.type} • Score MAL: ★ ${externalWinner.score || '8.0'} • ${externalWinner.genres || externalWinner.genre || ''}`;
            if (externalWinner.image) imgEl.src = externalWinner.image;

            if (detailBtn) {
                detailBtn.disabled = false;
                detailBtn.innerHTML = '<i class="fas fa-plus"></i> Ajouter au Codex';
                detailBtn.onclick = () => {
                    closeModal('rouletteModal');
                    if (typeof openAddModal === 'function') {
                        openAddModal();
                        setTimeout(() => {
                            const titleInput = document.getElementById('itemTitle');
                            const typeSelect = document.getElementById('itemType');
                            const genresInput = document.getElementById('itemGenres');
                            const imageInput = document.getElementById('itemImageUrl');
                            const remarksInput = document.getElementById('itemRemarks');
                            
                            if (titleInput) titleInput.value = externalWinner.title;
                            if (typeSelect) typeSelect.value = externalWinner.type || 'Manga';
                            if (genresInput) genresInput.value = externalWinner.genres || externalWinner.genre || '';
                            if (imageInput) imageInput.value = externalWinner.image || '';
                            if (remarksInput) {
                                const malScoreText = externalWinner.score ? `[Score MyAnimeList: ★ ${externalWinner.score}/10]\n\n` : '';
                                remarksInput.value = malScoreText + (externalWinner.synopsis || '');
                            }
                            if (externalWinner.image && typeof showImagePreview === 'function') {
                                showImagePreview(externalWinner.image);
                            }
                        }, 200);
                    }
                };
            }

            if (window.questManager) {
                window.questManager.addExp(25, 'Découverte de manga externe');
                window.questManager.onCustomEvent('roulette_spin');
            }
            showToast('Nouveau manga découvert !', 'success');
        } catch (e) {
            if (wrap) wrap.classList.remove('roulette-spinning');
            if (spinBtn) spinBtn.disabled = false;
            showToast('Erreur lors du tirage externe', 'error');
        }
        return;
    }

    // Local pool
    const pool = allItems.filter(i => i.status === 'À lire' || i.status === 'En cours');
    const candidates = pool.length > 0 ? pool : allItems;

    if (candidates.length === 0) {
        if (wrap) wrap.classList.remove('roulette-spinning');
        if (spinBtn) spinBtn.disabled = false;
        showToast('Aucun titre disponible dans votre bibliothèque', 'info');
        return;
    }

    let counter = 0;
    const interval = setInterval(() => {
        const temp = candidates[Math.floor(Math.random() * candidates.length)];
        titleEl.textContent = temp.title;
        if (temp.imageUrl || temp.image) imgEl.src = temp.imageUrl || temp.image;
        counter++;
        if (counter >= 15) {
            clearInterval(interval);
            if (wrap) wrap.classList.remove('roulette-spinning');
            
            const winner = candidates[Math.floor(Math.random() * candidates.length)];
            rouletteSelectedId = winner.id;
            titleEl.textContent = winner.title;
            metaEl.textContent = `${winner.type} • ${winner.status} • ${winner.chapters || 0} chapitres`;
            if (winner.imageUrl || winner.image) imgEl.src = winner.imageUrl || winner.image;

            if (spinBtn) spinBtn.disabled = false;
            if (detailBtn) {
                detailBtn.disabled = false;
                detailBtn.innerHTML = '<i class="fas fa-eye"></i> Voir la fiche';
                detailBtn.onclick = () => {
                    closeModal('rouletteModal');
                    openViewModal(winner.id);
                };
            }

            if (window.questManager) {
                window.questManager.addExp(10, 'Tirage au sort de lecture');
                window.questManager.onCustomEvent('roulette_spin');
            }
            showToast('Destin scellé ! Bonne lecture !', 'success');
        }
    }, 80);
}

// ============ OPEN EXTERNAL LINK (SYSTEM BROWSER) ============
function openExternalLink(url) {
    if (!url) return;
    try {
        if (window.Capacitor?.Plugins?.Browser) {
            window.Capacitor.Plugins.Browser.open({ url });
            return;
        }
        if (window.cordova?.InAppBrowser) {
            window.cordova.InAppBrowser.open(url, '_system');
            return;
        }
    } catch (e) {}

    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    document.body.appendChild(a);
    a.click();
    a.remove();
}
// ============ SUIVI DES SORTIES & CHAPITRES ============
async function openReleaseTrackerModal(forceRefresh = false) {
    if (typeof openModal === 'function') openModal('releaseTrackerModal');
    await renderReleaseTracker(forceRefresh);
}
window.openReleaseTrackerModal = openReleaseTrackerModal;

async function renderReleaseTracker(forceRefresh = false) {
    const container = document.getElementById('releaseTrackerModalBody');
    if (!container) return;

    container.innerHTML = `
        <div style="padding:2rem; text-align:center; color:var(--text-muted);">
            <i class="fas fa-spinner fa-spin" style="font-size:2rem; color:var(--color-primary); margin-bottom:0.5rem;"></i>
            <p>${i18n.t('release.checking') || 'Recherche des mises à jour...'}</p>
        </div>
    `;

    try {
        const releases = await window.jikan.checkReleaseUpdates(allItems, forceRefresh);
        if (!releases || releases.length === 0) {
            container.innerHTML = `
                <div style="padding:2.5rem; text-align:center; color:var(--text-muted);">
                    <i class="fas fa-rss" style="font-size:2.5rem; opacity:0.4; margin-bottom:0.75rem; display:block;"></i>
                    <p style="font-weight:600;">${i18n.t('release.noReleases') || 'Aucune série en cours pour le moment.'}</p>
                </div>
            `;
            return;
        }

        const unreadTotal = releases.reduce((sum, r) => sum + (r.unreadCount || 0), 0);

        container.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1.25rem; padding-bottom:0.75rem; border-bottom:1px solid var(--border-color);">
                <div>
                    <span class="badge badge-primary" style="font-size:0.85rem; padding:0.35rem 0.75rem;">
                        <i class="fas fa-book"></i> ${releases.length} séries suivies
                    </span>
                    ${unreadTotal > 0 ? `<span class="badge badge-success" style="margin-left:0.5rem; font-size:0.85rem; padding:0.35rem 0.75rem;">+${unreadTotal} nouveaux chapitres</span>` : ''}
                </div>
                <button class="btn btn-secondary btn-sm" onclick="openReleaseTrackerModal(true)">
                    <i class="fas fa-sync-alt"></i> ${i18n.t('release.refreshBtn') || 'Actualiser'}
                </button>
            </div>
            <div class="space-y">
                ${releases.map(r => {
                    const isUpToDate = r.unreadCount === 0;
                    return `
                        <div style="display:flex; align-items:center; justify-content:space-between; padding:0.85rem; border-radius:10px; background:var(--bg-card); border:1px solid var(--border-color); gap:0.85rem;">
                            <div style="display:flex; align-items:center; gap:0.85rem; min-width:0;">
                                ${r.image ? `<img src="${escapeHtml(r.image)}" style="width:40px; height:54px; object-fit:cover; border-radius:6px; flex-shrink:0;">` : `<div style="width:40px; height:54px; background:var(--border-color); border-radius:6px; display:flex; align-items:center; justify-content:center; flex-shrink:0;"><i class="fas fa-book text-muted"></i></div>`}
                                <div style="min-width:0;">
                                    <div style="font-weight:700; color:var(--text-primary); font-size:0.95rem; text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${escapeHtml(r.title)}</div>
                                    <div class="text-xs text-muted" style="margin-top:0.15rem;">
                                        Lu : <strong>Chap. ${r.currentChapter}</strong> • Paru : <strong style="color:var(--color-primary);">Chap. ${r.latestChapter}</strong>
                                    </div>
                                    ${!isUpToDate ? `<span class="badge badge-success" style="font-size:0.75rem; margin-top:0.35rem; display:inline-block;"><i class="fas fa-plus-circle"></i> +${r.unreadCount} chapitres parus</span>` : `<span class="badge badge-secondary" style="font-size:0.75rem; margin-top:0.35rem; display:inline-block;"><i class="fas fa-check"></i> ${i18n.t('release.upToDate') || 'À jour'}</span>`}
                                </div>
                            </div>
                            <div style="flex-shrink:0;">
                                ${!isUpToDate ? `
                                    <button class="btn btn-primary btn-sm" onclick="markChapterUpToDate('${r.itemId}', ${r.latestChapter})" style="font-size:0.8rem; padding:0.45rem 0.75rem;">
                                        <i class="fas fa-check-double"></i> ${i18n.t('release.markUpToDate', { chapter: r.latestChapter }) || `Marquer lu (${r.latestChapter})`}
                                    </button>
                                ` : `
                                    <button class="btn btn-secondary btn-sm" onclick="openViewModal('${r.itemId}')" style="font-size:0.8rem;">
                                        <i class="fas fa-eye"></i> Voir
                                    </button>
                                `}
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    } catch (e) {
        container.innerHTML = `
            <div style="padding:2rem; text-align:center; color:var(--color-danger);">
                <i class="fas fa-exclamation-triangle" style="font-size:2rem; margin-bottom:0.5rem; display:block;"></i>
                <p>Erreur lors de la récupération des sorties.</p>
            </div>
        `;
    }
}
window.renderReleaseTracker = renderReleaseTracker;

async function markChapterUpToDate(itemId, targetChapter) {
    const item = allItems.find(i => String(i.id) === String(itemId) || String(i.objectId) === String(itemId));
    if (!item) return;

    const oldChapters = parseInt(item.chapters) || 0;
    const diff = Math.max(0, targetChapter - oldChapters);

    item.chapters = targetChapter;
    if (typeof updateInLocalStorage === 'function') {
        updateInLocalStorage(itemId, { chapters: targetChapter });
    }

    if (window.questManager && diff > 0) {
        window.questManager.onChapterRead(diff);
    }

    if (typeof applyFiltersAndRender === 'function') applyFiltersAndRender();
    showToast(`Mis à jour au Chapitre ${targetChapter} (+${diff * 5} EXP)`, 'success');
    await renderReleaseTracker(true);
}
window.markChapterUpToDate = markChapterUpToDate;

// ============ PRESS-AND-HOLD QUICK IMAGE PREVIEW ============
let quickPreviewTimer = null;
let quickPreviewStartX = 0;
let quickPreviewStartY = 0;

function initQuickPreviewListeners() {
    const overlay = document.getElementById('quickPreviewOverlay');
    const content = document.getElementById('quickPreviewContent');
    if (!overlay || !content) return;

    function hidePreview() {
        if (quickPreviewTimer) {
            clearTimeout(quickPreviewTimer);
            quickPreviewTimer = null;
        }
        overlay.classList.remove('active');
    }

    function handlePressStart(e) {
        const img = e.target.closest('.item-card img, .cover-img, .wishlist-card img');
        if (!img) return;

        const touch = e.touches ? e.touches[0] : e;
        quickPreviewStartX = touch.clientX;
        quickPreviewStartY = touch.clientY;

        const card = img.closest('.item-card, .wishlist-card');
        let title = '', type = '', image = img.src, status = '', chapters = '', rating = '', synopsis = '';
        if (card && card.dataset.id) {
            const item = allItems.find(i => (i.id || i.objectId) === card.dataset.id);
            if (item) {
                title = item.title;
                type = item.type || 'Manga';
                status = item.status || 'En cours';
                chapters = `Chap. ${item.chapters || 0}`;
                rating = item.rating ? `★ ${item.rating}/10` : '';
                synopsis = item.remarks || item.synopsis || 'Appuyez pour voir plus de détails.';
            }
        }
        if (!title) {
            title = img.alt || img.title || 'Aperçu Rapide';
        }

        quickPreviewTimer = setTimeout(() => {
            content.innerHTML = `
                <img src="${image}" style="max-height:220px; width:auto; border-radius:12px; margin-bottom:0.75rem; box-shadow:0 8px 24px rgba(0,0,0,0.5); object-fit:cover">
                <h3 style="font-size:1.1rem; font-weight:700; color:var(--text-primary); margin-bottom:0.25rem">${escapeHtml(title)}</h3>
                <div style="display:flex; gap:0.4rem; justify-content:center; align-items:center; margin-bottom:0.5rem; flex-wrap:wrap">
                    ${type ? `<span class="genre-tag" style="font-size:0.75rem">${escapeHtml(type)}</span>` : ''}
                    ${status ? `<span class="badge badge-info" style="font-size:0.75rem">${escapeHtml(status)}</span>` : ''}
                    ${chapters ? `<span class="text-xs text-muted">${escapeHtml(chapters)}</span>` : ''}
                    ${rating ? `<span class="text-xs text-warning" style="font-weight:700">${escapeHtml(rating)}</span>` : ''}
                </div>
                <p class="text-xs text-secondary" style="line-height:1.4; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden">${escapeHtml(synopsis)}</p>
                <div class="text-xs text-muted" style="margin-top:0.75rem; font-style:italic">Relâchez pour fermer l'aperçu</div>
            `;
            overlay.classList.add('active');
        }, 3000);
    }

    function handlePressMove(e) {
        if (!quickPreviewTimer && !overlay.classList.contains('active')) return;
        const touch = e.touches ? e.touches[0] : e;
        const dist = Math.hypot(touch.clientX - quickPreviewStartX, touch.clientY - quickPreviewStartY);
        if (dist > 8) {
            hidePreview();
        }
    }

    document.addEventListener('pointerdown', handlePressStart, { passive: true });
    document.addEventListener('touchstart', handlePressStart, { passive: true });

    document.addEventListener('pointermove', handlePressMove, { passive: true });
    document.addEventListener('touchmove', handlePressMove, { passive: true });

    ['pointerup', 'pointercancel', 'pointerleave', 'touchend', 'touchcancel', 'mouseleave', 'scroll'].forEach(evt => {
        window.addEventListener(evt, hidePreview, { passive: true });
    });

    document.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.item-card img, .cover-img, .wishlist-card img')) {
            e.preventDefault();
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initQuickPreviewListeners();
});

console.log('[App v9.0.1] Module loaded');

