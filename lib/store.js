'use strict';

const fs = require('fs');
const path = require('path');

const MAX_LEADS = 300;
const PROTECTED_LEAD_STATUSES = new Set(['converted', 'replied']);

// ad: [envVar, defaultValue, isSecret]
const SETTINGS_FIELDS = {
  googleClientId: ['GOOGLE_CLIENT_ID', '', false],
  googleClientSecret: ['GOOGLE_CLIENT_SECRET', '', true],
  adminEmails: ['ADMIN_EMAILS', '', false],

  smtpHost: ['SMTP_HOST', '', false],
  smtpPort: ['SMTP_PORT', '587', false],
  smtpSecurity: ['SMTP_SECURITY', 'starttls', false],
  smtpUsername: ['SMTP_USERNAME', '', false],
  smtpPassword: ['SMTP_PASSWORD', '', true],
  smtpFrom: ['SMTP_FROM', '', false],
  notifyEmails: ['NOTIFY_EMAILS', '', false],

  aiProvider: ['AI_PROVIDER', 'none', false],
  aiApiKey: ['AI_API_KEY', '', true],
  aiModel: ['AI_MODEL', '', false],
  aiBaseUrl: ['AI_BASE_URL', '', false],
  mymemoryEmail: ['MYMEMORY_EMAIL', '', false],

  telegramBotToken: ['TELEGRAM_BOT_TOKEN', '', true],
  telegramChatId: ['TELEGRAM_CHAT_ID', '', false],
  telegramMinScore: ['TELEGRAM_MIN_SCORE', '80', false]
};

const SETTINGS_CHOICES = {
  aiProvider: new Set(['none', 'anthropic', 'openai', 'gemini']),
  smtpSecurity: new Set(['starttls', 'ssl', 'none'])
};

const SECRET_TARGETS = {
  aiApiKey: ['aiBaseUrl', 'aiProvider'],
  smtpPassword: ['smtpHost', 'smtpPort', 'smtpSecurity']
};

const SECRET_LABELS = {
  aiApiKey: 'API anahtarını',
  smtpPassword: 'SMTP parolasını'
};

