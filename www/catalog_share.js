/* ============================================
   MANLORE v9.0.2 - CATALOG_SHARE.JS
   Partage Temporaire de Catalogue, Révocation, 
   Comparaison de Collections & Mode Battle ⚔️
   ============================================ */

'use strict';

let activeShareLinks = [];

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

    let createdSuccess = false;
    let shareUrl = `${window.location.origin}${window.location.pathname}?share=${shareCode}`;

    try {
        if (typeof back4appApiCall === 'function') {
            const res = await back4appApiCall('/classes/SharedCatalogs', 'POST', payload, sessionToken);
            if (res.ok) {
                createdSuccess = true;
            }
        }
    } catch(e) {
        console.warn('Cloud share save note:', e);
    }

    // Save locally to track active links
    let localLinks = [];
    try {
        localLinks = JSON.parse(localStorage.getItem('manlore_active_share_links') || '[]');
    } catch {}

    const newLinkObj = {
        shareCode,
        durationHours,
        expiresAt,
        shareUrl,
        createdAt: new Date().toISOString(),
        isRevoked: false
    };

    localLinks.unshift(newLinkObj);
    localStorage.setItem('manlore_active_share_links', JSON.stringify(localLinks));
    activeShareLinks = localLinks;

    renderActiveShareLinksList();
    return { success: true, shareCode, shareUrl, expiresAt };
}
window.createSharedCatalogLink = createSharedCatalogLink;

