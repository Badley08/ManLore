/* ============================================
   MANLORE v5.0.1 - WISHLIST.JS
   Liste de souhaits personnelle + Vote & Proposition de features
   ============================================ */

'use strict';

const WISHLIST_KEY = 'manlore_wishlist_v5';
const DELETED_FEATURES_KEY = 'manlore_deleted_features_v5';

// ============ WISHLIST LOCALE ============

function loadWishlist() {
    try {
        const raw = localStorage.getItem(WISHLIST_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function saveWishlist(items) {
    try { 
        localStorage.setItem(WISHLIST_KEY, JSON.stringify(items)); 
    } catch (e) {
        console.warn('[Wishlist] Erreur sauvegarde locale', e);
    }
}

function addToWishlist(item) {
    const items = loadWishlist();
    const newItem = {
        id: 'wish_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        title: item.title,
        type: item.type || 'Manga',
        priority: item.priority || 'moyenne',
        image: item.image || '',
        notes: item.notes || '',
        malId: item.malId || '',
        addedAt: new Date().toISOString()
    };
    items.unshift(newItem);
    saveWishlist(items);

    if (window.questManager) {
        window.questManager.addExp(10, 'Ajout à la Wishlist');
    }

    return newItem;
}

function removeFromWishlist(id) {
    let items = loadWishlist();
    items = items.filter(i => String(i.id) !== String(id));
    saveWishlist(items);
}

function updateWishlistItem(id, updates) {
    const items = loadWishlist();
    const idx = items.findIndex(i => String(i.id) === String(id));
    if (idx !== -1) { 
        items[idx] = { ...items[idx], ...updates }; 
        saveWishlist(items); 
    }
}

function wishlistToCollection(wishItem) {
    const itemData = {
        title: wishItem.title,
        type: wishItem.type,
        status: 'À lire',
        rating: 0,
        genres: [],
        image: wishItem.image || '',
        imageUrl: wishItem.image || '',
        notes: wishItem.notes || '',
        malId: wishItem.malId || '',
        chapters: 0,
        link: ''
    };
    removeFromWishlist(wishItem.id);
    return itemData;
}

// ============ RENDU DE LA WISHLIST ============

function renderWishlist() {
    const items = loadWishlist();
    const grid = document.getElementById('wishlistGrid');
    const empty = document.getElementById('wishlistEmpty');
    const count = document.getElementById('wishlistCount');
    if (!grid) return;

    if (count) {
        if (items.length <= 1) {
            count.textContent = i18n.t('wishlist.count.single') || `${items.length} titre souhaité`;
        } else {
            count.textContent = i18n.t('wishlist.count.plural', { count: items.length }) || `${items.length} titres souhaités`;
        }
    }

    if (items.length === 0) {
        grid.innerHTML = '';
        if (empty) empty.classList.remove('hidden');
        return;
    }
    if (empty) empty.classList.add('hidden');

    grid.innerHTML = items.map(item => `
        <div class="wishlist-item" id="wish-${item.id}">
            ${item.image
                ? `<img src="${item.image}" alt="${escapeHtml(item.title)}" class="wishlist-cover" onerror="this.style.display='none'">`
                : `<div class="wishlist-cover" style="display:flex;align-items:center;justify-content:center;font-size:1.5rem;color:rgba(255,255,255,0.15)"><i class="fas fa-book"></i></div>`
            }
            <div class="wishlist-info">
                <p class="wishlist-title">${escapeHtml(item.title)}</p>
                <p class="wishlist-meta">${escapeHtml(i18n.tType(item.type))}</p>
                <span class="priority-badge priority-${item.priority || 'moyenne'}">
                    ${getPriorityLabel(item.priority)}
                </span>
                ${item.notes ? `<p class="text-xs text-muted" style="margin-top:0.35rem">${escapeHtml(item.notes.slice(0, 80))}${item.notes.length > 80 ? '...' : ''}</p>` : ''}
            </div>
            <div class="wishlist-actions">
                <button class="btn-icon" title="${i18n.t('wishlist.addToCollection')}"
                    onclick="handleAddWishToCollection('${item.id}')">
                    <i class="fas fa-plus-circle" style="color:var(--color-success)"></i>
                </button>
                <button class="btn-icon delete" title="${i18n.t('wishlist.remove')}"
                    onclick="handleRemoveWish('${item.id}')">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        </div>
    `).join('');
}

function getPriorityLabel(priority) {
    const labels = {
        haute: i18n.t('wishlist.priority.haute') || 'Haute',
        moyenne: i18n.t('wishlist.priority.moyenne') || 'Moyenne',
        basse: i18n.t('wishlist.priority.basse') || 'Basse'
    };
    return labels[priority] || priority;
}

async function handleAddWishToCollection(wishId) {
    const items = loadWishlist();
    const item = items.find(i => String(i.id) === String(wishId));
    if (!item) return;
    const itemData = wishlistToCollection(item);
    const result = await createItem(itemData);
    if (result.success) {
        showToast(i18n.t('toast.item.added'), 'success');
        renderWishlist();
        if (typeof loadAndRenderItems === 'function') loadAndRenderItems();
    } else {
        showToast(result.error || 'Erreur', 'error');
    }
}

function handleRemoveWish(wishId) {
    removeFromWishlist(wishId);
    renderWishlist();
    showToast(i18n.t('toast.wishlist.removed') || 'Titre retiré de la wishlist', 'info');
}

// ============ SUPPRESSION PERSISTANTE DES FONCTIONNALITÉS ============

function getDeletedFeatures() {
    try {
        const raw = localStorage.getItem(DELETED_FEATURES_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function saveDeletedFeatures(list) {
    try {
        localStorage.setItem(DELETED_FEATURES_KEY, JSON.stringify(list));
    } catch (e) {}
}

async function deleteFeatureLocallyAndCloud(id) {
    try {
        const deleted = getDeletedFeatures();
        if (!deleted.includes(id)) {
            deleted.push(id);
            saveDeletedFeatures(deleted);
        }

        // Suppression dans Back4App si possible
        if (!isGuestMode && navigator.onLine && typeof Parse !== 'undefined') {
            try {
                const FeatureRequest = Parse.Object.extend('FeatureRequests');
                const query = new Parse.Query(FeatureRequest);
                const obj = await query.get(id);
                if (obj) {
                    await obj.destroy();
                    console.log('[Features] Feature deleted from Parse cloud:', id);
                }
            } catch (cloudErr) {
                console.log('[Features] Note: Local mask applied for feature:', id);
            }
        }
    } catch (e) {
        console.error('[Features] Erreur de suppression:', e);
    }
}

function handleDeleteFeature(id) {
    showConfirmDialog(
        i18n.t('confirm.delete.title') || 'Supprimer',
        'Voulez-vous supprimer définitivement cette proposition ?',
        i18n.t('confirm.delete.yes') || 'Supprimer',
        i18n.t('confirm.delete.no') || 'Annuler',
        'danger',
        async () => {
            // Retrait immédiat du DOM pour réactivité instantanée
            const el = document.getElementById(`feature-${id}`);
            if (el) el.remove();

            await deleteFeatureLocallyAndCloud(id);
            await renderFeatures();
            showToast('Proposition supprimée avec succès', 'info');
        }
    );
}

// ============ VOTE & PROPOSITIONS ============

const TEAM_EMAILS = [
    'karlluberisse1308@gmail.com',
    'karlito2best@gmail.com'
];

function isUserTeamMember(email) {
    if (!email) return false;
    const clean = String(email).toLowerCase().trim();
    return TEAM_EMAILS.includes(clean);
}

const DEFAULT_FEATURES = [
    { id: 'f1', title: 'Synchronisation multi-appareils', description: 'Synchroniser la collection entre plusieurs téléphones', votes: 42, author: 'ManLore Team', authorEmail: 'karlluberisse1308@gmail.com', isTeamFeature: true },
    { id: 'f2', title: 'Notifications de nouveaux chapitres', description: 'Être notifié quand un nouveau chapitre sort', votes: 38, author: 'ManLore Team', authorEmail: 'karlito2best@gmail.com', isTeamFeature: true },
    { id: 'f3', title: 'Recommandations intelligentes', description: 'Suggestions basées sur vos habitudes de lecture', votes: 31, author: 'ManLore Team', authorEmail: 'karlluberisse1308@gmail.com', isTeamFeature: true },
    { id: 'f4', title: 'Widget Android', description: 'Widget pour voir vos lectures en cours depuis l\'écran d\'accueil', votes: 27, author: 'ManLore Team', authorEmail: 'karlito2best@gmail.com', isTeamFeature: true },
    { id: 'f5', title: 'Mode lecture intégré', description: 'Lire directement dans l\'app via les sources disponibles', votes: 19, author: 'ManLore Team', authorEmail: 'karlluberisse1308@gmail.com', isTeamFeature: true },
];

async function loadFeatures() {
    const deletedFeatures = getDeletedFeatures();

    if (!isGuestMode && navigator.onLine && typeof Parse !== 'undefined') {
        try {
            const FeatureRequest = Parse.Object.extend('FeatureRequests');
            const query = new Parse.Query(FeatureRequest);
            query.descending('votes');
            query.limit(50);
            const results = await query.find();
            if (results && results.length > 0) {
                return results
                    .filter(r => !deletedFeatures.includes(r.id))
                    .map(r => {
                        const authorEmail = (r.get('authorEmail') || '').toLowerCase().trim();
                        const rawAuthor = r.get('author') || 'Communauté';
                        const isTeam = r.get('isTeamFeature') === true ||
                                       isUserTeamMember(authorEmail) ||
                                       rawAuthor.toLowerCase().includes('manlore team') ||
                                       rawAuthor.toLowerCase().includes('équipe manlore');
                        return {
                            id: r.id,
                            title: r.get('title') || '',
                            description: r.get('description') || '',
                            votes: r.get('votes') || 0,
                            author: isTeam ? 'ManLore Team' : rawAuthor,
                            authorEmail: authorEmail,
                            isTeamFeature: isTeam
                        };
                    });
            }
        } catch (e) {
            console.warn('[Features] Cloud load failed, using defaults', e);
        }
    }
    return DEFAULT_FEATURES.filter(f => !deletedFeatures.includes(f.id));
}

async function renderFeatures() {
    const grid = document.getElementById('featuresGrid');
    if (!grid) return;
    grid.innerHTML = '<div class="text-center text-muted" style="padding:2rem"><i class="fas fa-spinner fa-spin"></i></div>';
    
    const features = await loadFeatures();
    const myVotes = getMyVotes();

    if (features.length === 0) {
        grid.innerHTML = `<p class="text-center text-muted" style="padding:2rem">${i18n.t('wishlist.features.empty') || 'Aucune fonctionnalité proposée'}</p>`;
        return;
    }

    grid.innerHTML = features.map(f => {
        const isTeam = f.isTeamFeature || isUserTeamMember(f.authorEmail) || f.author === 'ManLore Team';
        const badgeHTML = isTeam
            ? `<span class="badge-featured-team"><i class="fas fa-crown"></i> Wishlist Featured By ManLore Team</span>`
            : `<span class="badge-community-feature"><i class="fas fa-users"></i> Community Feature</span>`;

        const authorDisplay = isTeam ? 'ManLore Team' : (f.author || 'Communauté');

        return `
            <div class="feature-item ${isTeam ? 'team-featured' : ''}" id="feature-${f.id}">
                <button class="vote-btn ${myVotes.includes(f.id) ? 'voted' : ''}"
                    onclick="handleVote('${f.id}')" id="voteBtn-${f.id}">
                    <i class="fas fa-chevron-up"></i>
                    <span class="vote-count" id="voteCount-${f.id}">${f.votes}</span>
                </button>
                <div class="feature-info">
                    <div style="margin-bottom:0.45rem">${badgeHTML}</div>
                    <p class="feature-title">${escapeHtml(f.title)}</p>
                    ${f.description ? `<p class="feature-desc">${escapeHtml(f.description)}</p>` : ''}
                    <p class="feature-author"><i class="fas fa-user-circle"></i> Proposé par ${escapeHtml(authorDisplay)}</p>
                </div>
                <div style="display:flex; flex-direction:column; align-items:flex-end; gap:0.5rem; justify-content:space-between; height:100%">
                    <button class="btn-icon delete" title="${i18n.t('wishlist.remove') || 'Supprimer'}"
                        onclick="handleDeleteFeature('${f.id}')">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                    ${myVotes.includes(f.id) ? `<span class="text-xs" style="color:var(--color-primary);font-weight:700">Voté</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

function getMyVotes() {
    try {
        const raw = localStorage.getItem('manlore_my_votes');
        return raw ? JSON.parse(raw) : [];
    } catch { return []; }
}

function saveMyVotes(votes) {
    localStorage.setItem('manlore_my_votes', JSON.stringify(votes));
}

async function handleVote(featureId) {
    if (isGuestMode) {
        showToast(i18n.t('toast.guest.feature') || 'Connectez-vous pour voter', 'warning');
        return;
    }
    const myVotes = getMyVotes();
    if (myVotes.includes(featureId)) {
        showToast(i18n.t('wishlist.features.alreadyVoted') || 'Vous avez déjà voté pour cette idée', 'info');
        return;
    }

    myVotes.push(featureId);
    saveMyVotes(myVotes);
    const btn = document.getElementById(`voteBtn-${featureId}`);
    const countEl = document.getElementById(`voteCount-${featureId}`);
    if (btn) btn.classList.add('voted');
    if (countEl) countEl.textContent = parseInt(countEl.textContent || '0') + 1;

    if (navigator.onLine && typeof Parse !== 'undefined') {
        try {
            const FeatureRequest = Parse.Object.extend('FeatureRequests');
            const query = new Parse.Query(FeatureRequest);
            const feature = await query.get(featureId);
            feature.increment('votes');
            await feature.save();
        } catch (e) {
            console.warn('[Vote] Cloud vote failed:', e);
        }
    }
    showToast(i18n.t('toast.vote.counted') || 'Vote enregistré !', 'success');
}

async function handleProposeFeature() {
    if (isGuestMode) { 
        showToast(i18n.t('toast.guest.feature') || 'Connectez-vous pour proposer', 'warning'); 
        return; 
    }
    const title = document.getElementById('featureTitle').value.trim();
    const desc = document.getElementById('featureDesc').value.trim();
    if (!title) return;

    const userEmail = currentUser ? (currentUser.get('email') || '').toLowerCase().trim() : '';
    const userName = currentUser ? (currentUser.get('username') || '') : 'Communauté';
    const isTeam = isUserTeamMember(userEmail);

    if (navigator.onLine && typeof Parse !== 'undefined') {
        try {
            const FeatureRequest = Parse.Object.extend('FeatureRequests');
            const feature = new FeatureRequest();
            feature.set('title', title);
            feature.set('description', desc);
            feature.set('votes', 1);
            feature.set('author', isTeam ? 'ManLore Team' : userName);
            feature.set('authorEmail', userEmail);
            feature.set('isTeamFeature', isTeam);

            // Permettre la visibilité et le vote public pour tous les utilisateurs
            const acl = new Parse.ACL();
            acl.setPublicReadAccess(true);
            acl.setPublicWriteAccess(true);
            feature.setACL(acl);

            await feature.save();

            const myVotes = getMyVotes();
            myVotes.push(feature.id);
            saveMyVotes(myVotes);

            showToast(i18n.t('toast.feature.proposed') || 'Fonctionnalité proposée !', 'success');
        } catch (e) {
            console.error('[Feature Proposal Error]', e);
            showToast(i18n.t('toast.feature.error') || 'Erreur lors de la proposition', 'error');
        }
    } else {
        showToast(i18n.t('toast.offline') || 'Hors ligne', 'warning');
    }
    closeModal('featureModal');
    renderFeatures();
}

function switchWishlistTab(tab) {
    const myListSection = document.getElementById('myWishlistSection');
    const featuresSection = document.getElementById('featuresSection');
    const tabMyList = document.getElementById('tabMyList');
    const tabFeatures = document.getElementById('tabFeatures');

    if (tab === 'mylist') {
        myListSection?.classList.remove('hidden');
        featuresSection?.classList.add('hidden');
        if (tabMyList) tabMyList.className = 'btn-primary';
        if (tabFeatures) tabFeatures.className = 'btn-secondary';
        renderWishlist();
    } else {
        myListSection?.classList.add('hidden');
        featuresSection?.classList.remove('hidden');
        if (tabMyList) tabMyList.className = 'btn-secondary';
        if (tabFeatures) tabFeatures.className = 'btn-primary';
        renderFeatures();
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

document.addEventListener('DOMContentLoaded', () => {
    const wishForm = document.getElementById('wishlistForm');
    if (wishForm) {
        wishForm.addEventListener('submit', e => {
            e.preventDefault();
            const item = {
                title: document.getElementById('wishTitle').value.trim(),
                type: document.getElementById('wishType').value,
                priority: document.getElementById('wishPriority').value,
                image: document.getElementById('wishImage').value.trim(),
                notes: document.getElementById('wishNotes').value.trim(),
            };
            if (!item.title) return;
            addToWishlist(item);
            showToast(i18n.t('toast.wishlist.added') || 'Ajouté à la wishlist', 'success');
            closeModal('wishlistModal');
            renderWishlist();
        });
    }

    const wishJikanBtn = document.getElementById('wishJikanBtn');
    const wishJikanInput = document.getElementById('wishJikanInput');
    if (wishJikanBtn && wishJikanInput) {
        wishJikanBtn.addEventListener('click', async () => {
            const q = wishJikanInput.value.trim();
            if (!q) return;
            wishJikanBtn.disabled = true;
            wishJikanBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
            const results = await jikan.search(q, '');
            renderJikanResultsWish(results);
            wishJikanBtn.disabled = false;
            wishJikanBtn.innerHTML = '<i class="fas fa-search"></i>';
        });
    }

    document.getElementById('addWishlistBtn')?.addEventListener('click', () => openWishlistModal());
    document.getElementById('proposeFeatureBtn')?.addEventListener('click', () => {
        if (isGuestMode) { showToast(i18n.t('toast.guest.feature'), 'warning'); return; }
        openModal('featureModal');
    });

    document.getElementById('featureForm')?.addEventListener('submit', async e => {
        e.preventDefault();
        await handleProposeFeature();
    });
});

function renderJikanResultsWish(results) {
    const container = document.getElementById('wishJikanResults');
    if (!container) return;
    if (!results || results.length === 0) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'block';
    container.innerHTML = results.map(r => `
        <div class="jikan-result-item" onclick="applyWishJikanResult(${JSON.stringify(r).replace(/"/g, '&quot;')})">
            ${r.imageUrl ? `<img src="${r.imageUrl}" class="jikan-result-cover" alt="">` : '<div class="jikan-result-cover"></div>'}
            <div class="jikan-result-info">
                <p class="jikan-result-title">${escapeHtml(r.title)}</p>
                <p class="jikan-result-meta">${r.type} ${r.score ? '• ' + r.score + '/10' : ''}</p>
            </div>
        </div>
    `).join('');
}

function applyWishJikanResult(result) {
    document.getElementById('wishTitle').value = result.title || '';
    const typeEl = document.getElementById('wishType');
    if (typeEl && result.type) {
        const opt = [...typeEl.options].find(o => o.value === result.type);
        if (opt) typeEl.value = result.type;
    }
    if (result.imageUrl) document.getElementById('wishImage').value = result.imageUrl;
    document.getElementById('wishJikanResults').style.display = 'none';
}

function openWishlistModal(prefill = null) {
    document.getElementById('wishlistItemId').value = '';
    document.getElementById('wishTitle').value = prefill?.title || '';
    document.getElementById('wishType').value = prefill?.type || 'Manga';
    document.getElementById('wishPriority').value = 'moyenne';
    document.getElementById('wishImage').value = prefill?.image || '';
    document.getElementById('wishNotes').value = '';
    document.getElementById('wishJikanInput').value = '';
    document.getElementById('wishJikanResults').style.display = 'none';
    openModal('wishlistModal');
}

console.log('[Wishlist v5.0.1] Module loaded');
