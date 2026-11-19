'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const store = require('./store');
const mailer = require('./mailer');

const SESSION_COOKIE = 'customerhunter_oturum';
const SECURE_SESSION_COOKIE = '__Host-customerhunter_oturum';
const OIDC_COOKIE = 'customerhunter_oidc';
const SECURE_OIDC_COOKIE = '__Host-customerhunter_oidc';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_ISSUERS = new Set(['https://accounts.google.com', 'accounts.google.com']);

const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_KEYLEN = 32;
const DUMMY_HASH = `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${'0'.repeat(32)}$${'0'.repeat(64)}`;

const APPROVAL_TTL = 14 * 86400; // 14 gün
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15 dakika
const LOGIN_MAX_PER_ACCOUNT = 10;
const LOGIN_MAX_PER_IP = 100;
const LOGIN_MAX_PER_USERNAME_GLOBAL = 25;

let cachedSecret = null;

// Kaba kuvvet koruması (süreç içi)
const accountFailures = new Map(); // "ip|username" -> number[]
const ipFailures = new Map(); // "ip" -> number[]
const globalAccountFailures = new Map(); // "username" -> number[]

function sessionHours() {
  const h = parseInt(process.env.SESSION_HOURS || '12', 10);
  return Number.isFinite(h) && h > 0 ? h : 12;
}

function isHttps() {
  return String(process.env.PUBLIC_URL || '').trim().startsWith('https://');
}

function cookieSecure() {
  return String(process.env.COOKIE_SECURE || '').toLowerCase() === 'true' || isHttps();
}

function sessionCookieName() {
  return isHttps() ? SECURE_SESSION_COOKIE : SESSION_COOKIE;
}

function oidcCookieName() {
  return isHttps() ? SECURE_OIDC_COOKIE : OIDC_COOKIE;
}

function getSecretKey() {
  const envSecret = String(process.env.SECRET_KEY || '').trim();
  if (envSecret) return envSecret;
  if (cachedSecret) return cachedSecret;

  const keyPath = path.join(store.getDataDir(), 'secret.key');
  if (!fs.existsSync(keyPath)) {
    const generated = crypto.randomBytes(32).toString('hex');
    try {
      const fd = fs.openSync(keyPath, 'wx', 0o600);
      try {
        fs.writeSync(fd, generated, 0, 'utf8');
      } finally {
        fs.closeSync(fd);
      }
      try {
        fs.chmodSync(keyPath, 0o600);
      } catch {
        // Windows'ta chmod kısıtlı olabilir
      }
    } catch (err) {
      if (err.code !== 'EEXIST') throw err;
    }
  }
  const diskSecret = fs.readFileSync(keyPath, 'utf8').trim();
  if (diskSecret.length < 32) {
    throw new Error(`Oturum anahtarı okunamadı: ${keyPath}`);
  }
  cachedSecret = diskSecret;
  return cachedSecret;
}

function resetSecretCache() {
  cachedSecret = null;
}

