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

const BLUESKY_HOST = 'https://bsky.social';
const SESSION_TTL_MS = 45 * 60 * 1000;
const MAX_POSTS = 6;

let cachedSession = null;

function clearBlueskySession() {
  cachedSession = null;
}

function getCredentials(options = {}) {
  const handle = typeof options.handle === 'string'
    ? options.handle.trim()
    : (typeof process.env.BLUESKY_HANDLE === 'string' && process.env.BLUESKY_HANDLE.trim())
      ? process.env.BLUESKY_HANDLE.trim()
      : (() => {
        try { return String(store.getSetting('blueskyHandle') || '').trim(); } catch { return ''; }
      })();

  const appPassword = typeof options.appPassword === 'string'
    ? options.appPassword.trim()
    : (typeof process.env.BLUESKY_APP_PASSWORD === 'string' && process.env.BLUESKY_APP_PASSWORD.trim())
      ? process.env.BLUESKY_APP_PASSWORD.trim()
      : (() => {
        try { return String(store.getSetting('blueskyAppPassword') || '').trim(); } catch { return ''; }
      })();

  return { handle, appPassword };
}

async function getAccessToken(handle, appPassword, options = {}, forceRefresh = false) {
  const nowMs = typeof options.now === 'function' ? options.now() : Date.now();
  if (
    !forceRefresh &&
    cachedSession &&
    cachedSession.handle === handle &&
    nowMs < cachedSession.expiresAt &&
    cachedSession.accessJwt
  ) {
    return cachedSession.accessJwt;
  }

  const res = await fetchWithAbort(`${BLUESKY_HOST}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    timeoutMs: options.timeoutMs || DEFAULT_SOURCE_TIMEOUT_MS,
    fetchImpl: options.fetchImpl || fetch,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify({ identifier: handle, password: appPassword })
  });

  if (!res || !res.ok) {
    throw new Error(`Bluesky createSession HTTP ${res ? res.status : 'unknown'}`);
  }

  const data = await res.json();
  if (!data || typeof data.accessJwt !== 'string' || !data.accessJwt) {
    throw new Error('Bluesky createSession missing accessJwt');
  }

  cachedSession = {
    handle,
    accessJwt: data.accessJwt,
    expiresAt: nowMs + SESSION_TTL_MS
  };
  return cachedSession.accessJwt;
}

function buildPostUrl(atUri) {
  if (typeof atUri !== 'string') return null;
  const m = atUri.match(/^at:\/\/([^/]+)\/app\.bsky\.feed\.post\/([^/]+)$/);
  if (!m) return null;
  const repo = encodeURIComponent(m[1]);
  const rkey = encodeURIComponent(m[2]);
  return toSafeHttpsUrl(`https://bsky.app/profile/${repo}/post/${rkey}`);
}

async function fetchBlueskySignals(spec, options = {}) {
  const { handle, appPassword } = getCredentials(options);
  if (!handle || !appPassword) {
    return { status: 'unconfigured', count: 0, items: [] };
  }

  const keywords = Array.isArray(spec.keywords) ? spec.keywords : [];
  const query = cleanControlChars(keywords[0] || spec.repo_name || '').split(/\s+/).slice(0, 4).join(' ');
  if (!query) {
    return { status: 'ok', count: 0, items: [] };
  }

  const searchUrl = `${BLUESKY_HOST}/xrpc/app.bsky.feed.searchPosts?q=${encodeURIComponent(query)}&limit=${MAX_POSTS}`;

  let token = await getAccessToken(handle, appPassword, options, false);
  let res = await fetchWithAbort(searchUrl, {
    timeoutMs: options.timeoutMs || DEFAULT_SOURCE_TIMEOUT_MS,
    fetchImpl: options.fetchImpl || fetch,
    headers: {
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });

  // 401 durumunda oturumu bir kez yenile
  if (res && res.status === 401) {
    clearBlueskySession();
    token = await getAccessToken(handle, appPassword, options, true);
    res = await fetchWithAbort(searchUrl, {
      timeoutMs: options.timeoutMs || DEFAULT_SOURCE_TIMEOUT_MS,
      fetchImpl: options.fetchImpl || fetch,
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
  }

  if (!res || !res.ok) {
    throw new Error(`Bluesky searchPosts HTTP ${res ? res.status : 'unknown'}`);
  }

  const data = await res.json();
  const rawPosts = (data && Array.isArray(data.posts)) ? data.posts : [];
  const items = [];

  for (const post of rawPosts) {
    if (!post || !post.record || typeof post.record.text !== 'string') continue;
    // KVKK: post.author (handle, displayName, avatar, did) kesinlikle okunmaz ve çıktıya GİRMEZ
    const cleanedText = maskPii(post.record.text).slice(0, 240);
    if (!cleanedText) continue;

    const safeUrl = buildPostUrl(post.uri);
    if (!safeUrl) continue;

    items.push({
      title: cleanedText.slice(0, 140),
      snippet: cleanedText,
      url: safeUrl,
      source: 'bluesky',
      region: 'global',
      created_at: toIsoDate(post.record.createdAt || post.indexedAt)
    });
  }

  return {
    status: 'ok',
    count: items.length,
    items
  };
}

module.exports = {
  fetchBlueskySignals,
  clearBlueskySession
};
