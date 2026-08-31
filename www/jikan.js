/* ============================================
   MANLORE v6.0.1 - JIKAN.JS
   Jikan v4 + Kitsu + AniList Multi-Search + Auto-Translate + NSFW Filter
   ============================================ */

'use strict';

const JIKAN_BASE = 'https://api.jikan.moe/v4';
const ANILIST_BASE = 'https://graphql.anilist.co';
const JIKAN_CACHE_KEY = 'manlore_jikan_cache_v6';
const JIKAN_CACHE_TTL = 48 * 60 * 60 * 1000; // 48h
const JIKAN_RATE_LIMIT_MS = 350;

let jikanLastRequest = 0;
let jikanSearchTimeout = null;

class JikanAPI {
    constructor() {
        this.cache = this.loadCache();
        this.translationCache = this.loadTranslationCache();
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

    loadTranslationCache() {
        try {
            const raw = localStorage.getItem('manlore_translation_cache');
            return raw ? JSON.parse(raw) : {};
        } catch { return {}; }
    }

    saveTranslationCache() {
        try {
            localStorage.setItem('manlore_translation_cache', JSON.stringify(this.translationCache));
        } catch (e) {}
    }

    getCached(key) {
        const entry = this.cache[key];
        if (!entry) return null;
        if (Date.now() - entry.ts > JIKAN_CACHE_TTL) { delete this.cache[key]; return null; }
        return entry.data;
    }

    setCached(key, data) {
        const keys = Object.keys(this.cache);
        if (keys.length > 150) {
            keys.sort((a, b) => this.cache[a].ts - this.cache[b].ts).slice(0, 30).forEach(k => delete this.cache[k]);
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
        const startTime = Date.now();
        for (let i = 0; i <= retries; i++) {
            try {
                await this.rateLimit();
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), 7000);
                const res = await fetch(url, { signal: controller.signal });
                clearTimeout(timer);
                
                const duration = Date.now() - startTime;
                if (window.appLogger) {
                    window.appLogger.trackNetwork(url, duration, res.status);
                }

                if (res.status === 429) { 
                    await new Promise(r => setTimeout(r, 1500)); 
                    continue; 
                }
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                return await res.json();
            } catch (e) {
                if (i === retries) {
                    if (window.appLogger) {
                        window.appLogger.log('network', 'Échec requête Jikan après retries', { url, error: e.message });
                    }
                    throw e;
                }
                await new Promise(r => setTimeout(r, 800 * (i + 1)));
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

    // Filtrage strict NSFW
    isNsfw(item) {
        const genres = [
            ...(item.genres || []),
            ...(item.themes || []),
            ...(item.demographics || []),
            ...(item.explicit_genres || [])
        ].map(g => (g.name || g || '').toLowerCase());

        const nsfwKeywords = ['hentai', 'erotica', 'ecchi', 'adult', 'smut', '18+', 'r18'];
        if (genres.some(g => nsfwKeywords.some(kw => g.includes(kw)))) return true;
        if (item.rating && item.rating.toLowerCase().includes('rx')) return true;
        if (item.ageRating && ['R18', 'adult'].includes(item.ageRating)) return true;
        return false;
    }

    // Sélection du titre le plus pertinent pour l'utilisateur
    extractPreferredTitle(item) {
        const lang = (window.i18n?.currentLang || 'fr').toLowerCase();
        
        // Si Jikan renvoie une liste structurée de titres
        if (Array.isArray(item.titles)) {
            const french = item.titles.find(t => t.type === 'French');
            if (lang.startsWith('fr') && french && french.title) return french.title;

            const english = item.titles.find(t => t.type === 'English');
            if (english && english.title) return english.title;

            const def = item.titles.find(t => t.type === 'Default');
            if (def && def.title) return def.title;
        }

        return item.title_english || item.title || item.canonicalTitle || '';
    }

    normalizeResult(item) {
        const genres = [
            ...(item.genres || []), ...(item.themes || []), ...(item.demographics || [])
        ].map(g => g.name).filter(Boolean);

        const allTitles = [];
        if (item.title) allTitles.push(item.title);
        if (item.title_english && item.title_english !== item.title) allTitles.push(item.title_english);
        if (item.title_japanese) allTitles.push(item.title_japanese);
        if (Array.isArray(item.title_synonyms)) allTitles.push(...item.title_synonyms);

        const preferredTitle = this.extractPreferredTitle(item);

        return {
            malId: item.mal_id,
            title: preferredTitle || item.title || '',
            originalTitle: item.title || '',
            titleEnglish: item.title_english || '',
            allTitles: [...new Set(allTitles)],
            type: this.mapType(item.type),
            imageUrl: item.images?.jpg?.large_image_url || item.images?.jpg?.image_url || '',
            synopsis: (item.synopsis || '').replace(/\[Written by MAL Rewrite\]/g, '').trim().slice(0, 700),
            genres,
            score: item.score || 0,
            rank: item.rank || 0,
            popularity: item.popularity || 0,
            members: item.members || 0,
            year: item.published?.prop?.from?.year || null,
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

    normalizeKitsuResult(item, included = []) {
        const attrs = item.attributes || {};
        const categoryIds = (item.relationships?.categories?.data || []).map(c => c.id);
        const genres = included
            .filter(inc => inc.type === 'categories' && categoryIds.includes(inc.id))
            .map(inc => inc.attributes?.title)
            .filter(Boolean);

        const kitsuId = `kitsu-${item.id}`;
        const title = attrs.canonicalTitle || attrs.en || attrs.en_jp || attrs.ja_jp || '';

        return {
            malId: kitsuId,
            title: title,
            originalTitle: attrs.ja_jp || title,
            titleEnglish: attrs.en || attrs.en_jp || '',
            allTitles: [attrs.canonicalTitle, attrs.en, attrs.en_jp, attrs.ja_jp].filter(Boolean),
            type: this.mapKitsuSubtype(attrs.subtype),
            imageUrl: attrs.posterImage?.medium || attrs.posterImage?.small || attrs.posterImage?.original || '',
            synopsis: (attrs.synopsis || '').trim().slice(0, 700),
            genres,
            score: attrs.averageRating ? (parseFloat(attrs.averageRating) / 10).toFixed(1) : 0,
            rank: attrs.ratingRank || 0,
            popularity: attrs.popularityRank || 0,
            members: attrs.userCount || 0,
            year: attrs.startDate ? new Date(attrs.startDate).getFullYear() : null,
            chapters: attrs.chapterCount || 0,
            status: attrs.status === 'current' ? 'En cours' : (attrs.status === 'finished' ? 'Terminé' : 'À lire'),
            authors: '',
            url: `https://kitsu.io/manga/${item.id}`,
            source: 'Kitsu'
        };
    }

    // ===== ANILIST =====
    mapAniListFormat(format) {
        const map = {
            MANGA: 'Manga', MANHWA: 'Manwha', MANHUA: 'Manhua',
            NOVEL: 'Light Novel', ONE_SHOT: 'Manga'
        };
        return map[format] || 'Manga';
    }

    normalizeAniListResult(media) {
        const title = media.title?.english || media.title?.romaji || media.title?.native || '';
        const author = (media.staff?.edges || [])
            .filter(e => ['Story', 'Art', 'Story & Art'].includes(e.role))
            .map(e => e.node?.name?.full)
            .filter(Boolean)
            .join(', ');
        // Strip HTML tags from description
        const synopsis = (media.description || '')
            .replace(/<br\s*\/?>/gi, ' ')
            .replace(/<[^>]+>/g, '')
            .trim()
            .slice(0, 700);
        return {
            malId: `anilist-${media.id}`,
            title,
            originalTitle: media.title?.native || title,
            titleEnglish: media.title?.english || '',
            allTitles: [media.title?.english, media.title?.romaji, media.title?.native].filter(Boolean),
            type: this.mapAniListFormat(media.format),
            imageUrl: media.coverImage?.large || media.coverImage?.medium || '',
            synopsis,
            genres: media.genres || [],
            score: media.averageScore ? (media.averageScore / 10).toFixed(1) : 0,
            rank: 0,
            popularity: media.popularity || 0,
            members: media.popularity || 0,
            year: media.startDate?.year || null,
            chapters: media.chapters || 0,
            status: media.status === 'FINISHED' ? 'Terminé' : (media.status === 'RELEASING' ? 'En cours' : 'À lire'),
            authors: author,
            url: media.siteUrl || '',
            source: 'AniList'
        };
    }

    async searchAniList(query) {
        const gql = `
            query ($search: String) {
              Page(perPage: 12) {
                media(search: $search, type: MANGA, sort: [SEARCH_MATCH, POPULARITY_DESC]) {
                  id isAdult format
                  title { romaji english native }
                  genres
                  coverImage { large medium }
                  description(asHtml: false)
                  averageScore popularity chapters status
                  startDate { year }
                  staff(perPage: 4, sort: [ROLE]) { edges { role node { name { full } } } }
                  siteUrl
                }
              }
            }`;
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 8000);
            const res = await fetch(ANILIST_BASE, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                body: JSON.stringify({ query: gql, variables: { search: query.trim() } }),
                signal: controller.signal
            });
            clearTimeout(timer);
            if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
            const json = await res.json();
            return (json.data?.Page?.media || [])
                .filter(m => !m.isAdult)
                .map(m => this.normalizeAniListResult(m));
        } catch (e) {
            console.warn('[AniList] Search error:', e.message);
            return [];
        }
    }

    async searchJikan(query, jikanType = '') {
        try {
            // sfw=true obligatoire pour conformité Play Store
            let url = `${JIKAN_BASE}/manga?q=${encodeURIComponent(query.trim())}&limit=10&sfw=true`;
            if (jikanType) url += `&type=${jikanType}`;
            const data = await this.fetchWithRetry(url);
            const rawList = data.data || [];
            
            // Filtre NSFW additionnel
            return rawList
                .filter(item => !this.isNsfw(item))
                .map(item => this.normalizeResult(item));
        } catch (e) {
            console.error('[Jikan] Search error:', e);
            return [];
        }
    }

    async searchKitsu(query) {
        try {
            const url = `https://kitsu.io/api/edge/manga?filter[text]=${encodeURIComponent(query.trim())}&page[limit]=10&include=categories`;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 6000);
            const res = await fetch(url, { signal: controller.signal });
            clearTimeout(timer);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const included = data.included || [];
            
            return (data.data || [])
                .filter(item => !(item.attributes?.ageRating === 'R18' || item.attributes?.nsfw))
                .map(item => this.normalizeKitsuResult(item, included));
        } catch (e) {
            console.error('[Kitsu] Search error:', e);
            return [];
        }
    }

    async search(query, jikanType = '') {
        if (!query || query.trim().length < 2) return [];
        const cleanQuery = query.toLowerCase().trim();
        const cacheKey = `s:${cleanQuery}:${jikanType}`;
        const cached = this.getCached(cacheKey);
        if (cached) {
            if (window.appLogger && cached.length > 0) {
                window.appLogger.trackNetwork(cacheKey, 5, 200, { cached: true });
            }
            return cached;
        }
        if (!navigator.onLine) return [];

        const startT = Date.now();

        try {
            // 3 sources en parallèle : MAL (Jikan) + Kitsu + AniList
            const [jikanRes, kitsuRes, anilistRes] = await Promise.allSettled([
                this.searchJikan(query, jikanType),
                this.searchKitsu(query),
                this.searchAniList(query)
            ]);

            const jikanResults   = jikanRes.status   === 'fulfilled' ? jikanRes.value   : [];
            const kitsuResults   = kitsuRes.status   === 'fulfilled' ? kitsuRes.value   : [];
            const anilistResults = anilistRes.status === 'fulfilled' ? anilistRes.value : [];

            // Interleave: AniList prioritaire pour les manhuas, puis MAL, puis Kitsu
            const seen = new Set();
            const merged = [];

            const addUnique = (list) => {
                for (const item of list) {
                    const key = (item.title || '').toLowerCase().trim();
                    if (key && !seen.has(key)) { seen.add(key); merged.push(item); }
                }
            };

            // AniList en tête car meilleure couverture Manhua/Manhwa
            addUnique(anilistResults);
            addUnique(jikanResults);
            addUnique(kitsuResults);

            const finalResults = merged.slice(0, 20);
            this.setCached(cacheKey, finalResults);

            if (window.appLogger) {
                if (finalResults.length === 0) {
                    window.appLogger.trackTitleSearch(query, null, Date.now() - startT);
                } else {
                    finalResults.forEach(r => window.appLogger.trackTitleSearch(query, r, Date.now() - startT));
                }
            }

            return finalResults;
        } catch (e) {
            console.error('[MultiSearch] Search error:', e);
            return [];
        }
    }

    // Traduction automatique des synopsis vers la langue de l'application
    async translateSynopsis(text, targetLang = 'fr') {
        if (!text || text.trim().length === 0) return '';
        if (targetLang === 'en') return text;

        const hash = `${targetLang}_${text.slice(0, 50)}`;
        if (this.translationCache[hash]) return this.translationCache[hash];

        try {
            const cleanText = text.slice(0, 500);
            const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(cleanText)}&langpair=en|${targetLang}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data.responseData?.translatedText) {
                    const translated = data.responseData.translatedText;
                    this.translationCache[hash] = translated;
                    this.saveTranslationCache();
                    return translated;
                }
            }
        } catch (e) {
            console.warn('[Jikan] Translation API fallback to original text', e);
        }
        return text;
    }

    async getDetails(malId) {
        const cacheKey = `d:${malId}`;
        const cached = this.getCached(cacheKey);
        if (cached) return cached;
        if (!navigator.onLine) return null;

        try {
            const id = String(malId);

            if (id.startsWith('anilist-')) {
                const numId = parseInt(id.replace('anilist-', ''), 10);
                const gql = `query ($id: Int) { Media(id: $id, type: MANGA) {
                    id isAdult format title { romaji english native }
                    genres coverImage { large medium } description(asHtml: false)
                    averageScore popularity chapters status startDate { year }
                    staff(perPage: 4, sort:[ROLE]) { edges { role node { name { full } } } }
                    siteUrl } }`;
                const res = await fetch(ANILIST_BASE, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
                    body: JSON.stringify({ query: gql, variables: { id: numId } })
                });
                if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
                const json = await res.json();
                const result = this.normalizeAniListResult(json.data.Media);
                this.setCached(cacheKey, result);
                return result;

            } else if (id.startsWith('kitsu-')) {
                const kitsuId = id.replace('kitsu-', '');
                const url = `https://kitsu.io/api/edge/manga/${kitsuId}?include=categories`;
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

    async fillForm(result) {
        const set = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
        set('itemTitle', result.title);
        const typeEl = document.getElementById('itemType');
        if (typeEl && result.type) {
            const opt = [...typeEl.options].find(o => o.value === result.type);
            if (opt) typeEl.value = result.type;
        }
        if (result.genres?.length) set('itemGenres', result.genres.slice(0, 6).join(', '));
        if (result.imageUrl) { 
            set('itemImageUrl', result.imageUrl); 
            if (typeof showImagePreview === 'function') showImagePreview(result.imageUrl); 
        }

        // Traduction automatique des notes / synopsis
        const notesEl = document.getElementById('itemNotes');
        if (notesEl && result.synopsis) {
            notesEl.value = 'Traduction en cours...';
            const userLang = window.i18n?.currentLang || 'fr';
            const translatedNotes = await this.translateSynopsis(result.synopsis, userLang);
            notesEl.value = translatedNotes || result.synopsis;
        }

        set('itemMalId', result.malId || '');
    }

    debounceSearch(query, manloreType, callback, delay = 400) {
        if (jikanSearchTimeout) clearTimeout(jikanSearchTimeout);
        jikanSearchTimeout = setTimeout(async () => {
            const results = await this.search(query, this.getJikanType(manloreType));
            callback(results);
        }, delay);
    }
}

window.jikan = new JikanAPI();
console.log('[Jikan v6.0.1] Module loaded — Sources: Jikan (MAL) + Kitsu + AniList');