// ---------------------------------------------------------------- PBKDF2 Parola

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const digest = crypto.pbkdf2Sync(String(password), salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, 'sha256').toString('hex');
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${salt}$${digest}`;
}

function verifyPassword(password, stored) {
  let real = true;
  let rounds = PBKDF2_ITERATIONS;
  let salt = '0'.repeat(32);
  let expectedHex = '0'.repeat(64);

  const parts = String(stored || '').split('$');
  if (parts.length === 4 && parts[0] === 'pbkdf2_sha256') {
    const parsedRounds = parseInt(parts[1], 10);
    if (Number.isFinite(parsedRounds) && parsedRounds >= 1 && parsedRounds <= 10_000_000 && parts[2] && parts[3]) {
      rounds = parsedRounds;
      salt = parts[2];
      expectedHex = parts[3];
    } else {
      real = false;
    }
  } else {
    real = false;
    const dummy = DUMMY_HASH.split('$');
    rounds = parseInt(dummy[1], 10);
    salt = dummy[2];
    expectedHex = dummy[3];
  }

  const actual = crypto.pbkdf2Sync(String(password || ''), salt, rounds, PBKDF2_KEYLEN, 'sha256');
  const expected = Buffer.from(expectedHex, 'hex');
  if (actual.length !== expected.length) {
    return false;
  }
  const match = crypto.timingSafeEqual(actual, expected);
  return match && real;
}

// ---------------------------------------------------------------- HS256 JWT

function b64urlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), 'utf8');
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function b64urlDecode(str) {
  const s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s + pad, 'base64');
}

function signJwt(purpose, seconds, data = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64urlEncode(JSON.stringify({
    pur: purpose,
    iat: now,
    exp: now + seconds,
    jti: crypto.randomUUID().replace(/-/g, ''),
    ...data
  }));
  const signingInput = `${header}.${payload}`;
  const sig = crypto.createHmac('sha256', getSecretKey()).update(signingInput).digest();
  return `${signingInput}.${b64urlEncode(sig)}`;
}

function verifyJwt(token, expectedPurpose) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, sigB64] = parts;
  try {
    const header = JSON.parse(b64urlDecode(headerB64).toString('utf8'));
    if (!header || header.alg !== 'HS256') return null;

    const signingInput = `${headerB64}.${payloadB64}`;
    const expectedSig = crypto.createHmac('sha256', getSecretKey()).update(signingInput).digest();
    const actualSig = b64urlDecode(sigB64);
    if (actualSig.length !== expectedSig.length || !crypto.timingSafeEqual(actualSig, expectedSig)) {
      return null;
    }

    const payload = JSON.parse(b64urlDecode(payloadB64).toString('utf8'));
    if (!payload || typeof payload !== 'object') return null;
    const now = Math.floor(Date.now() / 1000);
    if (typeof payload.exp !== 'number' || payload.exp < now) return null;
    if (expectedPurpose && payload.pur !== expectedPurpose) return null;
    return payload;
  } catch {
    return null;
  }
}

function safeEqualStr(a, b) {
  const bufA = Buffer.from(String(a || ''), 'utf8');
  const bufB = Buffer.from(String(b || ''), 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

// ---------------------------------------------------------------- İlk Yönetici

function initialAdminNotePath() {
  return path.join(store.getDataDir(), 'ilk-yonetici.txt');
}

function bootstrapAdmin() {
  if (store.countUsers() > 0) return;
  const username = String(process.env.ADMIN_USERNAME || 'admin').trim().toLowerCase() || 'admin';
  const envPassword = String(process.env.ADMIN_PASSWORD || '').trim();
  const password = envPassword || crypto.randomBytes(12).toString('base64url');

  try {
    store.createUser({
      username,
      displayName: 'Yönetici',
      passwordHash: hashPassword(password),
      role: 'admin',
      status: 'active'
    });
  } catch {
    return;
  }

  if (!envPassword) {
    const notePath = initialAdminNotePath();
    const content = `Kullanıcı adı: ${username}\nParola: ${password}\nBu dosya, bu yönetici ilk kez başarıyla giriş yapınca otomatik silinir.\n`;
    try {
      fs.writeFileSync(notePath, content, { encoding: 'utf8', mode: 0o600 });
      try {
        fs.chmodSync(notePath, 0o600);
      } catch {
        // Windows
      }
      console.warn(`[auth] ADMIN_PASSWORD verilmedi; ilk yönetici (${username}) parolası ${notePath} dosyasına yazıldı (ilk başarılı girişte silinir).`);
    } catch (err) {
      console.error('[auth] İlk yönetici parola notu yazılamadı:', err.message);
    }
  }
}

function removeInitialAdminNote(username) {
  const notePath = initialAdminNotePath();
  try {
    if (!fs.existsSync(notePath)) return;
    const firstLine = fs.readFileSync(notePath, 'utf8').split(/\r?\n/)[0] || '';
    if (firstLine.trim() !== `Kullanıcı adı: ${username}`) return;
    fs.unlinkSync(notePath);
    console.info(`[auth] İlk yönetici parola notu silindi (${username} ilk kez giriş yaptı).`);
  } catch (err) {
    console.warn('[auth] İlk yönetici parola notu silinemedi:', err.message);
  }
}

// ---------------------------------------------------------------- Çerezler & Yardımcılar

function parseCookies(req) {
  const header = req && req.headers ? req.headers.cookie : '';
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) {
      try {
        out[k] = decodeURIComponent(v);
      } catch {
        out[k] = v;
      }
    }
  }
  return out;
}

function buildSetCookie(name, value, { maxAge = null, httpOnly = true, sameSite = 'Lax', secure = false, path: cookiePath = '/' } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${cookiePath}`];
  if (maxAge !== null) parts.push(`Max-Age=${Math.max(0, Math.floor(maxAge))}`);
  if (httpOnly) parts.push('HttpOnly');
  if (sameSite) parts.push(`SameSite=${sameSite}`);
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

function appendSetCookie(res, cookieStr) {
  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', [cookieStr]);
  } else if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookieStr]);
  } else {
    res.setHeader('Set-Cookie', [String(existing), cookieStr]);
  }
}

function getClientIp(req) {
  const xff = req.headers && req.headers['x-forwarded-for'];
  if (xff) {
    const parts = String(xff).split(',').map(s => s.trim()).filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }
  return (req.socket && req.socket.remoteAddress) || '?';
}

