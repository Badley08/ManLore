/* ============================================
   MANLORE v5.0.1 - QUESTS.JS
   Multi-period Quest System (Daily, Weekly, Monthly, Annual, Rank)
   Multi-language Support (FR, EN, ES) & Rank Overview Modal
   ============================================ */

'use strict';

const QUESTS_STORAGE_KEY = 'manlore_quest_progression_v5';

const QUEST_I18N = {
    fr: {
        rank: 'Rang',
        expTotal: 'EXP Total',
        towards: 'vers',
        maxRank: 'Niveau Maximum',
        tabDaily: 'Quotidiennes',
        tabWeekly: 'Hebdo',
        tabMonthly: 'Mensuelles',
        tabAnnual: 'Annuelles',
        noQuests: 'Aucune quête disponible',
        yourRank: 'VOTRE RANG',
        expRequired: 'EXP requis',
        missingExp: 'Il vous manque <strong>{exp} EXP</strong> pour atteindre le rang <strong>{title}</strong>.',
        maxRankCongrats: 'Félicitations ! Vous avez atteint le rang suprême du ManLore !',
        guideTitle: "Comment gagner plus d'XP ?",
        hierarchyTitle: 'Hiérarchie des Rangs (E ➔ S)',
        statusTitle: 'Votre statut actuel',
        modalTitle: 'Système de Rangs & Progression',
        guideChaptersTitle: 'Lire des Chapitres',
        guideChaptersVal: '+5 EXP par chapitre lu',
        guideAddTitle: 'Ajouter une Œuvre',
        guideAddVal: '+25 EXP par œuvre ajoutée',
        guideRateTitle: 'Évaluer & Noter',
        guideRateVal: '+15 EXP par note donnée',
        guideStreakTitle: 'Maintenir sa Série',
        guideStreakVal: '+50 EXP bonus de fidélité',
        guideQuestsTitle: 'Quêtes Quotidiennes / Hebdo',
        guideQuestsVal: '+50 à +800 EXP par quête',
        guideAnnualTitle: 'Quêtes Annuelles',
        guideAnnualVal: "Jusqu'à +25 000 EXP",
    },
    en: {
        rank: 'Rank',
        expTotal: 'Total EXP',
        towards: 'towards',
        maxRank: 'Maximum Rank',
        tabDaily: 'Daily',
        tabWeekly: 'Weekly',
        tabMonthly: 'Monthly',
        tabAnnual: 'Annual',
        noQuests: 'No quests available',
        yourRank: 'YOUR RANK',
        expRequired: 'EXP required',
        missingExp: 'You need <strong>{exp} EXP</strong> to reach <strong>{title}</strong> rank.',
        maxRankCongrats: 'Congratulations! You have reached the supreme rank of ManLore!',
        guideTitle: 'How to earn more XP?',
        hierarchyTitle: 'Rank Hierarchy (E ➔ S)',
        statusTitle: 'Your current status',
        modalTitle: 'Rank System & Progression',
        guideChaptersTitle: 'Read Chapters',
        guideChaptersVal: '+5 EXP per read chapter',
        guideAddTitle: 'Add a Title',
        guideAddVal: '+25 EXP per added title',
        guideRateTitle: 'Rate & Review',
        guideRateVal: '+15 EXP per rating',
        guideStreakTitle: 'Maintain Streak',
        guideStreakVal: '+50 EXP loyalty bonus',
        guideQuestsTitle: 'Daily / Weekly Quests',
        guideQuestsVal: '+50 to +800 EXP per quest',
        guideAnnualTitle: 'Annual Quests',
        guideAnnualVal: 'Up to +25,000 EXP',
    },
    es: {
        rank: 'Rango',
        expTotal: 'EXP Total',
        towards: 'hacia',
        maxRank: 'Nivel Máximo',
        tabDaily: 'Diarias',
        tabWeekly: 'Semanales',
        tabMonthly: 'Mensuales',
        tabAnnual: 'Anuales',
        noQuests: 'Sin misiones disponibles',
        yourRank: 'TU RANGO',
        expRequired: 'EXP requerido',
        missingExp: 'Te faltan <strong>{exp} EXP</strong> para alcanzar el rango <strong>{title}</strong>.',
        maxRankCongrats: '¡Felicidades! ¡Has alcanzado el rango supremo de ManLore!',
        guideTitle: '¿Cómo ganar más XP?',
        hierarchyTitle: 'Jerarquía de Rangos (E ➔ S)',
        statusTitle: 'Tu estado actual',
        modalTitle: 'Sistema de Rangos y Progresión',
        guideChaptersTitle: 'Leer Capítulos',
        guideChaptersVal: '+5 EXP por capítulo leído',
        guideAddTitle: 'Añadir una Obra',
        guideAddVal: '+25 EXP por obra añadida',
        guideRateTitle: 'Calificar y Puntuar',
        guideRateVal: '+15 EXP por calificación',
        guideStreakTitle: 'Mantener la Racha',
        guideStreakVal: '+50 EXP bono de fidelidad',
        guideQuestsTitle: 'Misiones Diarias / Semanales',
        guideQuestsVal: '+50 a +800 EXP por misión',
        guideAnnualTitle: 'Misiones Anuales',
        guideAnnualVal: 'Hasta +25,000 EXP',
    }
};

