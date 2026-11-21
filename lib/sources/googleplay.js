'use strict';

const {
  cleanControlChars,
  toIsoDate,
  maskPii,
  LruTtlCache
} = require('./utils');

const PAIN_CACHE_TTL_MS = 60 * 60 * 1000; // 60 dakika
const TOP_CHARTS_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 saat
const CACHE_MAX_ENTRIES = 100;
const DEFAULT_GPLAY_TIMEOUT_MS = 4500;
const MAX_APPS_PER_SEARCH = 2;
const REVIEWS_FETCH_NUM = 15;
const TOP_CHARTS_LIMIT = 12;

const searchCache = new LruTtlCache(CACHE_MAX_ENTRIES, PAIN_CACHE_TTL_MS);
const reviewsCache = new LruTtlCache(CACHE_MAX_ENTRIES, PAIN_CACHE_TTL_MS);
let topChartsCache = null; // { value, expiresAt }
let cachedGplayModule = null;

function clearGooglePlayCache() {
  searchCache.clear();
  reviewsCache.clear();
  topChartsCache = null;
}

async function resolveGplay(options = {}) {
  if (options && options.gplay) {
    return options.gplay;
  }
  // Çevrimdışı birim testlerinde özel fetchImpl mock'u verilmiş ve gplay verilmemişse
  // gerçek ağa çıkmamak için kontrollü hata döndür.
  if (options && options.fetchImpl && options.fetchImpl !== globalThis.fetch) {
    throw new Error('Google Play client is not mocked in offline fetch test');
  }
  if (!cachedGplayModule) {
    const mod = await import('google-play-scraper');
    cachedGplayModule = mod && mod.default ? mod.default : mod;
  }
  return cachedGplayModule;
}

function withTimeout(promise, timeoutMs, label) {
  let timer;
  const safePromise = Promise.resolve(promise);
  // Timeout sonrası geç gelen reject'lerin unhandledRejection üretmesini önle
  safePromise.catch(() => {});
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label || 'Google Play request'} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });
  return Promise.race([safePromise, timeoutPromise]).finally(() => {
    clearTimeout(timer);
  });
}

function buildPlayStoreUrl(appId) {
  const safeId = cleanControlChars(appId || '');
  if (!safeId) return null;
  return `https://play.google.com/store/apps/details?id=${encodeURIComponent(safeId)}`;
}

