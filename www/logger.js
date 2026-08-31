/* ============================================
   MANLORE v5.0.1 - LOGGER.JS
   Telemetry & Diagnostic Logging Engine (Back4App)
   ============================================ */

'use strict';

class AppLogger {
    constructor() {
        this.storageKey = 'com.karlitodev.manlore/logs';
        this.legacyKey = 'manlore_diagnostic_logs';
        this.maxLocalLogs = 10;
        this.syncIntervalMs = 7 * 24 * 60 * 60 * 1000; // 7 jours
        this.lastSyncKey = 'manlore_last_log_sync';
        this.buffer = this.loadLocalLogs();
    }

    loadLocalLogs() {
        try {
            const raw = localStorage.getItem(this.storageKey) || localStorage.getItem(this.legacyKey);
            return raw ? JSON.parse(raw) : [];
        } catch {
            return [];
        }
    }

    saveLocalLogs() {
        try {
            if (this.buffer.length > this.maxLocalLogs) {
                this.buffer = this.buffer.slice(-this.maxLocalLogs);
            }
            localStorage.setItem(this.storageKey, JSON.stringify(this.buffer));
        } catch (e) {
            console.warn('[Logger] Échec de sauvegarde locale des logs', e);
        }
    }

    log(type, message, details = {}) {
        const entry = {
            id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            timestamp: new Date().toISOString(),
            version: '5.0.1',
            type, // 'network', 'jikan_missing', 'auth', 'error', 'perf'
            message,
            details,
            platform: navigator.userAgent || 'unknown',
            online: navigator.onLine
        };

        this.buffer.push(entry);
        this.saveLocalLogs();
        console.log(`[Diagnostic Log - ${type}]`, message, details);

        // Si le buffer dépasse 15 logs ou si c'est une erreur critique, on tente une synchronisation
        if (this.buffer.length >= 20) {
            this.syncLogsToBack4App();
        }
    }

    // Analyse réseau
    trackNetwork(url, durationMs, status = 200, extra = {}) {
        if (durationMs > 3000) {
            this.log('network', 'Connexion lente détectée', { url, durationMs, status, ...extra });
        } else if (durationMs < 30) {
            this.log('network', 'Réponse ultra rapide ou depuis cache local', { url, durationMs, status, ...extra });
        }
    }

    // Analyse des métadonnées de titre Jikan/Kitsu
    trackTitleSearch(query, result, durationMs = 0) {
        if (!result) {
            this.log('jikan_missing', "Titre non trouvé lors de la recherche", { query, durationMs });
            return;
        }

        const missingFields = [];
        if (!result.imageUrl) missingFields.push('image');
        if (!result.score || result.score === 0) missingFields.push('score');
        if (!result.synopsis || result.synopsis.trim().length === 0) missingFields.push('description/synopsis');
        if (!result.rank) missingFields.push('rank');
        if (!result.year) missingFields.push('year');
        if (!result.members) missingFields.push('members');
        if (!result.popularity) missingFields.push('popularity');
        if (!result.status) missingFields.push('status');
        if (!result.genres || result.genres.length === 0) missingFields.push('genres');

        if (missingFields.length > 0) {
            this.log('jikan_missing', `Titre trouvé avec métadonnées manquantes (${missingFields.length})`, {
                title: result.title,
                query,
                missingFields,
                source: result.source || 'Jikan'
            });
        }
    }

    // Envoi des logs sur Back4App (Classe Parse: AppLogs)
    async syncLogsToBack4App() {
        if (!navigator.onLine || this.buffer.length === 0) return;
        if (typeof Parse === 'undefined') return;

        // Guard: only sync if user is authenticated — prevents 403 on unauthenticated batch calls
        try {
            const user = Parse.User.current();
            if (!user) return;
        } catch { return; }

        const lastSync = parseInt(localStorage.getItem(this.lastSyncKey) || '0', 10);
        const now = Date.now();

        // On synchronise si le buffer est volumineux ou si plus d'une semaine s'est écoulée
        const shouldSync = (now - lastSync > this.syncIntervalMs) || (this.buffer.length >= 20);
        if (!shouldSync && this.buffer.length < 20) return;

        try {
            const logsToSend = [...this.buffer];
            const AppLogObject = Parse.Object.extend('AppLogs');
            
            const parseObjects = logsToSend.map(l => {
                const obj = new AppLogObject();
                obj.set('logType', l.type);
                obj.set('message', l.message);
                obj.set('details', l.details);
                obj.set('appVersion', l.version);
                obj.set('clientTimestamp', l.timestamp);
                obj.set('platform', l.platform);
                return obj;
            });

            // Envoi par batch Parse
            await Parse.Object.saveAll(parseObjects);
            
            // Nettoyage des logs envoyés
            this.buffer = [];
            this.saveLocalLogs();
            localStorage.setItem(this.lastSyncKey, String(now));
            console.log(`[Logger] ${logsToSend.length} logs synchronisés avec succès sur Back4App.`);
        } catch (error) {
            console.warn('[Logger] Synchronisation Back4App différée :', error);
        }
    }

    async exportLogs() {
        const date = new Date().toISOString().split('T')[0];
        const filename = `manlore_logs_${date}.json`;
        const content = JSON.stringify(this.buffer, null, 2);
        const blob = new Blob([content], { type: 'application/json' });

        try {
            if (navigator.canShare && navigator.canShare({ files: [new File([blob], filename, { type: 'application/json' })] })) {
                const file = new File([blob], filename, { type: 'application/json' });
                await navigator.share({
                    title: 'ManLore Logs',
                    text: 'Journaux de diagnostic ManLore',
                    files: [file]
                });
                return { success: true, shared: true };
            }
        } catch (e) {
            console.warn('[Logger] Share note:', e);
        }

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        return { success: true, downloaded: true };
    }
}

window.appLogger = new AppLogger();

// Synchronisation uniquement quand en ligne ET connecté (évite les 403 au démarrage)
window.addEventListener('online', () => window.appLogger?.syncLogsToBack4App());
setTimeout(() => window.appLogger?.syncLogsToBack4App(), 15000);

