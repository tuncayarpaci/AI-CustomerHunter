'use strict';

const crypto = require('crypto');

const { fetchStackExchangeSignals } = require('./sources/stackexchange');
const { fetchAppStoreSignals } = require('./sources/appstore');
const { fetchRssSourceSignals } = require('./sources/rss-feeds');
const { fetchBlueskySignals } = require('./sources/bluesky');
const {
  DEFAULT_SOURCE_TIMEOUT_MS,
  cleanControlChars,
  toSafeHttpsUrl,
  toIsoDate,
  LruTtlCache
} = require('./sources/utils');

const DEFAULT_CACHE_MAX = 100;
const DEFAULT_CACHE_TTL_MS = 15 * 60 * 1000;
const DEFAULT_OVERALL_BUDGET_MS = 7800;

const ALL_SOURCE_KEYS = [
  'reddit',
  'hackernews',
  'github',
  'stackexchange',
  'appstore_tr',
  'appstore_us',
  'producthunt',
  'webrazzi_tr',
  'technopat_tr',
  'bluesky'
];

const SOURCE_REGIONS = {
  reddit: 'global',
  hackernews: 'global',
  github: 'global',
  stackexchange: 'global',
  appstore_tr: 'tr',
  appstore_us: 'global',
  producthunt: 'global',
  webrazzi_tr: 'tr',
  technopat_tr: 'tr',
  bluesky: 'global'
};

const VALID_REGIONS = new Set(['all', 'global', 'tr']);
const VALID_SOURCE_SET = new Set(ALL_SOURCE_KEYS);

const CHURN_PATTERNS = [
  'alternative to',
  'switching from',
  'tired of',
  'hate ',
  'frustrated with',
  'too expensive',
  'shut down',
  'replacing',
  'cancel',
  'migrate from',
  'moving away from',
  'alternative',
  // Türkçe kalıplar
  'alternatif',
  'çok pahalı',
  'cok pahali',
  'abonelik',
  'iptal',
  'bıraktım',
  'biraktim',
  'yerine'
];

const BUYER_PATTERNS = [
  'looking for',
  'recommend',
  'what tool',
  'best tool',
  'any suggestions',
  'what are you using',
  'which software',
  'advice on',
  'budget',
  'ready to pay',
  'pricing',
  'per month',
  '/mo',
  'paid tool',
  'worth paying',
  'under $',
  'need a tool',
  'searching for',
  // Türkçe kalıplar
  'öneri',
  'oneri',
  'arıyorum',
  'ariyorum',
  'tavsiye',
  'hangi program',
  'hangi uygulama',
  'ücretli',
  'ucretli'
];

const PAIN_PATTERNS = [
  'problem',
  'issue',
  'broken',
  'slow',
  'pain',
  'struggling',
  'annoying',
  'bug',
  'missing',
  'hard to',
  'difficult',
  'manual',
  'bottleneck',
  'limitation',
  "doesn't work",
  'cannot',
  // Türkçe kalıplar
  'çalışmıyor',
  'calismiyor',
  'eksik',
  'kilitleniyor',
  'donuyor',
  'türkçe destek',
  'turkce destek',
  'yavaş',
  'yavas',
  'hata',
  'sorun'
];

function verifyInternalToken(providedToken, expectedToken) {
  const expected = typeof expectedToken === 'string' ? expectedToken.trim() : '';
  if (!expected) {
    return { ok: false, status: 503, error: 'Internal API token is not configured' };
  }
  const provided = typeof providedToken === 'string' ? providedToken.trim() : '';
  if (!provided) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  const expectedDigest = crypto.createHash('sha256').update(expected, 'utf8').digest();
  const providedDigest = crypto.createHash('sha256').update(provided, 'utf8').digest();
  if (!crypto.timingSafeEqual(expectedDigest, providedDigest)) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  return { ok: true };
}

function validateDemandSignalInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: 'Request body must be a JSON object' };
  }

  let repoName = '';
  const rawRepoName = body.repo_name !== undefined && body.repo_name !== null
    ? body.repo_name
    : (body.name !== undefined && body.name !== null ? body.name : undefined);

  if (rawRepoName !== undefined) {
    if (typeof rawRepoName !== 'string') {
      return { ok: false, error: 'repo_name must be a string' };
    }
    repoName = cleanControlChars(rawRepoName);
    if (repoName.length > 160) {
      return { ok: false, error: 'repo_name must be at most 160 characters' };
    }
  }

  if (!Array.isArray(body.keywords) || body.keywords.length < 1 || body.keywords.length > 6) {
    return { ok: false, error: 'keywords must be an array of 1 to 6 strings' };
  }

  const keywords = [];
  const seenKw = new Set();
  for (const item of body.keywords) {
    if (typeof item !== 'string') {
      return { ok: false, error: 'Each keyword must be a string' };
    }
    const cleaned = cleanControlChars(item);
    if (cleaned.length < 2 || cleaned.length > 64) {
      return { ok: false, error: 'Each keyword must be between 2 and 64 characters' };
    }
    const lower = cleaned.toLowerCase();
    if (!seenKw.has(lower)) {
      seenKw.add(lower);
      keywords.push(cleaned);
    }
  }
  if (keywords.length < 1) {
    return { ok: false, error: 'keywords must contain at least 1 valid keyword' };
  }

  const competitors = [];
  if (body.competitors !== undefined && body.competitors !== null) {
    if (!Array.isArray(body.competitors) || body.competitors.length > 4) {
      return { ok: false, error: 'competitors must be an array of 0 to 4 strings' };
    }
    const seenComp = new Set();
    for (const item of body.competitors) {
      if (typeof item !== 'string') {
        return { ok: false, error: 'Each competitor must be a string' };
      }
      const cleaned = cleanControlChars(item);
      if (cleaned.length < 1 || cleaned.length > 48) {
        return { ok: false, error: 'Each competitor must be between 1 and 48 characters' };
      }
      const lower = cleaned.toLowerCase();
      if (!seenComp.has(lower)) {
        seenComp.add(lower);
        competitors.push(cleaned);
      }
    }
  }

  let category = '';
  if (body.category !== undefined && body.category !== null) {
    if (typeof body.category !== 'string') {
      return { ok: false, error: 'category must be a string' };
    }
    category = cleanControlChars(body.category);
    if (category.length > 80) {
      return { ok: false, error: 'category must be at most 80 characters' };
    }
  }

  let region = 'all';
  if (body.region !== undefined && body.region !== null && body.region !== '') {
    if (typeof body.region !== 'string' || !VALID_REGIONS.has(body.region.trim().toLowerCase())) {
      return { ok: false, error: 'region must be one of: all, global, tr' };
    }
    region = body.region.trim().toLowerCase();
  }

  let sources = null;
  if (body.sources !== undefined && body.sources !== null) {
    if (!Array.isArray(body.sources) || body.sources.length < 1 || body.sources.length > ALL_SOURCE_KEYS.length) {
      return { ok: false, error: 'sources must be a non-empty array of valid source keys' };
    }
    const dedupSources = [];
    const seenSrc = new Set();
    for (const s of body.sources) {
      if (typeof s !== 'string' || !VALID_SOURCE_SET.has(s.trim().toLowerCase())) {
        return { ok: false, error: `Invalid source key: ${String(s)}` };
      }
      const key = s.trim().toLowerCase();
      if (!seenSrc.has(key)) {
        seenSrc.add(key);
        dedupSources.push(key);
      }
    }
    sources = dedupSources;
  }

  return {
    ok: true,
    value: {
      repo_name: repoName,
      keywords,
      competitors,
      category,
      region,
      sources
    }
  };
}

function resolveSelectedSources(spec) {
  const region = spec.region || 'all';
  const base = Array.isArray(spec.sources) && spec.sources.length > 0
    ? spec.sources.filter(k => VALID_SOURCE_SET.has(k))
    : ALL_SOURCE_KEYS;

  if (region === 'all') return base;
  return base.filter(k => SOURCE_REGIONS[k] === region);
}

function buildCacheKey(spec) {
  return JSON.stringify({
    keywords: spec.keywords.map(k => k.toLowerCase()).sort(),
    competitors: spec.competitors.map(c => c.toLowerCase()).sort(),
    category: (spec.category || '').toLowerCase(),
    region: spec.region || 'all',
    sources: Array.isArray(spec.sources) ? [...spec.sources].sort() : null
  });
}

