/* ============================================
   MANLORE v9.1.0 - CATALOG_SHARE.JS
   Partage Temporaire de Catalogue, Révocation,
   Comparaison de Collections & Mode Battle ⚔️
   ULTRA ÉDITION — Animations, Stats Détaillées,
   Visualisation du Catalogue Ami, Responsive Mobile
   ============================================ */

'use strict';

let activeShareLinks = [];

// ============ PER-USER STORAGE KEY ============
// Résout le problème du téléphone partagé : chaque utilisateur a son propre namespace localStorage
function getUserStoragePrefix() {
    const user = typeof Parse !== 'undefined' && Parse.User ? Parse.User.current() : null;
    if (user) return `manlore_u_${user.id}_`;
    const guestId = localStorage.getItem('manlore_guest_id');
    if (guestId) return `manlore_g_${guestId}_`;
    // Fallback
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

// ============ GENERATE SHARE LINK ============
async function createSharedCatalogLink(durationHours = 24) {
    durationHours = Math.max(1, Math.min(72, parseInt(durationHours, 10) || 24));

    const user = typeof Parse !== 'undefined' && Parse.User ? Parse.User.current() : null;
    const username = user ? user.get('username') : (localStorage.getItem('manlore_username') || 'Ami ManLore');
    const email = user ? user.get('email') : '';
    const userId = user ? user.id : 'guest';
    const sessionToken = user ? user.getSessionToken() : null;

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

    // Per-user local storage
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

    const user = typeof Parse !== 'undefined' && Parse.User ? Parse.User.current() : null;
    const sessionToken = user ? user.getSessionToken() : null;

    try {
        if (typeof back4appApiCall === 'function') {
            const queryRes = await back4appApiCall(
                `/classes/SharedCatalogs?where=${encodeURIComponent(JSON.stringify({ shareCode }))}`,
                'GET', null, sessionToken
            );
            if (queryRes.ok && queryRes.data?.results?.length) {
                const objectId = queryRes.data.results[0].objectId;
                await back4appApiCall(`/classes/SharedCatalogs/${objectId}`, 'PUT', { isRevoked: true }, sessionToken);
            }
        }
    } catch(e) {
        console.warn('Revoke cloud note:', e);
    }

    const prefix = getUserStoragePrefix();
    try {
        let localLinks = JSON.parse(localStorage.getItem(prefix + 'active_share_links') || '[]');
        localLinks = localLinks.map(l => l.shareCode === shareCode ? { ...l, isRevoked: true } : l);
        localStorage.setItem(prefix + 'active_share_links', JSON.stringify(localLinks));
        activeShareLinks = localLinks;
    } catch {}

    renderActiveShareLinksList();
    if (window.showToast) window.showToast('Lien de partage révoqué !', 'info');
    return { success: true };
}
window.revokeSharedCatalogLink = revokeSharedCatalogLink;

// ============ RENDER ACTIVE LINKS ============
function renderActiveShareLinksList() {
    const listEl = document.getElementById('activeShareLinksList');
    if (!listEl) return;

    const prefix = getUserStoragePrefix();
    try {
        activeShareLinks = JSON.parse(localStorage.getItem(prefix + 'active_share_links') || '[]');
    } catch {}

    const now = new Date();
    const validLinks = activeShareLinks.filter(l => !l.isRevoked && new Date(l.expiresAt) > now);

    if (!validLinks.length) {
        listEl.innerHTML = `
            <div style="text-align:center; padding:1.2rem; color:var(--text-muted); font-size:0.85rem">
                <i class="fas fa-link-slash" style="font-size:1.5rem; margin-bottom:0.4rem; opacity:0.5; display:block"></i>
                Aucun lien de partage actif.
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
                    <button type="button" class="btn-secondary" style="padding:0.35rem 0.65rem; font-size:0.78rem" onclick="navigator.clipboard.writeText('${l.shareUrl}'); if(window.showToast) window.showToast('Lien copié !', 'success')">
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

// ============ LOAD & COMPARE SHARED CATALOG ============
async function fetchAndOpenSharedCatalog(shareCode) {
    if (!shareCode) return;

    if (window.showLoading) window.showLoading(true, 'Chargement du catalogue partagé...');

    let catalogData = null;

    try {
        if (typeof back4appApiCall === 'function') {
            const res = await back4appApiCall(
                `/classes/SharedCatalogs?where=${encodeURIComponent(JSON.stringify({ shareCode }))}`,
                'GET', null, null
            );
            if (res.ok && res.data?.results?.length) {
                catalogData = res.data.results[0];
            }
        }
    } catch(e) {
        console.warn('Fetch shared catalog note:', e);
    }

    if (window.showLoading) window.showLoading(false);

    if (!catalogData) {
        if (window.showToast) window.showToast('Catalogue introuvable ou expiré.', 'error');
        return;
    }

    const now = new Date();
    const expiresAt = catalogData.expiresAt?.iso ? new Date(catalogData.expiresAt.iso) : new Date(catalogData.expiresAt);

    if (catalogData.isRevoked || (expiresAt && expiresAt < now)) {
        if (window.showToast) window.showToast('Ce lien de partage a expiré ou a été révoqué.', 'warning');
        return;
    }

    openBattleAndComparisonModal(catalogData);
}
window.fetchAndOpenSharedCatalog = fetchAndOpenSharedCatalog;

// ============ DETAILED STATS BREAKDOWN ============
function computeDetailedStats(items = []) {
    if (!Array.isArray(items)) items = [];
    let totalChapters = 0, completedCount = 0, totalRating = 0, ratedCount = 0;
    let ongoingCount = 0, pausedCount = 0, planCount = 0;
    const types = {}, genres = {};
    let longestTitle = { title: '', chapters: 0 };

    items.forEach(i => {
        const ch = parseInt(i.chapters, 10) || 0;
        totalChapters += ch;
        if (ch > longestTitle.chapters) longestTitle = { title: i.title || '?', chapters: ch };

        const st = (i.status || '').toLowerCase();
        if (st.includes('terminé') || st.includes('completed')) completedCount++;
        else if (st.includes('en cours') || st.includes('reading')) ongoingCount++;
        else if (st.includes('pause') || st.includes('hold')) pausedCount++;
        else if (st.includes('lire') || st.includes('plan')) planCount++;

        if (i.rating && i.rating > 0) { totalRating += i.rating; ratedCount++; }
        const t = i.type || 'Manga';
        types[t] = (types[t] || 0) + 1;
        (Array.isArray(i.genres) ? i.genres : []).forEach(g => {
            if (g) genres[g] = (genres[g] || 0) + 1;
        });
    });

    const avgRating = ratedCount > 0 ? (totalRating / ratedCount) : 0;
    const topGenres = Object.entries(genres).sort((a,b) => b[1] - a[1]).slice(0, 5);

    return {
        totalTitles: items.length,
        totalChapters,
        completedCount,
        ongoingCount,
        pausedCount,
        planCount,
        avgRating,
        ratedCount,
        types,
        topGenres,
        longestTitle,
        diversityScore: Object.keys(genres).length,
        completionRate: items.length > 0 ? Math.round((completedCount / items.length) * 100) : 0
    };
}

// ============ CALCULATE BATTLE POWER SCORE (ENHANCED) ============
function calculateBattlePower(items = []) {
    const s = computeDetailedStats(items);
    // Enhanced formula with more depth
    const chaptersPower = s.totalChapters * 12;
    const completionPower = s.completedCount * 250;
    const catalogPower = s.totalTitles * 40;
    const ratingPower = Math.round(s.avgRating * 55);
    const diversityBonus = s.diversityScore * 30;
    const dedicationBonus = s.ongoingCount * 20;

    return chaptersPower + completionPower + catalogPower + ratingPower + diversityBonus + dedicationBonus;
}
window.calculateBattlePower = calculateBattlePower;

// ============ BATTLE ARENA & COMPARISON UI ============
function openBattleAndComparisonModal(friendCatalog) {
    const modal = document.getElementById('catalogBattleModal');
    if (!modal) return;

    const myCollection = typeof allItems !== 'undefined' && allItems.length > 0
        ? allItems
        : (typeof loadFromLocalStorage === 'function' ? loadFromLocalStorage() : []);

    const friendUsername = friendCatalog.username || 'Ami ManLore';
    const friendItems = friendCatalog.items || [];

    renderComparisonView(myCollection, friendItems, friendUsername);
    renderBattleArena(myCollection, friendItems, friendUsername);
    renderFriendCatalogView(friendItems, friendUsername);

    modal.classList.remove('hidden');
    modal.style.display = 'flex';

    // Trigger entrance animations
    setTimeout(() => {
        modal.querySelectorAll('.battle-animate-in').forEach((el, i) => {
            el.style.animationDelay = `${i * 0.08}s`;
            el.classList.add('battle-visible');
        });
    }, 100);
}
window.openBattleAndComparisonModal = openBattleAndComparisonModal;

function closeCatalogBattleModal() {
    const modal = document.getElementById('catalogBattleModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}
window.closeCatalogBattleModal = closeCatalogBattleModal;

function openShareCatalogModal() {
    const modal = document.getElementById('shareCatalogModal');
    if (modal) {
        renderActiveShareLinksList();
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
}
window.openShareCatalogModal = openShareCatalogModal;

function closeShareCatalogModal() {
    const modal = document.getElementById('shareCatalogModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}
window.closeShareCatalogModal = closeShareCatalogModal;

// Normalize title for matching
function normT(title) {
    return (title || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// ============ COMPARISON VIEW ============
function renderComparisonView(myItems, friendItems, friendName) {
    const container = document.getElementById('comparisonTabContent');
    if (!container) return;

    const friendMap = new Map();
    friendItems.forEach(i => friendMap.set(normT(i.title), i));
    const commonTitles = [];
    const myOnlyTitles = [];

    myItems.forEach(my => {
        const key = normT(my.title);
        if (friendMap.has(key)) {
            commonTitles.push({ my, friend: friendMap.get(key) });
            friendMap.delete(key);
        } else {
            myOnlyTitles.push(my);
        }
    });

    const myTotalCh = myItems.reduce((a, i) => a + (parseInt(i.chapters, 10) || 0), 0);
    const friendTotalCh = friendItems.reduce((a, i) => a + (parseInt(i.chapters, 10) || 0), 0);
    const friendOnly = Array.from(friendMap.values());

    // Count who leads more common titles
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
            <div class="battle-animate-in compare-row" style="background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.06); border-radius:12px; padding:0.6rem 0.8rem; margin-bottom:0.5rem; display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap">
                <img src="${c.my.image || c.my.imageUrl || 'manlore-logo.png'}" alt="" style="width:36px; height:50px; object-fit:cover; border-radius:8px; border:1px solid rgba(255,255,255,0.1); flex-shrink:0" onerror="this.src='manlore-logo.png'">
                <div style="flex:1; min-width:120px">
                    <strong style="color:var(--text-primary); font-size:0.82rem; display:block; line-height:1.2">${escapeHtml(c.my.title)}</strong>
                    <span style="font-size:0.7rem; color:var(--text-muted)">${escapeHtml(c.my.type || 'Manga')}</span>
                </div>
                <div style="display:flex; align-items:center; gap:0.8rem; flex-shrink:0">
                    <div style="text-align:center"><small style="color:var(--text-muted); font-size:0.65rem; display:block">Vous</small><span style="font-weight:700; color:#6c5ce7; font-size:0.85rem">${myCh}</span></div>
                    <span style="color:rgba(255,255,255,0.2); font-size:0.7rem">vs</span>
                    <div style="text-align:center"><small style="color:var(--text-muted); font-size:0.65rem; display:block">${escapeHtml(friendName).substring(0,8)}</small><span style="font-weight:700; color:#fd79a8; font-size:0.85rem">${frCh}</span></div>
                    <span style="background:${badgeColor}22; color:${badgeColor}; border:1px solid ${badgeColor}44; padding:0.15rem 0.4rem; border-radius:20px; font-size:0.65rem; font-weight:600; white-space:nowrap"><i class="fas ${badgeIcon}" style="font-size:0.55rem"></i> ${badgeText}</span>
                </div>
            </div>`;
    }).join('') : `<div style="text-align:center; padding:1.5rem; color:var(--text-muted)"><i class="fas fa-folder-open" style="font-size:1.5rem; margin-bottom:0.4rem; display:block"></i>Aucun titre en commun.</div>`;

    container.innerHTML = `
        <div class="compare-stats-grid" style="display:grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap:0.6rem; margin-bottom:1.2rem">
            <div class="battle-animate-in compare-stat-card" style="background:rgba(108,92,231,0.12); border:1px solid rgba(108,92,231,0.25); border-radius:14px; text-align:center; padding:0.8rem 0.5rem">
                <i class="fas fa-handshake" style="font-size:1.2rem; color:#6c5ce7; margin-bottom:0.2rem; display:block"></i>
                <div style="font-size:1.3rem; font-family:var(--font-title); color:var(--text-primary)">${commonTitles.length}</div>
                <div style="font-size:0.68rem; color:var(--text-muted)">En commun</div>
            </div>
            <div class="battle-animate-in compare-stat-card" style="background:rgba(0,184,148,0.12); border:1px solid rgba(0,184,148,0.25); border-radius:14px; text-align:center; padding:0.8rem 0.5rem">
                <i class="fas fa-crown" style="font-size:1.2rem; color:#00b894; margin-bottom:0.2rem; display:block"></i>
                <div style="font-size:1.3rem; font-family:var(--font-title); color:#00b894">${myLeads}</div>
                <div style="font-size:0.68rem; color:var(--text-muted)">Vous menez</div>
            </div>
            <div class="battle-animate-in compare-stat-card" style="background:rgba(253,203,110,0.12); border:1px solid rgba(253,203,110,0.25); border-radius:14px; text-align:center; padding:0.8rem 0.5rem">
                <i class="fas fa-trophy" style="font-size:1.2rem; color:#fdcb6e; margin-bottom:0.2rem; display:block"></i>
                <div style="font-size:1.3rem; font-family:var(--font-title); color:#fdcb6e">${friendLeads}</div>
                <div style="font-size:0.68rem; color:var(--text-muted)">${escapeHtml(friendName).substring(0,10)} mène</div>
            </div>
            <div class="battle-animate-in compare-stat-card" style="background:rgba(116,185,255,0.12); border:1px solid rgba(116,185,255,0.25); border-radius:14px; text-align:center; padding:0.8rem 0.5rem">
                <i class="fas fa-equals" style="font-size:1.2rem; color:#74b9ff; margin-bottom:0.2rem; display:block"></i>
                <div style="font-size:1.3rem; font-family:var(--font-title); color:#74b9ff">${ties}</div>
                <div style="font-size:0.68rem; color:var(--text-muted)">Égalités</div>
            </div>
        </div>

        <h4 class="battle-animate-in" style="font-family:var(--font-title); color:var(--color-secondary); font-size:0.95rem; margin-bottom:0.6rem; display:flex; align-items:center; gap:0.5rem">
            <i class="fas fa-list-check"></i> Comparatif des Titres Communs (${commonTitles.length})
        </h4>
        ${commonHtml}

        ${friendOnly.length > 0 ? `
        <h4 class="battle-animate-in" style="font-family:var(--font-title); color:#fd79a8; font-size:0.9rem; margin-top:1.2rem; margin-bottom:0.5rem; display:flex; align-items:center; gap:0.5rem">
            <i class="fas fa-eye-slash"></i> ${escapeHtml(friendName)} lit mais pas vous (${friendOnly.length})
        </h4>
        <div style="display:flex; gap:0.4rem; flex-wrap:wrap">
            ${friendOnly.slice(0, 12).map(f => `<span class="battle-animate-in" style="background:rgba(253,121,168,0.12); border:1px solid rgba(253,121,168,0.2); color:#fd79a8; padding:0.25rem 0.6rem; border-radius:20px; font-size:0.72rem; font-weight:500">${escapeHtml((f.title||'').substring(0,25))}</span>`).join('')}
            ${friendOnly.length > 12 ? `<span style="color:var(--text-muted); font-size:0.72rem; padding:0.25rem">+${friendOnly.length - 12} autres</span>` : ''}
        </div>` : ''}
    `;
}