async function searchGooglePlayPainPoints(params = {}, options = {}) {
  const keywords = Array.isArray(params.keywords) ? params.keywords : [];
  const competitors = Array.isArray(params.competitors) ? params.competitors : [];
  const normalizedCountry = String(params.country || 'tr').toLowerCase() === 'us' ? 'us' : 'tr';
  const lang = params.lang || (normalizedCountry === 'tr' ? 'tr' : 'en');
  const limit = Number.isInteger(params.limit) && params.limit > 0 ? Math.min(params.limit, 12) : 6;
  const timeoutMs = options.timeoutMs || DEFAULT_GPLAY_TIMEOUT_MS;
  const nowMs = typeof options.now === 'function' ? options.now() : Date.now();
  const sourceKey = normalizedCountry === 'tr' ? 'googleplay_tr' : 'googleplay_us';
  const countryCode = normalizedCountry.toUpperCase();

  const term = cleanControlChars(
    competitors[0] || keywords[0] || params.repo_name || ''
  ).split(/\s+/).slice(0, 3).join(' ');

  if (!term) {
    return { status: 'ok', count: 0, items: [] };
  }

  const gplay = await resolveGplay(options);
  const searchKey = `${normalizedCountry}:${lang}:${term.toLowerCase()}`;
  let apps = searchCache.get(searchKey, nowMs);

  if (apps === null) {
    const rawApps = await withTimeout(
      gplay.search({
        term,
        num: MAX_APPS_PER_SEARCH,
        country: normalizedCountry,
        lang,
        throttle: 2
      }),
      timeoutMs,
      `Google Play search (${normalizedCountry})`
    );

    const list = Array.isArray(rawApps) ? rawApps : [];
    apps = [];
    for (const app of list.slice(0, MAX_APPS_PER_SEARCH)) {
      if (!app || !app.appId) continue;
      const appId = cleanControlChars(app.appId).slice(0, 120);
      const url = buildPlayStoreUrl(appId);
      if (!url) continue;
      apps.push({
        appId,
        appName: cleanControlChars(app.title || app.name || appId).slice(0, 100),
        url
      });
    }
    searchCache.set(searchKey, apps, nowMs);
  }

  if (apps.length === 0) {
    return { status: 'ok', count: 0, items: [] };
  }

  const sortNewest = (gplay.sort && gplay.sort.NEWEST !== undefined) ? gplay.sort.NEWEST : 2;

  const fetchReviewsForApp = async (app) => {
    const revKey = `${normalizedCountry}:${lang}:${app.appId}`;
    const cached = reviewsCache.get(revKey, nowMs);
    if (cached !== null) {
      return cached;
    }

    const rawRes = await withTimeout(
      gplay.reviews({
        appId: app.appId,
        sort: sortNewest,
        num: REVIEWS_FETCH_NUM,
        country: normalizedCountry,
        lang,
        throttle: 2
      }),
      timeoutMs,
      `Google Play reviews (${normalizedCountry}/${app.appId})`
    );

    const rawReviews = Array.isArray(rawRes)
      ? rawRes
      : (rawRes && Array.isArray(rawRes.data) ? rawRes.data : []);

    const cleaned = [];
    for (const rev of rawReviews) {
      if (!rev || typeof rev !== 'object') continue;
      const rating = Number(rev.score);
      // Yalnız 1-3 yıldızlı gerçek şikayet/acı noktası yorumları; 4-5★ tamamen elenir
      if (!Number.isInteger(rating) || rating < 1 || rating > 3) continue;

      // KVKK: userName, userImage, id, replyText vb. tüm yazar PII alanları KESİNLİKLE okunmaz ve çıktıya GİRMEZ
      const rawTitle = maskPii(rev.title || '');
      const rawText = maskPii(rev.text || '');
      if (!rawTitle && !rawText) continue;

      const title = `[${app.appName} · ${rating}★] ${rawTitle || rawText.slice(0, 100)}`.slice(0, 200);
      const snippet = (rawText || rawTitle).slice(0, 260);
      const createdAt = toIsoDate(rev.date);

      cleaned.push({
        title,
        snippet,
        rating,
        appName: app.appName,
        country: countryCode,
        url: app.url,
        source: sourceKey,
        region: normalizedCountry === 'tr' ? 'tr' : 'global',
        created_at: createdAt
      });

      if (cleaned.length >= 12) break;
    }

    reviewsCache.set(revKey, cleaned, nowMs);
    return cleaned;
  };

  const settled = await Promise.allSettled(apps.map(app => fetchReviewsForApp(app)));
  const items = [];
  let anyFulfilled = false;
  for (const res of settled) {
    if (res.status === 'fulfilled') {
      anyFulfilled = true;
      for (const item of res.value) {
        items.push(item);
        if (items.length >= limit) break;
      }
    }
    if (items.length >= limit) break;
  }

  if (!anyFulfilled) {
    throw new Error(`Google Play reviews (${normalizedCountry}) failed for all apps`);
  }

  return {
    status: 'ok',
    count: items.length,
    items
  };
}

async function fetchGooglePlaySignals(spec, country = 'tr', options = {}) {
  const normalizedCountry = country === 'us' ? 'us' : 'tr';
  const lang = normalizedCountry === 'tr' ? 'tr' : 'en';
  return searchGooglePlayPainPoints(
    {
      repo_name: spec && spec.repo_name ? spec.repo_name : '',
      keywords: spec && Array.isArray(spec.keywords) ? spec.keywords : [],
      competitors: spec && Array.isArray(spec.competitors) ? spec.competitors : [],
      country: normalizedCountry,
      lang,
      limit: 6
    },
    options
  );
}