function getBaseUrl(req) {
  const pub = String(process.env.PUBLIC_URL || '').trim();
  if (pub) return pub.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] || 'http').toString().split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3090').toString().split(',')[0].trim();
  return `${proto}://${host}`.replace(/\/+$/, '');
}

function getAllowedOrigins(req) {
  const origins = new Set();
  try {
    origins.add(new URL(getBaseUrl(req)).origin.toLowerCase());
  } catch {
    // yoksay
  }
  const host = String((req.headers && req.headers.host) || '').trim();
  if (host) {
    const proto = String((req.headers && req.headers['x-forwarded-proto']) || 'http').split(',')[0].trim().toLowerCase();
    for (const p of new Set([proto, 'https', 'http'])) {
      try {
        origins.add(new URL(`${p}://${host}`).origin.toLowerCase());
      } catch {
        // yoksay
      }
    }
  }
  return origins;
}

function checkSameOrigin(req) {
  const headers = (req && req.headers) || {};
  const secFetchSite = String(headers['sec-fetch-site'] || '').trim().toLowerCase();
  if (secFetchSite === 'cross-site') {
    return false;
  }

  const allowed = getAllowedOrigins(req);
  const origin = String(headers.origin || '').trim();
  if (origin) {
    if (origin.toLowerCase() === 'null') return false;
    try {
      const parsedOrigin = new URL(origin).origin.toLowerCase();
      return allowed.has(parsedOrigin);
    } catch {
      return false;
    }
  }

  const referer = String(headers.referer || '').trim();
  if (referer) {
    try {
      const parsedReferer = new URL(referer).origin.toLowerCase();
      return allowed.has(parsedReferer);
    } catch {
      return false;
    }
  }

  return true;
}

function requireSameOrigin(req, res) {
  if (!checkSameOrigin(req)) {
    sendJson(res, 403, { ok: false, error: 'Geçersiz istek kaynağı (CSRF koruması).' });
    return false;
  }
  return true;
}

function safeNext(url) {
  const s = String(url || '').trim();
  if (s.startsWith('/') && !s.startsWith('//') && !s.includes('\\')) return s;
  return '/';
}

// ---------------------------------------------------------------- Kaba Kuvvet Koruması

function pruneRecent(map, key, nowMs) {
  const arr = map.get(key);
  if (!arr || arr.length === 0) return 0;
  const cutoff = nowMs - LOGIN_WINDOW_MS;
  let i = 0;
  while (i < arr.length && arr[i] < cutoff) i++;
  if (i > 0) arr.splice(0, i);
  if (arr.length === 0) {
    map.delete(key);
    return 0;
  }
  return arr.length;
}

function isRateLimited(ip, username) {
  const now = Date.now();
  if (pruneRecent(ipFailures, ip, now) >= LOGIN_MAX_PER_IP) return true;
  if (pruneRecent(accountFailures, `${ip}|${username}`, now) >= LOGIN_MAX_PER_ACCOUNT) return true;
  if (username && pruneRecent(globalAccountFailures, username, now) >= LOGIN_MAX_PER_USERNAME_GLOBAL) return true;
  return false;
}

function recordLoginFailure(ip, username) {
  const now = Date.now();
  const accKey = `${ip}|${username}`;
  if (!accountFailures.has(accKey)) accountFailures.set(accKey, []);
  accountFailures.get(accKey).push(now);

  if (!ipFailures.has(ip)) ipFailures.set(ip, []);
  ipFailures.get(ip).push(now);

  if (username) {
    if (!globalAccountFailures.has(username)) globalAccountFailures.set(username, []);
    globalAccountFailures.get(username).push(now);
  }

  if (accountFailures.size > 10_000) {
    for (const k of Array.from(accountFailures.keys())) pruneRecent(accountFailures, k, now);
    for (const k of Array.from(ipFailures.keys())) pruneRecent(ipFailures, k, now);
    for (const k of Array.from(globalAccountFailures.keys())) pruneRecent(globalAccountFailures, k, now);
  }
}

function clearAccountFailures(ip, username) {
  accountFailures.delete(`${ip}|${username}`);
  if (username) globalAccountFailures.delete(username);
}

function resetLoginFailures() {
  accountFailures.clear();
  ipFailures.clear();
  globalAccountFailures.clear();
}

// ---------------------------------------------------------------- Oturum

function getCurrentUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[sessionCookieName()] || '';
  if (!token) return null;
  const data = verifyJwt(token, 'session');
  if (!data) return null;
  const user = store.getUserById(data.uid);
  if (!user || user.status !== 'active' || user.tokenVersion !== data.tv) {
    return null;
  }
  return user;
}