function classifyRealSignal(text, createdAtIso, spec, nowMs = Date.now()) {
  const lower = String(text || '').toLocaleLowerCase('tr-TR');
  const competitors = spec.competitors || [];
  const keywords = spec.keywords || [];

  const matchedCompetitor = competitors.some(c => lower.includes(c.toLocaleLowerCase('tr-TR')));
  const matchedChurn = CHURN_PATTERNS.some(p => lower.includes(p));
  const matchedBuyer = BUYER_PATTERNS.some(p => lower.includes(p));
  const matchedPain = PAIN_PATTERNS.some(p => lower.includes(p));

  let intent_type = 'pain_point';
  if (matchedChurn) {
    intent_type = 'competitor_churn';
  } else if (matchedBuyer) {
    intent_type = 'active_buyer';
  }

  let matchedKeywordCount = 0;
  for (const kw of keywords) {
    const words = kw.toLocaleLowerCase('tr-TR').split(/\s+/).filter(w => w.length > 2);
    if (words.length > 0 && words.some(w => lower.includes(w))) {
      matchedKeywordCount += 1;
    }
  }

  let score = 20;
  if (intent_type === 'competitor_churn') {
    score += 28;
  } else if (intent_type === 'active_buyer') {
    score += 25;
  } else {
    score += matchedPain ? 22 : 12;
  }

  if (matchedCompetitor) score += 15;
  score += Math.min(2, matchedKeywordCount) * 10;
  if (lower.includes('?')) score += 5;

  const createdMs = Date.parse(createdAtIso);
  if (!Number.isNaN(createdMs) && nowMs - createdMs <= 14 * 24 * 60 * 60 * 1000 && createdMs <= nowMs + 86400000) {
    score += 5;
  }

  score = Math.max(10, Math.min(98, Math.round(score)));
  return { intent_type, score };
}

function calculateCalibratedDemandScore(posts, sources) {
  const total_matches = posts.length;
  let active_buyer_count = 0;
  let competitor_churn_count = 0;
  let pain_point_count = 0;

  for (const post of posts) {
    if (post.intent_type === 'active_buyer') active_buyer_count += 1;
    else if (post.intent_type === 'competitor_churn') competitor_churn_count += 1;
    else pain_point_count += 1;
  }

  if (total_matches === 0) {
    return {
      demand_score: 0,
      demand_level: 'yok',
      total_matches: 0,
      active_buyer_count: 0,
      competitor_churn_count: 0,
      pain_point_count: 0
    };
  }

  const volumeScore = Math.min(30, total_matches * 4);
  const intentScore = Math.min(40, active_buyer_count * 12 + competitor_churn_count * 12 + pain_point_count * 5);
  const activeSourceCount = Object.values(sources).filter(s => s && s.count > 0).length;
  const diversityScore = Math.min(18, activeSourceCount * 5);
  const avgPostScore = posts.reduce((acc, p) => acc + (Number(p.score) || 0), 0) / total_matches;
  const qualityBonus = Math.round((avgPostScore / 100) * 12);

  const demand_score = Math.max(0, Math.min(100, Math.round(volumeScore + intentScore + diversityScore + qualityBonus)));
  const demand_level = demand_score >= 70
    ? 'yuksek'
    : demand_score >= 45
      ? 'orta'
      : demand_score >= 15
        ? 'zayif'
        : 'yok';

  return {
    demand_score,
    demand_level,
    total_matches,
    active_buyer_count,
    competitor_churn_count,
    pain_point_count
  };
}

async function fetchJsonWithTimeout(url, timeoutMs, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'ReplyPulseAI-DemandSignal/1.0 (+https://customerhunter.appcook.store)',
        'Accept': 'application/json'
      }
    });
    if (!res || !res.ok) {
      throw new Error(`HTTP ${res ? res.status : 'unknown'}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchRedditSignals(spec, timeoutMs, fetchImpl, nowMs) {
  const baseQuery = spec.keywords.slice(0, 2).join(' OR ');
  const compPart = spec.competitors.length > 0 ? ` OR "${spec.competitors[0]} alternative"` : '';
  const query = encodeURIComponent(`${baseQuery}${compPart}`);
  const data = await fetchJsonWithTimeout(
    `https://www.reddit.com/search.json?q=${query}&sort=new&limit=6`,
    timeoutMs,
    fetchImpl
  );
  const children = (data && data.data && Array.isArray(data.data.children)) ? data.data.children : [];
  const posts = [];
  for (const item of children) {
    const post = item && item.data;
    if (!post || !post.title) continue;
    const rawUrl = post.permalink
      ? `https://www.reddit.com${post.permalink}`
      : post.url;
    const url = toSafeHttpsUrl(rawUrl);
    if (!url) continue;
    const created_at = toIsoDate(post.created_utc);
    const title = cleanControlChars(post.title).slice(0, 200);
    const text = `${title} ${post.selftext || ''}`;
    const { intent_type, score } = classifyRealSignal(text, created_at, spec, nowMs);
    posts.push({ title, url, source: 'reddit', intent_type, score, created_at });
  }
  return { status: 'ok', items: posts };
}

