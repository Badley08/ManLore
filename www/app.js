/* ============================================
   MANLORE v2.0.12 - APP.JS
   Main Application Logic
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
    i18n.applyAll();
    applyStoredTheme();
    applyStoredSettings();
    setupEventListeners();

    // Show auth or app
    const guestMode = localStorage.getItem('manlore_guest_mode') === 'true';
    const user = !guestMode ? Parse.User.current() : null;

    if (user || guestMode) {
        await showApp();
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
}

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
}

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
    if (page === 'settings') updateStorageModeUI();

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
        allItems = result.items.map(i => i instanceof Parse.Object ? parseItemToObject(i) : i);
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
                    <button class="btn-primary" style="flex:1;font-size:0.8rem" onclick="closeModal('viewModal');openEditModal('${item.id}')">
                        <i class="fas fa-pen"></i> ${escapeHtml(i18n.t('view.btn.edit'))}
                    </button>
                    <button class="btn-secondary" style="flex:1;font-size:0.8rem" onclick="closeModal('viewModal');handleDeleteItem('${item.id}')">
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
                showToast(i18n.t('toast.item.updated'), 'success');
            }
        } else {
            result = await createItem(itemData);
            if (result.success) {
                const newItem = result.item instanceof Parse.Object
                    ? parseItemToObject(result.item)
                    : result.item;
                allItems.unshift(newItem);
                showToast(i18n.t('toast.item.added') + (result.offline ? ' (hors ligne)' : ''), 'success');
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
        i18n.t('confirm.delete.msg'),
        i18n.t('confirm.delete.yes'),
        i18n.t('confirm.delete.no'),
        'danger',
        async () => {
            showLoading(true);
            const result = await deleteItem(itemId);
            showLoading(false);
            if (result.success) {
                allItems = allItems.filter(i => i.id !== itemId);
                applyFiltersAndRender();
                showToast(i18n.t('toast.item.deleted'), 'info');
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
}

function applyStoredTheme() {
    const saved = localStorage.getItem('manlore_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', saved);
    document.querySelectorAll('.theme-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.theme === saved);
    });
}

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
            
            showLoading(true, '...');
            const result = await exportData(allItems, filename);
            showLoading(false);
            if (result.success) showToast(i18n.t('toast.export.success'), 'success');
            else showToast('Erreur export', 'error');
        }
    );
}

function handleImportClick() {
    document.getElementById('importFile').click();
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
            i18n.t('confirm.import.title'),
            `${parsed.count} ${i18n.t('confirm.import.msg')}`,
            'Importer',
            i18n.t('modal.form.cancel'),
            'info',
            async () => {
                showLoading(true);
                let imported = 0;
                for (const item of parsed.items) {
                    const result = await createItem(item);
                    if (result.success) {
                        const ni = result.item instanceof Parse.Object ? parseItemToObject(result.item) : result.item;
                        allItems.unshift(ni);
                        imported++;
                    }
                }
                showLoading(false);
                applyFiltersAndRender();
                showToast(`${i18n.t('toast.import.success')} (${imported}/${parsed.count})`, 'success');
            }
        );
    } catch (e) {
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
    document.getElementById(id).classList.remove('active');
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

    document.getElementById('showSignup')?.addEventListener('click', e => {
        e.preventDefault();
        document.getElementById('loginForm').classList.add('hidden');
        document.getElementById('signupForm').classList.remove('hidden');
    });

    document.getElementById('showLogin')?.addEventListener('click', e => {
        e.preventDefault();
        document.getElementById('signupForm').classList.add('hidden');
        document.getElementById('loginForm').classList.remove('hidden');
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

    // Close modals on backdrop click
    ['itemModal','viewModal','passwordModal','wishlistModal','featureModal','rouletteModal'].forEach(id => {
        document.getElementById(id)?.addEventListener('click', e => {
            if (e.target.id === id) closeModal(id);
        });
    });

    // Roulette du Destin listeners
    document.getElementById('rouletteBtn')?.addEventListener('click', openRouletteModal);
    document.getElementById('spinRouletteBtn')?.addEventListener('click', spinRoulette);

    // Keyboard ESC
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape') {
            ['itemModal','viewModal','passwordModal','wishlistModal','featureModal','rouletteModal'].forEach(closeModal);
            closeConfirmDialog();
            closePromptDialog();
            closeSidebar();
        }
    });

    // Online/offline UI update
    window.addEventListener('online', () => updateJikanOfflineNotice());
    window.addEventListener('offline', () => updateJikanOfflineNotice());
}

// ============ ROULETTE DU DESTIN (RANDOM READ) ============
let rouletteSelectedId = null;

function openRouletteModal() {
    rouletteSelectedId = null;
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

function spinRoulette() {
    const pool = allItems.filter(i => i.status === 'À lire' || i.status === 'En cours');
    const candidates = pool.length > 0 ? pool : allItems;

    if (candidates.length === 0) {
        showToast('Aucun titre disponible pour le tirage au sort', 'info');
        return;
    }

    const spinBtn = document.getElementById('spinRouletteBtn');
    const imgEl = document.getElementById('rouletteImage');
    const titleEl = document.getElementById('rouletteTitle');
    const metaEl = document.getElementById('rouletteMeta');
    const detailBtn = document.getElementById('openRouletteDetailBtn');
    const wrap = document.getElementById('rouletteCoverContainer');

    if (spinBtn) spinBtn.disabled = true;
    if (detailBtn) detailBtn.disabled = true;
    if (wrap) wrap.classList.add('roulette-spinning');

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
                detailBtn.onclick = () => {
                    closeModal('rouletteModal');
                    openViewModal(winner.id);
                };
            }

            if (window.questManager) {
                window.questManager.addExp(10, 'Tirage au sort de lecture');
            }
            showToast('🎉 Destin scellé ! Bonne lecture !', 'success');
        }
    }, 80);
}

console.log('[App v5.0.1] Module loaded');