function startSession(res, user) {
  const seconds = sessionHours() * 3600;
  const name = sessionCookieName();
  const token = signJwt('session', seconds, { uid: user.id, tv: user.tokenVersion });
  appendSetCookie(res, buildSetCookie(name, token, {
    maxAge: seconds,
    httpOnly: true,
    sameSite: 'Lax',
    secure: cookieSecure() || name === SECURE_SESSION_COOKIE,
    path: '/'
  }));
  store.updateUser(user.id, { lastLoginAt: new Date().toISOString() });
}

function clearSessionCookies(res) {
  appendSetCookie(res, buildSetCookie(SESSION_COOKIE, '', { maxAge: 0, httpOnly: true, sameSite: 'Lax', secure: false, path: '/' }));
  appendSetCookie(res, buildSetCookie(SECURE_SESSION_COOKIE, '', { maxAge: 0, httpOnly: true, sameSite: 'Lax', secure: true, path: '/' }));
}

function sanitizeUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    isAdmin: user.role === 'admin',
    status: user.status,
    authType: user.googleSub ? 'google' : 'local',
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt
  };
}

function requireAuth(req, res) {
  const user = getCurrentUser(req);
  if (!user) {
    res.writeHead(401, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: false, error: 'Oturumunuz kapanmış. Lütfen yeniden giriş yapın.' }));
    return null;
  }
  return user;
}

function requireAdmin(req, res) {
  const user = requireAuth(req, res);
  if (!user) return null;
  if (user.role !== 'admin') {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: false, error: 'Bu işlem yalnızca yöneticilere açık.' }));
    return null;
  }
  return user;
}

// ---------------------------------------------------------------- Google OAuth 2.0 (PKCE + OIDC)

function getAdminEmailSet() {
  const raw = store.getSetting('adminEmails');
  return new Set(
    raw
      .replace(/;/g, ',')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

function getGoogleCredentials() {
  return {
    clientId: store.getSetting('googleClientId'),
    clientSecret: store.getSetting('googleClientSecret')
  };
}

function isGoogleConfigured() {
  const { clientId, clientSecret } = getGoogleCredentials();
  return Boolean(clientId && clientSecret);
}

function googleRedirectUri(req) {
  return `${getBaseUrl(req)}/auth/google/callback`;
}

function dropOidcCookie(res) {
  const name = oidcCookieName();
  appendSetCookie(res, buildSetCookie(name, '', {
    maxAge: 0,
    httpOnly: true,
    sameSite: 'Lax',
    secure: cookieSecure() || name === SECURE_OIDC_COOKIE,
    path: '/'
  }));
}

async function exchangeGoogleCode(code, redirectUri, flow) {
  const { clientId, clientSecret } = getGoogleCredentials();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
    code_verifier: flow.verifier
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  let resp;
  try {
    resp = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: body.toString(),
      signal: controller.signal
    });
  } catch {
    throw new Error('Google sunucusuna ulaşılamadı.');
  } finally {
    clearTimeout(timer);
  }

  if (!resp.ok) {
    throw new Error('Google girişi tamamlanamadı.');
  }

  const tokenData = await resp.json();
  const idToken = String(tokenData.id_token || '');
  const parts = idToken.split('.');
  if (parts.length !== 3) {
    throw new Error('Google kimlik belirteci geçersiz.');
  }

  let claims;
  try {
    claims = JSON.parse(b64urlDecode(parts[1]).toString('utf8'));
  } catch {
    throw new Error('Google kimlik belirteci okunamadı.');
  }

  // OIDC Core §3.1.3.7: Doğrudan TLS + client_secret ile Google token ucundan alındığı için iss/aud/exp/nonce/sub doğrulanır
  const audList = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  const nowSec = Math.floor(Date.now() / 1000);
  if (
    !audList.includes(clientId) ||
    !GOOGLE_ISSUERS.has(claims.iss) ||
    Number(claims.exp || 0) < nowSec - 60 ||
    !safeEqualStr(claims.nonce || '', flow.nonce || '') ||
    !claims.sub
  ) {
    throw new Error('Google kimliği doğrulanamadı.');
  }

  return {
    sub: String(claims.sub),
    email: claims.email ? String(claims.email).trim().toLowerCase() : null,
    verified: Boolean(claims.email_verified),
    name: claims.name ? String(claims.name).trim() : null
  };
}