class QuestManager {
    constructor() {
        this.currentLang = 'fr';
        this.questData = null;
        this.activeTab = 'daily';
        this.data = this.loadProgression();
        this.initActiveTimer();
        this.loadQuestDefinitions();
    }

    loadProgression() {
        try {
            const raw = localStorage.getItem(QUESTS_STORAGE_KEY);
            if (raw) return JSON.parse(raw);
        } catch {}

        return {
            exp: 0,
            activeMinutesToday: 0,
            activeMinutesWeek: 0,
            activeMinutesMonth: 0,
            activeMinutesYear: 0,
            titlesAddedToday: 0,
            titlesAddedWeek: 0,
            titlesAddedMonth: 0,
            titlesAddedYear: 0,
            titlesEditedToday: 0,
            titlesEditedWeek: 0,
            titlesEditedMonth: 0,
            titlesEditedYear: 0,
            titlesDeletedToday: 0,
            titlesDeletedWeek: 0,
            titlesDeletedMonth: 0,
            titlesDeletedYear: 0,
            titlesViewedToday: [],
            titlesViewedWeek: [],
            titlesViewedMonth: [],
            titlesViewedYear: [],
            actionsToday: new Set(),
            actionsWeek: new Set(),
            actionsMonth: new Set(),
            completedQuests: {},
            lastDailyDate: new Date().toISOString().split('T')[0],
            lastWeekNumber: this.getWeekNumber(new Date()),
            lastMonth: new Date().getMonth(),
            lastYear: new Date().getFullYear(),
            activeDaysThisWeek: new Set([new Date().toISOString().split('T')[0]]),
            activeDaysThisMonth: new Set([new Date().toISOString().split('T')[0]]),
            activeDaysThisYear: new Set([new Date().toISOString().split('T')[0]]),
        };
    }

    saveProgression() {
        try {
            const serializable = {
                ...this.data,
                titlesViewedToday: Array.isArray(this.data.titlesViewedToday) ? this.data.titlesViewedToday : [],
                titlesViewedWeek: Array.isArray(this.data.titlesViewedWeek) ? this.data.titlesViewedWeek : [],
                titlesViewedMonth: Array.isArray(this.data.titlesViewedMonth) ? this.data.titlesViewedMonth : [],
                titlesViewedYear: Array.isArray(this.data.titlesViewedYear) ? this.data.titlesViewedYear : [],
                actionsToday: Array.from(this.data.actionsToday || []),
                actionsWeek: Array.from(this.data.actionsWeek || []),
                actionsMonth: Array.from(this.data.actionsMonth || []),
                activeDaysThisWeek: Array.from(this.data.activeDaysThisWeek || []),
                activeDaysThisMonth: Array.from(this.data.activeDaysThisMonth || []),
                activeDaysThisYear: Array.from(this.data.activeDaysThisYear || [])
            };
            localStorage.setItem(QUESTS_STORAGE_KEY, JSON.stringify(serializable));
        } catch (e) {
            console.warn('[Quests] Erreur sauvegarde', e);
        }
    }

