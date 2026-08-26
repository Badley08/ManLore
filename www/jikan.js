/* ============================================
   MANLORE v2.0.12 - JIKAN.JS
   Jikan API v4 Integration + Offline Cache
   ============================================ */

const JIKAN_BASE = 'https://api.jikan.moe/v4';
const JIKAN_CACHE_KEY = 'manlore_jikan_cache';
const JIKAN_CACHE_TTL = 24 * 60 * 60 * 1000; // 24h
const JIKAN_RATE_LIMIT_MS = 400;

let jikanLastRequest = 0;
let jikanSearchTimeout = null;

class JikanAPI {
    constructor() {
        this.cache = this.loadCache();
    }

    loadCache() {
        try {
            const raw = localStorage.getItem(JIKAN_CACHE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch { return {}; }
    }

    saveCache() {
        try {
            localStorage.setItem(JIKAN_CACHE_KEY, JSON.stringify(this.cache));
        } catch (e) {
            console.warn('[Jikan] Cache save failed', e);
        }
    }

    getCached(key) {
        const entry = this.cache[key];
        if (!entry) return null;
        if (Date.now() - entry.ts > JIKAN_CACHE_TTL) { delete this.cache[key]; return null; }
        return entry.data;
    }

    setCached(key, data) {
        const keys = Object.keys(this.cache);
        if (keys.length > 100) {
            keys.sort((a, b) => this.cache[a].ts - this.cache[b].ts).slice(0, 20).forEach(k => delete this.cache[k]);
        }
        this.cache[key] = { ts: Date.now(), data };
        this.saveCache();
    }

    async rateLimit() {
        const wait = JIKAN_RATE_LIMIT_MS - (Date.now() - jikanLastRequest);
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        jikanLastRequest = Date.now();
    }

    async fetchWithRetry(url, retries = 2) {
        for (let i = 0; i <= retries; i++) {
            try {
                await this.rateLimit();
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 8000);
                const res = await fetch(url, { signal: controller.signal });
                clearTimeout(timer);
                if (res.status === 429) { await new Promise(r => setTimeout(r, 2000)); continue; }
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.json();
            } catch (e) {
                if (i === retries) throw e;
                await new Promise(r => setTimeout(r, 1000 * (i + 1)));
            }
        }
    }

    mapType(jikanType) {
        const map = {
            'Manga': 'Manga', 'Manhwa': 'Manwha', 'Manhua': 'Manhua',
            'Novel': 'Light Novel', 'Light Novel': 'Light Novel',
            'One-shot': 'Manga', 'Doujinshi': 'Manga', 'Webtoon': 'Webtoon'
        };
        return map[jikanType] || 'Manga';
    }

    getJikanType(manloreType) {
        const map = {
            'Manga': 'manga', 'Manwha': 'manhwa', 'Manhua': 'manhua',
            'Light Novel': 'lightnovel', 'WebNovel': 'novel', 'Webtoon': 'manhwa', 'Webcomic': ''
        };
        return map[manloreType] || '';
    }

    normalizeResult(item) {
        const genres = [
            ...(item.genres || []), ...(item.themes || []), ...(item.demographics || [])
        ].map(g => g.name).filter(Boolean);
        return {
            malId: item.mal_id,
            title: item.title || item.title_english || '',
            titleEnglish: item.title_english || '',
            type: this.mapType(item.type),
            imageUrl: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || '',
            synopsis: (item.synopsis || '').slice(0, 600),
            genres,
            score: item.score || 0,
            chapters: item.chapters || 0,
            status: item.status || '',
            authors: (item.authors || []).map(a => a.name).join(', '),
            url: item.url || '',
            source: 'MAL'
        };
    }

    mapKitsuSubtype(subtype) {
        const map = {
            'manga': 'Manga',
            'novel': 'Light Novel',
            'manhua': 'Manhua',
            'manhwa': 'Manwha',
            'oel': 'Manga',
            'oneshot': 'Manga'
        };
        return map[String(subtype).toLowerCase()] || 'Manga';
    }

    mapKitsuStatus(status) {
        const map = {
            'current': 'En cours',
            'finished': 'Terminé',
            'tba': 'À lire',
            'unreleased': 'À lire',
            'upcoming': 'À lire'
        };
        return map[String(status).toLowerCase()] || 'En cours';
    }

    normalizeKitsuResult(item, included = []) {
        const attrs = item.attributes || {};
        const categoryIds = (item.relationships?.categories?.data || []).map(c => c.id);
        const genres = included
            .filter(inc => inc.type === 'categories' && categoryIds.includes(inc.id))
            .map(inc => inc.attributes?.title)
            .filter(Boolean);

        const kitsuId = `kitsu-${item.id}`;

        return {
            malId: kitsuId,
            title: attrs.canonicalTitle || attrs.en || attrs.en_jp || '',
            titleEnglish: attrs.en || attrs.en_jp || '',
            type: this.mapKitsuSubtype(attrs.subtype),
            imageUrl: attrs.posterImage?.medium || attrs.posterImage?.small || attrs.posterImage?.original || '',
            synopsis: (attrs.synopsis || '').slice(0, 600),
            genres,
            score: attrs.averageRating ? (parseFloat(attrs.averageRating) / 10).toFixed(1) : 0,
            chapters: attrs.chapterCount || 0,
            status: this.mapKitsuStatus(attrs.status),
            authors: '',
            url: `https://kitsu.io/manga/${item.id}`,
            source: 'Kitsu'
        };
    }

    async searchJikan(query, jikanType = '') {
        try {
            let url = `${JIKAN_BASE}/manga?q=${encodeURIComponent(query.trim())}&limit=8&sfw=false`;
            if (jikanType) url += `&type=${jikanType}`;
            const data = await this.fetchWithRetry(url);
            return (data.data || []).map(item => this.normalizeResult(item));
        } catch (e) {
            console.error('[Jikan] Search error:', e);
            return [];
        }
    }

    async searchKitsu(query) {
        try {
            const url = `https://kitsu.io/api/edge/manga?filter[text]=${encodeURIComponent(query.trim())}&page[limit]=8&include=categories`;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 6000);
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timer);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const included = data.included || [];
            return (data.data || []).map(item => this.normalizeKitsuResult(item, included));
        } catch (e) {
            console.error('[Kitsu] Search error:', e);
            return [];
        }
    }

    async search(query, jikanType = '') {
        if (!query || query.trim().length < 2) return [];
        const cacheKey = `s:${query.toLowerCase().trim()}:${jikanType}`;
        const cached = this.getCached(cacheKey);
        if (cached) return cached;
        if (!navigator.onLine) return [];

        try {
            const jikanPromise = this.searchJikan(query, jikanType);
            const kitsuPromise = this.searchKitsu(query);

            const settled = await Promise.allSettled([jikanPromise, kitsuPromise]);
            
            const jikanResults = settled[0].status === 'fulfilled' ? settled[0].value : [];
            const kitsuResults = settled[1].status === 'fulfilled' ? settled[1].value : [];

            const seen = new Set();
            const merged = [];

            const maxLen = Math.max(jikanResults.length, kitsuResults.length);
            for (let i = 0; i < maxLen; i++) {
                if (i < jikanResults.length) {
                    const item = jikanResults[i];
                    const key = item.title.toLowerCase().trim();
                    if (!seen.has(key)) { seen.add(key); merged.push(item); }
                }
                if (i < kitsuResults.length) {
                    const item = kitsuResults[i];
                    const key = item.title.toLowerCase().trim();
                    if (!seen.has(key)) { seen.add(key); merged.push(item); }
                }
            }

            const finalResults = merged.slice(0, 12);
            this.setCached(cacheKey, finalResults);
            return finalResults;
        } catch (e) {
            console.error('[MultiSearch] Search error:', e);
            return [];
        }
    }

    async getDetails(malId) {
        const cacheKey = `d:${malId}`;
        const cached = this.getCached(cacheKey);
        if (cached) return cached;
        if (!navigator.onLine) return null;

        try {
            if (String(malId).startsWith('kitsu-')) {
                const id = String(malId).replace('kitsu-', '');
                const url = `https://kitsu.io/api/edge/manga/${id}?include=categories`;
                const res = await fetch(url);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                const result = this.normalizeKitsuResult(data.data, data.included || []);
                this.setCached(cacheKey, result);
                return result;
            } else {
                const data = await this.fetchWithRetry(`${JIKAN_BASE}/manga/${malId}/full`);
                const result = this.normalizeResult(data.data);
                this.setCached(cacheKey, result);
                return result;
            }
        } catch (e) {
            console.error('[Search] Get details failed:', e);
            return null;
        }
    }

    fillForm(result) {
        const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
        set('itemTitle', result.title);
        const typeEl = document.getElementById('itemType');
        if (typeEl && result.type) {
            const opt = [...typeEl.options].find(o => o.value === result.type);
            if (opt) typeEl.value = result.type;
        }
        if (result.genres?.length) set('itemGenres', result.genres.slice(0, 6).join(', '));
        if (result.imageUrl) { set('itemImageUrl', result.imageUrl); if (typeof showImagePreview === 'function') showImagePreview(result.imageUrl); }
        const notesEl = document.getElementById('itemNotes');
        if (notesEl && !notesEl.value && result.synopsis) notesEl.value = result.synopsis;
        set('itemMalId', result.malId || '');
    }

    debounceSearch(query, manloreType, callback, delay = 500) {
        if (jikanSearchTimeout) clearTimeout(jikanSearchTimeout);
        jikanSearchTimeout = setTimeout(async () => {
            const results = await this.search(query, this.getJikanType(manloreType));
            callback(results);
        }, delay);
    }
}

const jikan = new JikanAPI();
console.log('[Jikan] Module loaded');
