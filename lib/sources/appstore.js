'use strict';

const {
  DEFAULT_SOURCE_TIMEOUT_MS,
  cleanControlChars,
  toSafeHttpsUrl,
  toIsoDate,
  maskPii,
  LruTtlCache,
  fetchWithAbort
} = require('./utils');

const CACHE_TTL_MS = 30 * 60 * 1000;
const CACHE_MAX_ENTRIES = 100;
const MAX_APPS_PER_SEARCH = 3;
const MAX_REVIEWS_PER_APP = 4;
const MAX_REVIEWS_PER_COUNTRY = 6;

const searchCache = new LruTtlCache(CACHE_MAX_ENTRIES, CACHE_TTL_MS);
const reviewsCache = new LruTtlCache(CACHE_MAX_ENTRIES, CACHE_TTL_MS);

function clearAppStoreCache() {
  searchCache.clear();
  reviewsCache.clear();
}

function getLabel(field) {
  if (!field) return '';
  if (typeof field === 'string') return field;
  if (typeof field.label === 'string') return field.label;
  return '';
}

async function searchApps(term, country, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_SOURCE_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl || fetch;
  const nowMs = typeof options.now === 'function' ? options.now() : Date.now();
  const normalizedCountry = country === 'tr' ? 'tr' : 'us';
  const cacheKey = `${normalizedCountry}:${term.toLowerCase()}`;

  const cached = searchCache.get(cacheKey, nowMs);
  if (cached !== null) {
    return cached;
  }

  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&country=${normalizedCountry}&entity=software&limit=${MAX_APPS_PER_SEARCH}`;
  const res = await fetchWithAbort(url, {
    timeoutMs,
    fetchImpl,
    headers: { 'Accept': 'application/json' }
  });

  if (!res || !res.ok) {
    throw new Error(`iTunes Search (${normalizedCountry}) HTTP ${res ? res.status : 'unknown'}`);
  }

  const data = await res.json();
  const results = (data && Array.isArray(data.results)) ? data.results : [];
  const apps = [];
  for (const app of results.slice(0, MAX_APPS_PER_SEARCH)) {
    if (!app || !app.trackId || !app.trackName) continue;
    const trackViewUrl = toSafeHttpsUrl(app.trackViewUrl) ||
      `https://apps.apple.com/${normalizedCountry}/app/id${encodeURIComponent(String(app.trackId))}`;
    apps.push({
      trackId: String(app.trackId),
      trackName: cleanControlChars(app.trackName).slice(0, 100),
      trackViewUrl,
      primaryGenreName: cleanControlChars(app.primaryGenreName || '')
    });
  }

  searchCache.set(cacheKey, apps, nowMs);
  return apps;
}

async function fetchAppLowStarReviews(app, country, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_SOURCE_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl || fetch;
  const nowMs = typeof options.now === 'function' ? options.now() : Date.now();
  const normalizedCountry = country === 'tr' ? 'tr' : 'us';
  const countryCode = normalizedCountry.toUpperCase();
  const sourceKey = normalizedCountry === 'tr' ? 'appstore_tr' : 'appstore_us';
  const cacheKey = `${normalizedCountry}:${app.trackId}`;

  const cached = reviewsCache.get(cacheKey, nowMs);
  if (cached !== null) {
    return cached;
  }

  const url = `https://itunes.apple.com/${normalizedCountry}/rss/customerreviews/page=1/id=${encodeURIComponent(app.trackId)}/sortby=mostrecent/json`;
  const res = await fetchWithAbort(url, {
    timeoutMs,
    fetchImpl,
    headers: { 'Accept': 'application/json' }
  });

  if (!res || !res.ok) {
    throw new Error(`iTunes Reviews (${normalizedCountry}/${app.trackId}) HTTP ${res ? res.status : 'unknown'}`);
  }

  const data = await res.json();
  const rawEntries = data && data.feed && data.feed.entry
    ? (Array.isArray(data.feed.entry) ? data.feed.entry : [data.feed.entry])
    : [];

  const reviews = [];
  for (const entry of rawEntries) {
    if (!entry || typeof entry !== 'object') continue;
    const ratingStr = getLabel(entry['im:rating']);
    const rating = Number(ratingStr);
    // Yalnız 1-3 yıldızlı gerçek acı noktası yorumları; 4-5★ tamamen elenir
    if (!Number.isInteger(rating) || rating < 1 || rating > 3) continue;

    // KVKK: entry.author, author.name, author.uri KESİNLİKLE okunmaz ve çıktıya GİRMEZ
    const rawTitle = maskPii(getLabel(entry.title));
    const rawContent = maskPii(getLabel(entry.content));
    if (!rawTitle && !rawContent) continue;

    const title = `[${app.trackName} · ${rating}★] ${rawTitle || rawContent.slice(0, 100)}`.slice(0, 200);
    const snippet = (rawContent || rawTitle).slice(0, 260);
    const createdAt = toIsoDate(getLabel(entry.updated));

    reviews.push({
      title,
      snippet,
      rating,
      appName: app.trackName,
      country: countryCode,
      url: app.trackViewUrl,
      source: sourceKey,
      region: normalizedCountry === 'tr' ? 'tr' : 'global',
      created_at: createdAt
    });

    if (reviews.length >= MAX_REVIEWS_PER_APP) break;
  }

  reviewsCache.set(cacheKey, reviews, nowMs);
  return reviews;
}

async function fetchAppStoreSignals(spec, country = 'us', options = {}) {
  const normalizedCountry = country === 'tr' ? 'tr' : 'us';
  const keywords = Array.isArray(spec.keywords) ? spec.keywords : [];
  const competitors = Array.isArray(spec.competitors) ? spec.competitors : [];

  const searchTerm = cleanControlChars(
    competitors[0] || keywords[0] || spec.repo_name || ''
  ).split(/\s+/).slice(0, 3).join(' ');

  if (!searchTerm) {
    return { status: 'ok', count: 0, items: [] };
  }

  const apps = await searchApps(searchTerm, normalizedCountry, options);
  if (apps.length === 0) {
    return { status: 'ok', count: 0, items: [] };
  }

  // En fazla 2 eşzamanlı yorum isteği (bellek ve Apple hız limiti koruması)
  const targetApps = apps.slice(0, 2);
  const settled = await Promise.allSettled(
    targetApps.map(app => fetchAppLowStarReviews(app, normalizedCountry, options))
  );

  const items = [];
  let anyFulfilled = false;
  for (const res of settled) {
    if (res.status === 'fulfilled') {
      anyFulfilled = true;
      for (const review of res.value) {
        items.push(review);
        if (items.length >= MAX_REVIEWS_PER_COUNTRY) break;
      }
    }
    if (items.length >= MAX_REVIEWS_PER_COUNTRY) break;
  }

  if (!anyFulfilled) {
    throw new Error(`iTunes Reviews (${normalizedCountry}) failed for all apps`);
  }

  return {
    status: 'ok',
    count: items.length,
    items
  };
}

module.exports = {
  fetchAppStoreSignals,
  clearAppStoreCache
};