    getWeekNumber(d) {
        const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        const dayNum = date.getUTCDay() || 7;
        date.setUTCDate(date.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
        return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
    }

    checkResets() {
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const weekNum = this.getWeekNumber(now);
        const monthNum = now.getMonth();
        const yearNum = now.getFullYear();

        if (Array.isArray(this.data.actionsToday)) this.data.actionsToday = new Set(this.data.actionsToday);
        if (Array.isArray(this.data.actionsWeek)) this.data.actionsWeek = new Set(this.data.actionsWeek);
        if (Array.isArray(this.data.actionsMonth)) this.data.actionsMonth = new Set(this.data.actionsMonth);
        if (Array.isArray(this.data.activeDaysThisWeek)) this.data.activeDaysThisWeek = new Set(this.data.activeDaysThisWeek);
        if (Array.isArray(this.data.activeDaysThisMonth)) this.data.activeDaysThisMonth = new Set(this.data.activeDaysThisMonth);
        if (Array.isArray(this.data.activeDaysThisYear)) this.data.activeDaysThisYear = new Set(this.data.activeDaysThisYear);

        if (this.data.lastDailyDate !== today) {
            this.data.lastDailyDate = today;
            this.data.activeMinutesToday = 0;
            this.data.titlesAddedToday = 0;
            this.data.titlesEditedToday = 0;
            this.data.titlesDeletedToday = 0;
            this.data.titlesViewedToday = [];
            this.data.actionsToday = new Set();
        }

        if (this.data.lastWeekNumber !== weekNum) {
            this.data.lastWeekNumber = weekNum;
            this.data.activeMinutesWeek = 0;
            this.data.titlesAddedWeek = 0;
            this.data.titlesEditedWeek = 0;
            this.data.titlesDeletedWeek = 0;
            this.data.titlesViewedWeek = [];
            this.data.actionsWeek = new Set();
            this.data.activeDaysThisWeek = new Set([today]);
        }

        if (this.data.lastMonth !== monthNum) {
            this.data.lastMonth = monthNum;
            this.data.activeMinutesMonth = 0;
            this.data.titlesAddedMonth = 0;
            this.data.titlesEditedMonth = 0;
            this.data.titlesDeletedMonth = 0;
            this.data.titlesViewedMonth = [];
            this.data.actionsMonth = new Set();
            this.data.activeDaysThisMonth = new Set([today]);
        }

        if (this.data.lastYear !== yearNum) {
            this.data.lastYear = yearNum;
            this.data.activeMinutesYear = 0;
            this.data.titlesAddedYear = 0;
            this.data.titlesEditedYear = 0;
            this.data.titlesDeletedYear = 0;
            this.data.titlesViewedYear = [];
            this.data.activeDaysThisYear = new Set([today]);
        }

        this.data.activeDaysThisWeek.add(today);
        this.data.activeDaysThisMonth.add(today);
        this.data.activeDaysThisYear.add(today);

        this.saveProgression();
    }

    initActiveTimer() {
        setInterval(() => {
            if (document.visibilityState === 'visible') {
                this.checkResets();
                this.data.activeMinutesToday = (this.data.activeMinutesToday || 0) + 1;
                this.data.activeMinutesWeek = (this.data.activeMinutesWeek || 0) + 1;
                this.data.activeMinutesMonth = (this.data.activeMinutesMonth || 0) + 1;
                this.data.activeMinutesYear = (this.data.activeMinutesYear || 0) + 1;
                this.saveProgression();
            }
        }, 60000);
    }

    async loadQuestDefinitions() {
        const lang = (window.i18n?.lang || window.i18n?.currentLang || localStorage.getItem('manlore_lang') || 'fr').toLowerCase();
        this.currentLang = ['en', 'es'].includes(lang) ? lang : 'fr';

        const jsonFile = `manlore_${this.currentLang}-quests_xp.json`;
        try {
            const res = await fetch(jsonFile);
            if (res.ok) {
                this.questData = await res.json();
                if (typeof renderQuestUI === 'function') renderQuestUI();
                return;
            }
        } catch (e) {
            console.warn('[Quests] Fallback to FR json fetch', e);
        }

        // Fallback fetch fr
        try {
            const resFr = await fetch('manlore_fr-quests_xp.json');
            if (resFr.ok) {
                this.questData = await resFr.json();
                if (typeof renderQuestUI === 'function') renderQuestUI();
            }
        } catch {}
    }

    getText(key, vars = {}) {
        const dict = QUEST_I18N[this.currentLang] || QUEST_I18N.fr;
        let str = dict[key] || QUEST_I18N.fr[key] || key;
        Object.keys(vars).forEach(k => {
            str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), vars[k]);
        });
        return str;
    }

    getRanks() {
        return this.questData?.rank_system?.ranks || [
            { rank: "E", title: "Novice du Lore", xp_required: 0, badge_svg: "<svg viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z\"></path></svg>", color: "#95a5a6" },
            { rank: "D", title: "Lecteur Curieux", xp_required: 500, badge_svg: "<svg viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polyline points=\"14.5 17.5 3 6 3 3 6 3 17.5 14.5\"></polyline><line x1=\"13\" y1=\"19\" x2=\"19\" y2=\"13\"></line><line x1=\"16\" y1=\"16\" x2=\"20\" y2=\"20\"></line><line x1=\"19\" y1=\"21\" x2=\"21\" y2=\"19\"></line></svg>", color: "#2ecc71" },
            { rank: "C", title: "Chasseur de Chapitres", xp_required: 1500, badge_svg: "<svg viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m14.5 17.5-11.5-11.5v-3h3l11.5 11.5\"></path><path d=\"m9.5 17.5 11.5-11.5v-3h-3l-11.5 11.5\"></path><line x1=\"5\" y1=\"19\" x2=\"19\" y2=\"5\"></line></svg>", color: "#3498db" },
            { rank: "B", title: "Explorateur d'Univers", xp_required: 3000, badge_svg: "<svg viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z\"></path><path d=\"M12 8v8\"></path><path d=\"M8 12h8\"></path></svg>", color: "#9b59b6" },
            { rank: "A", title: "Érudit des Mondes", xp_required: 5500, badge_svg: "<svg viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14\"></path></svg>", color: "#f39c12" },
            { rank: "S", title: "Seigneur du ManLore", xp_required: 8500, badge_svg: "<svg viewBox=\"0 0 24 24\" width=\"24\" height=\"24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z\"></path></svg>", color: "#e74c3c" }
        ];
    }

    getCurrentRankInfo() {
        const currentExp = this.data.exp || 0;
        const ranks = this.getRanks();
        let currentRank = ranks[0];
        let nextRank = ranks[1] || null;

        for (let i = 0; i < ranks.length; i++) {
            if (currentExp >= ranks[i].xp_required) {
                currentRank = ranks[i];
                nextRank = ranks[i + 1] || null;
            }
        }

        const expInCurrentRank = currentExp - currentRank.xp_required;
        const totalExpForRank = nextRank ? (nextRank.xp_required - currentRank.xp_required) : 1000;
        const percent = nextRank ? Math.min(100, Math.round((expInCurrentRank / totalExpForRank) * 100)) : 100;
        const remainingExp = nextRank ? Math.max(0, nextRank.xp_required - currentExp) : 0;

        return {
            rank: currentRank.rank,
            title: currentRank.title,
            badge_svg: currentRank.badge_svg || '',
            color: currentRank.color || '#6c5ce7',
            currentExp,
            expInCurrentRank,
            totalExpForRank,
            percent,
            remainingExp,
            nextRankTitle: nextRank ? nextRank.title : this.getText('maxRank'),
            nextRankXp: nextRank ? nextRank.xp_required : currentExp
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
                window.showToast(`🎉 [${this.getText('rank')} ${after.rank}] ${after.title} !`, 'success');
            }
            if (window.appLogger) {
                window.appLogger.log('rank_up', `Promotion de Rang : ${after.rank}`, { from: before.rank, to: after.rank, totalExp: this.data.exp });
            }
        }

        if (typeof renderQuestUI === 'function') renderQuestUI();
    }

    onTitleAdded() {
        this.checkResets();
        this.data.titlesAddedToday = (this.data.titlesAddedToday || 0) + 1;
        this.data.titlesAddedWeek = (this.data.titlesAddedWeek || 0) + 1;
        this.data.titlesAddedMonth = (this.data.titlesAddedMonth || 0) + 1;
        this.data.titlesAddedYear = (this.data.titlesAddedYear || 0) + 1;
        this.data.actionsToday?.add('title_add');
        this.data.actionsWeek?.add('title_add');
        this.data.actionsMonth?.add('title_add');
        this.addExp(25, 'Titre ajouté');
        this.saveProgression();
    }

    onTitleEdited() {
        this.checkResets();
        this.data.titlesEditedToday = (this.data.titlesEditedToday || 0) + 1;
        this.data.titlesEditedWeek = (this.data.titlesEditedWeek || 0) + 1;
        this.data.titlesEditedMonth = (this.data.titlesEditedMonth || 0) + 1;
        this.data.titlesEditedYear = (this.data.titlesEditedYear || 0) + 1;
        this.data.actionsToday?.add('title_edit');
        this.data.actionsWeek?.add('title_edit');
        this.data.actionsMonth?.add('title_edit');
        this.addExp(15, 'Titre modifié');
        this.saveProgression();
    }

    onTitleDeleted() {
        this.checkResets();
        this.data.titlesDeletedToday = (this.data.titlesDeletedToday || 0) + 1;
        this.data.titlesDeletedWeek = (this.data.titlesDeletedWeek || 0) + 1;
        this.data.titlesDeletedMonth = (this.data.titlesDeletedMonth || 0) + 1;
        this.data.titlesDeletedYear = (this.data.titlesDeletedYear || 0) + 1;
        this.data.actionsToday?.add('title_delete');
        this.data.actionsWeek?.add('title_delete');
        this.data.actionsMonth?.add('title_delete');
        this.addExp(10, 'Titre supprimé');
        this.saveProgression();
    }

    onTitleViewed(id) {
        if (!id) return;
        this.checkResets();
        const strId = String(id);
        if (!this.data.titlesViewedToday.includes(strId)) this.data.titlesViewedToday.push(strId);
        if (!this.data.titlesViewedWeek.includes(strId)) this.data.titlesViewedWeek.push(strId);
        if (!this.data.titlesViewedMonth.includes(strId)) this.data.titlesViewedMonth.push(strId);
        if (!this.data.titlesViewedYear.includes(strId)) this.data.titlesViewedYear.push(strId);
        this.data.actionsToday?.add('title_view');
        this.data.actionsWeek?.add('title_view');
        this.data.actionsMonth?.add('title_view');
        this.saveProgression();
    }

    onChapterRead(count = 1) {
        this.checkResets();
        this.addExp(count * 5, `${count} chapitre(s) lu(s)`);
    }

    onTitleRated() {
        this.checkResets();
        this.addExp(15, 'Titre noté');
    }

    getQuestsForTab(tabKey) {
        this.checkResets();
        if (!this.questData?.quests) return [];

        const rawList = this.questData.quests[tabKey] || [];
        return rawList.map(q => {
            const progress = this.calculateQuestProgress(q, tabKey);
            return {
                ...q,
                current: progress.current,
                targetValue: progress.target,
                completed: progress.completed,
                percent: Math.min(100, Math.round((progress.current / progress.target) * 100))
            };
        });
    }

    calculateQuestProgress(quest, period) {
        const t = quest.target || {};
        let current = 0;
        let target = t.value || 1;

        switch (t.type) {
            case 'active_minutes':
                current = period === 'daily' ? this.data.activeMinutesToday :
                          period === 'weekly' ? this.data.activeMinutesWeek :
                          period === 'monthly' ? this.data.activeMinutesMonth : this.data.activeMinutesYear;
                break;
            case 'title_add':
                current = period === 'daily' ? this.data.titlesAddedToday :
                          period === 'weekly' ? this.data.titlesAddedWeek :
                          period === 'monthly' ? this.data.titlesAddedMonth : this.data.titlesAddedYear;
                break;
            case 'title_edit':
                current = period === 'daily' ? this.data.titlesEditedToday :
                          period === 'weekly' ? this.data.titlesEditedWeek :
                          period === 'monthly' ? this.data.titlesEditedMonth : this.data.titlesEditedYear;
                break;
            case 'title_delete':
                current = period === 'daily' ? this.data.titlesDeletedToday :
                          period === 'weekly' ? this.data.titlesDeletedWeek :
                          period === 'monthly' ? this.data.titlesDeletedMonth : this.data.titlesDeletedYear;
                break;
            case 'title_view':
                current = period === 'daily' ? this.data.titlesViewedToday.length :
                          period === 'weekly' ? this.data.titlesViewedWeek.length :
                          period === 'monthly' ? this.data.titlesViewedMonth.length : this.data.titlesViewedYear.length;
                break;
            case 'active_days':
                current = period === 'weekly' ? (this.data.activeDaysThisWeek?.size || 1) :
                          period === 'monthly' ? (this.data.activeDaysThisMonth?.size || 1) : (this.data.activeDaysThisYear?.size || 1);
                break;
            case 'unique_actions':
                current = period === 'daily' ? (this.data.actionsToday?.size || 0) :
                          period === 'weekly' ? (this.data.actionsWeek?.size || 0) : (this.data.actionsMonth?.size || 0);
                break;
            case 'rank':
                const currentRankInfo = this.getCurrentRankInfo();
                const ranks = this.getRanks();
                const targetIdx = ranks.findIndex(r => r.rank === t.to);
                const curIdx = ranks.findIndex(r => r.rank === currentRankInfo.rank);
                current = curIdx >= targetIdx ? 1 : 0;
                target = 1;
                break;
            default:
                current = 0;
                break;
        }

        return { current, target, completed: current >= target };
    }
}