// ============ FRIEND CATALOG VIEW (Reciprocal) ============
function renderFriendCatalogView(friendItems, friendName) {
    const container = document.getElementById('catalogViewTabContent');
    if (!container) return;

    const stats = computeDetailedStats(friendItems);

    const itemsHtml = friendItems.slice(0, 50).map(item => {
        const ch = parseInt(item.chapters, 10) || 0;
        const stars = item.rating > 0 ? '★'.repeat(Math.min(item.rating, 5)) : '';
        return `
            <div class="battle-animate-in" style="background:rgba(0,0,0,0.2); border:1px solid rgba(255,255,255,0.06); border-radius:10px; padding:0.5rem; display:flex; align-items:center; gap:0.5rem">
                <img src="${item.image || item.imageUrl || 'manlore-logo.png'}" alt="" style="width:32px; height:44px; object-fit:cover; border-radius:6px; flex-shrink:0" onerror="this.src='manlore-logo.png'">
                <div style="flex:1; min-width:0">
                    <div style="font-size:0.78rem; font-weight:600; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${escapeHtml(item.title || '?')}</div>
                    <div style="font-size:0.65rem; color:var(--text-muted)">${escapeHtml(item.type || 'Manga')} • ${ch} ch ${stars ? '• ' + stars : ''}</div>
                </div>
                <span style="background:${item.status?.toLowerCase().includes('terminé') ? 'rgba(0,184,148,0.2); color:#00b894' : 'rgba(108,92,231,0.2); color:#6c5ce7'}; padding:0.15rem 0.4rem; border-radius:8px; font-size:0.6rem; font-weight:600; flex-shrink:0">${escapeHtml((item.status || 'En cours').substring(0, 10))}</span>
            </div>`;
    }).join('');

    container.innerHTML = `
        <div class="battle-animate-in" style="background:rgba(253,121,168,0.08); border:1px solid rgba(253,121,168,0.2); border-radius:16px; padding:1rem; margin-bottom:1rem">
            <div style="display:flex; align-items:center; gap:0.6rem; margin-bottom:0.8rem">
                <div style="width:42px; height:42px; border-radius:50%; background:linear-gradient(135deg, #fd79a8, #a29bfe); display:flex; align-items:center; justify-content:center; font-size:1.2rem; color:white"><i class="fas fa-user-ninja"></i></div>
                <div>
                    <div style="font-family:var(--font-title); font-size:1rem; color:var(--text-primary)">${escapeHtml(friendName)}</div>
                    <div style="font-size:0.72rem; color:var(--text-muted)">${stats.totalTitles} titres • ${stats.totalChapters.toLocaleString()} chapitres • ${stats.completedCount} terminés</div>
                </div>
            </div>
            <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(85px, 1fr)); gap:0.5rem">
                ${Object.entries(stats.types).map(([t, c]) => `<div style="background:rgba(0,0,0,0.2); border-radius:8px; padding:0.4rem; text-align:center"><div style="font-size:0.9rem; font-weight:700; color:var(--text-primary)">${c}</div><div style="font-size:0.6rem; color:var(--text-muted)">${escapeHtml(t)}</div></div>`).join('')}
            </div>
        </div>
        <div style="display:flex; flex-direction:column; gap:0.4rem; max-height:350px; overflow-y:auto; padding-right:0.3rem">
            ${itemsHtml}
            ${friendItems.length > 50 ? `<div style="text-align:center; padding:0.5rem; color:var(--text-muted); font-size:0.75rem">+${friendItems.length - 50} autres titres</div>` : ''}
        </div>
    `;
}

