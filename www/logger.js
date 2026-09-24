/* ============================================
   MANLORE v10.0.0 - LOGGER.JS
   Local-Only Diagnostic Logger (Zero Server Requests)
   ============================================ */

'use strict';

class AppLogger {
    constructor() {
        this.storageKey = 'com.karlitodev.manlore/logs';
        this.maxLocalLogs = 10;
        this.buffer = this.loadLocalLogs();
    }

    loadLocalLogs() {
        try {
            const raw = localStorage.getItem(this.storageKey);
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
            if (e.name === 'QuotaExceededError' || e.code === 22) {
                this.buffer = [];
                try { localStorage.removeItem(this.storageKey); } catch {}
            }
        }
    }

    log(type, message, details = {}) {
        // Only log errors and critical events locally, skip info/network noise
        if (type === 'network' || type === 'jikan_missing') return;
        const entry = {
            id: 'log_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
            timestamp: new Date().toISOString(),
            version: '10.0.0',
            type,
            message,
            details,
            online: navigator.onLine
        };
        this.buffer.push(entry);
        this.saveLocalLogs();
    }

    // No-op stubs — prevent crashes in callers but generate zero server traffic
    trackNetwork() {}
    trackTitleSearch() {}
    syncLogsToBack4App() {}

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
        } catch {}

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

