/* ============================================
   MANLORE v9.1.0 - CATALOG_SHARE.JS
   Partage Temporaire de Catalogue, Révocation,
   Comparaison de Collections & Mode Battle ⚔️
   ULTRA ÉDITION — SVG Icons, User Avatars,
   Multilingual i18n, 1-Click Wishlist Import
   ============================================ */

'use strict';

let activeShareLinks = [];

// ============ PER-USER STORAGE KEY ============
function getUserStoragePrefix() {
    const user = typeof Parse !== 'undefined' && Parse.User ? Parse.User.current() : null;
    if (user) return `manlore_u_${user.id}_`;
    const guestId = localStorage.getItem('manlore_guest_id');
    if (guestId) return `manlore_g_${guestId}_`;
    return 'manlore_';
}

// ============ UTILS & CODE GENERATOR ============
function generateShareCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'ML-';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function t(key, fallback = '', params = {}) {
    if (window.i18n && typeof window.i18n.t === 'function') {
        let str = window.i18n.t(key);
        if (str && str !== key) {
            Object.keys(params).forEach(k => {
                str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), params[k]);
            });
            return str;
        }
    }
    let res = fallback || key;
    Object.keys(params).forEach(k => {
        res = res.replace(new RegExp(`\\{${k}\\}`, 'g'), params[k]);
    });
    return res;
}

// ============ GENERATE SHARE LINK ============
async function createSharedCatalogLink(durationHours = 24) {
    durationHours = Math.max(1, Math.min(72, parseInt(durationHours, 10) || 24));

    const user = typeof Parse !== 'undefined' && Parse.User ? Parse.User.current() : null;
    const username = user ? user.get('username') : (localStorage.getItem('manlore_username') || 'Ami ManLore');
    const email = user ? user.get('email') : '';
    const userId = user ? user.id : 'guest';
    const sessionToken = user ? user.getSessionToken() : null;
    const avatarBase64 = typeof getUserAvatar === 'function' ? getUserAvatar() : (user ? (user.get('avatarBase64') || '') : '');

    const shareCode = generateShareCode();
    const expiresAt = new Date(Date.now() + durationHours * 3600 * 1000).toISOString();

    const currentCollection = typeof allItems !== 'undefined' && allItems.length > 0
        ? allItems
        : (typeof loadFromLocalStorage === 'function' ? loadFromLocalStorage() : []);

    const sanitizedItems = currentCollection.map(i => ({
        title: i.title,
        type: i.type,
        status: i.status,
        chapters: i.chapters || 0,
        rating: i.rating || 0,
        genres: i.genres || [],
        image: i.image || i.imageUrl || ''
    }));

    const payload = {
        shareCode,
        userId,
        username,
        email,
        avatarBase64,
        items: sanitizedItems,
        durationHours,
        expiresAt: { __type: 'Date', iso: expiresAt },
        isRevoked: false
    };

    try {
        if (typeof back4appApiCall === 'function') {
            await back4appApiCall('/classes/SharedCatalogs', 'POST', payload, sessionToken);
        }
    } catch(e) {
        console.warn('Cloud share save note:', e);
    }

    const prefix = getUserStoragePrefix();
    let localLinks = [];
    try {
        localLinks = JSON.parse(localStorage.getItem(prefix + 'active_share_links') || '[]');
    } catch {}

    const shareUrl = `${window.location.origin}${window.location.pathname}?share=${shareCode}`;
    localLinks.unshift({
        shareCode,
        durationHours,
        expiresAt,
        shareUrl,
        createdAt: new Date().toISOString(),
        isRevoked: false
    });
    localStorage.setItem(prefix + 'active_share_links', JSON.stringify(localLinks));
    activeShareLinks = localLinks;

    renderActiveShareLinksList();
    if (window.showToast) window.showToast(`Lien ${shareCode} créé ! Expire dans ${durationHours}h.`, 'success');
    return { success: true, shareCode, shareUrl, expiresAt };
}
window.createSharedCatalogLink = createSharedCatalogLink;

// ============ REVOKE LINK ============
async function revokeSharedCatalogLink(shareCode) {
    if (!shareCode) return { success: false };

    try {
        if (typeof back4appApiCall === 'function') {
            const user = typeof Parse !== 'undefined' && Parse.User ? Parse.User.current() : null;
            const token = user ? user.getSessionToken() : null;
            const res = await back4appApiCall(
                `/classes/SharedCatalogs?where=${encodeURIComponent(JSON.stringify({ shareCode }))}`,
                'GET', null, token
            );
            if (res.ok && res.data?.results?.[0]) {
                const objectId = res.data.results[0].objectId;
                await back4appApiCall(`/classes/SharedCatalogs/${objectId}`, 'PUT', { isRevoked: true }, token);
            }
        }
    } catch(e) {
        console.warn('Cloud revoke note:', e);
    }

    const prefix = getUserStoragePrefix();
    try {
        let localLinks = JSON.parse(localStorage.getItem(prefix + 'active_share_links') || '[]');
        localLinks = localLinks.map(l => l.shareCode === shareCode ? { ...l, isRevoked: true } : l);
        localStorage.setItem(prefix + 'active_share_links', JSON.stringify(localLinks));
        activeShareLinks = localLinks;
    } catch {}

    renderActiveShareLinksList();
    if (window.showToast) window.showToast(`Lien ${shareCode} révoqué et désactivé !`, 'info');
    return { success: true };
}
window.revokeSharedCatalogLink = revokeSharedCatalogLink;

