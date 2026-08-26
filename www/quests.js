/* ============================================
   MANLORE v5.0.1 - QUESTS.JS
   Progression Globale & Système de Quêtes de Chasseur de Lore
   ============================================ */

'use strict';

const QUESTS_STORAGE_KEY = 'manlore_quest_progression';

const HUNTER_RANKS = [
    { rank: 'E', title: 'Novice du Lore', minExp: 0, maxExp: 100, color: '#95a5a6', badge: '🔰' },
    { rank: 'D', title: 'Lecteur Curieux', minExp: 100, maxExp: 300, color: '#2ecc71', badge: '🗡️' },
    { rank: 'C', title: 'Chasseur de Chapitres', minExp: 300, maxExp: 700, color: '#3498db', badge: '⚔️' },
    { rank: 'B', title: 'Explorateur d\'Univers', minExp: 700, maxExp: 1500, color: '#9b59b6', badge: '🛡️' },
    { rank: 'A', title: 'Érudit des Mondes', minExp: 1500, maxExp: 3000, color: '#f39c12', badge: '👑' },
    { rank: 'S', title: 'Seigneur du ManLore', minExp: 3000, maxExp: 6000, color: '#e74c3c', badge: '🔥' },
    { rank: 'National', title: 'Grand Archiviste Éternel', minExp: 6000, maxExp: Infinity, color: '#00f2fe', badge: '⚡' }
];

class QuestManager {
    constructor() {
        this.data = this.loadProgression();
        this.checkDailyReset();
    }

    loadProgression() {
        try {
            const raw = localStorage.getItem(QUESTS_STORAGE_KEY);
            if (raw) return JSON.parse(raw);
        } catch {}

        return {
            exp: 0,
            lastDailyDate: new Date().toISOString().split('T')[0],
            completedQuests: {},
            dailyProgress: {
                chaptersReadToday: 0,
                titlesAddedToday: 0,
                ratedToday: 0,
                viewedStatsToday: false
            }
        };
    }

    saveProgression() {
        try {
            localStorage.setItem(QUESTS_STORAGE_KEY, JSON.stringify(this.data));
        } catch (e) {
            console.warn('[Quests] Erreur sauvegarde', e);
        }
    }

    checkDailyReset() {
        const today = new Date().toISOString().split('T')[0];
        if (this.data.lastDailyDate !== today) {
            this.data.lastDailyDate = today;
            this.data.dailyProgress = {
                chaptersReadToday: 0,
                titlesAddedToday: 0,
                ratedToday: 0,
                viewedStatsToday: false
            };
            this.saveProgression();
        }
    }

    getCurrentRankInfo() {
        const currentExp = this.data.exp || 0;
        let currentRank = HUNTER_RANKS[0];
        let nextRank = HUNTER_RANKS[1];

        for (let i = 0; i < HUNTER_RANKS.length; i++) {
            if (currentExp >= HUNTER_RANKS[i].minExp) {
                currentRank = HUNTER_RANKS[i];
                nextRank = HUNTER_RANKS[i + 1] || null;
            }
        }

        const expInCurrentRank = currentExp - currentRank.minExp;
        const totalExpForRank = nextRank ? (nextRank.minExp - currentRank.minExp) : 1000;
        const percent = nextRank ? Math.min(100, Math.round((expInCurrentRank / totalExpForRank) * 100)) : 100;

        return {
            rank: currentRank.rank,
            title: currentRank.title,
            badge: currentRank.badge,
            color: currentRank.color,
            currentExp,
            expInCurrentRank,
            totalExpForRank,
            percent,
            nextRankTitle: nextRank ? nextRank.title : 'Niveau Maximum'
        };
    }

    addExp(amount, reason = '') {
        const before = this.getCurrentRankInfo();
        this.data.exp = (this.data.exp || 0) + amount;
        this.saveProgression();
        const after = this.getCurrentRankInfo();

        if (window.showToast) {
            window.showToast(`+${amount} EXP: ${reason}`, 'success');
        }

        if (before.rank !== after.rank) {
            if (window.showToast) {
                window.showToast(`🎉 Rang supérieur débloqué : [Rang ${after.rank}] ${after.title} !`, 'success');
            }
        }

        if (typeof renderQuestUI === 'function') {
            renderQuestUI();
        }
    }

