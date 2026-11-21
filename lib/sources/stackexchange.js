'use strict';

const store = require('../store');
const {
  DEFAULT_SOURCE_TIMEOUT_MS,
  cleanControlChars,
  toSafeHttpsUrl,
  toIsoDate,
  maskPii,
  fetchWithAbort
} = require('./utils');

const STACKEXCHANGE_BASE_URL = 'https://api.stackexchange.com/2.3/search/advanced';
const MAX_RESULTS_PER_SITE = 5;
const MAX_TOTAL_RESULTS = 8;

let backoffUntilMs = 0;

function resetBackoff() {
  backoffUntilMs = 0;
}

function getApiKey(options = {}) {
  if (typeof options.apiKey === 'string') {
    return options.apiKey.trim();
  }
  const envKey = typeof process.env.STACKEXCHANGE_API_KEY === 'string'
    ? process.env.STACKEXCHANGE_API_KEY.trim()
    : '';
  if (envKey) return envKey;
  try {
    return String(store.getSetting('stackExchangeApiKey') || '').trim();
  } catch {
    return '';
  }
}

function decodeHtmlEntitiesBasic(str) {
  return String(str || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function buildQueryParams(site, queryText, apiKey) {
  const params = new URLSearchParams({
    order: 'desc',
    sort: 'activity',
    site,
    pagesize: String(MAX_RESULTS_PER_SITE),
    q: queryText
  });
  if (apiKey) {
    params.set('key', apiKey);
  }
  return params.toString();
}

async function queryStackExchangeSite(site, queryText, apiKey, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_SOURCE_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl || fetch;
  const nowMs = typeof options.now === 'function' ? options.now() : Date.now();

  if (nowMs < backoffUntilMs) {
    return { items: [], backedOff: true };
  }

  const url = `${STACKEXCHANGE_BASE_URL}?${buildQueryParams(site, queryText, apiKey)}`;
  const res = await fetchWithAbort(url, {
    timeoutMs,
    fetchImpl,
    headers: { 'Accept': 'application/json' }
  });

  if (!res || !res.ok) {
    throw new Error(`StackExchange ${site} HTTP ${res ? res.status : 'unknown'}`);
  }

  const data = await res.json();
  if (data && typeof data.backoff === 'number' && data.backoff > 0) {
    backoffUntilMs = Math.max(backoffUntilMs, nowMs + data.backoff * 1000);
  }
  if (data && typeof data.quota_remaining === 'number' && data.quota_remaining <= 5) {
    backoffUntilMs = Math.max(backoffUntilMs, nowMs + 5 * 60 * 1000);
  }

  const rawItems = (data && Array.isArray(data.items)) ? data.items : [];
  const normalized = [];

  for (const q of rawItems) {
    if (!q || !q.title) continue;
    const safeUrl = toSafeHttpsUrl(q.link);
    if (!safeUrl) continue;

    // KVKK: q.owner alanı kesinlikle okunmaz ve çıktıya dahil edilmez
    const title = maskPii(decodeHtmlEntitiesBasic(q.title)).slice(0, 200);
    const tags = Array.isArray(q.tags)
      ? q.tags.slice(0, 5).map(t => cleanControlChars(t)).filter(Boolean)
      : [];
    const snippet = maskPii(
      `StackExchange (${site}) sorusu${tags.length ? ` [${tags.join(', ')}]` : ''}: ${title}`
    ).slice(0, 240);

    normalized.push({
      title,
      snippet,
      url: safeUrl,
      source: 'stackexchange',
      region: 'global',
      site,
      tags,
      created_at: toIsoDate(q.creation_date)
    });
  }

  return { items: normalized, backedOff: false };
}

async function fetchStackExchangeSignals(spec, options = {}) {
  const nowMs = typeof options.now === 'function' ? options.now() : Date.now();
  if (nowMs < backoffUntilMs) {
    return { status: 'ok', count: 0, items: [], reason: 'backoff' };
  }

  const keywords = Array.isArray(spec.keywords) ? spec.keywords : [];
  const competitors = Array.isArray(spec.competitors) ? spec.competitors : [];
  const primaryKw = cleanControlChars(keywords[0] || spec.repo_name || '').split(/\s+/).slice(0, 4).join(' ');
  if (!primaryKw) {
    return { status: 'ok', count: 0, items: [] };
  }

  const soQuery = competitors.length > 0
    ? `${primaryKw} ${cleanControlChars(competitors[0])} alternative`
    : `${primaryKw} alternative self-hosted`;

  const apiKey = getApiKey(options);

  const [recsRes, soRes] = await Promise.allSettled([
    queryStackExchangeSite('softwarerecs', primaryKw, apiKey, options),
    queryStackExchangeSite('stackoverflow', soQuery, apiKey, options)
  ]);

  const anySuccess = recsRes.status === 'fulfilled' || soRes.status === 'fulfilled';
  if (!anySuccess) {
    throw new Error('StackExchange sites failed');
  }

  const combined = [];
  const seenUrls = new Set();
  for (const result of [recsRes, soRes]) {
    if (result.status !== 'fulfilled') continue;
    for (const item of result.value.items) {
      if (seenUrls.has(item.url)) continue;
      seenUrls.add(item.url);
      combined.push(item);
      if (combined.length >= MAX_TOTAL_RESULTS) break;
    }
    if (combined.length >= MAX_TOTAL_RESULTS) break;
  }

  return {
    status: 'ok',
    count: combined.length,
    items: combined
  };
}

module.exports = {
  fetchStackExchangeSignals,
  resetBackoff
};