// ============ FETCH & OPEN SHARED CATALOG ============
async function fetchAndOpenSharedCatalog(shareCode) {
    if (!shareCode) return;
    shareCode = shareCode.trim().toUpperCase();

    if (typeof showLoading === 'function') showLoading(true, t('battle.loading', 'Chargement du duel...'));

    let catalogData = null;
    try {
        if (typeof back4appApiCall === 'function') {
            const user = typeof Parse !== 'undefined' && Parse.User ? Parse.User.current() : null;
            const token = user ? user.getSessionToken() : null;
            const res = await back4appApiCall(
                `/classes/SharedCatalogs?where=${encodeURIComponent(JSON.stringify({ shareCode }))}`,
                'GET', null, token
            );
            if (res.ok && res.data?.results?.[0]) {
                catalogData = res.data.results[0];
            }
        }
    } catch (e) {
        console.warn('Fetch shared catalog note:', e);
    }

    if (typeof showLoading === 'function') showLoading(false);

    if (!catalogData) {
        if (window.showToast) window.showToast(t('battle.not_found', 'Lien expiré ou introuvable'), 'error');
        return;
    }

    if (catalogData.isRevoked) {
        if (window.showToast) window.showToast(t('battle.revoked', 'Ce lien de partage a été révoqué par son créateur.'), 'warning');
        return;
    }

    const expiresAt = catalogData.expiresAt?.iso ? new Date(catalogData.expiresAt.iso) : new Date(catalogData.expiresAt);
    if (new Date() > expiresAt) {
        if (window.showToast) window.showToast(t('battle.expired', 'Ce lien de partage temporaire a expiré.'), 'warning');
        return;
    }

    const friendName = catalogData.username || 'Ami ManLore';
    const friendItems = catalogData.items || [];
    const friendAvatar = catalogData.avatarBase64 || '';

    openBattleMode(friendName, friendItems, shareCode, friendAvatar);
}
window.fetchAndOpenSharedCatalog = fetchAndOpenSharedCatalog;

// ============ RENDER ACTIVE SHARE LINKS ============
function renderActiveShareLinksList() {
    const listEl = document.getElementById('activeShareLinksList');
    if (!listEl) return;

    const prefix = getUserStoragePrefix();
    let localLinks = [];
    try {
        localLinks = JSON.parse(localStorage.getItem(prefix + 'active_share_links') || '[]');
    } catch {}

    const now = new Date();
    const validLinks = localLinks.filter(l => !l.isRevoked && new Date(l.expiresAt) > now);

    if (validLinks.length === 0) {
        listEl.innerHTML = `
            <div style="text-align:center; padding:1.2rem; color:var(--text-muted); font-size:0.82rem">
                <i class="fas fa-link-slash" style="font-size:1.4rem; margin-bottom:0.4rem; color:var(--text-muted); display:block"></i>
                Aucun lien de partage actif. Créez-en un ci-dessus !
            </div>`;
        return;
    }

    listEl.innerHTML = validLinks.map(l => {
        const expiresDate = new Date(l.expiresAt);
        const timeLeftMin = Math.max(0, Math.round((expiresDate - now) / (1000 * 60)));
        const hoursLeft = Math.floor(timeLeftMin / 60);
        const minsLeft = timeLeftMin % 60;
        const timeStr = hoursLeft > 0 ? `${hoursLeft}h ${minsLeft}m` : `${minsLeft} min`;

        return `
            <div style="background:rgba(0,0,0,0.3); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:0.75rem 1rem; margin-bottom:0.6rem; display:flex; align-items:center; justify-content:space-between; gap:0.6rem">
                <div style="min-width:0; flex:1">
                    <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.2rem; flex-wrap:wrap">
                        <strong style="color:var(--color-secondary); font-family:var(--font-title); font-size:0.9rem">${l.shareCode}</strong>
                        <span class="badge badge-info" style="font-size:0.68rem"><i class="fas fa-clock"></i> ${timeStr}</span>
                    </div>
                    <p style="font-size:0.72rem; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin:0">${l.shareUrl}</p>
                </div>
                <div style="display:flex; gap:0.4rem; flex-shrink:0">
                    <button type="button" class="btn-secondary" style="padding:0.35rem 0.65rem; font-size:0.78rem" onclick="navigator.clipboard.writeText('${l.shareUrl}'); if(window.showToast) window.showToast('${t('battle.link_copied', 'Lien copié !')}', 'success')">
                        <i class="fas fa-copy"></i>
                    </button>
                    <button type="button" class="btn-danger-sm" style="padding:0.35rem 0.6rem; font-size:0.78rem" onclick="revokeSharedCatalogLink('${l.shareCode}')" title="Révoker / Supprimer">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            </div>`;
    }).join('');
}
window.renderActiveShareLinksList = renderActiveShareLinksList;

// ============ BATTLE POWER CALCULATION ============
function calculateBattlePower(items) {
    if (!items || items.length === 0) return 0;

    let totalChapters = 0;
    let completedCount = 0;
    let totalRatingSum = 0;
    let ratedCount = 0;

    items.forEach(i => {
        const ch = parseInt(i.chapters, 10) || 0;
        totalChapters += ch;
        if (i.status && (i.status.toLowerCase().includes('terminé') || i.status.toLowerCase().includes('completed'))) {
            completedCount++;
        }
        const r = parseFloat(i.rating) || 0;
        if (r > 0) {
            totalRatingSum += r;
            ratedCount++;
        }
    });

    const avgRating = ratedCount > 0 ? (totalRatingSum / ratedCount) : 0;
    const power = Math.round(
        (totalChapters * 12) +
        (completedCount * 180) +
        (items.length * 35) +
        (avgRating * 45)
    );
    return power;
}

function computeDetailedStats(items) {
    const stats = {
        totalTitles: items.length,
        totalChapters: 0,
        completedCount: 0,
        inProgressCount: 0,
        avgRating: 0,
        types: {},
        genres: new Set(),
        longestTitle: { title: '-', chapters: 0 }
    };

    let ratingSum = 0, ratedCount = 0;
    items.forEach(i => {
        const ch = parseInt(i.chapters, 10) || 0;
        stats.totalChapters += ch;
        if (ch > stats.longestTitle.chapters) {
            stats.longestTitle = { title: i.title, chapters: ch };
        }
        const st = (i.status || '').toLowerCase();
        if (st.includes('terminé') || st.includes('completed')) stats.completedCount++;
        else stats.inProgressCount++;

        const r = parseFloat(i.rating) || 0;
        if (r > 0) { ratingSum += r; ratedCount++; }

        const type = i.type || 'Manga';
        stats.types[type] = (stats.types[type] || 0) + 1;

        if (Array.isArray(i.genres)) {
            i.genres.forEach(g => stats.genres.add(g));
        }
    });

    stats.avgRating = ratedCount > 0 ? ratingSum / ratedCount : 0;
    stats.diversityScore = stats.genres.size;
    stats.completionRate = stats.totalTitles > 0 ? Math.round((stats.completedCount / stats.totalTitles) * 100) : 0;

    return stats;
}