window.questManager = new QuestManager();

// ============ RENDU DE L'INTERFACE DES QUÊTES ============

function renderQuestUI() {
    const container = document.getElementById('questProgressionContainer');
    if (!container) return;

    const qm = window.questManager;
    const rankInfo = qm.getCurrentRankInfo();
    const activeTab = qm.activeTab || 'daily';
    const quests = qm.getQuestsForTab(activeTab);

    container.innerHTML = `
        <div class="quest-card-modern">
            <div class="quest-header-flex">
                <div class="quest-rank-badge clickable-rank" onclick="openRankOverviewModal()" title="Cliquer pour voir la progression de rang E -> S" style="background: ${rankInfo.color}22; border-color: ${rankInfo.color}; cursor:pointer">
                    <span class="quest-badge-icon" style="color:${rankInfo.color}">${rankInfo.badge_svg}</span>
                    <div>
                        <div class="quest-rank-level" style="color: ${rankInfo.color}">${qm.getText('rank')} ${rankInfo.rank} <i class="fas fa-external-link-alt" style="font-size:0.75rem; opacity:0.8"></i></div>
                        <div class="quest-rank-title">${rankInfo.title}</div>
                    </div>
                </div>
                <div class="quest-exp-display">
                    <span class="quest-exp-number">${rankInfo.currentExp}</span> <span class="quest-exp-label">${qm.getText('expTotal')}</span>
                </div>
            </div>

            <div class="quest-bar-wrapper">
                <div class="quest-bar-track">
                    <div class="quest-bar-fill" style="width: ${rankInfo.percent}%; background: linear-gradient(90deg, ${rankInfo.color}, #00f2fe);"></div>
                </div>
                <div class="quest-bar-labels">
                    <span>${rankInfo.expInCurrentRank} / ${rankInfo.totalExpForRank} EXP ${qm.getText('towards')} [${rankInfo.nextRankTitle}]</span>
                    <span style="font-weight:700;">${rankInfo.percent}%</span>
                </div>
            </div>

            <!-- Tabs Quêtes -->
            <div class="quest-tabs-nav">
                <button class="quest-tab-btn ${activeTab === 'daily' ? 'active' : ''}" onclick="switchQuestTab('daily')">
                    <i class="fas fa-calendar-day"></i> ${qm.getText('tabDaily')}
                </button>
                <button class="quest-tab-btn ${activeTab === 'weekly' ? 'active' : ''}" onclick="switchQuestTab('weekly')">
                    <i class="fas fa-calendar-week"></i> ${qm.getText('tabWeekly')}
                </button>
                <button class="quest-tab-btn ${activeTab === 'monthly' ? 'active' : ''}" onclick="switchQuestTab('monthly')">
                    <i class="fas fa-calendar-alt"></i> ${qm.getText('tabMonthly')}
                </button>
                <button class="quest-tab-btn ${activeTab === 'annual' ? 'active' : ''}" onclick="switchQuestTab('annual')">
                    <i class="fas fa-award"></i> ${qm.getText('tabAnnual')}
                </button>
            </div>

            <div class="quest-list">
                ${quests.length === 0 ? `<p class="text-xs text-muted" style="padding:1rem;text-align:center">${qm.getText('noQuests')}</p>` : quests.map(q => `
                    <div class="quest-item-box ${q.completed ? 'completed' : ''}">
                        <div class="quest-icon-bubble ${q.completed ? 'done' : ''}">
                            <i class="fas ${q.completed ? 'fa-check' : 'fa-scroll'}"></i>
                        </div>
                        <div class="quest-info-content">
                            <div class="quest-name">${escapeHtml(q.title)} <span class="quest-reward">+${q.xp} EXP</span></div>
                            <div class="quest-sub">${escapeHtml(q.description)}</div>
                            <div class="quest-mini-bar-track">
                                <div class="quest-mini-bar-fill" style="width:${q.percent}%; background:${q.completed ? '#2ecc71' : 'var(--color-primary)'}"></div>
                            </div>
                        </div>
                        <div class="quest-status-count">
                            ${q.current} / ${q.targetValue}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

function switchQuestTab(tabKey) {
    if (window.questManager) {
        window.questManager.activeTab = tabKey;
        renderQuestUI();
    }
}

// ============ MODAL D'APERÇU DES RANGS & GUIDE EXP ============

function openRankOverviewModal() {
    const modal = document.getElementById('rankModal');
    if (!modal) return;

    const qm = window.questManager;
    const rankInfo = qm.getCurrentRankInfo();
    const ranks = qm.getRanks();

    const ranksListContainer = document.getElementById('ranksHierarchyList');
    if (ranksListContainer) {
        ranksListContainer.innerHTML = ranks.map((r) => {
            const isCurrent = r.rank === rankInfo.rank;
            const isPassed = rankInfo.currentExp >= r.xp_required;
            return `
                <div class="rank-hierarchy-card ${isCurrent ? 'current-active' : isPassed ? 'unlocked' : 'locked'}" style="border-left: 4px solid ${r.color}">
                    <div class="rank-card-header">
                        <div style="display:flex; align-items:center; gap:0.75rem">
                            <span class="rank-card-svg-badge" style="color:${r.color}">${r.badge_svg || ''}</span>
                            <div>
                                <h4 style="font-family:'Orbitron',sans-serif; font-size:1rem; color:${r.color}">${qm.getText('rank')} ${r.rank} : ${r.title}</h4>
                                <span class="text-xs text-muted">${r.xp_required} ${qm.getText('expRequired')}</span>
                            </div>
                        </div>
                        <div>
                            ${isCurrent ? `<span class="badge-current-rank">${qm.getText('yourRank')}</span>` : isPassed ? '<i class="fas fa-check-circle" style="color:#2ecc71"></i>' : '<i class="fas fa-lock" style="color:#747d8c"></i>'}
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    const currentRankTitleEl = document.getElementById('modalCurrentRankTitle');
    if (currentRankTitleEl) {
        currentRankTitleEl.innerHTML = `
            <span style="color:${rankInfo.color}; font-weight:800">[${qm.getText('rank')} ${rankInfo.rank}]</span> ${rankInfo.title} (${rankInfo.currentExp} EXP)
        `;
    }

    const nextRankAdviceEl = document.getElementById('modalNextRankAdvice');
    if (nextRankAdviceEl) {
        if (rankInfo.remainingExp > 0) {
            nextRankAdviceEl.innerHTML = qm.getText('missingExp', { exp: rankInfo.remainingExp, title: rankInfo.nextRankTitle });
        } else {
            nextRankAdviceEl.textContent = qm.getText('maxRankCongrats');
        }
    }

    // Localize modal static titles
    const statusBoxHeader = modal.querySelector('.rank-modal-status-box p');
    if (statusBoxHeader) statusBoxHeader.textContent = qm.getText('statusTitle');

    const modalTitleEl = modal.querySelector('.modal-title');
    if (modalTitleEl) modalTitleEl.innerHTML = `<i class="fas fa-crown" style="color:#ffd32a"></i> ${qm.getText('modalTitle')}`;

    openModal('rankModal');
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

window.addEventListener('languageChanged', () => {
    window.questManager?.loadQuestDefinitions();
});

console.log('[Quests v5.0.1] Multi-period System loaded');