async function fetchHackerNewsSignals(spec, timeoutMs, fetchImpl, nowMs) {
  const hnQuery = encodeURIComponent(spec.keywords[0].split(/\s+/).slice(0, 3).join(' '));
  const data = await fetchJsonWithTimeout(
    `https://hn.algolia.com/api/v1/search_by_date?query=${hnQuery}&tags=story&hitsPerPage=6`,
    timeoutMs,
    fetchImpl
  );
  const hits = (data && Array.isArray(data.hits)) ? data.hits : [];
  const posts = [];
  for (const hit of hits) {
    if (!hit || !hit.title) continue;
    const fallbackUrl = hit.objectID ? `https://news.ycombinator.com/item?id=${encodeURIComponent(String(hit.objectID))}` : null;
    const url = toSafeHttpsUrl(hit.url) || toSafeHttpsUrl(fallbackUrl);
    if (!url) continue;
    const created_at = toIsoDate(hit.created_at || hit.created_at_i);
    const title = cleanControlChars(hit.title).slice(0, 200);
    const storyText = String(hit.story_text || '').replace(/<[^>]+>/g, ' ');
    const { intent_type, score } = classifyRealSignal(`${title} ${storyText}`, created_at, spec, nowMs);
    posts.push({ title, url, source: 'hackernews', intent_type, score, created_at });
  }
  return { status: 'ok', items: posts };
}

async function fetchGitHubSignals(spec, timeoutMs, fetchImpl, nowMs) {
  const ghQuery = encodeURIComponent(spec.keywords[0].split(/\s+/).slice(0, 3).join(' '));
  const data = await fetchJsonWithTimeout(
    `https://api.github.com/search/issues?q=${ghQuery}+in:title,body&sort=updated&per_page=4`,
    timeoutMs,
    fetchImpl
  );
  const items = (data && Array.isArray(data.items)) ? data.items : [];
  const posts = [];
  for (const issue of items) {
    if (!issue || !issue.title) continue;
    const url = toSafeHttpsUrl(issue.html_url);
    if (!url) continue;
    const created_at = toIsoDate(issue.created_at || issue.updated_at);
    const title = cleanControlChars(issue.title).slice(0, 200);
    const { intent_type, score } = classifyRealSignal(`${title} ${issue.body || ''}`, created_at, spec, nowMs);
    posts.push({ title, url, source: 'github', intent_type, score, created_at });
  }
  return { status: 'ok', items: posts };
}

function classifyNormalizedItems(rawItems, sourceKey, spec, nowMs) {
  const posts = [];
  for (const item of rawItems) {
    if (!item || !item.title) continue;
    const url = toSafeHttpsUrl(item.url);
    if (!url) continue;
    const created_at = toIsoDate(item.created_at);
    const title = cleanControlChars(item.title).slice(0, 200);
    const text = `${title} ${item.snippet || ''}`;
    const { intent_type, score } = classifyRealSignal(text, created_at, spec, nowMs);
    const normalized = {
      title,
      url,
      source: sourceKey,
      intent_type,
      score,
      created_at
    };
    if (item.rating !== undefined) normalized.rating = item.rating;
    if (item.country) normalized.country = item.country;
    if (item.snippet) normalized.snippet = item.snippet;
    posts.push(normalized);
  }
  return posts;
}

async function runSingleSource(sourceKey, spec, ctx) {
  const { timeoutMs, fetchImpl, nowMs } = ctx;
  const srcOpts = {
    timeoutMs,
    fetchImpl,
    now: () => nowMs
  };

  if (sourceKey === 'reddit') {
    return fetchRedditSignals(spec, timeoutMs, fetchImpl, nowMs);
  }
  if (sourceKey === 'hackernews') {
    return fetchHackerNewsSignals(spec, timeoutMs, fetchImpl, nowMs);
  }
  if (sourceKey === 'github') {
    return fetchGitHubSignals(spec, timeoutMs, fetchImpl, nowMs);
  }
  if (sourceKey === 'stackexchange') {
    const res = await fetchStackExchangeSignals(spec, srcOpts);
    return { status: res.status || 'ok', items: classifyNormalizedItems(res.items || [], 'stackexchange', spec, nowMs) };
  }
  if (sourceKey === 'appstore_tr') {
    const res = await fetchAppStoreSignals(spec, 'tr', srcOpts);
    return { status: res.status || 'ok', items: classifyNormalizedItems(res.items || [], 'appstore_tr', spec, nowMs) };
  }
  if (sourceKey === 'appstore_us') {
    const res = await fetchAppStoreSignals(spec, 'us', srcOpts);
    return { status: res.status || 'ok', items: classifyNormalizedItems(res.items || [], 'appstore_us', spec, nowMs) };
  }
  if (sourceKey === 'producthunt' || sourceKey === 'webrazzi_tr' || sourceKey === 'technopat_tr') {
    const res = await fetchRssSourceSignals(sourceKey, spec, srcOpts);
    return { status: res.status || 'ok', items: classifyNormalizedItems(res.items || [], sourceKey, spec, nowMs) };
  }
  if (sourceKey === 'bluesky') {
    const res = await fetchBlueskySignals(spec, srcOpts);
    if (res.status === 'unconfigured') {
      return { status: 'unconfigured', items: [] };
    }
    return { status: res.status || 'ok', items: classifyNormalizedItems(res.items || [], 'bluesky', spec, nowMs) };
  }
  throw new Error(`Unsupported source: ${sourceKey}`);
}