function computeRankInfo(chaptersCount) {
    if (chaptersCount >= 10000) return { rank: 'S', title: 'Cosmic Sovereign', color: '#ffd700', icon: 'fa-crown' };
    if (chaptersCount >= 5000) return { rank: 'A+', title: 'Supreme Cultivator', color: '#a855f7', icon: 'fa-khanda' };
    if (chaptersCount >= 2000) return { rank: 'A', title: 'High Master', color: '#00d2ff', icon: 'fa-dragon' };
    if (chaptersCount >= 800) return { rank: 'B', title: 'Guild Veteran', color: '#00b894', icon: 'fa-shield-halved' };
    if (chaptersCount >= 300) return { rank: 'C', title: 'Avid Reader', color: '#fd79a8', icon: 'fa-book-open' };
    return { rank: 'D', title: 'Novice Wanderer', color: '#a29bfe', icon: 'fa-seedling' };
}

// 1-Click Add Title to Wishlist
function addFriendTitleToWishlist(title, type, image) {
    if (!title) return;
    try {
        if (typeof addToWishlist === 'function') {
            addToWishlist({ title, type: type || 'Manga', image: image || '', chapters: 0, notes: 'Ajouté depuis le catalogue ami' });
        } else {
            const raw = localStorage.getItem('manlore_wishlist_v5');
            const list = raw ? JSON.parse(raw) : [];
            list.unshift({ title, type: type || 'Manga', image: image || '', addedAt: new Date().toISOString() });
            localStorage.setItem('manlore_wishlist_v5', JSON.stringify(list));
        }
        if (window.showToast) window.showToast(t('battle.added_toast', `"${title}" ajouté à votre liste d'envies !`), 'success');
    } catch(e) {
        console.warn('Wishlist add error:', e);
    }
}
window.addFriendTitleToWishlist = addFriendTitleToWishlist;

