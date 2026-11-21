'use strict';

const { LruTtlCache } = require('./demand-signal');

const DEFAULT_REPORADAR_INTERNAL_URL = 'http://ai-reporadar:8070';
const DEFAULT_REPORADAR_PUBLIC_URL = 'https://radar.appcook.store';
const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_CACHE_MAX = 100;
const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_LIMIT = 3;
const MAX_QUERY_LEN = 240;
const MAX_KEYWORDS = 8;
const MAX_KEYWORD_LEN = 64;
const MAX_LEAD_ID_LEN = 128;
const MAX_LEAD_TITLE_LEN = 200;
const MAX_SOURCE_PLATFORM_LEN = 48;

function cleanControlChars(value) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toSafeHttpsUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'https:') return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function normalizeInternalBaseUrl(rawUrl) {
  const value = String(rawUrl || '').trim() || DEFAULT_REPORADAR_INTERNAL_URL;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return DEFAULT_REPORADAR_INTERNAL_URL;
    }
    return parsed.href.replace(/\/+$/, '');
  } catch {
    return DEFAULT_REPORADAR_INTERNAL_URL;
  }
}

function normalizePublicBaseUrl(rawUrl) {
  const safe = toSafeHttpsUrl(rawUrl || DEFAULT_REPORADAR_PUBLIC_URL);
  return (safe || DEFAULT_REPORADAR_PUBLIC_URL).replace(/\/+$/, '');
}

function normalizeQueryInput({
  query = '',
  keywords = [],
  limit = MAX_LIMIT,
  lead_id = '',
  lead_title = '',
  source_platform = ''
} = {}) {
  const cleanQuery = cleanControlChars(typeof query === 'string' ? query : '').slice(0, MAX_QUERY_LEN);

  const rawList = Array.isArray(keywords)
    ? keywords
    : (typeof keywords === 'string' ? keywords.split(',') : []);

  const cleanKeywords = [];
  const seen = new Set();
  for (const item of rawList) {
    if (typeof item !== 'string') continue;
    const cleaned = cleanControlChars(item).slice(0, MAX_KEYWORD_LEN);
    if (cleaned.length < 2) continue;
    const lower = cleaned.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      cleanKeywords.push(cleaned);
      if (cleanKeywords.length >= MAX_KEYWORDS) break;
    }
  }

  const parsedLimit = Number(limit);
  const cleanLimit = Number.isFinite(parsedLimit)
    ? Math.max(1, Math.min(MAX_LIMIT, Math.floor(parsedLimit)))
    : MAX_LIMIT;

  const cleanLeadId = cleanControlChars(
    typeof lead_id === 'string'
      ? lead_id
      : (typeof lead_id === 'number' && Number.isFinite(lead_id) ? String(lead_id) : '')
  ).slice(0, MAX_LEAD_ID_LEN);
  const cleanLeadTitle = cleanControlChars(
    typeof lead_title === 'string' ? lead_title : ''
  ).slice(0, MAX_LEAD_TITLE_LEN);
  const cleanSourcePlatform = cleanControlChars(
    typeof source_platform === 'string' ? source_platform : ''
  ).toLowerCase().slice(0, MAX_SOURCE_PLATFORM_LEN);

  return {
    query: cleanQuery,
    keywords: cleanKeywords,
    limit: cleanLimit,
    lead_id: cleanLeadId,
    lead_title: cleanLeadTitle,
    source_platform: cleanSourcePlatform
  };
}

function buildCacheKey(spec) {
  return JSON.stringify({
    query: spec.query.toLowerCase(),
    keywords: spec.keywords.map(k => k.toLowerCase()).sort(),
    limit: spec.limit,
    lead_id: spec.lead_id || ''
  });
}

function buildFallbackRepoUrl(fullName, publicBaseUrl) {
  const parts = String(fullName || '').split('/');
  if (parts.length !== 2) return null;
  const owner = parts[0].trim();
  const repo = parts[1].trim();
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(owner) || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo)) {
    return null;
  }
  return toSafeHttpsUrl(`${publicBaseUrl}/repo/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`);
}

function sanitizeSuggestionItem(raw, publicBaseUrl) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const fullName = cleanControlChars(raw.full_name || raw.repo_name || raw.name || '').slice(0, 140);
  if (!fullName) return null;

  const spdxLicense = cleanControlChars(raw.spdx_license || raw.license || 'OSS').slice(0, 48) || 'OSS';

  const rawScore = raw.total_commercial_score !== undefined
    ? raw.total_commercial_score
    : (raw.commercial_score !== undefined ? raw.commercial_score : raw.score);
  const numScore = Number(rawScore);
  const totalCommercialScore = Number.isFinite(numScore)
    ? Math.max(0, Math.min(100, Math.round(numScore)))
    : null;

  const summaryTr = cleanControlChars(raw.summary_tr || raw.summary || raw.description || '').slice(0, 280);

  const rawStars = raw.stars_total !== undefined ? raw.stars_total : raw.stars;
  const numStars = Number(rawStars);
  const starsTotal = Number.isFinite(numStars) && numStars >= 0 ? Math.round(numStars) : null;

  const hasExplicitRepoUrl = raw.repo_url !== undefined && raw.repo_url !== null && String(raw.repo_url).trim() !== '';
  const hasExplicitRadarUrl = raw.radar_url !== undefined && raw.radar_url !== null && String(raw.radar_url).trim() !== '';

  let repoUrl = null;
  if (hasExplicitRepoUrl) {
    repoUrl = toSafeHttpsUrl(raw.repo_url);
  } else if (hasExplicitRadarUrl) {
    repoUrl = toSafeHttpsUrl(raw.radar_url);
  } else {
    repoUrl = buildFallbackRepoUrl(fullName, publicBaseUrl);
  }

  const rawGithub = raw.github_url !== undefined ? raw.github_url : raw.html_url;
  const githubUrl = rawGithub ? toSafeHttpsUrl(rawGithub) : null;

  return {
    full_name: fullName,
    spdx_license: spdxLicense,
    total_commercial_score: totalCommercialScore,
    summary_tr: summaryTr,
    stars_total: starsTotal,
    repo_url: repoUrl,
    github_url: githubUrl
  };
}

