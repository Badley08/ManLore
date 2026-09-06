/* ============================================
   MANLORE v7.0.0 - ANALYSE.JS
   Analytics Avancés + Intégration Quêtes & Rangs
   ============================================ */

'use strict';

// Cache des dernières stats calculées pour le popup de détails
let lastStatsCache = null;
let lastItemsCache = null;

function formatReadingTime(totalMinutes) {
    if (totalMinutes <= 0) return '0 ' + i18n.t('stats.time.minutes', { minutes: 0 }).replace('0', '').trim();
    const days = Math.floor(totalMinutes / (24 * 60));
    const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
    const minutes = totalMinutes % 60;

    const parts = [];
    if (days > 0) parts.push(i18n.t('stats.time.days', { days }));
    if (hours > 0) parts.push(i18n.t('stats.time.hours', { hours }));
    if (minutes > 0 || parts.length === 0) parts.push(i18n.t('stats.time.minutes', { minutes }));
    return parts.join(' ');
}

function renderStats(items) {
    const container = document.getElementById('statsContainer');
    if (!container) return;
    if (!items || items.length === 0) {
        container.innerHTML = `
            <div id="questProgressionContainer"></div>
            <div class="empty-state">
                <i class="fas fa-chart-bar empty-state-icon"></i>
                <h3 class="empty-state-title">${i18n.t('stats.empty.title')}</h3>
                <p class="empty-state-text">${i18n.t('stats.empty.text')}</p>
            </div>
        `;
        if (typeof renderQuestUI === 'function') renderQuestUI();
        return;
    }

    const plain = items.map(i => i instanceof Parse.Object ? parseItemToObject(i) : i);
    const stats = computeStats(plain);
    lastStatsCache = stats;
    lastItemsCache = plain;
    if (window.questManager) {
        window.questManager.syncCollectionStats(plain);
    }
    container.innerHTML = `
        <div id="questProgressionContainer"></div>
        ${buildStatsHTML(stats, plain)}
    `;
    if (typeof renderQuestUI === 'function') renderQuestUI();
    animateBars();
}