// ============ OPEN BATTLE OVERLAY ============
function openBattleMode(friendName, friendItems, shareCode, friendAvatar = '') {
    let overlay = document.getElementById('battleOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'battleOverlay';
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 10000;
            background: rgba(5,5,15,0.96); backdrop-filter: blur(12px);
            display: flex; flex-direction: column; overflow: hidden;
            color: #fff; font-family: var(--font-body); animation: battleFadeIn 0.3s ease-out;
        `;
        document.body.appendChild(overlay);
    }

    const myItems = typeof allItems !== 'undefined' && allItems.length > 0
        ? allItems
        : (typeof loadFromLocalStorage === 'function' ? loadFromLocalStorage() : []);

    const myUsername = (typeof Parse !== 'undefined' && Parse.User && Parse.User.current())
        ? Parse.User.current().get('username') : 'Vous';
    const myAvatar = typeof getUserAvatar === 'function' ? getUserAvatar() : '';

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;

    overlay.innerHTML = `
        <style>
            @keyframes battleFadeIn { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
            @keyframes battlePulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.1); box-shadow: 0 0 30px rgba(168,85,247,0.7); } }
            @keyframes battleFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
            @keyframes battleGlowRing { 0%,100% { box-shadow: 0 0 15px #a855f7; } 50% { box-shadow: 0 0 30px #00d2ff; } }
            .battle-tab-btn { background: none; border: none; padding: 0.6rem 1rem; color: var(--text-muted); font-size: 0.85rem; font-weight: 600; cursor: pointer; border-bottom: 2px solid transparent; transition: all 0.2s ease; }
            .battle-tab-btn.active { color: #a855f7; border-bottom-color: #a855f7; text-shadow: 0 0 10px rgba(168,85,247,0.4); }
            .battle-animate-in { animation: battleFadeIn 0.4s ease-out; }
            .avatar-glow-ring { border: 3px solid #a855f7; animation: battleGlowRing 3s infinite; }
        </style>

        <!-- HEADER -->
        <div style="padding: 0.8rem 1.2rem; background: rgba(0,0,0,0.4); border-bottom: 1px solid rgba(255,255,255,0.08); display: flex; align-items: center; justify-content: space-between; gap: 0.8rem; flex-shrink: 0">
            <div style="display:flex; align-items:center; gap:0.6rem">
                <i class="fas fa-swords" style="font-size:1.3rem; color:#a855f7"></i>
                <div>
                    <h3 style="margin:0; font-family:var(--font-title); font-size:1.1rem; color:#fff">${t('battle.title', 'DUEL DE LECTEURS ARENA')}</h3>
                    <span style="font-size:0.7rem; color:var(--text-muted)">Code: ${escapeHtml(shareCode)}</span>
                </div>
            </div>
            <div style="display:flex; align-items:center; gap:0.5rem">
                ${!isStandalone ? `
                <a href="web+manlore://share?share=${escapeHtml(shareCode)}" class="btn-secondary" style="font-size:0.75rem; padding:0.4rem 0.8rem; background:linear-gradient(135deg, rgba(46,204,113,0.2), rgba(0,184,148,0.3)); border:1px solid #2ecc7166; color:#2ecc71" title="Ouvrir dans l'app WebAPK">
                    <i class="fas fa-mobile-screen-button"></i> App
                </a>` : ''}
                <button type="button" class="btn-secondary" style="padding:0.4rem 0.8rem; font-size:0.78rem" onclick="navigator.clipboard.writeText('${window.location.origin}${window.location.pathname}?share=${escapeHtml(shareCode)}'); if(window.showToast) window.showToast('${t('battle.link_copied', 'Lien copié !')}', 'success')">
                    <i class="fas fa-share-nodes"></i> ${t('battle.copy_link', 'Partager')}
                </button>
                <button type="button" style="background:none; border:none; color:var(--text-muted); font-size:1.4rem; cursor:pointer; padding:0.2rem 0.5rem" onclick="document.getElementById('battleOverlay').remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        </div>

        <!-- TABS NAV -->
        <div style="display:flex; background:rgba(0,0,0,0.2); border-bottom:1px solid rgba(255,255,255,0.06); padding:0 0.8rem; gap:0.5rem; flex-shrink:0">
            <button class="battle-tab-btn active" id="btnBattleTab" onclick="switchBattleTab('battle')">
                <i class="fas fa-trophy"></i> ${t('battle.title', 'Arena Battle')}
            </button>
            <button class="battle-tab-btn" id="btnCompareTab" onclick="switchBattleTab('compare')">
                <i class="fas fa-scale-balanced"></i> ${t('battle.compare', 'Comparatif')}
            </button>
            <button class="battle-tab-btn" id="btnCatalogTab" onclick="switchBattleTab('catalog')">
                <i class="fas fa-book-open"></i> ${escapeHtml(friendName)}
            </button>
        </div>

        <!-- CONTENT CONTAINER -->
        <div style="flex:1; overflow-y:auto; padding:1rem; max-width:900px; margin:0 auto; width:100%">
            <div id="battleTabContent" class="battle-tab-pane"></div>
            <div id="comparisonTabContent" class="battle-tab-pane hidden"></div>
            <div id="catalogViewTabContent" class="battle-tab-pane hidden"></div>
        </div>
    `;

    renderBattleArena(myItems, friendItems, friendName, myUsername, myAvatar, friendAvatar);
    renderComparisonView(myItems, friendItems, friendName);
    renderFriendCatalogView(friendItems, friendName, friendAvatar);
}
window.openBattleMode = openBattleMode;

function switchBattleTab(tab) {
    ['battle', 'compare', 'catalog'].forEach(tKey => {
        const btn = document.getElementById(tKey === 'battle' ? 'btnBattleTab' : (tKey === 'compare' ? 'btnCompareTab' : 'btnCatalogTab'));
        const pane = document.getElementById(tKey === 'battle' ? 'battleTabContent' : (tKey === 'compare' ? 'comparisonTabContent' : 'catalogViewTabContent'));
        if (tKey === tab) {
            if (btn) btn.classList.add('active');
            if (pane) pane.classList.remove('hidden');
        } else {
            if (btn) btn.classList.remove('active');
            if (pane) pane.classList.add('hidden');
        }
    });
}
window.switchBattleTab = switchBattleTab;

// Normalize title for matching
function normT(title) {
    return (title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ============ RENDER BATTLE ARENA ============
function renderBattleArena(myItems, friendItems, friendName, myUsername = 'Vous', myAvatar = '', friendAvatar = '') {
    const container = document.getElementById('battleTabContent');
    if (!container) return;

    const myStats = computeDetailedStats(myItems);
    const frStats = computeDetailedStats(friendItems);

    const myPower = calculateBattlePower(myItems);
    const friendPower = calculateBattlePower(friendItems);
    const maxPower = Math.max(myPower, friendPower, 100);
    const myPct = Math.round((myPower / maxPower) * 100);
    const friendPct = Math.round((friendPower / maxPower) * 100);

    const myRank = computeRankInfo(myStats.totalChapters);
    const frRank = computeRankInfo(frStats.totalChapters);

    let winnerIsMe = myPower > friendPower;
    let isDraw = myPower === friendPower;
    const diff = Math.abs(myPower - friendPower);

    const categories = [
        { icon: 'fa-book-open', label: t('battle.chapters', 'Chapitres Lus'), my: myStats.totalChapters, fr: frStats.totalChapters, format: v => v.toLocaleString() },
        { icon: 'fa-layer-group', label: t('battle.titles', 'Total Titres'), my: myStats.totalTitles, fr: frStats.totalTitles, format: v => v.toString() },
        { icon: 'fa-flag-checkered', label: t('battle.completed', 'Œuvres Terminées'), my: myStats.completedCount, fr: frStats.completedCount, format: v => v.toString() },
        { icon: 'fa-star', label: t('battle.rating', 'Note Moyenne'), my: myStats.avgRating, fr: frStats.avgRating, format: v => v.toFixed(1) + '/5' },
        { icon: 'fa-dna', label: t('battle.diversity', 'Diversité Genres'), my: myStats.diversityScore, fr: frStats.diversityScore, format: v => v.toString() },
    ];

    let winnerTitle, winnerSub, winnerIcon;
    if (isDraw) {
        winnerTitle = t('battle.draw', 'ÉGALITÉ PARFAITE !');
        winnerSub = t('battle.draw_desc', 'Deux forces de lecture parfaitement équilibrées !');
        winnerIcon = 'fa-scale-balanced';
    } else if (diff / maxPower > 0.5) {
        winnerTitle = winnerIsMe ? t('battle.domination', 'DOMINATION ABSOLUE !') : `${escapeHtml(friendName).toUpperCase()} ${t('battle.domination', 'DOMINE !')}`;
        winnerSub = winnerIsMe ? `Niveau Cosmique d'écart !` : `${escapeHtml(friendName)} est sur une autre planète !`;
        winnerIcon = 'fa-skull';
    } else {
        winnerTitle = winnerIsMe ? t('battle.crushing_win', 'VICTOIRE DE DUEL !') : `${escapeHtml(friendName).toUpperCase()} L'EMPORTE !`;
        winnerSub = t('battle.close_win', 'Un duel palpitant !');
        winnerIcon = 'fa-bolt';
    }

    const categoriesHtml = categories.map(c => {
        const myWins = c.my > c.fr;
        const frWins = c.fr > c.my;
        const total = Math.max(c.my, c.fr, 1);
        const myBarPct = Math.round((c.my / total) * 100);
        const frBarPct = Math.round((c.fr / total) * 100);

        return `
            <div class="battle-animate-in battle-cat-row" style="margin-bottom:0.75rem">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.25rem">
                    <span style="font-size:0.75rem; font-weight:700; color:${myWins ? '#6c5ce7' : 'var(--text-secondary)'}; display:flex; align-items:center; gap:0.3rem">
                        ${myWins ? '<i class="fas fa-crown" style="font-size:0.6rem; color:#ffd700"></i>' : ''}
                        ${c.format(c.my)}
                    </span>
                    <span style="font-size:0.7rem; color:var(--text-muted); display:flex; align-items:center; gap:0.35rem">
                        <i class="fas ${c.icon}" style="font-size:0.7rem; color:#a855f7"></i> ${c.label}
                    </span>
                    <span style="font-size:0.75rem; font-weight:700; color:${frWins ? '#fd79a8' : 'var(--text-secondary)'}; display:flex; align-items:center; gap:0.3rem">
                        ${c.format(c.fr)}
                        ${frWins ? '<i class="fas fa-crown" style="font-size:0.6rem; color:#ffd700"></i>' : ''}
                    </span>
                </div>
                <div style="display:flex; gap:3px; height:8px">
                    <div style="flex:1; background:rgba(108,92,231,0.15); border-radius:4px 0 0 4px; overflow:hidden; direction:rtl">
                        <div style="width:${myBarPct}%; height:100%; background:linear-gradient(90deg, #6c5ce7, #a855f7); border-radius:4px 0 0 4px"></div>
                    </div>
                    <div style="flex:1; background:rgba(253,121,168,0.15); border-radius:0 4px 4px 0; overflow:hidden">
                        <div style="width:${frBarPct}%; height:100%; background:linear-gradient(90deg, #fd79a8, #a29bfe); border-radius:0 4px 4px 0"></div>
                    </div>
                </div>
            </div>`;
    }).join('');

    container.innerHTML = `
        <div class="battle-arena-main" style="position:relative; overflow:hidden">

            <!-- ARENA TITLE & VICTORY BANNER -->
            <div class="battle-animate-in" style="text-align:center; margin-bottom:1.2rem">
                <span style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.15em; color:var(--text-muted); margin-bottom:0.2rem; display:block">${t('battle.subtitle', 'MANLORE ARENA PRÉSENTE')}</span>
                <h2 style="font-family:var(--font-title); font-size:clamp(1.3rem, 4vw, 2rem); margin:0; background:linear-gradient(135deg, #a855f7, #fd79a8, #ffd700); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text">
                    <i class="fas fa-swords" style="color:#a855f7; -webkit-text-fill-color:initial"></i> ${t('battle.title', 'DUEL DE LECTEURS ARENA')} <i class="fas fa-swords" style="color:#fd79a8; -webkit-text-fill-color:initial"></i>
                </h2>
            </div>

            <!-- FIGHTER CARDS WITH AVATARS -->
            <div class="battle-animate-in" style="display:grid; grid-template-columns:1fr auto 1fr; gap:clamp(0.5rem, 2vw, 1.2rem); align-items:center; margin-bottom:1.5rem">
                
                <!-- MY FIGHTER -->
                <div style="background:linear-gradient(135deg, rgba(108,92,231,0.18), rgba(168,85,247,0.1)); border:2px solid ${winnerIsMe ? '#00b894' : 'rgba(108,92,231,0.4)'}; border-radius:18px; padding:1rem; text-align:center; position:relative; overflow:hidden; ${winnerIsMe ? 'box-shadow:0 0 25px rgba(0,184,148,0.3)' : ''}">
                    ${winnerIsMe ? '<div style="position:absolute; top:6px; right:10px; color:#ffd700; font-size:1.2rem" title="Vainqueur"><i class="fas fa-crown"></i></div>' : ''}
                    
                    <div style="width:70px; height:70px; margin:0 auto 0.5rem auto; border-radius:50%; overflow:hidden; border:3px solid ${myRank.color}; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; box-shadow:0 4px 15px rgba(108,92,231,0.4)">
                        ${myAvatar ? `<img src="${myAvatar}" style="width:100%; height:100%; object-fit:cover">` : `<i class="fas fa-user-astronaut" style="font-size:2rem; color:#6c5ce7"></i>`}
                    </div>

                    <h4 style="font-family:var(--font-title); color:#fff; font-size:0.95rem; margin:0 0 0.2rem 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${escapeHtml(myUsername)}</h4>
                    
                    <span style="background:${myRank.color}22; color:${myRank.color}; border:1px solid ${myRank.color}55; padding:0.15rem 0.5rem; border-radius:12px; font-size:0.65rem; font-weight:700; display:inline-flex; align-items:center; gap:0.3rem; margin-bottom:0.6rem">
                        <i class="fas ${myRank.icon}"></i> ${myRank.title}
                    </span>

                    <div style="font-family:var(--font-title); font-size:1.3rem; color:#6c5ce7; line-height:1; margin-bottom:0.5rem">
                        ${myPower.toLocaleString()} <span style="font-size:0.6rem; color:var(--text-muted); display:block">${t('battle.power', 'POWER')}</span>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.25rem; font-size:0.65rem; color:var(--text-muted)">
                        <div><i class="fas fa-book-open" style="color:#6c5ce7"></i> ${myStats.totalChapters} ch</div>
                        <div><i class="fas fa-layer-group" style="color:#6c5ce7"></i> ${myStats.totalTitles}</div>
                        <div><i class="fas fa-flag-checkered" style="color:#00b894"></i> ${myStats.completedCount}</div>
                        <div><i class="fas fa-star" style="color:#ffd700"></i> ${myStats.avgRating.toFixed(1)}</div>
                    </div>
                </div>

                <!-- VS BADGE -->
                <div style="text-align:center">
                    <div style="width:50px; height:50px; background:linear-gradient(135deg, #a855f7, #fd79a8); border-radius:50%; display:flex; align-items:center; justify-content:center; font-family:var(--font-title); font-size:0.9rem; color:#fff; font-weight:900; box-shadow:0 0 20px rgba(168,85,247,0.5); animation:battlePulse 2s infinite">
                        VS
                    </div>
                </div>

                <!-- FRIEND FIGHTER -->
                <div style="background:linear-gradient(135deg, rgba(253,121,168,0.18), rgba(162,155,254,0.1)); border:2px solid ${!winnerIsMe && !isDraw ? '#00b894' : 'rgba(253,121,168,0.4)'}; border-radius:18px; padding:1rem; text-align:center; position:relative; overflow:hidden; ${!winnerIsMe && !isDraw ? 'box-shadow:0 0 25px rgba(0,184,148,0.3)' : ''}">
                    ${!winnerIsMe && !isDraw ? '<div style="position:absolute; top:6px; right:10px; color:#ffd700; font-size:1.2rem" title="Vainqueur"><i class="fas fa-crown"></i></div>' : ''}
                    
                    <div style="width:70px; height:70px; margin:0 auto 0.5rem auto; border-radius:50%; overflow:hidden; border:3px solid ${frRank.color}; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; box-shadow:0 4px 15px rgba(253,121,168,0.4)">
                        ${friendAvatar ? `<img src="${friendAvatar}" style="width:100%; height:100%; object-fit:cover">` : `<i class="fas fa-user-ninja" style="font-size:2rem; color:#fd79a8"></i>`}
                    </div>

                    <h4 style="font-family:var(--font-title); color:#fff; font-size:0.95rem; margin:0 0 0.2rem 0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${escapeHtml(friendName)}</h4>
                    
                    <span style="background:${frRank.color}22; color:${frRank.color}; border:1px solid ${frRank.color}55; padding:0.15rem 0.5rem; border-radius:12px; font-size:0.65rem; font-weight:700; display:inline-flex; align-items:center; gap:0.3rem; margin-bottom:0.6rem">
                        <i class="fas ${frRank.icon}"></i> ${frRank.title}
                    </span>

                    <div style="font-family:var(--font-title); font-size:1.3rem; color:#fd79a8; line-height:1; margin-bottom:0.5rem">
                        ${friendPower.toLocaleString()} <span style="font-size:0.6rem; color:var(--text-muted); display:block">${t('battle.power', 'POWER')}</span>
                    </div>

                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.25rem; font-size:0.65rem; color:var(--text-muted)">
                        <div><i class="fas fa-book-open" style="color:#fd79a8"></i> ${frStats.totalChapters} ch</div>
                        <div><i class="fas fa-layer-group" style="color:#fd79a8"></i> ${frStats.totalTitles}</div>
                        <div><i class="fas fa-flag-checkered" style="color:#00b894"></i> ${frStats.completedCount}</div>
                        <div><i class="fas fa-star" style="color:#ffd700"></i> ${frStats.avgRating.toFixed(1)}</div>
                    </div>
                </div>
            </div>

            <!-- VICTORY ANNOUNCEMENT -->
            <div class="battle-animate-in" style="background:linear-gradient(135deg, rgba(255,215,0,0.12), rgba(168,85,247,0.15)); border:1px solid #ffd70055; border-radius:14px; padding:0.85rem; text-align:center; margin-bottom:1.5rem">
                <div style="font-size:1.3rem; color:#ffd700; margin-bottom:0.2rem"><i class="fas ${winnerIcon}"></i> ${winnerTitle}</div>
                <div style="font-size:0.8rem; color:var(--text-muted)">${winnerSub}</div>
            </div>

            <!-- CATEGORIES COMPARISON -->
            <h4 style="font-family:var(--font-title); color:var(--color-secondary); font-size:0.95rem; margin-bottom:0.8rem; display:flex; align-items:center; gap:0.5rem">
                <i class="fas fa-chart-column"></i> ${t('battle.compare', 'Comparatif des Statistiques')}
            </h4>
            ${categoriesHtml}
        </div>
    `;
}

// ============ RENDER COMPARISON VIEW ============
function renderComparisonView(myItems, friendItems, friendName) {
    const container = document.getElementById('comparisonTabContent');
    if (!container) return;

    const friendMap = new Map();
    friendItems.forEach(i => friendMap.set(normT(i.title), i));
    const commonTitles = [];

    myItems.forEach(my => {
        const key = normT(my.title);
        if (friendMap.has(key)) {
            commonTitles.push({ my, friend: friendMap.get(key) });
            friendMap.delete(key);
        }
    });

    const friendOnly = Array.from(friendMap.values());

    let myLeads = 0, friendLeads = 0, ties = 0;
    commonTitles.forEach(c => {
        const d = (parseInt(c.my.chapters,10)||0) - (parseInt(c.friend.chapters,10)||0);
        if (d > 0) myLeads++; else if (d < 0) friendLeads++; else ties++;
    });

    const commonHtml = commonTitles.length > 0 ? commonTitles.map(c => {
        const myCh = parseInt(c.my.chapters, 10) || 0;
        const frCh = parseInt(c.friend.chapters, 10) || 0;
        const diff = myCh - frCh;
        const badgeColor = diff > 0 ? '#00b894' : (diff < 0 ? '#fdcb6e' : '#74b9ff');
        const badgeIcon = diff > 0 ? 'fa-crown' : (diff < 0 ? 'fa-crown' : 'fa-equals');
        const badgeText = diff > 0
            ? `Vous (+${diff})`
            : (diff < 0 ? `${escapeHtml(friendName)} (+${Math.abs(diff)})` : `Égalité`);

        return `
            <div class="battle-animate-in" style="background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.06); border-radius:12px; padding:0.6rem 0.8rem; margin-bottom:0.5rem; display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap">
                <img src="${c.my.image || c.my.imageUrl || 'manlore-logo.png'}" alt="" style="width:36px; height:50px; object-fit:cover; border-radius:8px; border:1px solid rgba(255,255,255,0.1); flex-shrink:0" onerror="this.src='manlore-logo.png'">
                <div style="flex:1; min-width:120px">
                    <strong style="color:var(--text-primary); font-size:0.85rem; display:block; line-height:1.2">${escapeHtml(c.my.title)}</strong>
                    <span style="font-size:0.7rem; color:var(--text-muted)">${escapeHtml(c.my.type || 'Manga')}</span>
                </div>
                <div style="display:flex; align-items:center; gap:0.8rem; flex-shrink:0">
                    <div style="text-align:center"><small style="color:var(--text-muted); font-size:0.65rem; display:block">Vous</small><span style="font-weight:700; color:#6c5ce7; font-size:0.85rem">${myCh}</span></div>
                    <span style="color:rgba(255,255,255,0.2); font-size:0.7rem">vs</span>
                    <div style="text-align:center"><small style="color:var(--text-muted); font-size:0.65rem; display:block">${escapeHtml(friendName).substring(0,8)}</small><span style="font-weight:700; color:#fd79a8; font-size:0.85rem">${frCh}</span></div>
                    <span style="background:${badgeColor}22; color:${badgeColor}; border:1px solid ${badgeColor}44; padding:0.15rem 0.5rem; border-radius:20px; font-size:0.68rem; font-weight:600; white-space:nowrap"><i class="fas ${badgeIcon}" style="font-size:0.6rem"></i> ${badgeText}</span>
                </div>
            </div>`;
    }).join('') : `<div style="text-align:center; padding:1.5rem; color:var(--text-muted)"><i class="fas fa-folder-open" style="font-size:1.5rem; margin-bottom:0.4rem; display:block"></i>Aucun titre en commun.</div>`;

    container.innerHTML = `
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap:0.6rem; margin-bottom:1.2rem">
            <div class="battle-animate-in" style="background:rgba(108,92,231,0.12); border:1px solid rgba(108,92,231,0.25); border-radius:14px; text-align:center; padding:0.8rem 0.5rem">
                <i class="fas fa-handshake" style="font-size:1.2rem; color:#6c5ce7; margin-bottom:0.2rem; display:block"></i>
                <div style="font-size:1.3rem; font-family:var(--font-title); color:var(--text-primary)">${commonTitles.length}</div>
                <div style="font-size:0.68rem; color:var(--text-muted); font-weight:600">${t('battle.common', 'En commun')}</div>
            </div>
            <div class="battle-animate-in" style="background:rgba(0,184,148,0.12); border:1px solid rgba(0,184,148,0.25); border-radius:14px; text-align:center; padding:0.8rem 0.5rem">
                <i class="fas fa-crown" style="font-size:1.2rem; color:#00b894; margin-bottom:0.2rem; display:block"></i>
                <div style="font-size:1.3rem; font-family:var(--font-title); color:#00b894">${myLeads}</div>
                <div style="font-size:0.68rem; color:var(--text-muted); font-weight:600">${t('battle.leads', 'Vous menez')}</div>
            </div>
            <div class="battle-animate-in" style="background:rgba(253,203,110,0.12); border:1px solid rgba(253,203,110,0.25); border-radius:14px; text-align:center; padding:0.8rem 0.5rem">
                <i class="fas fa-trophy" style="font-size:1.2rem; color:#fdcb6e; margin-bottom:0.2rem; display:block"></i>
                <div style="font-size:1.3rem; font-family:var(--font-title); color:#fdcb6e">${friendLeads}</div>
                <div style="font-size:0.68rem; color:var(--text-muted); font-weight:600">${t('battle.friend_leads', '{name} mène', { name: escapeHtml(friendName).substring(0,8) })}</div>
            </div>
            <div class="battle-animate-in" style="background:rgba(116,185,255,0.12); border:1px solid rgba(116,185,255,0.25); border-radius:14px; text-align:center; padding:0.8rem 0.5rem">
                <i class="fas fa-equals" style="font-size:1.2rem; color:#74b9ff; margin-bottom:0.2rem; display:block"></i>
                <div style="font-size:1.3rem; font-family:var(--font-title); color:#74b9ff">${ties}</div>
                <div style="font-size:0.68rem; color:var(--text-muted); font-weight:600">${t('battle.ties', 'Égalités')}</div>
            </div>
        </div>

        <h4 style="font-family:var(--font-title); color:var(--color-secondary); font-size:0.95rem; margin-bottom:0.6rem; display:flex; align-items:center; gap:0.5rem">
            <i class="fas fa-list-check"></i> ${t('battle.common', 'Comparatif des Titres Communs')} (${commonTitles.length})
        </h4>
        ${commonHtml}

        ${friendOnly.length > 0 ? `
        <h4 style="font-family:var(--font-title); color:#fd79a8; font-size:0.9rem; margin-top:1.4rem; margin-bottom:0.6rem; display:flex; align-items:center; gap:0.5rem">
            <i class="fas fa-eye-slash"></i> ${t('battle.exclusive', '{name} lit mais pas vous', { name: escapeHtml(friendName) })} (${friendOnly.length})
        </h4>
        <div style="display:flex; flex-direction:column; gap:0.4rem">
            ${friendOnly.slice(0, 15).map(f => `
                <div class="battle-animate-in" style="background:rgba(253,121,168,0.08); border:1px solid rgba(253,121,168,0.2); border-radius:10px; padding:0.5rem 0.75rem; display:flex; align-items:center; justify-content:space-between; gap:0.5rem">
                    <div style="display:flex; align-items:center; gap:0.6rem; min-width:0">
                        <img src="${f.image || f.imageUrl || 'manlore-logo.png'}" alt="" style="width:30px; height:42px; object-fit:cover; border-radius:6px; flex-shrink:0" onerror="this.src='manlore-logo.png'">
                        <div style="min-width:0">
                            <strong style="color:var(--text-primary); font-size:0.8rem; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${escapeHtml(f.title)}</strong>
                            <span style="font-size:0.68rem; color:var(--text-muted)">${escapeHtml(f.type || 'Manga')} • ${parseInt(f.chapters,10)||0} ch</span>
                        </div>
                    </div>
                    <button type="button" class="btn-primary" style="padding:0.3rem 0.6rem; font-size:0.72rem; white-space:nowrap; background:linear-gradient(135deg, #a855f7, #6c5ce7); border:none" onclick="addFriendTitleToWishlist('${escapeHtml(f.title)}', '${escapeHtml(f.type)}', '${escapeHtml(f.image || f.imageUrl)}')">
                        <i class="fas fa-plus"></i> ${t('battle.add_wishlist', 'Ajouter')}
                    </button>
                </div>`).join('')}
            ${friendOnly.length > 15 ? `<div style="text-align:center; color:var(--text-muted); font-size:0.75rem; padding:0.4rem">+${friendOnly.length - 15} autres titres</div>` : ''}
        </div>` : ''}
    `;
}

// ============ RENDER FRIEND CATALOG VIEW ============
function renderFriendCatalogView(friendItems, friendName, friendAvatar = '') {
    const container = document.getElementById('catalogViewTabContent');
    if (!container) return;

    const stats = computeDetailedStats(friendItems);
    const frRank = computeRankInfo(stats.totalChapters);

    const itemsHtml = friendItems.slice(0, 60).map(item => {
        const ch = parseInt(item.chapters, 10) || 0;
        const stars = item.rating > 0 ? '★'.repeat(Math.min(item.rating, 5)) : '';
        return `
            <div class="battle-animate-in" style="background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:0.55rem; display:flex; align-items:center; justify-content:space-between; gap:0.5rem">
                <div style="display:flex; align-items:center; gap:0.6rem; min-width:0; flex:1">
                    <img src="${item.image || item.imageUrl || 'manlore-logo.png'}" alt="" style="width:34px; height:46px; object-fit:cover; border-radius:6px; flex-shrink:0" onerror="this.src='manlore-logo.png'">
                    <div style="min-width:0">
                        <div style="font-size:0.8rem; font-weight:600; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${escapeHtml(item.title || '?')}</div>
                        <div style="font-size:0.68rem; color:var(--text-muted)">${escapeHtml(item.type || 'Manga')} • ${ch} ch ${stars ? '• ' + stars : ''}</div>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:0.4rem; flex-shrink:0">
                    <span style="background:${item.status?.toLowerCase().includes('terminé') ? 'rgba(0,184,148,0.2); color:#00b894' : 'rgba(108,92,231,0.2); color:#6c5ce7'}; padding:0.15rem 0.45rem; border-radius:8px; font-size:0.62rem; font-weight:600">${escapeHtml((item.status || 'En cours').substring(0, 10))}</span>
                    <button type="button" class="btn-secondary" style="padding:0.25rem 0.5rem; font-size:0.7rem" onclick="addFriendTitleToWishlist('${escapeHtml(item.title)}', '${escapeHtml(item.type)}', '${escapeHtml(item.image || item.imageUrl)}')" title="Ajouter à mes souhaits">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            </div>`;
    }).join('');

    container.innerHTML = `
        <div class="battle-animate-in" style="background:linear-gradient(135deg, rgba(253,121,168,0.15), rgba(162,155,254,0.1)); border:1px solid rgba(253,121,168,0.3); border-radius:16px; padding:1rem; margin-bottom:1.2rem">
            <div style="display:flex; align-items:center; gap:0.8rem; margin-bottom:0.8rem">
                <div style="width:50px; height:50px; border-radius:50%; overflow:hidden; border:2px solid ${frRank.color}; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; flex-shrink:0">
                    ${friendAvatar ? `<img src="${friendAvatar}" style="width:100%; height:100%; object-fit:cover">` : `<i class="fas fa-user-ninja" style="font-size:1.5rem; color:#fd79a8"></i>`}
                </div>
                <div>
                    <div style="font-family:var(--font-title); font-size:1.05rem; color:var(--text-primary)">${escapeHtml(friendName)}</div>
                    <div style="font-size:0.72rem; color:var(--text-muted)">${stats.totalTitles} titres • ${stats.totalChapters.toLocaleString()} chapitres • ${stats.completedCount} terminés</div>
                </div>
            </div>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(85px, 1fr)); gap:0.5rem">
                ${Object.entries(stats.types).map(([t, c]) => `<div style="background:rgba(0,0,0,0.25); border-radius:8px; padding:0.4rem; text-align:center"><div style="font-size:0.9rem; font-weight:700; color:var(--text-primary)">${c}</div><div style="font-size:0.62rem; color:var(--text-muted)">${escapeHtml(t)}</div></div>`).join('')}
            </div>
        </div>

        <div style="display:flex; flex-direction:column; gap:0.4rem; max-height:380px; overflow-y:auto; padding-right:0.3rem">
            ${itemsHtml}
            ${friendItems.length > 60 ? `<div style="text-align:center; padding:0.5rem; color:var(--text-muted); font-size:0.75rem">+${friendItems.length - 60} autres titres</div>` : ''}
        </div>
    `;
}

// Auto-check URL for share code parameter (e.g. ?share=ML-8A3F9X or web+manlore://...)
function checkAndOpenUrlShareCode() {
    renderActiveShareLinksList();

    let rawCode = null;
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.has('share')) {
        rawCode = urlParams.get('share');
    } else if (urlParams.has('code')) {
        rawCode = urlParams.get('code');
    } else if (window.location.hash && window.location.hash.includes('share=')) {
        const hashMatch = window.location.hash.match(/share=([^&]+)/);
        if (hashMatch) rawCode = hashMatch[1];
    }

    if (rawCode) {
        let shareCode = decodeURIComponent(rawCode);
        const codeMatch = shareCode.match(/ML-[A-Z0-9]{6}/i);
        if (codeMatch) {
            shareCode = codeMatch[0].toUpperCase();
        }
        console.log('[CatalogShare] Détection du code de partage:', shareCode);
        setTimeout(() => fetchAndOpenSharedCatalog(shareCode), 600);
    }
}

document.addEventListener('DOMContentLoaded', checkAndOpenUrlShareCode);
window.checkAndOpenUrlShareCode = checkAndOpenUrlShareCode;
