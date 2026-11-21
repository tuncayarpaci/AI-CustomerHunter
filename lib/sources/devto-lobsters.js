'use strict';

const {
  DEFAULT_SOURCE_TIMEOUT_MS,
  cleanControlChars,
  toSafeHttpsUrl,
  toIsoDate,
  maskPii,
  normalizeTurkish,
  LruTtlCache,
  fetchWithAbort
} = require('./utils');

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 dakika
const CACHE_MAX_ENTRIES = 100;
const MAX_ITEMS_PER_SOURCE = 6;

const devtoCache = new LruTtlCache(CACHE_MAX_ENTRIES, CACHE_TTL_MS);
const lobstersCache = new LruTtlCache(10, CACHE_TTL_MS);

function clearDevToLobstersCache() {
  devtoCache.clear();
  lobstersCache.clear();
}

function buildSearchTokens(spec) {
  const keywords = Array.isArray(spec && spec.keywords) ? spec.keywords : [];
  const competitors = Array.isArray(spec && spec.competitors) ? spec.competitors : [];
  const rawTerms = [...keywords, ...competitors];
  const tokens = new Set();

  for (const term of rawTerms) {
    const norm = normalizeTurkish(cleanControlChars(term));
    if (!norm) continue;
    if (norm.length >= 2) tokens.add(norm);
    for (const word of norm.split(/[^a-z0-9]+/)) {
      if (word.length >= 3) tokens.add(word);
    }
  }
  return Array.from(tokens);
}

function deriveDevToTag(spec) {
  const keywords = Array.isArray(spec && spec.keywords) ? spec.keywords : [];
  const competitors = Array.isArray(spec && spec.competitors) ? spec.competitors : [];
  const candidates = [...keywords, ...competitors, spec && spec.repo_name ? spec.repo_name : ''];

  for (const cand of candidates) {
    const cleaned = normalizeTurkish(cleanControlChars(cand));
    if (!cleaned) continue;
    const words = cleaned.split(/\s+/).filter(Boolean);
    for (const w of words) {
      const tag = w.replace(/[^a-z0-9]/g, '');
      if (tag.length >= 2) {
        return tag.slice(0, 32);
      }
    }
  }
  return '';
}

function matchesAnyToken(haystackNorm, tokens) {
  if (!tokens || tokens.length === 0) return true;
  return tokens.some(t => haystackNorm.includes(t));
}

async function searchDevTo(params = {}, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_SOURCE_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl || fetch;
  const nowMs = typeof options.now === 'function' ? options.now() : Date.now();

  const tag = deriveDevToTag(params);
  if (!tag) {
    return { status: 'ok', count: 0, items: [] };
  }

  const cacheKey = `tag:${tag}`;
  let normalizedArticles = devtoCache.get(cacheKey, nowMs);

  if (normalizedArticles === null) {
    const url = `https://dev.to/api/articles?tag=${encodeURIComponent(tag)}&per_page=15`;
    const res = await fetchWithAbort(url, {
      timeoutMs,
      fetchImpl,
      headers: { 'Accept': 'application/json' }
    });

    if (!res || !res.ok) {
      throw new Error(`Dev.to HTTP ${res ? res.status : 'unknown'}`);
    }

    const rawList = await res.json();
    const list = Array.isArray(rawList) ? rawList : [];
    normalizedArticles = [];

    for (const art of list) {
      if (!art || typeof art !== 'object' || !art.title) continue;
      const safeUrl = toSafeHttpsUrl(art.url || art.canonical_url);
      if (!safeUrl) continue;

      // KVKK: art.user, art.organization, profil resmi ve kullanıcı adları KESİNLİKLE atılır
      const title = maskPii(art.title).slice(0, 200);
      const description = maskPii(art.description || '').slice(0, 260);
      if (!title) continue;

      const tagsList = Array.isArray(art.tag_list)
        ? art.tag_list.map(t => cleanControlChars(t)).filter(Boolean)
        : (typeof art.tags === 'string'
          ? art.tags.split(',').map(t => cleanControlChars(t)).filter(Boolean)
          : []);

      normalizedArticles.push({
        title,
        snippet: description || title,
        url: safeUrl,
        source: 'devto',
        region: 'global',
        created_at: toIsoDate(art.published_at || art.created_at),
        _searchText: normalizeTurkish(`${title} ${description} ${tagsList.join(' ')}`)
      });
    }

    devtoCache.set(cacheKey, normalizedArticles, nowMs);
  }

  const tokens = buildSearchTokens(params);
  const matched = [];
  const fallback = [];

  for (const art of normalizedArticles) {
    const cleanItem = {
      title: art.title,
      snippet: art.snippet,
      url: art.url,
      source: 'devto',
      region: 'global',
      created_at: art.created_at
    };
    if (matchesAnyToken(art._searchText, tokens)) {
      matched.push(cleanItem);
    } else {
      fallback.push(cleanItem);
    }
  }

  // Etiketle eşleşen makalelerde anahtar kelime eşleşenleri önceliklendir
  const selected = (matched.length > 0 ? matched : fallback).slice(0, MAX_ITEMS_PER_SOURCE);

  return {
    status: 'ok',
    count: selected.length,
    items: selected
  };
}