function userForGoogle(info, baseUrl) {
  const email = info.email;
  const verified = Boolean(info.verified && email);
  if (!verified) {
    throw new Error('Google bu hesabın e-posta adresini doğrulamamış. Doğrulanmış e-posta adresi olan bir Google hesabıyla deneyin.');
  }

  const isBoss = getAdminEmailSet().has(email);
  let user = store.findUserByGoogleSub(info.sub);
  if (!user && email) {
    const existing = store.findUserByEmail(email);
    if (existing) {
      user = store.updateUser(existing.id, { googleSub: info.sub });
    }
  }

  if (!user) {
    user = store.createUser({
      username: store.uniqueUsername(email.split('@')[0]),
      displayName: (info.name || email || 'Kullanıcı').slice(0, 120),
      email,
      googleSub: info.sub,
      role: isBoss ? 'admin' : 'user',
      status: isBoss ? 'active' : 'pending'
    });
    if (!isBoss) {
      const mailed = notifyAdminsOfApplication(user, baseUrl);
      console.info(`[auth] Yeni başvuru: ${email} (yöneticiye e-posta ${mailed ? 'gönderildi' : 'gönderilemedi'})`);
    }
  } else if (isBoss && (user.role !== 'admin' || user.status !== 'active')) {
    user = store.updateUser(user.id, { role: 'admin', status: 'active' });
  }

  return user;
}

// ---------------------------------------------------------------- Onay / Ret E-postaları ve Karar

function buildApprovalLinks(uid, baseUrl) {
  const token = signJwt('approval', APPROVAL_TTL, { uid });
  return {
    approve: `${baseUrl}/onay?t=${encodeURIComponent(token)}&karar=onayla`,
    reject: `${baseUrl}/onay?t=${encodeURIComponent(token)}&karar=reddet`
  };
}

function notifyAdminsOfApplication(user, baseUrl) {
  const { approve, reject } = buildApprovalLinks(user.id, baseUrl);
  const text = [
    `${mailer.APP_NAME} için yeni bir hesap başvurusu var.`,
    `Ad soyad: ${user.displayName}\nE-posta: ${user.email || '—'}\nGiriş yöntemi: Google`,
    `Başvuruyu aşağıdaki düğmelerle ya da Yönetim → Kullanıcılar sayfasından (${baseUrl}/yonetim/kullanicilar) yanıtlayabilirsiniz. Bağlantı 14 gün geçerlidir ve tek kullanımlıktır.`
  ].join('\n\n');

  return mailer.sendMailAsync(
    mailer.getNotifyAddresses(),
    `Yeni hesap başvurusu: ${user.displayName}`,
    text,
    [['Onayla', approve], ['Reddet', reject]]
  );
}

function decideUser(uid, approve, baseUrl) {
  const user = store.getUserById(uid);
  if (!user) throw new Error('Kullanıcı bulunamadı.');
  if (user.status === 'active') {
    throw new Error('Bu hesap zaten etkin; değişiklik için Kullanıcılar sayfasını kullanın.');
  }
  if (user.status !== 'pending' && user.status !== 'rejected') {
    throw new Error('Bu hesap devre dışı bırakılmış; yeniden açmak için Kullanıcılar sayfasını kullanın.');
  }
  const target = approve ? 'active' : 'rejected';
  if (user.status === target) {
    return { changed: false, mailed: false, user };
  }

  const updated = store.updateUser(uid, { status: target, decidedAt: new Date().toISOString() });
  if (!approve) {
    store.bumpTokenVersion(uid);
  }

  let mailed = false;
  if (user.email) {
    if (approve) {
      mailed = mailer.sendMailAsync(
        user.email,
        `${mailer.APP_NAME} hesabınız onaylandı`,
        `Merhaba ${user.displayName},\n\n${mailer.APP_NAME} hesabınız onaylandı. Giriş sayfasında "Google ile devam et" düğmesine basarak başvururken kullandığınız Google hesabıyla giriş yapabilirsiniz.`,
        [['Giriş sayfasını aç', `${baseUrl}/giris`]]
      );
    } else {
      mailed = mailer.sendMailAsync(
        user.email,
        `${mailer.APP_NAME} hesap başvurunuz`,
        `Merhaba ${user.displayName},\n\n${mailer.APP_NAME} hesap başvurunuz yönetici tarafından onaylanmadı. Bir yanlışlık olduğunu düşünüyorsanız yöneticinizle iletişime geçin.`,
        []
      );
    }
  }

  console.info(`[auth] Hesap ${user.username} ${approve ? 'onaylandı' : 'reddedildi'}.`);
  return { changed: true, mailed, user: updated };
}

// ---------------------------------------------------------------- Onay HTML Şablonu

