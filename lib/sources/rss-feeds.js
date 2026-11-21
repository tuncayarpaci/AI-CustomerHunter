'use strict';

const {
  DEFAULT_SOURCE_TIMEOUT_MS,
  cleanControlChars,
  toSafeHttpsUrl,
  toIsoDate,
  maskPii,
  normalizeTurkish,
  fetchWithAbort,
  readResponseTextLimited
} = require('./utils');

const RSS_CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_FEED_BYTES = 512 * 1024;
const MAX_CACHED_ITEMS_PER_FEED = 50;
const MAX_MATCHED_ITEMS = 4;

const RSS_FEEDS = {
  producthunt: {
    url: 'https://www.producthunt.com/feed',
    region: 'global',
    label: 'Product Hunt'
  },
  webrazzi_tr: {
    url: 'https://webrazzi.com/feed/',
    region: 'tr',
    label: 'Webrazzi TR'
  },
  technopat_tr: {
    url: 'https://www.technopat.net/sosyal/forums/-/index.rss',
    region: 'tr',
    label: 'Technopat TR'
  }
};

// Her besleme için 30 dk önbellek + ETag/Last-Modified
const feedCache = new Map();

function clearRssCache() {
  feedCache.clear();
}

function decodeXmlEntities(str) {
  return String(str || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      const code = parseInt(hex, 16);
      return Number.isFinite(code) && code > 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : ' ';
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = parseInt(dec, 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10FFFF ? String.fromCodePoint(code) : ' ';
    })
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function stripHtmlTags(str) {
  return String(str || '').replace(/<[^>]*>/g, ' ');
}

function extractTagContent(block, tagName) {
  const re = new RegExp(`<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const m = block.match(re);
  return m ? m[1] : '';
}

function extractAtomLink(block) {
  const altMatch = block.match(/<link\b[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["'][^>]*\/?>/i) ||
    block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']alternate["'][^>]*\/?>/i) ||
    block.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  if (altMatch && altMatch[1]) {
    return decodeXmlEntities(altMatch[1]).trim();
  }
  const textLink = extractTagContent(block, 'link');
  return decodeXmlEntities(textLink).trim();
}

function parseXmlFeed(xmlText, sourceKey, region) {
  if (typeof xmlText !== 'string' || !xmlText.trim()) return [];

  // XXE / DTD güvenliği: DOCTYPE ve ENTITY bildirimlerini kesinlikle yoksay
  const sanitizedXml = xmlText
    .replace(/<!DOCTYPE[\s\S]*?(?:\]>|>)/gi, '')
    .replace(/<!ENTITY[\s\S]*?>/gi, '');

  const items = [];
  const isAtom = /<entry[\s>]/i.test(sanitizedXml) && !/<item[\s>]/i.test(sanitizedXml);
  const blockRe = isAtom
    ? /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi
    : /<item\b[^>]*>([\s\S]*?)<\/item>/gi;

  let match;
  while ((match = blockRe.exec(sanitizedXml)) !== null) {
    const block = match[1];
    // KVKK: <dc:creator> ve <author> etiketleri kesinlikle okunmaz ve saklanmaz
    const rawTitle = stripHtmlTags(decodeXmlEntities(extractTagContent(block, 'title')));
    const title = maskPii(rawTitle).slice(0, 200);
    if (!title) continue;

    const rawLink = isAtom
      ? extractAtomLink(block)
      : decodeXmlEntities(extractTagContent(block, 'link')).trim();
    const safeUrl = toSafeHttpsUrl(rawLink);
    if (!safeUrl) continue;

    const rawDesc = isAtom
      ? (extractTagContent(block, 'summary') || extractTagContent(block, 'content'))
      : (extractTagContent(block, 'description') || extractTagContent(block, 'content:encoded'));
    const snippet = maskPii(stripHtmlTags(decodeXmlEntities(rawDesc))).slice(0, 260) || title;

    const rawDate = isAtom
      ? (extractTagContent(block, 'published') || extractTagContent(block, 'updated'))
      : (extractTagContent(block, 'pubDate') || extractTagContent(block, 'dc:date'));

    items.push({
      title,
      snippet,
      url: safeUrl,
      source: sourceKey,
      region,
      created_at: toIsoDate(decodeXmlEntities(rawDate).trim())
    });

    if (items.length >= MAX_CACHED_ITEMS_PER_FEED) break;
  }

  return items;
}

async function getCachedFeedItems(sourceKey, options = {}) {
  const def = RSS_FEEDS[sourceKey];
  if (!def) {
    throw new Error(`Unknown RSS feed source: ${sourceKey}`);
  }

  const nowMs = typeof options.now === 'function' ? options.now() : Date.now();
  const cached = feedCache.get(sourceKey);
  if (cached && nowMs < cached.expiresAt) {
    return cached.items;
  }

  const headers = {
    'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8'
  };
  if (cached && cached.etag) headers['If-None-Match'] = cached.etag;
  if (cached && cached.lastModified) headers['If-Modified-Since'] = cached.lastModified;

  const res = await fetchWithAbort(def.url, {
    timeoutMs: options.timeoutMs || DEFAULT_SOURCE_TIMEOUT_MS,
    fetchImpl: options.fetchImpl || fetch,
    headers
  });

  if (res && res.status === 304 && cached) {
    cached.expiresAt = nowMs + RSS_CACHE_TTL_MS;
    return cached.items;
  }

  if (!res || !res.ok) {
    throw new Error(`RSS ${sourceKey} HTTP ${res ? res.status : 'unknown'}`);
  }

  const xmlText = await readResponseTextLimited(res, MAX_FEED_BYTES);
  const parsedItems = parseXmlFeed(xmlText, sourceKey, def.region);

  const etag = res.headers && typeof res.headers.get === 'function' ? (res.headers.get('etag') || '') : '';
  const lastModified = res.headers && typeof res.headers.get === 'function' ? (res.headers.get('last-modified') || '') : '';

  feedCache.set(sourceKey, {
    items: parsedItems,
    expiresAt: nowMs + RSS_CACHE_TTL_MS,
    etag,
    lastModified
  });

  return parsedItems;
}

function buildSearchTokens(spec) {
  const rawTerms = [
    ...(Array.isArray(spec.keywords) ? spec.keywords : []),
    ...(Array.isArray(spec.competitors) ? spec.competitors : [])
  ];
  const phrases = [];
  const words = new Set();

  for (const term of rawTerms) {
    const norm = normalizeTurkish(cleanControlChars(term));
    if (!norm) continue;
    if (norm.length >= 2) phrases.push(norm);
    for (const part of norm.split(/\s+/)) {
      if (part.length >= 3) words.add(part);
    }
  }

  return { phrases, words: Array.from(words) };
}

function filterFeedItemsBySpec(feedItems, spec) {
  const { phrases, words } = buildSearchTokens(spec);
  if (phrases.length === 0 && words.length === 0) return [];

  const matched = [];
  for (const item of feedItems) {
    const haystack = normalizeTurkish(`${item.title} ${item.snippet}`);
    const hitPhrase = phrases.some(p => haystack.includes(p));
    const hitWords = !hitPhrase && words.some(w => haystack.includes(w));
    if (hitPhrase || hitWords) {
      matched.push(item);
      if (matched.length >= MAX_MATCHED_ITEMS) break;
    }
  }
  return matched;
}

async function fetchRssSourceSignals(sourceKey, spec, options = {}) {
  const feedItems = await getCachedFeedItems(sourceKey, options);
  const matched = filterFeedItemsBySpec(feedItems, spec);
  return {
    status: 'ok',
    count: matched.length,
    items: matched
  };
}

module.exports = {
  RSS_FEEDS,
  RSS_CACHE_TTL_MS,
  MAX_FEED_BYTES,
  parseXmlFeed,
  fetchRssSourceSignals,
  clearRssCache
};