// ============ EPIC BATTLE ARENA ⚔️ ============
function renderBattleArena(myItems, friendItems, friendName) {
    const container = document.getElementById('battleTabContent');
    if (!container) return;

    const myStats = computeDetailedStats(myItems);
    const frStats = computeDetailedStats(friendItems);

    const myPower = calculateBattlePower(myItems);
    const friendPower = calculateBattlePower(friendItems);
    const maxPower = Math.max(myPower, friendPower, 100);
    const myPct = Math.round((myPower / maxPower) * 100);
    const friendPct = Math.round((friendPower / maxPower) * 100);

    const myUsername = (typeof Parse !== 'undefined' && Parse.User && Parse.User.current())
        ? Parse.User.current().get('username') : 'Vous';

    let winnerIsMe = myPower > friendPower;
    let isDraw = myPower === friendPower;
    const diff = Math.abs(myPower - friendPower);
    const dominanceRatio = maxPower > 0 ? (diff / maxPower * 100).toFixed(1) : 0;

    // Category battles (who wins each category)
    const categories = [
        { icon: 'fa-book-open', label: 'Chapitres Lus', my: myStats.totalChapters, fr: frStats.totalChapters, format: v => v.toLocaleString() },
        { icon: 'fa-layer-group', label: 'Total Titres', my: myStats.totalTitles, fr: frStats.totalTitles, format: v => v.toString() },
        { icon: 'fa-flag-checkered', label: 'Œuvres Terminées', my: myStats.completedCount, fr: frStats.completedCount, format: v => v.toString() },
        { icon: 'fa-star', label: 'Note Moyenne', my: myStats.avgRating, fr: frStats.avgRating, format: v => v.toFixed(1) + '/5' },
        { icon: 'fa-dna', label: 'Diversité Genres', my: myStats.diversityScore, fr: frStats.diversityScore, format: v => v.toString() },
        { icon: 'fa-percent', label: 'Taux Completion', my: myStats.completionRate, fr: frStats.completionRate, format: v => v + '%' },
    ];

    let catWinsMe = 0, catWinsFr = 0;
    categories.forEach(c => { if (c.my > c.fr) catWinsMe++; else if (c.fr > c.my) catWinsFr++; });

    // Victory titles based on dominance
    let winnerTitle, winnerSub, winnerEmoji;
    if (isDraw) {
        winnerTitle = 'ÉGALITÉ PARFAITE !'; winnerSub = 'Deux forces de lecture parfaitement équilibrées !'; winnerEmoji = '⚖️';
    } else if (diff / maxPower > 0.5) {
        winnerTitle = winnerIsMe ? 'DOMINATION ABSOLUE !' : `${escapeHtml(friendName).toUpperCase()} ÉCRASE TOUT !`;
        winnerSub = winnerIsMe ? `Vous êtes dans un tout autre niveau !` : `${escapeHtml(friendName)} est sur une autre planète !`;
        winnerEmoji = '💀';
    } else if (diff / maxPower > 0.25) {
        winnerTitle = winnerIsMe ? 'VICTOIRE ÉCRASANTE !' : `${escapeHtml(friendName).toUpperCase()} DOMINE !`;
        winnerSub = winnerIsMe ? `Vous surpassez largement ${escapeHtml(friendName)} !` : `${escapeHtml(friendName)} prend le dessus nettement !`;
        winnerEmoji = '🔥';
    } else {
        winnerTitle = winnerIsMe ? 'VICTOIRE SERRÉE !' : `${escapeHtml(friendName).toUpperCase()} L'EMPORTE !`;
        winnerSub = 'Un duel extrêmement serré et palpitant !';
        winnerEmoji = '⚡';
    }

    const categoriesHtml = categories.map(c => {
        const myWins = c.my > c.fr;
        const frWins = c.fr > c.my;
        const total = Math.max(c.my, c.fr, 1);
        const myBarPct = Math.round((c.my / total) * 100);
        const frBarPct = Math.round((c.fr / total) * 100);

        return `
            <div class="battle-animate-in battle-cat-row" style="margin-bottom:0.7rem">
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:0.25rem">
                    <span style="font-size:0.72rem; font-weight:600; color:${myWins ? '#6c5ce7' : 'var(--text-secondary)'}; display:flex; align-items:center; gap:0.3rem">
                        ${myWins ? '<i class="fas fa-crown" style="font-size:0.55rem; color:#fdcb6e"></i>' : ''}
                        ${c.format(c.my)}
                    </span>
                    <span style="font-size:0.7rem; color:var(--text-muted); display:flex; align-items:center; gap:0.3rem">
                        <i class="fas ${c.icon}" style="font-size:0.65rem"></i> ${c.label}
                    </span>
                    <span style="font-size:0.72rem; font-weight:600; color:${frWins ? '#fd79a8' : 'var(--text-secondary)'}; display:flex; align-items:center; gap:0.3rem">
                        ${c.format(c.fr)}
                        ${frWins ? '<i class="fas fa-crown" style="font-size:0.55rem; color:#fdcb6e"></i>' : ''}
                    </span>
                </div>
                <div style="display:flex; gap:3px; height:8px">
                    <div style="flex:1; background:rgba(108,92,231,0.15); border-radius:4px 0 0 4px; overflow:hidden; direction:rtl">
                        <div class="battle-bar-animate" style="width:${myBarPct}%; height:100%; background:linear-gradient(90deg, #6c5ce7, #a855f7); border-radius:4px 0 0 4px; transition:width 1.5s cubic-bezier(0.4,0,0.2,1)"></div>
                    </div>
                    <div style="flex:1; background:rgba(253,121,168,0.15); border-radius:0 4px 4px 0; overflow:hidden">
                        <div class="battle-bar-animate" style="width:${frBarPct}%; height:100%; background:linear-gradient(90deg, #fd79a8, #a29bfe); border-radius:0 4px 4px 0; transition:width 1.5s cubic-bezier(0.4,0,0.2,1)"></div>
                    </div>
                </div>
            </div>`;
    }).join('');

    // Fun facts
    const funFacts = [];
    if (myStats.totalChapters > 10000) funFacts.push(`📖 ${myUsername} a lu plus de ${myStats.totalChapters.toLocaleString()} chapitres — c'est le niveau Légende !`);
    if (frStats.totalChapters > 10000) funFacts.push(`📖 ${escapeHtml(friendName)} a lu plus de ${frStats.totalChapters.toLocaleString()} chapitres — impressionnant !`);
    if (myStats.longestTitle.chapters > 500) funFacts.push(`🏆 Plus longue série de ${myUsername} : ${myStats.longestTitle.title} (${myStats.longestTitle.chapters} ch)`);
    if (frStats.longestTitle.chapters > 500) funFacts.push(`🏆 Plus longue série de ${escapeHtml(friendName)} : ${frStats.longestTitle.title} (${frStats.longestTitle.chapters} ch)`);
    if (diff / maxPower > 0.5) funFacts.push(`💀 Écart de puissance : ${dominanceRatio}% — DOMINATION !`);

    container.innerHTML = `
        <div class="battle-arena-main" style="position:relative; overflow:hidden">
            <!-- Arena Background Effects -->
            <div class="battle-bg-glow" style="position:absolute; top:-50%; left:-50%; width:200%; height:200%; background:radial-gradient(circle at 30% 40%, rgba(108,92,231,0.08) 0%, transparent 50%), radial-gradient(circle at 70% 60%, rgba(253,121,168,0.08) 0%, transparent 50%); animation:battleBgRotate 20s linear infinite; pointer-events:none; z-index:0"></div>

            <!-- TITLE -->
            <div class="battle-animate-in" style="text-align:center; position:relative; z-index:1; margin-bottom:1rem">
                <div style="font-size:0.7rem; text-transform:uppercase; letter-spacing:0.15em; color:var(--text-muted); margin-bottom:0.3rem">ManLore Arena Présente</div>
                <div style="font-family:var(--font-title); font-size:clamp(1.2rem, 4vw, 1.8rem); background:linear-gradient(135deg, #a855f7, #fd79a8, #fdcb6e); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; letter-spacing:0.03em; line-height:1.2">
                    ⚔️ DUEL DE LECTEURS ⚔️
                </div>
            </div>

            <!-- FIGHTER CARDS -->
            <div class="battle-animate-in" style="display:grid; grid-template-columns:1fr auto 1fr; gap:clamp(0.5rem, 2vw, 1.2rem); align-items:center; margin-bottom:1.2rem; position:relative; z-index:1">
                <!-- My Fighter -->
                <div class="fighter-card-epic" style="background:linear-gradient(135deg, rgba(108,92,231,0.15), rgba(168,85,247,0.08)); border:2px solid ${winnerIsMe ? '#00b894' : 'rgba(108,92,231,0.4)'}; border-radius:18px; padding:clamp(0.6rem, 2vw, 1.2rem); text-align:center; position:relative; overflow:hidden; ${winnerIsMe ? 'box-shadow:0 0 25px rgba(0,184,148,0.2)' : ''}">
                    ${winnerIsMe ? '<div class="winner-glow" style="position:absolute; top:-10px; left:50%; transform:translateX(-50%); font-size:1.5rem; animation:battleFloat 2s ease-in-out infinite">👑</div>' : ''}
                    <div style="font-size:clamp(1.8rem, 5vw, 2.8rem); margin-bottom:0.2rem; margin-top:${winnerIsMe ? '1rem' : '0'}">
                        <i class="fas fa-user-astronaut" style="color:#6c5ce7"></i>
                    </div>
                    <h4 style="font-family:var(--font-title); color:var(--text-primary); font-size:clamp(0.75rem, 2.5vw, 1rem); margin-bottom:0.15rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${escapeHtml(myUsername)}</h4>
                    <div style="font-family:var(--font-title); font-size:clamp(1rem, 3.5vw, 1.5rem); color:#6c5ce7; margin-bottom:0.5rem; line-height:1">
                        ${myPower.toLocaleString()}
                        <span style="font-size:0.6rem; color:var(--text-muted); display:block">POWER</span>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.3rem; font-size:0.62rem; color:var(--text-muted)">
                        <div>📚 ${myStats.totalTitles}</div>
                        <div>📖 ${myStats.totalChapters.toLocaleString()}</div>
                        <div>✅ ${myStats.completedCount}</div>
                        <div>⭐ ${myStats.avgRating.toFixed(1)}</div>
                    </div>
                    <!-- Power bar -->
                    <div style="margin-top:0.5rem; background:rgba(255,255,255,0.06); height:10px; border-radius:5px; overflow:hidden">
                        <div class="battle-bar-animate" style="width:${myPct}%; height:100%; background:linear-gradient(90deg, #6c5ce7, #a855f7); border-radius:5px; box-shadow:0 0 8px rgba(108,92,231,0.5)"></div>
                    </div>
                </div>

                <!-- VS Badge -->
                <div style="text-align:center; position:relative">
                    <div class="vs-badge-epic" style="width:clamp(40px, 8vw, 60px); height:clamp(40px, 8vw, 60px); background:linear-gradient(135deg, #a855f7, #fd79a8); border-radius:50%; display:flex; align-items:center; justify-content:center; font-family:var(--font-title); font-size:clamp(0.7rem, 2vw, 1rem); color:white; font-weight:900; box-shadow:0 0 20px rgba(168,85,247,0.4); animation:battlePulse 2s ease-in-out infinite">
                        VS
                    </div>
                </div>

                <!-- Friend Fighter -->
                <div class="fighter-card-epic" style="background:linear-gradient(135deg, rgba(253,121,168,0.15), rgba(162,155,254,0.08)); border:2px solid ${!winnerIsMe && !isDraw ? '#00b894' : 'rgba(253,121,168,0.4)'}; border-radius:18px; padding:clamp(0.6rem, 2vw, 1.2rem); text-align:center; position:relative; overflow:hidden; ${!winnerIsMe && !isDraw ? 'box-shadow:0 0 25px rgba(0,184,148,0.2)' : ''}">
                    ${!winnerIsMe && !isDraw ? '<div class="winner-glow" style="position:absolute; top:-10px; left:50%; transform:translateX(-50%); font-size:1.5rem; animation:battleFloat 2s ease-in-out infinite">👑</div>' : ''}
                    <div style="font-size:clamp(1.8rem, 5vw, 2.8rem); margin-bottom:0.2rem; margin-top:${!winnerIsMe && !isDraw ? '1rem' : '0'}">
                        <i class="fas fa-user-ninja" style="color:#fd79a8"></i>
                    </div>
                    <h4 style="font-family:var(--font-title); color:var(--text-primary); font-size:clamp(0.75rem, 2.5vw, 1rem); margin-bottom:0.15rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis">${escapeHtml(friendName)}</h4>
                    <div style="font-family:var(--font-title); font-size:clamp(1rem, 3.5vw, 1.5rem); color:#fd79a8; margin-bottom:0.5rem; line-height:1">
                        ${friendPower.toLocaleString()}
                        <span style="font-size:0.6rem; color:var(--text-muted); display:block">POWER</span>
                    </div>
                    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.3rem; font-size:0.62rem; color:var(--text-muted)">
                        <div>📚 ${frStats.totalTitles}</div>
                        <div>📖 ${frStats.totalChapters.toLocaleString()}</div>
                        <div>✅ ${frStats.completedCount}</div>
                        <div>⭐ ${frStats.avgRating.toFixed(1)}</div>
                    </div>
                    <div style="margin-top:0.5rem; background:rgba(255,255,255,0.06); height:10px; border-radius:5px; overflow:hidden">
                        <div class="battle-bar-animate" style="width:${friendPct}%; height:100%; background:linear-gradient(90deg, #fd79a8, #a29bfe); border-radius:5px; box-shadow:0 0 8px rgba(253,121,168,0.5)"></div>
                    </div>
                </div>
            </div>

            <!-- WINNER BANNER -->
            <div class="battle-animate-in winner-banner-epic" style="background:linear-gradient(135deg, ${winnerIsMe ? 'rgba(0,184,148,0.15), rgba(108,92,231,0.1)' : (isDraw ? 'rgba(116,185,255,0.15), rgba(162,155,254,0.1)' : 'rgba(253,121,168,0.15), rgba(253,203,110,0.1)')}); border:1px solid ${winnerIsMe ? '#00b894' : (isDraw ? '#74b9ff' : '#fdcb6e')}; border-radius:16px; padding:1rem; margin-bottom:1.2rem; text-align:center; animation:battlePulse 3s ease-in-out infinite; position:relative; z-index:1">
                <div style="font-size:2rem; margin-bottom:0.2rem">${winnerEmoji}</div>
                <h3 style="font-family:var(--font-title); font-size:clamp(0.9rem, 3vw, 1.2rem); color:${winnerIsMe ? '#00b894' : (isDraw ? '#74b9ff' : '#fdcb6e')}; margin:0">${winnerTitle}</h3>
                <p style="font-size:0.78rem; color:var(--text-primary); margin-top:0.3rem">${winnerSub}</p>
                ${!isDraw ? `<div style="margin-top:0.4rem; font-size:0.7rem; color:var(--text-muted)">Écart de puissance : <strong style="color:var(--text-primary)">${diff.toLocaleString()}</strong> PWR (${dominanceRatio}%)</div>` : ''}
                <div style="margin-top:0.4rem; font-size:0.7rem; color:var(--text-muted)">Catégories remportées : <strong style="color:#6c5ce7">${catWinsMe}</strong> vs <strong style="color:#fd79a8">${catWinsFr}</strong></div>
            </div>

            <!-- CATEGORY BREAKDOWNS -->
            <div class="battle-animate-in" style="position:relative; z-index:1; margin-bottom:1rem">
                <h4 style="font-family:var(--font-title); font-size:0.9rem; color:var(--text-primary); margin-bottom:0.6rem; display:flex; align-items:center; gap:0.4rem">
                    <i class="fas fa-chart-bar" style="color:#a855f7"></i> Breakdown par Catégorie
                </h4>
                ${categoriesHtml}
            </div>

            <!-- FUN FACTS -->
            ${funFacts.length > 0 ? `
            <div class="battle-animate-in" style="background:rgba(253,203,110,0.08); border:1px solid rgba(253,203,110,0.2); border-radius:14px; padding:0.8rem 1rem; position:relative; z-index:1">
                <h4 style="font-size:0.82rem; font-weight:700; color:#fdcb6e; margin-bottom:0.4rem; display:flex; align-items:center; gap:0.4rem"><i class="fas fa-fire"></i> Fun Facts</h4>
                ${funFacts.map(f => `<div style="font-size:0.72rem; color:var(--text-secondary); margin-bottom:0.2rem; line-height:1.4">${f}</div>`).join('')}
            </div>` : ''}
        </div>
    `;

    // Trigger confetti effect if there's a decisive winner
    if (!isDraw && diff / maxPower > 0.1) {
        setTimeout(() => launchBattleConfetti(winnerIsMe), 500);
    }
}