function renderApprovalHtml(title, bodyHtml, statusCode = 200) {
  const html = `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${mailer.escapeHtml(title)} · ${mailer.APP_NAME}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b1020; color: #e2e8f0; margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
    .card { background: #121a2e; border: 1px solid #24304d; border-radius: 16px; max-width: 480px; width: 100%; padding: 28px; box-shadow: 0 20px 50px rgba(0,0,0,0.45); }
    h1 { margin: 0 0 12px; font-size: 22px; color: #f8fafc; }
    p { margin: 0 0 14px; line-height: 1.55; color: #94a3b8; font-size: 14px; }
    dl { display: grid; grid-template-columns: 110px 1fr; gap: 8px 12px; margin: 16px 0 20px; font-size: 14px; }
    dt { color: #94a3b8; }
    dd { margin: 0; color: #f1f5f9; font-weight: 500; word-break: break-word; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; margin: 16px 0; }
    .btn { display: inline-block; padding: 10px 18px; border-radius: 10px; border: 1px solid #334155; background: #1e293b; color: #f8fafc; font-weight: 600; font-size: 14px; text-decoration: none; cursor: pointer; }
    .btn.primary { background: #2563eb; border-color: #2563eb; }
    .btn.danger { background: #dc2626; border-color: #dc2626; }
    .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; background: #1e293b; color: #cbd5e1; }
    .badge.pending { background: rgba(245,158,11,0.18); color: #fbbf24; }
    .badge.active { background: rgba(16,185,129,0.18); color: #34d399; }
    .badge.rejected { background: rgba(239,68,68,0.18); color: #f87171; }
    a { color: #60a5fa; }
  </style>
</head>
<body>
  <main class="card">${bodyHtml}</main>
</body>
</html>`;
  return { statusCode, html };
}

// ---------------------------------------------------------------- İstek Gövdesi Okuma

function parseRequestBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      const ct = String(req.headers['content-type'] || '').toLowerCase();
      if (ct.includes('application/x-www-form-urlencoded')) {
        const params = new URLSearchParams(raw);
        const obj = {};
        for (const [k, v] of params.entries()) obj[k] = v;
        return resolve({ data: obj, isForm: true });
      }
      try {
        return resolve({ data: raw ? JSON.parse(raw) : {}, isForm: false });
      } catch {
        return resolve({ data: {}, isForm: false });
      }
    });
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
}

function sendHtml(res, status, html) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(html);
}