function withOverallBudget(promise, budgetMs) {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error('Overall budget exceeded')), budgetMs);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

async function scanRealSourcesForDemand(spec, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_SOURCE_TIMEOUT_MS;
  const overallBudgetMs = options.overallBudgetMs || DEFAULT_OVERALL_BUDGET_MS;
  const fetchImpl = options.fetchImpl || fetch;
  const nowMs = typeof options.now === 'function' ? options.now() : Date.now();

  const selectedSources = resolveSelectedSources(spec);
  const ctx = { timeoutMs, fetchImpl, nowMs };

  const settled = await Promise.allSettled(
    selectedSources.map(sourceKey =>
      withOverallBudget(runSingleSource(sourceKey, spec, ctx), overallBudgetMs)
    )
  );

  const seenUrls = new Set();
  const dedupe = (list) => {
    const unique = [];
    for (const item of list) {
      if (!item || !item.url || seenUrls.has(item.url)) continue;
      seenUrls.add(item.url);
      unique.push(item);
    }
    return unique;
  };

  const sources = {};
  const allPosts = [];

  for (let i = 0; i < selectedSources.length; i++) {
    const key = selectedSources[i];
    const outcome = settled[i];

    if (outcome.status === 'fulfilled' && outcome.value) {
      const val = outcome.value;
      if (val.status === 'unconfigured') {
        sources[key] = { status: 'unconfigured', count: 0 };
        continue;
      }
      const items = dedupe(val.items || []);
      sources[key] = { status: 'ok', count: items.length };
      allPosts.push(...items);
    } else {
      sources[key] = { status: 'error', count: 0 };
    }
  }

  const metrics = calculateCalibratedDemandScore(allPosts, sources);
  const sample_posts = [...allPosts]
    .sort((a, b) => (b.score - a.score) || b.created_at.localeCompare(a.created_at))
    .slice(0, 3)
    .map(p => ({
      title: p.title,
      url: p.url,
      source: p.source,
      intent_type: p.intent_type,
      score: p.score,
      created_at: p.created_at
    }));

  return {
    ...metrics,
    sources,
    sample_posts,
    cached: false,
    fetched_at: new Date(nowMs).toISOString()
  };
}

function createDemandSignalService(options = {}) {
  const cache = new LruTtlCache(
    options.cacheMax || DEFAULT_CACHE_MAX,
    options.cacheTtlMs || DEFAULT_CACHE_TTL_MS
  );
  const timeoutMs = options.timeoutMs || DEFAULT_SOURCE_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl || fetch;
  const nowFn = options.now || (() => Date.now());

  return {
    cache,
    async getDemandSignal(spec) {
      const nowMs = nowFn();
      const cacheKey = buildCacheKey(spec);
      const cachedPayload = cache.get(cacheKey, nowMs);
      if (cachedPayload) {
        return { ...cachedPayload, cached: true };
      }

      const fresh = await scanRealSourcesForDemand(spec, {
        timeoutMs,
        fetchImpl,
        now: () => nowMs
      });

      const anySourceOk = Object.values(fresh.sources).some(s => s.status === 'ok');
      if (anySourceOk) {
        cache.set(cacheKey, fresh, nowMs);
      }
      return fresh;
    }
  };
}

module.exports = {
  DEFAULT_CACHE_MAX,
  DEFAULT_CACHE_TTL_MS,
  DEFAULT_SOURCE_TIMEOUT_MS,
  ALL_SOURCE_KEYS,
  SOURCE_REGIONS,
  LruTtlCache,
  verifyInternalToken,
  validateDemandSignalInput,
  classifyRealSignal,
  calculateCalibratedDemandScore,
  scanRealSourcesForDemand,
  createDemandSignalService
};
