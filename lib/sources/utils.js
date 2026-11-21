'use strict';

const DEFAULT_SOURCE_TIMEOUT_MS = 4000;
const USER_AGENT = 'AI-CustomerHunter/1.2 (+https://customerhunter.appcook.store)';

function cleanControlChars(value) {
  return String(value || '')
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

function toIsoDate(value) {
  if (value === null || value === undefined || value === '') {
    return new Date().toISOString();
  }
  const d = typeof value === 'number'
    ? new Date(value < 1e12 ? value * 1000 : value)
    : new Date(value);
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString();
  }
  return d.toISOString();
}

// KVKK: E-posta ve telefon numaralarını metinlerden temizle
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_RE = /(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{2}[\s.-]?\d{2}\b|\b0?5\d{2}[\s.-]?\d{3}[\s.-]?\d{2}[\s.-]?\d{2}\b/g;

function maskPii(text) {
  if (!text) return '';
  return cleanControlChars(
    String(text)
      .replace(EMAIL_RE, '[maskelendi]')
      .replace(PHONE_RE, '[maskelendi]')
  );
}

function normalizeTurkish(text) {
  return String(text || '')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i');
}

class LruTtlCache {
  constructor(maxEntries = 100, ttlMs = 30 * 60 * 1000) {
    this.maxEntries = maxEntries;
    this.ttlMs = ttlMs;
    this.store = new Map();
  }

  get(key, now = Date.now()) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (now >= entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key, value, now = Date.now()) {
    if (this.store.has(key)) {
      this.store.delete(key);
    }
    this.store.set(key, { value, expiresAt: now + this.ttlMs });
    while (this.store.size > this.maxEntries) {
      const oldestKey = this.store.keys().next().value;
      this.store.delete(oldestKey);
    }
  }

  clear() {
    this.store.clear();
  }

  get size() {
    return this.store.size;
  }
}

async function fetchWithAbort(url, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_SOURCE_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl || fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = {
      'User-Agent': USER_AGENT,
      ...(options.headers || {})
    };
    const fetchOpts = {
      method: options.method || 'GET',
      signal: controller.signal,
      headers
    };
    if (options.body !== undefined) {
      fetchOpts.body = options.body;
    }
    return await fetchImpl(url, fetchOpts);
  } finally {
    clearTimeout(timer);
  }
}

async function readResponseTextLimited(res, maxBytes = 512 * 1024) {
  if (!res) return '';
  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const buf = Buffer.from(value);
        if (total + buf.length > maxBytes) {
          const remaining = maxBytes - total;
          if (remaining > 0) chunks.push(buf.subarray(0, remaining));
          await reader.cancel().catch(() => {});
          break;
        }
        chunks.push(buf);
        total += buf.length;
      }
    } finally {
      try { reader.releaseLock(); } catch { /* yoksay */ }
    }
    return Buffer.concat(chunks).toString('utf8');
  }
  const text = await res.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    return Buffer.from(text, 'utf8').subarray(0, maxBytes).toString('utf8');
  }
  return text;
}

module.exports = {
  DEFAULT_SOURCE_TIMEOUT_MS,
  USER_AGENT,
  cleanControlChars,
  toSafeHttpsUrl,
  toIsoDate,
  maskPii,
  normalizeTurkish,
  LruTtlCache,
  fetchWithAbort,
  readResponseTextLimited
};