function sendRedirect(res, location, status = 303) {
  res.writeHead(status, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

// ---------------------------------------------------------------- Rotalar

async function handleAuthRoutes(req, res, parsedUrl) {
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // 1. Oturum / yapılandırma bilgisi
  if ((pathname === '/api/me' || pathname === '/api/auth/me') && method === 'GET') {
    const user = getCurrentUser(req);
    if (!user) {
      return sendJson(res, 401, { ok: false, error: 'Giriş gerekli.' });
    }
    const pendingCount = user.role === 'admin'
      ? store.listUsers().filter(u => u.status === 'pending').length
      : 0;
    return sendJson(res, 200, {
      ok: true,
      user: sanitizeUser(user),
      pendingCount,
      googleConfigured: isGoogleConfigured()
    });
  }

  if (pathname === '/api/auth/config' && method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      googleConfigured: isGoogleConfigured()
    });
  }

  // 2. Yerel giriş (POST /auth/login, /auth/local/login, /giris)
  if ((pathname === '/auth/login' || pathname === '/auth/local/login' || pathname === '/giris') && method === 'POST') {
    if (!requireSameOrigin(req, res)) return true;
    const { data, isForm } = await parseRequestBody(req);
    const ip = getClientIp(req);
    const username = String(data.username || '').trim().toLowerCase().slice(0, 254);
    const password = String(data.password || '');
    const nextUrl = safeNext(data.next || '/');

    if (isRateLimited(ip, username)) {
      if (isForm) {
        return sendRedirect(res, `/giris?hata=${encodeURIComponent('Çok fazla hatalı deneme. 15 dakika sonra yeniden deneyin.')}`);
      }
      return sendJson(res, 429, { ok: false, error: 'Çok fazla hatalı deneme. 15 dakika sonra yeniden deneyin.' });
    }

    const user = store.findUserByUsername(username) || store.findUserByEmail(username);
    const valid = verifyPassword(password, user ? user.passwordHash : null) && Boolean(user);
    if (!valid) {
      recordLoginFailure(ip, username);
      if (isForm) {
        return sendRedirect(res, `/giris?hata=${encodeURIComponent('Kullanıcı adı veya parola hatalı.')}`);
      }
      return sendJson(res, 401, { ok: false, error: 'Kullanıcı adı veya parola hatalı.' });
    }

    clearAccountFailures(ip, username);

    if (user.status !== 'active') {
      const durum = user.status === 'pending' ? 'bekliyor' : 'reddedildi';
      const msg = user.status === 'pending'
        ? 'Hesabınız yönetici onayı bekliyor.'
        : 'Hesabınız etkin değil. Yöneticinizle iletişime geçin.';
      if (isForm) {
        return sendRedirect(res, `/giris?durum=${durum}`);
      }
      return sendJson(res, 403, { ok: false, error: msg, status: user.status });
    }

    startSession(res, user);
    if (user.role === 'admin') {
      removeInitialAdminNote(user.username);
    }

    if (isForm) {
      return sendRedirect(res, nextUrl);
    }
    return sendJson(res, 200, { ok: true, user: sanitizeUser(user), next: nextUrl });
  }

  // 3. Çıkış (POST /auth/logout, /api/auth/logout, /cikis)
  if ((pathname === '/auth/logout' || pathname === '/api/auth/logout' || pathname === '/cikis') && method === 'POST') {
    if (!requireSameOrigin(req, res)) return true;
    const user = getCurrentUser(req);
    if (user) {
      store.bumpTokenVersion(user.id);
    }
    clearSessionCookies(res);
    const accept = String(req.headers.accept || '');
    if (accept.includes('application/json')) {
      return sendJson(res, 200, { ok: true });
    }
    return sendRedirect(res, '/giris');
  }

  // 4. Google OAuth Başlatma
  if ((pathname === '/auth/google/start' || pathname === '/api/auth/google/start') && method === 'GET') {
    if (!isGoogleConfigured()) {
      return sendRedirect(res, `/giris?hata=${encodeURIComponent('Google ile giriş henüz ayarlanmamış.')}`);
    }
    const { clientId } = getGoogleCredentials();
    const state = crypto.randomBytes(24).toString('base64url');
    const nonce = crypto.randomBytes(24).toString('base64url');
    const verifier = crypto.randomBytes(48).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    const nextUrl = safeNext(parsedUrl.searchParams.get('next') || '/');

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: googleRedirectUri(req),
      scope: 'openid email profile',
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      prompt: 'select_account'
    });

    const oidcName = oidcCookieName();
    const oidcToken = signJwt('oidc', 600, { state, nonce, verifier, next: nextUrl });
    appendSetCookie(res, buildSetCookie(oidcName, oidcToken, {
      maxAge: 600,
      httpOnly: true,
      sameSite: 'Lax',
      secure: cookieSecure() || oidcName === SECURE_OIDC_COOKIE,
      path: '/'
    }));

    return sendRedirect(res, `${GOOGLE_AUTH_URL}?${params.toString()}`);
  }

  // 5. Google OAuth Callback
  if ((pathname === '/auth/google/callback' || pathname === '/api/auth/google/callback') && method === 'GET') {
    const code = parsedUrl.searchParams.get('code') || '';
    const state = parsedUrl.searchParams.get('state') || '';
    const error = parsedUrl.searchParams.get('error') || '';

    const fail = (query) => {
      dropOidcCookie(res);
      return sendRedirect(res, `/giris?${query}`);
    };

    const cookies = parseCookies(req);
    const flow = verifyJwt(cookies[oidcCookieName()] || '', 'oidc');
    if (!flow) {
      return fail(`hata=${encodeURIComponent('Giriş isteğinin süresi doldu. Lütfen yeniden deneyin.')}`);
    }
    if (error) {
      const msg = error === 'access_denied' ? 'Giriş iptal edildi.' : `Google girişi başarısız: ${error}`;
      return fail(`hata=${encodeURIComponent(msg)}`);
    }
    if (!state || !safeEqualStr(state, flow.state || '') || !code) {
      return fail(`hata=${encodeURIComponent('Giriş isteği doğrulanamadı. Lütfen yeniden deneyin.')}`);
    }

    let user;
    try {
      const info = await exchangeGoogleCode(code, googleRedirectUri(req), flow);
      user = userForGoogle(info, getBaseUrl(req));
    } catch (err) {
      return fail(`hata=${encodeURIComponent(err.message || 'Google girişi tamamlanamadı.')}`);
    }

    if (user.status === 'pending') {
      return fail('durum=bekliyor');
    }
    if (user.status !== 'active') {
      return fail('durum=reddedildi');
    }

    dropOidcCookie(res);
    startSession(res, user);
    return sendRedirect(res, safeNext(flow.next || '/'));
  }

  // 6. Onay / Ret Sayfası (GET /onay — bot önizleme korumalı)
  if (pathname === '/onay' && method === 'GET') {
    const token = parsedUrl.searchParams.get('t') || '';
    const karar = parsedUrl.searchParams.get('karar') || '';
    const data = verifyJwt(token, 'approval');
    const user = data ? store.getUserById(data.uid) : null;

    if (!user) {
      const page = renderApprovalHtml(
        'Geçersiz bağlantı',
        `<h1>Bağlantı geçersiz</h1>
         <p>Bağlantının süresi dolmuş ya da bozulmuş olabilir. Başvuruyu Yönetim → Kullanıcılar sayfasından yanıtlayabilirsiniz.</p>
         <a class="btn" href="/yonetim/kullanicilar">Kullanıcılar</a>`,
        400
      );
      return sendHtml(res, page.statusCode, page.html);
    }

    const statusLabels = { pending: 'Onay bekliyor', active: 'Etkin', rejected: 'Reddedildi', disabled: 'Devre dışı' };
    const rejectFirst = karar === 'reddet';
    let buttons = '';
    if (user.status === 'pending' || user.status === 'rejected') {
      buttons += `<button class="btn ${rejectFirst ? '' : 'primary'}" name="karar" value="onayla">Onayla</button>`;
    }
    if (user.status === 'pending') {
      buttons += `<button class="btn ${rejectFirst ? 'danger' : ''}" name="karar" value="reddet">Reddet</button>`;
    }

    const formHtml = buttons
      ? `<form method="post" action="/onay" class="actions"><input type="hidden" name="t" value="${mailer.escapeHtml(token)}">${buttons}</form><p>Kararınız kişiye e-postayla bildirilir.</p>`
      : `<p>Bu hesap zaten etkin; değişiklik için Kullanıcılar sayfasını kullanın.</p>`;

    const page = renderApprovalHtml(
      'Hesap başvurusu',
      `<h1>Hesap başvurusu</h1>
       <dl>
         <dt>Ad soyad</dt><dd>${mailer.escapeHtml(user.displayName)}</dd>
         <dt>E-posta</dt><dd>${mailer.escapeHtml(user.email || '—')}</dd>
         <dt>Giriş</dt><dd>${user.googleSub ? 'Google' : 'Parola'}</dd>
         <dt>Durum</dt><dd><span class="badge ${mailer.escapeHtml(user.status)}">${mailer.escapeHtml(statusLabels[user.status] || user.status)}</span></dd>
       </dl>
       ${formHtml}
       <p><a href="/yonetim/kullanicilar">Yönetim → Kullanıcılar</a></p>`
    );
    return sendHtml(res, page.statusCode, page.html);
  }

  // 7. Onay / Ret Uygulama (POST /onay — tek kullanımlık jti)
  if (pathname === '/onay' && method === 'POST') {
    if (!requireSameOrigin(req, res)) return true;
    const { data } = await parseRequestBody(req);
    const token = String(data.t || '');
    const karar = String(data.karar || '');

    if (karar !== 'onayla' && karar !== 'reddet') {
      const page = renderApprovalHtml('Geçersiz işlem', '<h1>İşlem yapılamadı</h1><p>Geçersiz karar parametresi.</p>', 400);
      return sendHtml(res, page.statusCode, page.html);
    }

    const payload = verifyJwt(token, 'approval');
    if (!payload || !store.useToken(payload.jti, payload.exp)) {
      const page = renderApprovalHtml(
        'Geçersiz bağlantı',
        `<h1>Bağlantı kullanılamaz</h1>
         <p>Bu bağlantı daha önce kullanılmış ya da süresi dolmuş. Yönetim → Kullanıcılar sayfasından devam edebilirsiniz.</p>
         <a class="btn" href="/yonetim/kullanicilar">Kullanıcılar</a>`,
        400
      );
      return sendHtml(res, page.statusCode, page.html);
    }

    let result;
    try {
      result = decideUser(payload.uid, karar === 'onayla', getBaseUrl(req));
    } catch (err) {
      const page = renderApprovalHtml('İşlem yapılamadı', `<h1>İşlem yapılamadı</h1><p>${mailer.escapeHtml(err.message)}</p>`, 400);
      return sendHtml(res, page.statusCode, page.html);
    }

    const word = karar === 'onayla' ? 'onaylandı' : 'reddedildi';
    const note = result.mailed
      ? 'Kişiye e-postayla bilgi verildi.'
      : (result.changed ? 'Kişiye e-posta gönderilemedi (SMTP ayarlarını kontrol edin).' : 'Değişiklik yapılmadı.');

    const page = renderApprovalHtml(
      'Hesap başvurusu',
      `<h1>Başvuru ${word}</h1>
       <p>${mailer.escapeHtml(note)}</p>
       <a class="btn primary" href="/yonetim/kullanicilar">Kullanıcılar</a>`
    );
    return sendHtml(res, page.statusCode, page.html);
  }

  return false;
}

module.exports = {
  SESSION_COOKIE,
  SECURE_SESSION_COOKIE,
  OIDC_COOKIE,
  SECURE_OIDC_COOKIE,
  sessionCookieName,
  oidcCookieName,
  getSecretKey,
  resetSecretCache,
  hashPassword,
  verifyPassword,
  signJwt,
  verifyJwt,
  bootstrapAdmin,
  getCurrentUser,
  requireAuth,
  requireAdmin,
  sanitizeUser,
  isGoogleConfigured,
  getClientIp,
  getBaseUrl,
  checkSameOrigin,
  requireSameOrigin,
  decideUser,
  buildApprovalLinks,
  notifyAdminsOfApplication,
  resetLoginFailures,
  handleAuthRoutes
};