async function fetchLobstersFeed(feedName, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_SOURCE_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl || fetch;
  const nowMs = typeof options.now === 'function' ? options.now() : Date.now();
  const cacheKey = `lobsters:${feedName}`;

  const cached = lobstersCache.get(cacheKey, nowMs);
  if (cached !== null) {
    return cached;
  }

  const url = `https://lobste.rs/${feedName}.json`;
  const res = await fetchWithAbort(url, {
    timeoutMs,
    fetchImpl,
    headers: { 'Accept': 'application/json' }
  });

  if (!res || !res.ok) {
    throw new Error(`Lobste.rs (${feedName}) HTTP ${res ? res.status : 'unknown'}`);
  }

  const rawList = await res.json();
  const list = Array.isArray(rawList) ? rawList : [];
  const cleaned = [];

  for (const story of list) {
    if (!story || typeof story !== 'object' || !story.title) continue;
    const safeUrl = toSafeHttpsUrl(story.comments_url) || toSafeHttpsUrl(story.url);
    if (!safeUrl) continue;

    // KVKK: submitter_user, submitter, avatar vb. tüm kullanıcı PII alanları KESİNLİKLE atılır
    const title = maskPii(story.title).slice(0, 200);
    const description = maskPii(story.description_plain || story.description || '').slice(0, 260);
    if (!title) continue;

    const tagsList = Array.isArray(story.tags)
      ? story.tags.map(t => cleanControlChars(t)).filter(Boolean)
      : [];

    cleaned.push({
      title,
      snippet: description || (tagsList.length > 0 ? `Tags: ${tagsList.join(', ')}` : title),
      url: safeUrl,
      source: 'lobsters',
      region: 'global',
      created_at: toIsoDate(story.created_at),
      _searchText: normalizeTurkish(`${title} ${description} ${tagsList.join(' ')}`)
    });
  }

  lobstersCache.set(cacheKey, cleaned, nowMs);
  return cleaned;
}

async function searchLobsters(params = {}, options = {}) {
  const tokens = buildSearchTokens(params);
  if (tokens.length === 0) {
    return { status: 'ok', count: 0, items: [] };
  }

  const settled = await Promise.allSettled([
    fetchLobstersFeed('hottest', options),
    fetchLobstersFeed('newest', options)
  ]);

  let anyFulfilled = false;
  const seenUrls = new Set();
  const matched = [];

  for (const outcome of settled) {
    if (outcome.status === 'fulfilled' && Array.isArray(outcome.value)) {
      anyFulfilled = true;
      for (const story of outcome.value) {
        if (!story || !story.url || seenUrls.has(story.url)) continue;
        if (!matchesAnyToken(story._searchText, tokens)) continue;
        seenUrls.add(story.url);
        matched.push({
          title: story.title,
          snippet: story.snippet,
          url: story.url,
          source: 'lobsters',
          region: 'global',
          created_at: story.created_at
        });
        if (matched.length >= MAX_ITEMS_PER_SOURCE) break;
      }
    }
    if (matched.length >= MAX_ITEMS_PER_SOURCE) break;
  }

  if (!anyFulfilled) {
    throw new Error('Lobste.rs feeds (hottest & newest) failed');
  }

  return {
    status: 'ok',
    count: matched.length,
    items: matched
  };
}

module.exports = {
  CACHE_TTL_MS,
  searchDevTo,
  searchLobsters,
  clearDevToLobstersCache
};