async function fetchGooglePlayTopCharts(options = {}) {
  const nowMs = typeof options.now === 'function' ? options.now() : Date.now();
  const timeoutMs = options.timeoutMs || DEFAULT_GPLAY_TIMEOUT_MS;
  const refresh = Boolean(options.refresh);

  if (!refresh && topChartsCache && nowMs < topChartsCache.expiresAt) {
    return {
      ...topChartsCache.value,
      cached: true
    };
  }

  let gplay;
  try {
    gplay = await resolveGplay(options);
  } catch {
    return {
      ok: true,
      cached: false,
      fetched_at: new Date(nowMs).toISOString(),
      ttl_seconds: Math.floor(TOP_CHARTS_CACHE_TTL_MS / 1000),
      charts: {
        tr_top_free: [],
        tr_top_paid: [],
        us_top_free: [],
        us_top_paid: []
      },
      items: [],
      status: {
        tr_top_free: 'error',
        tr_top_paid: 'error',
        us_top_free: 'error',
        us_top_paid: 'error'
      }
    };
  }

  const colTopFree = (gplay.collection && gplay.collection.TOP_FREE) || 'TOP_FREE';
  const colTopPaid = (gplay.collection && gplay.collection.TOP_PAID) || 'TOP_PAID';

  const targets = [
    { key: 'tr_top_free', country: 'tr', lang: 'tr', collection: colTopFree, chart: 'TOP_FREE' },
    { key: 'tr_top_paid', country: 'tr', lang: 'tr', collection: colTopPaid, chart: 'TOP_PAID' },
    { key: 'us_top_free', country: 'us', lang: 'en', collection: colTopFree, chart: 'TOP_FREE' },
    { key: 'us_top_paid', country: 'us', lang: 'en', collection: colTopPaid, chart: 'TOP_PAID' }
  ];

  const settled = await Promise.allSettled(
    targets.map(t =>
      withTimeout(
        gplay.list({
          collection: t.collection,
          country: t.country,
          lang: t.lang,
          num: TOP_CHARTS_LIMIT,
          throttle: 2
        }),
        timeoutMs,
        `Google Play list (${t.key})`
      )
    )
  );

  const charts = {
    tr_top_free: [],
    tr_top_paid: [],
    us_top_free: [],
    us_top_paid: []
  };
  const status = {};
  const allItems = [];
  let anyOk = false;

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    const outcome = settled[i];
    if (outcome.status === 'fulfilled' && Array.isArray(outcome.value)) {
      anyOk = true;
      status[t.key] = 'ok';
      const normalized = [];
      for (const raw of outcome.value.slice(0, TOP_CHARTS_LIMIT)) {
        if (!raw || !raw.appId) continue;
        const appId = cleanControlChars(raw.appId).slice(0, 120);
        const url = buildPlayStoreUrl(appId);
        if (!url) continue;
        const rawScore = Number(raw.score);
        const entry = {
          rank: normalized.length + 1,
          name: cleanControlChars(raw.title || raw.name || appId).slice(0, 120),
          app_id: appId,
          category: cleanControlChars(raw.genre || raw.genreId || '').slice(0, 80),
          score: Number.isFinite(rawScore) ? Number(rawScore.toFixed(2)) : null,
          url,
          country: t.country.toUpperCase(),
          chart: t.chart
        };
        normalized.push(entry);
      }
      charts[t.key] = normalized;
      allItems.push(...normalized);
    } else {
      status[t.key] = 'error';
      charts[t.key] = [];
    }
  }

  const payload = {
    ok: true,
    cached: false,
    fetched_at: new Date(nowMs).toISOString(),
    ttl_seconds: Math.floor(TOP_CHARTS_CACHE_TTL_MS / 1000),
    charts,
    items: allItems,
    status
  };

  if (anyOk) {
    topChartsCache = {
      value: payload,
      expiresAt: nowMs + TOP_CHARTS_CACHE_TTL_MS
    };
  }

  return payload;
}

module.exports = {
  PAIN_CACHE_TTL_MS,
  TOP_CHARTS_CACHE_TTL_MS,
  DEFAULT_GPLAY_TIMEOUT_MS,
  searchGooglePlayPainPoints,
  fetchGooglePlaySignals,
  fetchGooglePlayTopCharts,
  clearGooglePlayCache
};