function computeStats(items) {
    const total = items.length;
    const byStatus = {};
    const byType = {};
    const byGenre = {};
    const byRating = {1:0,2:0,3:0,4:0,5:0};
    const byMonth = {};
    const byDay = {};
    let totalChapters = 0;
    let ratedCount = 0;
    let totalRating = 0;
    let topRated = [];

    items.forEach(item => {
        const s = item.status || 'Inconnu';
        byStatus[s] = (byStatus[s] || 0) + 1;

        const t = item.type || 'Inconnu';
        byType[t] = (byType[t] || 0) + 1;

        const genres = Array.isArray(item.genres) ? item.genres : (item.genres ? item.genres.split(',').map(g => g.trim()) : []);
        genres.forEach(g => { if (g) byGenre[g] = (byGenre[g] || 0) + 1; });

        const r = parseInt(item.rating) || 0;
        if (r > 0) {
            byRating[r] = (byRating[r] || 0) + 1;
            totalRating += r;
            ratedCount++;
        }

        totalChapters += parseInt(item.chapters) || 0;

        const date = item.createdAt ? new Date(item.createdAt) : null;
        if (date && !isNaN(date)) {
            const monthKey = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}`;
            byMonth[monthKey] = (byMonth[monthKey] || 0) + 1;
            const dayKey = date.toISOString().split('T')[0];
            byDay[dayKey] = (byDay[dayKey] || 0) + 1;
        }

        if (r > 0) topRated.push({ title: item.title, rating: r, type: item.type });
    });

    topRated = topRated.sort((a, b) => b.rating - a.rating).slice(0, 10);
    const avgRating = ratedCount > 0 ? (totalRating / ratedCount).toFixed(1) : 0;
    const topGenres = Object.entries(byGenre).sort((a,b) => b[1]-a[1]).slice(0, 8);

    const now = new Date();
    const timeline = [];
    for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        const label = d.toLocaleDateString(i18n.lang || 'fr', { month: 'short', year: '2-digit' });
        timeline.push({ key, label, count: byMonth[key] || 0 });
    }
    const maxMonth = Math.max(...timeline.map(t => t.count), 1);
    const streak = window.questManager ? window.questManager.getStreak() : computeStreak(byDay);

    const heatmap = timeline.map(t => {
        const level = t.count === 0 ? 0 : t.count <= 2 ? 1 : t.count <= 5 ? 2 : t.count <= 10 ? 3 : 4;
        return { ...t, level };
    });

    const completed = byStatus['Terminé'] || byStatus['Completed'] || byStatus['Completado'] || 0;
    
    // Taux de complétion basé sur la réalisation des quêtes actives
    let completionRate = 0;
    if (window.questManager) {
        const dailyQ = window.questManager.getQuestsForTab('daily') || [];
        const weeklyQ = window.questManager.getQuestsForTab('weekly') || [];
        const totalQuests = [...dailyQ, ...weeklyQ];
        if (totalQuests.length > 0) {
            const done = totalQuests.filter(q => q.completed || q.claimed).length;
            completionRate = Math.round((done / totalQuests.length) * 100);
        }
    }
    if (completionRate === 0 && total > 0) {
        completionRate = Math.round((completed / total) * 100);
    }
    const bestGenre = topGenres.length > 0 ? topGenres[0][0] : '—';

    return {
        total, byStatus, byType, byGenre, byRating, topGenres,
        totalChapters, avgRating, ratedCount,
        topRated, timeline, maxMonth, streak, heatmap,
        completed, completionRate, bestGenre,
        reading: byStatus['En cours'] || byStatus['Reading'] || byStatus['Leyendo'] || 0,
        toRead: byStatus['À lire'] || byStatus['To Read'] || byStatus['Por leer'] || 0,
        dropped: byStatus['Abandonné'] || byStatus['Dropped'] || byStatus['Abandonado'] || 0,
    };
}

function computeStreak(byDay) {
    const days = Object.keys(byDay).sort().reverse();
    if (days.length === 0) return 0;
    const today = new Date().toISOString().split('T')[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    if (days[0] !== today && days[0] !== yesterday) return 0;
    let streak = 0;
    let current = new Date(days[0]);
    for (let i = 0; i < days.length; i++) {
        const d = new Date(days[i]);
        const diff = Math.round((current - d) / 86400000);
        if (diff <= 1) { streak++; current = d; }
        else break;
    }
    return streak;
}

function buildStatsHTML(s, items) {
    const statusColors = {
        'En cours': 'var(--color-success)', 'Reading': 'var(--color-success)', 'Leyendo': 'var(--color-success)',
        'Terminé': 'var(--color-primary)', 'Completed': 'var(--color-primary)', 'Completado': 'var(--color-primary)',
        'À lire': 'var(--color-warning)', 'To Read': 'var(--color-warning)', 'Por leer': 'var(--color-warning)',
        'Abandonné': 'var(--color-danger)', 'Dropped': 'var(--color-danger)', 'Abandonado': 'var(--color-danger)',
        'En pause': '#e67e22', 'On Hold': '#e67e22', 'En pausa': '#e67e22',
        'Re-lecture': '#3498db', 'Re-reading': '#3498db', 'Releyendo': '#3498db'
    };

    const qm = window.questManager;
    const activeDaysCount = qm?.data?.activeDaysThisYear?.size || qm?.data?.activeDaysThisMonth?.size || 1;
    const trashList = typeof loadTrashBin === 'function' ? loadTrashBin() : [];

    return `
    <!-- Quick CTA Banner to Full Interactive Graphs Popup -->
    <div class="section-card" style="background:linear-gradient(135deg, rgba(212,175,55,0.08) 0%, rgba(0,242,254,0.05) 100%); border:1px solid var(--border-color); cursor:pointer;" onclick="openStatsDetailModal()">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:1rem;">
            <div style="display:flex; align-items:center; gap:0.9rem;">
                <div style="font-size:1.6rem; color:var(--color-primary);"><i class="fas fa-chart-area"></i></div>
                <div>
                    <strong style="font-size:0.95rem; color:var(--text-primary); display:block">${i18n.t('stats.detailModal.bannerTitle') || 'Rapport Complet des Statistiques & Graphiques'}</strong>
                    <span class="text-xs text-muted">${i18n.t('stats.detailModal.bannerDesc') || 'Consultez la chronologie, le calendrier d\'activité, les genres et le top titres'}</span>
                </div>
            </div>
            <div style="font-size:1.2rem; color:var(--color-primary)"><i class="fas fa-chevron-right"></i></div>
        </div>
    </div>

    <!-- Cards Jours Actifs & Corbeille -->
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem; margin-bottom:1rem;">
        <div class="section-card" style="padding:0.9rem; text-align:center; background:var(--bg-card);">
            <div style="font-size:1.4rem; color:var(--color-primary); margin-bottom:0.2rem;"><i class="fas fa-calendar-check"></i></div>
            <div style="font-size:1.1rem; font-weight:800; color:var(--text-primary);">${activeDaysCount}</div>
            <div class="text-xs text-muted">${i18n.t('stats.totalActiveDays') || 'Jours d\'activité total'}</div>
        </div>
        <div class="section-card" style="padding:0.9rem; text-align:center; background:var(--bg-card); cursor:pointer;" onclick="openTrashBinModal()">
            <div style="font-size:1.4rem; color:#e74c3c; margin-bottom:0.2rem;"><i class="fas fa-trash-alt"></i></div>
            <div style="font-size:1.1rem; font-weight:800; color:var(--text-primary);">${trashList.length}</div>
            <div class="text-xs text-muted">${i18n.t('trash.title') || 'Corbeille (15j)'}</div>
        </div>
    </div>

    <!-- Insights -->
    <div class="section-card">
        <h3 class="section-title"><i class="fas fa-lightbulb"></i> <span>${i18n.t('stats.insights')}</span></h3>
        <div class="space-y">
            <div class="insight-card insight-info"><i class="fas fa-calendar-alt"></i><span>${i18n.t('stats.totalActiveDays') || 'Jours d\'activité total'} : <strong>${activeDaysCount} ${i18n.t('stats.days') || 'jours'}</strong></span></div>
            ${s.reading > 0 ? `<div class="insight-card insight-info"><i class="fas fa-book-reader"></i><span>${i18n.t('stats.insight.reading', { count: s.reading, plural: s.reading > 1 ? 's' : '' })}</span></div>` : ''}
            ${s.streak > 2 ? `<div class="insight-card insight-success"><i class="fas fa-fire"></i><span>${i18n.t('stats.insight.streak', { count: s.streak })}</span></div>` : ''}
            ${s.completionRate > 50 ? `<div class="insight-card insight-success"><i class="fas fa-trophy"></i><span>${i18n.t('stats.insight.completion')}</span></div>` : ''}
            ${s.dropped > 0 ? `<div class="insight-card insight-warning"><i class="fas fa-times-circle"></i><span>${i18n.t('stats.insight.dropped', { count: s.dropped, plural: s.dropped > 1 ? 's' : '' })}</span></div>` : ''}
            ${s.bestGenre !== '—' ? `<div class="insight-card insight-info"><i class="fas fa-star"></i><span>${i18n.t('stats.insight.genre', { genre: s.bestGenre })}</span></div>` : ''}
            ${s.totalChapters > 100 ? `<div class="insight-card insight-success"><i class="fas fa-book"></i><span>${i18n.t('stats.insight.chapters', { count: s.totalChapters })}</span></div>` : ''}
        </div>
    </div>
    `;
}

function openTrashBinModal() {
    renderTrashBinModal();
    if (typeof openModal === 'function') {
        openModal('trashModal');
    }
}
window.openTrashBinModal = openTrashBinModal;

function renderTrashBinModal() {
    const container = document.getElementById('trashModalList');
    if (!container) return;

    const trash = typeof loadTrashBin === 'function' ? loadTrashBin() : [];
    if (trash.length === 0) {
        container.innerHTML = `
            <div style="padding:2rem; text-align:center; color:var(--text-muted);">
                <i class="fas fa-trash" style="font-size:2rem; opacity:0.5; margin-bottom:0.5rem; display:block;"></i>
                <p>${i18n.t('trash.empty') || 'La corbeille est vide.'}</p>
            </div>
        `;
        return;
    }

    const now = Date.now();

    container.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:1rem; padding-bottom:0.5rem; border-bottom:1px solid var(--border-color);">
            <span class="text-xs text-muted">${i18n.t('trash.desc') || 'Rétention automatique 15 jours.'}</span>
            <button class="btn btn-secondary btn-sm" onclick="emptyTrashBin()" style="font-size:0.75rem; color:#e74c3c;">
                <i class="fas fa-fire"></i> ${i18n.t('trash.empty') || 'Vider tout'}
            </button>
        </div>
        <div class="space-y">
            ${trash.map(item => {
                const daysPassed = Math.floor((now - (item.deletedAt || now)) / (86400 * 1000));
                const daysLeft = Math.max(0, 15 - daysPassed);
                return `
                    <div style="display:flex; align-items:center; justify-content:space-between; padding:0.75rem; border-radius:8px; background:var(--bg-card); border:1px solid var(--border-color); gap:0.75rem;">
                        <div style="display:flex; align-items:center; gap:0.75rem; min-width:0;">
                            ${item.image ? `<img src="${escapeHtml(item.image)}" style="width:36px; height:48px; object-fit:cover; border-radius:4px;">` : `<div style="width:36px; height:48px; background:var(--border-color); border-radius:4px; display:flex; align-items:center; justify-content:center;"><i class="fas fa-book text-muted"></i></div>`}
                            <div style="min-width:0;">
                                <div style="font-weight:600; color:var(--text-primary); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">${escapeHtml(item.title)}</div>
                                <span class="text-xs" style="color:#e67e22;"><i class="fas fa-clock"></i> ${i18n.t('trash.daysLeft', { days: daysLeft }) || `${daysLeft}j restants`}</span>
                            </div>
                        </div>
                        <div style="display:flex; gap:0.4rem; flex-shrink:0;">
                            <button class="btn btn-primary btn-sm" onclick="restoreFromTrashBin('${item.id}')" title="${i18n.t('trash.restore') || 'Restaurer'}">
                                <i class="fas fa-undo"></i> ${i18n.t('trash.restore') || 'Restaurer'}
                            </button>
                            <button class="btn btn-secondary btn-sm" onclick="permanentlyDeleteFromTrash('${item.id}')" title="${i18n.t('trash.deletePermanent') || 'Supprimer'}">
                                <i class="fas fa-times"></i>
                            </button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}
window.renderTrashBinModal = renderTrashBinModal;

function openStatsDetailModal() {
    if (!lastStatsCache || !lastItemsCache) return;
    const s = lastStatsCache;
    const statusColors = {
        'En cours': 'var(--color-success)', 'Reading': 'var(--color-success)', 'Leyendo': 'var(--color-success)',
        'Terminé': 'var(--color-primary)', 'Completed': 'var(--color-primary)', 'Completado': 'var(--color-primary)',
        'À lire': 'var(--color-warning)', 'To Read': 'var(--color-warning)', 'Por leer': 'var(--color-warning)',
        'Abandonné': 'var(--color-danger)', 'Dropped': 'var(--color-danger)', 'Abandonado': 'var(--color-danger)',
        'En pause': '#e67e22', 'On Hold': '#e67e22', 'En pausa': '#e67e22',
        'Re-lecture': '#3498db', 'Re-reading': '#3498db', 'Releyendo': '#3498db'
    };

    const modalBody = document.getElementById('statsDetailModalBody');
    if (!modalBody) return;

    modalBody.innerHTML = `
        <!-- Heatmap -->
        <div class="section-card" style="margin-bottom:1.25rem">
            <h3 class="section-title"><i class="fas fa-th"></i> <span>${i18n.t('stats.heatmap')}</span></h3>
            <div style="margin-bottom:0.5rem">
                <div class="heatmap-grid">
                    ${s.heatmap.map(h => {
                        const pluralStr = h.count !== 1 ? 's' : '';
                        const tooltipText = i18n.t('stats.heatmap.added', { count: h.count, plural: pluralStr });
                        return `<div class="heatmap-cell level-${h.level}" title="${h.label}: ${tooltipText}"></div>`;
                    }).join('')}
                </div>
                <div style="display:flex;justify-content:space-between;margin-top:0.5rem">
                    ${s.heatmap.filter((_, i) => i % 3 === 0).map(h => `<span class="text-xs text-muted">${h.label}</span>`).join('')}
                </div>
            </div>
        </div>

        <!-- Timeline -->
        <div class="section-card" style="margin-bottom:1.25rem">
            <h3 class="section-title"><i class="fas fa-chart-line"></i> <span>${i18n.t('stats.timeline')}</span></h3>
            <div class="space-y">
                ${s.timeline.filter(t => t.count > 0).length === 0
                    ? `<p class="text-muted text-sm">${i18n.t('stats.noMonthlyActivity')}</p>`
                    : s.timeline.map(t => `
                    <div class="timeline-row">
                        <span class="timeline-month">${t.label}</span>
                        <div class="timeline-track">
                            <div class="timeline-fill" data-width="${Math.round((t.count / s.maxMonth) * 100)}" style="width:0%"></div>
                        </div>
                        <span class="timeline-num">${t.count}</span>
                    </div>
                `).join('')}
            </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem;margin-bottom:1.25rem" class="stats-split-grid">
            <!-- By Type -->
            <div class="section-card">
                <h3 class="section-title"><i class="fas fa-layer-group"></i> <span>${i18n.t('stats.byType')}</span></h3>
                <div class="space-y">
                    ${Object.entries(s.byType).sort((a,b) => b[1]-a[1]).map(([type, count]) => {
                        const typeLabel = i18n.t(`type.${type.toLowerCase().replace(/\s+/g,'')}`) || type;
                        return `
                            <div class="progress-bar-wrap">
                                <div class="progress-header">
                                    <span>${typeLabel}</span><span style="color:var(--color-primary);font-weight:700">${count}</span>
                                </div>
                                <div class="progress-bar-track">
                                    <div class="progress-bar-fill" data-width="${Math.round((count/s.total)*100)}" style="width:0%"></div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>

            <!-- By Status -->
            <div class="section-card">
                <h3 class="section-title"><i class="fas fa-tasks"></i> <span>${i18n.t('stats.byStatus')}</span></h3>
                <div class="space-y">
                    ${Object.entries(s.byStatus).sort((a,b) => b[1]-a[1]).map(([status, count]) => {
                        const cleanStatus = status.toLowerCase().replace(/\s+/g,'-').replace(/[àâä]/g,'a').replace(/[éèêë]/g,'e').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
                        const statusLabel = i18n.t(`status.${cleanStatus}`) || status;
                        return `
                            <div class="progress-bar-wrap">
                                <div class="progress-header">
                                    <span>${statusLabel}</span><span style="color:${statusColors[status]||'var(--color-primary)'};font-weight:700">${count}</span>
                                </div>
                                <div class="progress-bar-track">
                                    <div class="progress-bar-fill" data-width="${Math.round((count/s.total)*100)}" style="width:0%;background:${statusColors[status]||'var(--color-primary)'}"></div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        </div>

        <!-- Ratings -->
        <div class="section-card" style="margin-bottom:1.25rem">
            <h3 class="section-title"><i class="fas fa-star"></i> <span>${i18n.t('stats.ratings')}</span></h3>
            ${s.ratedCount === 0
                ? `<p class="text-muted text-sm">${i18n.t('stats.noRatings')}</p>`
                : `<div class="space-y">
                    ${[5,4,3,2,1].map(r => {
                        const count = s.byRating[r] || 0;
                        const maxR = Math.max(...Object.values(s.byRating), 1);
                        return `<div class="rating-row">
                            <div class="rating-stars-display">
                                ${[1,2,3,4,5].map(i => `<i class="${i <= r ? 'fas' : 'far'} fa-star"></i>`).join('')}
                            </div>
                            <div class="rating-bar-track">
                                <div class="rating-bar-fill" data-width="${Math.round((count/maxR)*100)}" style="width:0%"></div>
                            </div>
                            <span class="rating-count-label">${count}</span>
                        </div>`;
                    }).join('')}
                </div>`
            }
        </div>

        <!-- Top Genres -->
        ${s.topGenres.length > 0 ? `
        <div class="section-card" style="margin-bottom:1.25rem">
            <h3 class="section-title"><i class="fas fa-tags"></i> <span>${i18n.t('stats.genres')}</span></h3>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:0.75rem">
                ${s.topGenres.map(([genre, count]) => {
                    const countText = count === 1 ? i18n.t('wishlist.count.single') : i18n.t('wishlist.count.plural', { count });
                    return `
                        <div class="genre-badge-large">
                            <span style="font-weight:700;font-size:0.85rem">${escapeHtml(genre)}</span>
                            <span class="text-xs text-muted">${countText}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>` : ''}

        <!-- Top Rated -->
        ${s.topRated.length > 0 ? `
        <div class="section-card">
            <h3 class="section-title"><i class="fas fa-trophy"></i> <span>${i18n.t('stats.topRated')}</span></h3>
            <div class="space-y">
                ${s.topRated.map((item, idx) => `
                    <div class="top-item">
                        <span class="top-rank">#${idx+1}</span>
                        <span class="top-title">${escapeHtml(item.title)}</span>
                        <div class="top-stars">
                            ${[1,2,3,4,5].map(i => `<i class="${i <= item.rating ? 'fas' : 'far'} fa-star"></i>`).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>` : ''}
    `;

    if (typeof openModal === 'function') {
        openModal('statsDetailModal');
    }
    animateBars();
}
window.openStatsDetailModal = openStatsDetailModal;

function animateBars() {
    requestAnimationFrame(() => {
        document.querySelectorAll('.progress-bar-fill[data-width], .timeline-fill[data-width], .rating-bar-fill[data-width]').forEach(el => {
            const w = el.getAttribute('data-width');
            setTimeout(() => { el.style.width = w + '%'; }, 100);
        });
    });
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

console.log('[Analyse v7.0.0] Module loaded');