// ============ CONFETTI EFFECT ============
function launchBattleConfetti(isLeftWinner) {
    const container = document.getElementById('battleTabContent');
    if (!container) return;

    // Remove previous confetti
    container.querySelectorAll('.battle-confetti').forEach(e => e.remove());

    const colors = isLeftWinner
        ? ['#6c5ce7', '#a855f7', '#00b894', '#fdcb6e', '#ffffff']
        : ['#fd79a8', '#a29bfe', '#fdcb6e', '#00b894', '#ffffff'];

    const confettiCount = 35;
    const confettiContainer = document.createElement('div');
    confettiContainer.className = 'battle-confetti';
    confettiContainer.style.cssText = 'position:absolute; top:0; left:0; width:100%; height:100%; pointer-events:none; z-index:10; overflow:hidden';

    for (let i = 0; i < confettiCount; i++) {
        const piece = document.createElement('div');
        const size = Math.random() * 8 + 4;
        const isCircle = Math.random() > 0.5;
        piece.style.cssText = `
            position:absolute;
            width:${size}px;
            height:${isCircle ? size : size * 0.4}px;
            background:${colors[Math.floor(Math.random() * colors.length)]};
            border-radius:${isCircle ? '50%' : '2px'};
            top:-20px;
            left:${Math.random() * 100}%;
            opacity:${0.6 + Math.random() * 0.4};
            animation:confettiFall ${1.5 + Math.random() * 2}s ease-in forwards;
            animation-delay:${Math.random() * 1}s;
            transform:rotate(${Math.random() * 360}deg);
        `;
        confettiContainer.appendChild(piece);
    }
    container.style.position = 'relative';
    container.appendChild(confettiContainer);

    setTimeout(() => confettiContainer.remove(), 5000);
}

// ============ SWITCH TABS ============
function switchBattleTab(tab) {
    const tabs = {
        comparison: { btn: 'btnTabComparison', content: 'comparisonTabContent' },
        battle: { btn: 'btnTabBattle', content: 'battleTabContent' },
        catalog: { btn: 'btnTabCatalog', content: 'catalogViewTabContent' }
    };

    Object.entries(tabs).forEach(([key, { btn, content }]) => {
        const btnEl = document.getElementById(btn);
        const contentEl = document.getElementById(content);
        if (key === tab) {
            if (btnEl) btnEl.classList.add('active');
            if (contentEl) contentEl.classList.remove('hidden');
        } else {
            if (btnEl) btnEl.classList.remove('active');
            if (contentEl) contentEl.classList.add('hidden');
        }
    });
}
window.switchBattleTab = switchBattleTab;

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
        // Extract clean share code (e.g. ML-8A3F9X) from URL or protocol_handlers
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