// ============ REVOKE LINK ============
async function revokeSharedCatalogLink(shareCode) {
    if (!shareCode) return { success: false };

    const user = typeof Parse !== 'undefined' && Parse.User ? Parse.User.current() : null;
    const sessionToken = user ? user.getSessionToken() : null;

    // Update in Cloud if possible
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

    // Update local list
    try {
        let localLinks = JSON.parse(localStorage.getItem('manlore_active_share_links') || '[]');
        localLinks = localLinks.map(l => l.shareCode === shareCode ? { ...l, isRevoked: true } : l);
        localStorage.setItem('manlore_active_share_links', JSON.stringify(localLinks));
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

    try {
        activeShareLinks = JSON.parse(localStorage.getItem('manlore_active_share_links') || '[]');
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
            <div class="share-link-item" style="background:rgba(0,0,0,0.3); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:0.75rem 1rem; margin-bottom:0.6rem; display:flex; align-items:center; justify-content:space-between; gap:0.6rem">
                <div style="min-width:0; flex:1">
                    <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.2rem">
                        <strong style="color:var(--color-secondary); font-family:var(--font-title); font-size:0.9rem">${l.shareCode}</strong>
                        <span class="badge badge-info" style="font-size:0.68rem"><i class="fas fa-clock"></i> Expire dans ${timeStr}</span>
                    </div>
                    <p style="font-size:0.75rem; color:var(--text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin:0">${l.shareUrl}</p>
                </div>
                <div style="display:flex; gap:0.4rem">
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

    // Open Comparison & Battle Modal
    openBattleAndComparisonModal(catalogData);
}
window.fetchAndOpenSharedCatalog = fetchAndOpenSharedCatalog;

// ============ CALCULATE BATTLE POWER SCORE ============
function calculateBattlePower(items = []) {
    if (!Array.isArray(items)) return 0;
    
    let totalChapters = 0;
    let completedCount = 0;
    let totalRating = 0;
    let ratedCount = 0;

    items.forEach(i => {
        const ch = typeof i.chapters === 'number' ? i.chapters : (parseInt(i.chapters, 10) || 0);
        totalChapters += ch;
        if ((i.status || '').toLowerCase().includes('terminé') || (i.status || '').toLowerCase().includes('completed')) {
            completedCount++;
        }
        if (i.rating && i.rating > 0) {
            totalRating += i.rating;
            ratedCount++;
        }
    });

    const avgRating = ratedCount > 0 ? (totalRating / ratedCount) : 3;

    // Power Score Formula
    const score = (totalChapters * 12) + (completedCount * 180) + (items.length * 35) + Math.round(avgRating * 45);
    return score;
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

    // 1. Render Comparison View
    renderComparisonView(myCollection, friendItems, friendUsername);

    // 2. Render Battle Mode Arena ⚔️
    renderBattleArena(myCollection, friendItems, friendUsername);

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
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

    // Stats calculations
    const myTotalCh = myItems.reduce((acc, i) => acc + (parseInt(i.chapters, 10) || 0), 0);
    const friendTotalCh = friendItems.reduce((acc, i) => acc + (parseInt(i.chapters, 10) || 0), 0);

    const commonHtml = commonTitles.length > 0 ? commonTitles.map(c => {
        const myCh = parseInt(c.my.chapters, 10) || 0;
        const frCh = parseInt(c.friend.chapters, 10) || 0;
        const diff = myCh - frCh;
        const leaderBadge = diff > 0 
            ? `<span class="badge badge-success" style="font-size:0.7rem"><i class="fas fa-crown"></i> Vous (+${diff} chap)</span>`
            : (diff < 0 ? `<span class="badge badge-warning" style="font-size:0.7rem"><i class="fas fa-crown"></i> ${escapeHtml(friendName)} (+${Math.abs(diff)} chap)</span>` : `<span class="badge badge-info" style="font-size:0.7rem">Égalité (${myCh} chap)</span>`);

        return `
            <div style="background:rgba(0,0,0,0.25); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:0.75rem 1rem; margin-bottom:0.6rem; display:flex; align-items:center; justify-content:space-between; gap:0.75rem; flex-wrap:wrap">
                <div style="display:flex; align-items:center; gap:0.75rem; min-width:200px">
                    <img src="${c.my.image || c.my.imageUrl || 'manlore-logo.png'}" alt="Cover" style="width:40px; height:56px; object-fit:cover; border-radius:6px; border:1px solid var(--border-color)">
                    <div>
                        <strong style="color:var(--text-primary); font-size:0.9rem; display:block">${escapeHtml(c.my.title)}</strong>
                        <span class="text-xs text-muted">${escapeHtml(c.my.type || 'Manga')} • Commun</span>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:1.2rem">
                    <div style="text-align:center">
                        <small style="color:var(--text-muted); font-size:0.7rem">Vous</small>
                        <div style="font-weight:700; color:var(--color-primary); font-size:0.9rem">${myCh} ch</div>
                    </div>
                    <div style="color:var(--text-muted); font-size:0.8rem">vs</div>
                    <div style="text-align:center">
                        <small style="color:var(--text-muted); font-size:0.7rem">${escapeHtml(friendName)}</small>
                        <div style="font-weight:700; color:var(--color-secondary); font-size:0.9rem">${frCh} ch</div>
                    </div>
                    <div>${leaderBadge}</div>
                </div>
            </div>`;
    }).join('') : `<div class="empty-state" style="padding:1.5rem"><i class="fas fa-folder-open"></i><p>Aucun titre en commun pour le moment.</p></div>`;

    container.innerHTML = `
        <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap:1rem; margin-bottom:1.5rem">
            <div class="section-card" style="margin:0; text-align:center; padding:1rem">
                <i class="fas fa-handshake" style="font-size:1.4rem; color:var(--color-primary); margin-bottom:0.3rem"></i>
                <div style="font-size:1.4rem; font-family:var(--font-title); color:var(--text-primary)">${commonTitles.length}</div>
                <div style="font-size:0.75rem; color:var(--text-muted)">Titres en commun</div>
            </div>
            <div class="section-card" style="margin:0; text-align:center; padding:1rem">
                <i class="fas fa-book-open" style="font-size:1.4rem; color:var(--color-success); margin-bottom:0.3rem"></i>
                <div style="font-size:1.4rem; font-family:var(--font-title); color:var(--color-success)">${myTotalCh}</div>
                <div style="font-size:0.75rem; color:var(--text-muted)">Vos chapitres lus</div>
            </div>
            <div class="section-card" style="margin:0; text-align:center; padding:1rem">
                <i class="fas fa-user-friends" style="font-size:1.4rem; color:var(--color-secondary); margin-bottom:0.3rem"></i>
                <div style="font-size:1.4rem; font-family:var(--font-title); color:var(--color-secondary)">${friendTotalCh}</div>
                <div style="font-size:0.75rem; color:var(--text-muted)">Chapitres de ${escapeHtml(friendName)}</div>
            </div>
        </div>

        <h4 style="font-family:var(--font-title); color:var(--color-secondary); font-size:1.05rem; margin-bottom:0.8rem; display:flex; align-items:center; gap:0.5rem">
            <i class="fas fa-list-check"></i> Comparatif des Titres Communs (${commonTitles.length})
        </h4>
        ${commonHtml}
    `;
}

function renderBattleArena(myItems, friendItems, friendName) {
    const container = document.getElementById('battleTabContent');
    if (!container) return;

    const myPower = calculateBattlePower(myItems);
    const friendPower = calculateBattlePower(friendItems);
    const maxPower = Math.max(myPower, friendPower, 100);

    const myPct = Math.round((myPower / maxPower) * 100);
    const friendPct = Math.round((friendPower / maxPower) * 100);

    let winnerName = 'Égalité Parfaite !';
    let winnerMessage = 'Deux grands maîtres de la lecture à égalité !';
    let winnerIsMe = false;

    if (myPower > friendPower) {
        winnerName = 'VICTOIRE DE VOUS !';
        winnerMessage = `Vous surpassez ${escapeHtml(friendName)} avec une puissance de lecture déchaînée !`;
        winnerIsMe = true;
    } else if (friendPower > myPower) {
        winnerName = `VICTOIRE DE ${escapeHtml(friendName).toUpperCase()} !`;
        winnerMessage = `${escapeHtml(friendName)} remporte ce duel éteignant la concurrence !`;
    }

    container.innerHTML = `
        <div class="battle-arena-wrapper" style="background:linear-gradient(180deg, rgba(168,85,247,0.12) 0%, rgba(13,13,26,0.95) 100%); border:1px solid rgba(168,85,247,0.3); border-radius:var(--radius-xl); padding:1.5rem; text-align:center; position:relative; overflow:hidden">
            <div style="font-family:var(--font-title); font-size:1.8rem; color:#a855f7; margin-bottom:0.2rem; letter-spacing:0.05em">
                ⚔️ DUEL DE LECTEURS MANLORE ⚔️
            </div>
            <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1.5rem">Affrontement suprême des scores de puissance</p>

            <!-- Winner Banner -->
            <div class="winner-banner" style="background:linear-gradient(135deg, rgba(253,203,110,0.2), rgba(225,112,85,0.2)); border:1px solid #fdcb6e; border-radius:var(--radius-lg); padding:1rem; margin-bottom:1.8rem; animation:pulse 2s infinite">
                <i class="fas fa-trophy" style="font-size:2rem; color:#fdcb6e; margin-bottom:0.4rem; display:block"></i>
                <h3 style="font-family:var(--font-title); font-size:1.3rem; color:#fdcb6e; margin:0">${winnerName}</h3>
                <p style="font-size:0.8rem; color:var(--text-primary); margin-top:0.3rem">${winnerMessage}</p>
            </div>

            <!-- Duel Combatants Grid -->
            <div style="display:grid; grid-template-columns:1fr auto 1fr; gap:1.2rem; align-items:center; margin-bottom:1.5rem">
                <!-- My Fighter -->
                <div class="fighter-card" style="background:rgba(0,0,0,0.35); border:2px solid ${winnerIsMe ? '#00b894' : 'var(--color-primary)'}; border-radius:var(--radius-lg); padding:1.2rem; text-align:center">
                    <div style="font-size:2.5rem; color:var(--color-primary); margin-bottom:0.3rem"><i class="fas fa-user-astronaut"></i></div>
                    <h4 style="font-family:var(--font-title); color:var(--text-primary); font-size:1.1rem; margin-bottom:0.2rem">Vous</h4>
                    <div style="font-family:var(--font-title); font-size:1.6rem; color:var(--color-primary); margin-bottom:0.6rem">${myPower.toLocaleString()} <small style="font-size:0.75rem">PWR</small></div>
                    <div style="background:rgba(255,255,255,0.08); height:12px; border-radius:6px; overflow:hidden">
                        <div style="width:${myPct}%; height:100%; background:linear-gradient(90deg, #6c5ce7, #a855f7); border-radius:6px; transition:width 1s ease"></div>
                    </div>
                </div>

                <div style="font-family:var(--font-title); font-size:2rem; color:#a855f7">VS</div>

                <!-- Friend Fighter -->
                <div class="fighter-card" style="background:rgba(0,0,0,0.35); border:2px solid ${!winnerIsMe && myPower !== friendPower ? '#00b894' : 'var(--color-secondary)'}; border-radius:var(--radius-lg); padding:1.2rem; text-align:center">
                    <div style="font-size:2.5rem; color:var(--color-secondary); margin-bottom:0.3rem"><i class="fas fa-user-ninja"></i></div>
                    <h4 style="font-family:var(--font-title); color:var(--text-primary); font-size:1.1rem; margin-bottom:0.2rem">${escapeHtml(friendName)}</h4>
                    <div style="font-family:var(--font-title); font-size:1.6rem; color:var(--color-secondary); margin-bottom:0.6rem">${friendPower.toLocaleString()} <small style="font-size:0.75rem">PWR</small></div>
                    <div style="background:rgba(255,255,255,0.08); height:12px; border-radius:6px; overflow:hidden">
                        <div style="width:${friendPct}%; height:100%; background:linear-gradient(90deg, #a29bfe, #fd79a8); border-radius:6px; transition:width 1s ease"></div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Switch tabs in Catalog Battle Modal
function switchBattleTab(tab) {
    const compBtn = document.getElementById('btnTabComparison');
    const battleBtn = document.getElementById('btnTabBattle');
    const compContent = document.getElementById('comparisonTabContent');
    const battleContent = document.getElementById('battleTabContent');

    if (tab === 'battle') {
        if (battleBtn) battleBtn.classList.add('active');
        if (compBtn) compBtn.classList.remove('active');
        if (battleContent) battleContent.classList.remove('hidden');
        if (compContent) compContent.classList.add('hidden');
    } else {
        if (compBtn) compBtn.classList.add('active');
        if (battleBtn) battleBtn.classList.remove('active');
        if (compContent) compContent.classList.remove('hidden');
        if (battleContent) battleContent.classList.add('hidden');
    }
}
window.switchBattleTab = switchBattleTab;

// Auto-check URL for share code parameter (e.g. ?share=ML-8A3F9X)
document.addEventListener('DOMContentLoaded', () => {
    renderActiveShareLinksList();

    const urlParams = new URLSearchParams(window.location.search);
    const shareCode = urlParams.get('share');
    if (shareCode) {
        setTimeout(() => fetchAndOpenSharedCatalog(shareCode), 800);
    }
});