function getDataDir() {
  const dir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function dbFilePath() {
  return path.join(getDataDir(), 'db.json');
}

function authFilePath() {
  return path.join(getDataDir(), 'auth.json');
}

function settingsFilePath() {
  return path.join(getDataDir(), 'settings.json');
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(filePath, data, mode = 0o644) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const suffix = `${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2, 8)}.tmp`;
  const tmpPath = `${filePath}.${suffix}`;
  const payload = JSON.stringify(data, null, 2);
  try {
    fs.writeFileSync(tmpPath, payload, { encoding: 'utf8', mode });
    try {
      fs.chmodSync(tmpPath, mode);
    } catch {
      // Windows'ta chmod kısıtlı olabilir
    }
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch {
      // Temizlik hatasını yut
    }
    throw err;
  }
}

// ---------------------------------------------------------------- db.json

function pruneLeads(leads, maxLeads = MAX_LEADS) {
  if (!Array.isArray(leads) || leads.length <= maxLeads) return Array.isArray(leads) ? leads : [];
  const protectedLeads = [];
  const otherLeads = [];
  for (const lead of leads) {
    if (!lead || typeof lead !== 'object') continue;
    if (PROTECTED_LEAD_STATUSES.has(lead.status)) {
      protectedLeads.push(lead);
    } else {
      otherLeads.push(lead);
    }
  }
  if (protectedLeads.length >= maxLeads) {
    return protectedLeads.slice(0, maxLeads);
  }
  const remainingSlots = maxLeads - protectedLeads.length;
  const keptOthers = otherLeads.slice(0, remainingSlots);
  const keptSet = new Set([...protectedLeads, ...keptOthers]);
  return leads.filter(l => keptSet.has(l));
}

function loadDb(syncFn, defaultFactory) {
  const filePath = dbFilePath();
  const parsed = readJsonSafe(filePath, null);
  if (parsed && Array.isArray(parsed.campaigns) && Array.isArray(parsed.leads)) {
    let changed = false;
    if (typeof syncFn === 'function' && syncFn(parsed)) {
      changed = true;
    }
    if (parsed.leads.length > MAX_LEADS) {
      parsed.leads = pruneLeads(parsed.leads);
      changed = true;
    }
    if (changed) {
      saveDb(parsed);
    }
    return parsed;
  }
  const initial = typeof defaultFactory === 'function'
    ? defaultFactory()
    : { campaigns: [], leads: [], settings: {} };
  saveDb(initial);
  return initial;
}

function saveDb(db) {
  if (db && Array.isArray(db.leads)) {
    db.leads = pruneLeads(db.leads);
  }
  writeJsonAtomic(dbFilePath(), db, 0o644);
}

// ---------------------------------------------------------------- auth.json

function loadAuth() {
  const data = readJsonSafe(authFilePath(), null);
  if (data && Array.isArray(data.users) && data.usedTokens && typeof data.usedTokens === 'object') {
    return data;
  }
  return { users: [], usedTokens: {} };
}

function saveAuth(data) {
  writeJsonAtomic(authFilePath(), data, 0o600);
}

function countUsers() {
  return loadAuth().users.length;
}

function listUsers() {
  return loadAuth().users.slice();
}

function getUserById(id) {
  const numId = Number(id);
  if (!Number.isFinite(numId)) return null;
  return loadAuth().users.find(u => u.id === numId) || null;
}

function findUserByUsername(username) {
  const clean = String(username || '').trim().toLowerCase();
  if (!clean) return null;
  return loadAuth().users.find(u => u.username && u.username.toLowerCase() === clean) || null;
}

function findUserByEmail(email) {
  const clean = String(email || '').trim().toLowerCase();
  if (!clean) return null;
  return loadAuth().users.find(u => u.email && u.email.toLowerCase() === clean) || null;
}

function findUserByGoogleSub(sub) {
  const clean = String(sub || '').trim();
  if (!clean) return null;
  return loadAuth().users.find(u => u.googleSub === clean) || null;
}

function uniqueUsername(base) {
  const auth = loadAuth();
  const taken = new Set(auth.users.map(u => String(u.username || '').toLowerCase()));
  const clean = (String(base || 'kullanici').toLowerCase().replace(/[^a-z0-9._-]/g, '') || 'kullanici').slice(0, 40);
  if (!taken.has(clean)) return clean;
  for (let i = 2; i < 10000; i++) {
    const candidate = `${clean}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${clean}_${Date.now()}`;
}

function createUser({ username, displayName, email = null, passwordHash = null, googleSub = null, role = 'user', status = 'pending' }) {
  const auth = loadAuth();
  const nextId = auth.users.reduce((max, u) => Math.max(max, Number(u.id) || 0), 0) + 1;
  const normalizedUsername = String(username || '').trim().toLowerCase();
  if (auth.users.some(u => u.username && u.username.toLowerCase() === normalizedUsername)) {
    throw new Error('Bu kullanıcı adı zaten kayıtlı.');
  }
  const normalizedEmail = email ? String(email).trim().toLowerCase() : null;
  const user = {
    id: nextId,
    username: normalizedUsername,
    displayName: String(displayName || normalizedUsername || 'Kullanıcı').trim().slice(0, 120),
    email: normalizedEmail,
    passwordHash: passwordHash || null,
    googleSub: googleSub || null,
    role: role === 'admin' ? 'admin' : 'user',
    status,
    tokenVersion: 1,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
    decidedAt: status === 'active' ? new Date().toISOString() : null
  };
  auth.users.push(user);
  saveAuth(auth);
  return user;
}

function updateUser(id, patch) {
  const numId = Number(id);
  const auth = loadAuth();
  const idx = auth.users.findIndex(u => u.id === numId);
  if (idx === -1) return null;
  auth.users[idx] = { ...auth.users[idx], ...patch };
  saveAuth(auth);
  return auth.users[idx];
}

function deleteUser(id) {
  const numId = Number(id);
  const auth = loadAuth();
  const before = auth.users.length;
  auth.users = auth.users.filter(u => u.id !== numId);
  if (auth.users.length === before) return false;
  saveAuth(auth);
  return true;
}

function bumpTokenVersion(id) {
  const numId = Number(id);
  const auth = loadAuth();
  const user = auth.users.find(u => u.id === numId);
  if (!user) return null;
  user.tokenVersion = (Number(user.tokenVersion) || 1) + 1;
  saveAuth(auth);
  return user;
}

function getAdminEmailsFromDb() {
  return loadAuth().users
    .filter(u => u.role === 'admin' && u.status === 'active' && u.email)
    .map(u => u.email.toLowerCase());
}

function useToken(jti, exp) {
  if (!jti) return false;
  const auth = loadAuth();
  const nowSec = Math.floor(Date.now() / 1000);
  // Süresi dolan kayıtları temizle
  for (const [k, v] of Object.entries(auth.usedTokens)) {
    if (Number(v) < nowSec) {
      delete auth.usedTokens[k];
    }
  }
  if (Object.prototype.hasOwnProperty.call(auth.usedTokens, jti)) {
    return false;
  }
  auth.usedTokens[jti] = Number(exp) || (nowSec + 14 * 86400);
  saveAuth(auth);
  return true;
}

// ---------------------------------------------------------------- settings.json

function loadRawSettings() {
  const data = readJsonSafe(settingsFilePath(), {});
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
}

function normalizeTelegramMinScore(val) {
  const s = String(val == null ? '' : val).trim();
  if (!/^\d+$/.test(s)) return '80';
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n < 0 || n > 100) return '80';
  return String(n);
}

function getSetting(name) {
  const spec = SETTINGS_FIELDS[name];
  if (!spec) throw new Error(`Bilinmeyen ayar: ${name}`);
  const [envKey, defaultVal] = spec;
  const raw = loadRawSettings();
  const panelVal = raw[name] !== undefined && raw[name] !== null ? String(raw[name]).trim() : '';
  const resolved = panelVal || (process.env[envKey] ? String(process.env[envKey]).trim() : '') || defaultVal;
  if (name === 'telegramMinScore') {
    return normalizeTelegramMinScore(resolved);
  }
  return resolved;
}

function getSettingSource(name) {
  const spec = SETTINGS_FIELDS[name];
  if (!spec) throw new Error(`Bilinmeyen ayar: ${name}`);
  const [envKey] = spec;
  const raw = loadRawSettings();
  if (raw[name] !== undefined && raw[name] !== null && String(raw[name]).trim()) {
    return 'panel';
  }
  return (process.env[envKey] && String(process.env[envKey]).trim()) ? 'env' : 'varsayılan';
}

function maskSecret(value) {
  const str = String(value || '');
  if (!str) return '';
  return str.length > 8 ? `…${str.slice(-4)}` : '…';
}

function getPublicSettings() {
  const out = {};
  for (const [name, [, , isSecret]] of Object.entries(SETTINGS_FIELDS)) {
    const val = getSetting(name);
    out[name] = {
      value: isSecret ? maskSecret(val) : val,
      set: Boolean(val),
      source: getSettingSource(name),
      secret: isSecret
    };
  }
  return out;
}

function normSettingTarget(name, val) {
  const s = String(val || '').trim();
  if (name === 'aiBaseUrl') return s.replace(/\/+$/, '').toLowerCase();
  if (name === 'smtpPort' && /^\d+$/.test(s)) return String(parseInt(s, 10));
  if (name === 'smtpHost') return s.toLowerCase().replace(/\.+$/, '');
  return s;
}

function effectiveSetting(name, val) {
  const [envKey, defaultVal] = SETTINGS_FIELDS[name];
  const v = val !== null && val !== undefined ? String(val).trim() : '';
  if (v) return v;
  return (process.env[envKey] ? String(process.env[envKey]).trim() : '') || defaultVal;
}

function validateSettingsChanges(changes) {
  if (!changes || typeof changes !== 'object') {
    throw new Error('Geçersiz ayar verisi.');
  }
  const clean = {};
  for (const [name, rawValue] of Object.entries(changes)) {
    if (!Object.prototype.hasOwnProperty.call(SETTINGS_FIELDS, name)) {
      throw new Error(`Bilinmeyen ayar: ${name}`);
    }
    if (rawValue === null) {
      clean[name] = null;
      continue;
    }
    const val = String(rawValue).trim();
    if (val.length > 2000 || /[\r\n]/.test(val)) {
      throw new Error(`Geçersiz değer: ${name}`);
    }
    if (val && SETTINGS_CHOICES[name] && !SETTINGS_CHOICES[name].has(val)) {
      throw new Error(`Geçersiz seçim: ${name}`);
    }
    if (val && name === 'aiBaseUrl') {
      if (!/^https?:\/\//i.test(val)) {
        throw new Error(`${name} http:// veya https:// ile başlamalı.`);
      }
    }
    if (val && name === 'smtpPort') {
      const portNum = Number(val);
      if (!/^\d+$/.test(val) || portNum < 1 || portNum > 65535) {
        throw new Error('SMTP portu 1-65535 arasında bir sayı olmalı.');
      }
    }
    if (val && name === 'telegramMinScore') {
      clean[name] = normalizeTelegramMinScore(val);
      continue;
    }
    clean[name] = name === 'aiBaseUrl' ? val.replace(/\/+$/, '') : val;
  }
  return clean;
}

function applySettingsPreview(clean) {
  const values = {};
  for (const name of Object.keys(SETTINGS_FIELDS)) {
    values[name] = getSetting(name);
  }
  for (const [name, val] of Object.entries(clean)) {
    const isSecret = SETTINGS_FIELDS[name][2];
    if (val === null) {
      values[name] = effectiveSetting(name, null);
    } else if (val !== '' || !isSecret) {
      values[name] = effectiveSetting(name, val);
    }
  }
  return values;
}

function guardSecretTargets(clean, values) {
  for (const [secret, targets] of Object.entries(SECRET_TARGETS)) {
    const reverting = Object.prototype.hasOwnProperty.call(clean, secret) && clean[secret] === null;
    const moved = targets.filter(t =>
      Object.prototype.hasOwnProperty.call(clean, t) &&
      normSettingTarget(t, values[t]) !== normSettingTarget(t, getSetting(t))
    );
    if (moved.length > 0 && values[secret] && !clean[secret] && !reverting) {
      throw new Error(`Bağlantı hedefi değiştiği için kayıtlı ${SECRET_LABELS[secret]} yeniden girin (kayıtlı sır yeni adrese gönderilmez).`);
    }
    if (reverting && values[secret]) {
      const off = targets.filter(t => normSettingTarget(t, values[t]) !== normSettingTarget(t, effectiveSetting(t, null)));
      if (off.length > 0) {
        throw new Error(`Panelde kayıtlı sır silinince ortam değişkenindeki ${SECRET_LABELS[secret]} kullanılır; ancak hedef alanlar farklı. Önce hedef alanları varsayılana döndürün.`);
      }
    }
  }
  const smtpTouched = Object.keys(clean).some(k => k.startsWith('smtp'));
  if (smtpTouched && values.smtpSecurity === 'none' && (values.smtpUsername || values.smtpPassword)) {
    throw new Error('Şifresiz SMTP bağlantısında (güvenlik: yok) kullanıcı adı ve parola gönderilmez; STARTTLS ya da SSL seçin.');
  }
}

function updateSettings(changes) {
  const clean = validateSettingsChanges(changes);
  const preview = applySettingsPreview(clean);
  guardSecretTargets(clean, preview);

  const raw = loadRawSettings();
  for (const [name, val] of Object.entries(clean)) {
    const isSecret = SETTINGS_FIELDS[name][2];
    if (val === null) {
      delete raw[name];
    } else if (val === '' && isSecret) {
      // Boş bırakılan gizli alan mevcut değeri korur
      continue;
    } else if (val === '') {
      delete raw[name];
    } else {
      raw[name] = val;
    }
  }
  writeJsonAtomic(settingsFilePath(), raw, 0o600);
  return getPublicSettings();
}

function mergedSettings(changes) {
  const clean = validateSettingsChanges(changes || {});
  const preview = applySettingsPreview(clean);
  guardSecretTargets(clean, preview);
  return preview;
}

module.exports = {
  MAX_LEADS,
  SETTINGS_FIELDS,
  SETTINGS_CHOICES,
  getDataDir,
  readJsonSafe,
  writeJsonAtomic,
  pruneLeads,
  loadDb,
  saveDb,
  loadAuth,
  saveAuth,
  countUsers,
  listUsers,
  getUserById,
  findUserByUsername,
  findUserByEmail,
  findUserByGoogleSub,
  uniqueUsername,
  createUser,
  updateUser,
  deleteUser,
  bumpTokenVersion,
  getAdminEmailsFromDb,
  useToken,
  getSetting,
  getSettingSource,
  maskSecret,
  getPublicSettings,
  updateSettings,
  mergedSettings
};