function createOssSuggestionsService(options = {}) {
  const cache = new LruTtlCache(
    options.cacheMax || DEFAULT_CACHE_MAX,
    options.cacheTtlMs || DEFAULT_CACHE_TTL_MS
  );
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl || fetch;
  const nowFn = options.now || (() => Date.now());
  const getInternalToken = typeof options.getInternalToken === 'function'
    ? options.getInternalToken
    : () => process.env.INTERNAL_API_TOKEN || '';
  const getBaseUrl = typeof options.getBaseUrl === 'function'
    ? options.getBaseUrl
    : () => process.env.REPORADAR_INTERNAL_URL || DEFAULT_REPORADAR_INTERNAL_URL;
  const getPublicUrl = typeof options.getPublicUrl === 'function'
    ? options.getPublicUrl
    : () => process.env.REPORADAR_PUBLIC_URL || DEFAULT_REPORADAR_PUBLIC_URL;

  async function fetchOssSuggestions({
    query = '',
    keywords = [],
    limit = MAX_LIMIT,
    lead_id = '',
    lead_title = '',
    source_platform = ''
  } = {}) {
    const token = String(getInternalToken() || '').trim();
    if (!token) {
      return { ok: false, items: [], reason: 'missing_token' };
    }

    const spec = normalizeQueryInput({
      query,
      keywords,
      limit,
      lead_id,
      lead_title,
      source_platform
    });
    if (!spec.query && spec.keywords.length === 0) {
      return { ok: false, items: [], reason: 'empty_query' };
    }

    const nowMs = nowFn();
    const cacheKey = buildCacheKey(spec);
    const cachedPayload = cache.get(cacheKey, nowMs);
    if (cachedPayload) {
      return { ...cachedPayload, cached: true };
    }

    const internalBase = normalizeInternalBaseUrl(getBaseUrl());
    const publicBase = normalizePublicBaseUrl(getPublicUrl());
    const endpoint = `${internalBase}/api/internal/oss-suggestions`;

    const upstreamBody = {
      query: spec.query,
      keywords: spec.keywords,
      limit: spec.limit
    };
    if (spec.lead_id) upstreamBody.lead_id = spec.lead_id;
    if (spec.lead_title) upstreamBody.lead_title = spec.lead_title;
    if (spec.source_platform) upstreamBody.source_platform = spec.source_platform;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetchImpl(endpoint, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Internal-Token': token
        },
        body: JSON.stringify(upstreamBody)
      });

      if (!res || !res.ok) {
        const status = res && res.status ? res.status : 'unknown';
        return { ok: false, items: [], reason: `upstream_http_${status}` };
      }

      let data;
      try {
        data = await res.json();
      } catch {
        return { ok: false, items: [], reason: 'invalid_response' };
      }

      const rawItems = Array.isArray(data && data.items)
        ? data.items
        : (Array.isArray(data && data.repos) ? data.repos : []);

      const items = [];
      for (const rawItem of rawItems) {
        const cleanItem = sanitizeSuggestionItem(rawItem, publicBase);
        if (cleanItem) {
          items.push(cleanItem);
          if (items.length >= spec.limit) break;
        }
      }

      const payload = {
        ok: true,
        items,
        cached: false
      };
      cache.set(cacheKey, payload, nowMs);
      return payload;
    } catch (err) {
      const isTimeout = Boolean(err && (err.name === 'AbortError' || err.code === 'ABORT_ERR'));
      return {
        ok: false,
        items: [],
        reason: isTimeout ? 'timeout' : 'upstream_unreachable'
      };
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    cache,
    fetchOssSuggestions
  };
}

const defaultService = createOssSuggestionsService();

function fetchOssSuggestions(params) {
  return defaultService.fetchOssSuggestions(params);
}

module.exports = {
  DEFAULT_REPORADAR_INTERNAL_URL,
  DEFAULT_REPORADAR_PUBLIC_URL,
  DEFAULT_TIMEOUT_MS,
  DEFAULT_CACHE_MAX,
  DEFAULT_CACHE_TTL_MS,
  toSafeHttpsUrl,
  normalizeQueryInput,
  sanitizeSuggestionItem,
  createOssSuggestionsService,
  fetchOssSuggestions
};