    onChapterRead(count = 1) {
        this.checkDailyReset();
        this.data.dailyProgress.chaptersReadToday += count;
        this.addExp(count * 5, `${count} chapitre(s) lu(s)`);
        this.saveProgression();
    }

    onTitleAdded() {
        this.checkDailyReset();
        this.data.dailyProgress.titlesAddedToday += 1;
        this.addExp(25, 'Nouvelle œuvre enregistrée');
        this.saveProgression();
    }

    onTitleRated() {
        this.checkDailyReset();
        this.data.dailyProgress.ratedToday += 1;
        this.addExp(15, 'Évaluation enregistrée');
        this.saveProgression();
    }

    getDailyQuests(items = []) {
        this.checkDailyReset();
        const p = this.data.dailyProgress;

        return [
            {
                id: 'daily_read',
                title: 'Lecteur Assidu',
                desc: 'Lire au moins 3 chapitres aujourd\'hui',
                current: Math.min(3, p.chaptersReadToday),
                target: 3,
                rewardExp: 30,
                completed: p.chaptersReadToday >= 3,
                icon: 'fa-book-open'
            },
            {
                id: 'daily_add',
                title: 'Découvreur de Trésors',
                desc: 'Ajouter ou importer une œuvre dans la collection',
                current: Math.min(1, p.titlesAddedToday),
                target: 1,
                rewardExp: 25,
                completed: p.titlesAddedToday >= 1,
                icon: 'fa-plus'
            },
            {
                id: 'daily_rate',
                title: 'Critique du Jour',
                desc: 'Donner une note à une œuvre de votre liste',
                current: Math.min(1, p.ratedToday),
                target: 1,
                rewardExp: 20,
                completed: p.ratedToday >= 1,
                icon: 'fa-star'
            }
        ];
    }
}

window.questManager = new QuestManager();

function renderQuestUI() {
    const container = document.getElementById('questProgressionContainer');
    if (!container) return;

    const rankInfo = window.questManager.getCurrentRankInfo();
    const quests = window.questManager.getDailyQuests();

    container.innerHTML = `
        <div class="quest-card-modern">
            <div class="quest-header-flex">
                <div class="quest-rank-badge" style="background: ${rankInfo.color}22; border-color: ${rankInfo.color}">
                    <span class="quest-badge-icon">${rankInfo.badge}</span>
                    <div>
                        <div class="quest-rank-level" style="color: ${rankInfo.color}">Rang ${rankInfo.rank}</div>
                        <div class="quest-rank-title">${rankInfo.title}</div>
                    </div>
                </div>
                <div class="quest-exp-display">
                    <span class="quest-exp-number">${rankInfo.currentExp}</span> <span class="quest-exp-label">EXP Total</span>
                </div>
            </div>

            <div class="quest-bar-wrapper">
                <div class="quest-bar-track">
                    <div class="quest-bar-fill" style="width: ${rankInfo.percent}%; background: linear-gradient(90deg, ${rankInfo.color}, #00f2fe);"></div>
                </div>
                <div class="quest-bar-labels">
                    <span>${rankInfo.expInCurrentRank} / ${rankInfo.totalExpForRank} EXP vers prochain rang</span>
                    <span style="font-weight:700;">${rankInfo.percent}%</span>
                </div>
            </div>

            <div class="quest-daily-title">
                <i class="fas fa-scroll"></i> Quêtes Quotidiennes
            </div>

            <div class="quest-list">
                ${quests.map(q => `
                    <div class="quest-item-box ${q.completed ? 'completed' : ''}">
                        <div class="quest-icon-bubble ${q.completed ? 'done' : ''}">
                            <i class="fas ${q.completed ? 'fa-check' : q.icon}"></i>
                        </div>
                        <div class="quest-info-content">
                            <div class="quest-name">${q.title} <span class="quest-reward">+${q.rewardExp} EXP</span></div>
                            <div class="quest-sub">${q.desc}</div>
                        </div>
                        <div class="quest-status-count">
                            ${q.current} / ${q.target}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}
