'use strict';

const store = require('./store');

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const TELEGRAM_TIMEOUT_MS = 8000;
const MAX_CHAT_TARGETS = 5;
const MAX_LEADS_PER_NOTIFY = 5;
const MAX_MESSAGE_CHARS = 4000;

const PLATFORM_LABELS = {
  reddit: 'Reddit',
  hackernews: 'HackerNews',
  github: 'GitHub'
};

function escapeTgHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function safeHttpUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  try {
    const parsed = new URL(s);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '';
    }
    return parsed.href;
  } catch {
    return '';
  }
}

function escapeHref(url) {
  return escapeTgHtml(url).replace(/"/g, '&quot;');
}

function truncateText(str, maxLen) {
  const clean = String(str || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, Math.max(1, maxLen - 1)).trimEnd()}…`;
}

function parseChatIds(raw) {
  const parts = String(raw || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const unique = [];
  const seen = new Set();
  for (const id of parts) {
    if (seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
    if (unique.length >= MAX_CHAT_TARGETS) break;
  }
  return unique;
}

function parseMinScore(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!/^\d+$/.test(s)) return 80;
  const n = parseInt(s, 10);
  if (!Number.isFinite(n) || n < 0 || n > 100) return 80;
  return n;
}

function getTelegramConfig(override = null) {
  if (override && typeof override === 'object') {
    return {
      botToken: String(override.telegramBotToken || '').trim(),
      chatIds: parseChatIds(override.telegramChatId),
      minScore: parseMinScore(override.telegramMinScore)
    };
  }
  return {
    botToken: store.getSetting('telegramBotToken'),
    chatIds: parseChatIds(store.getSetting('telegramChatId')),
    minScore: parseMinScore(store.getSetting('telegramMinScore'))
  };
}

function isTelegramConfigured(override = null) {
  const cfg = getTelegramConfig(override);
  return Boolean(cfg.botToken && cfg.chatIds.length > 0);
}

function redactToken(text, token) {
  let out = String(text || '');
  if (token) {
    out = out.split(token).join('[GİZLİ]');
  }
  // Genel Telegram bot token kalıbını da maskele
  return out.replace(/bot\d{5,20}:[A-Za-z0-9_-]{10,}/gi, 'bot[GİZLİ]');
}

function validateBotTokenSyntax(token) {
  const clean = String(token || '').trim();
  if (!clean) return false;
  if (/[\s/?#\\]/.test(clean)) return false;
  return clean.includes(':');
}

function explainTelegramError(status, description, err, token) {
  const desc = redactToken(description || '', token);
  const lower = desc.toLowerCase();

  if (err && (err.name === 'AbortError' || /aborted|timeout/i.test(String(err.message || '')))) {
    return 'Telegram API yanıt vermedi (8 sn zaman aşımı). Sunucunun internet erişimini kontrol edin.';
  }
  if (status === 401 || lower.includes('unauthorized')) {
    return 'Telegram Bot Token geçersiz (401). @BotFather üzerinden aldığınız tokenı kontrol edin.';
  }
  if (status === 404 && !lower.includes('chat')) {
    return 'Telegram API ucu bulunamadı (404). Bot Token biçimini (ör. 123456:ABC...) kontrol edin.';
  }
  if (status === 400 && (lower.includes('chat not found') || lower.includes('chat_id is empty') || lower.includes('user not found'))) {
    return 'Telegram sohbeti bulunamadı (400). Chat ID değerini kontrol edin ve bota en az bir kez /start gönderin.';
  }
  if (status === 400 && lower.includes('group chat was upgraded')) {
    return 'Grup süper gruba yükseltilmiş (400). Yeni -100... ile başlayan Chat ID değerini girin.';
  }
  if (status === 403 || lower.includes('bot was blocked') || lower.includes('bot was kicked') || lower.includes('not enough rights')) {
    return 'Bot sohbete mesaj gönderemedi (403). Botun engellenmediğinden ve grupta yazma yetkisi olduğundan emin olun.';
  }
  if (status === 429 || lower.includes('too many requests')) {
    return 'Telegram hız sınırına ulaşıldı (429). Kısa süre sonra tekrar deneyin.';
  }
  if (desc) {
    return `Telegram API hatası${status ? ` (${status})` : ''}: ${desc}`;
  }
  if (err && err.message) {
    return `Telegram bağlantı hatası: ${redactToken(err.message, token)}`;
  }
  return 'Telegram bildirimi gönderilemedi.';
}

async function sendTelegramMessage(token, chatId, htmlText, timeoutMs = TELEGRAM_TIMEOUT_MS) {
  const cleanToken = String(token || '').trim();
  const cleanChatId = String(chatId || '').trim();
  if (!validateBotTokenSyntax(cleanToken)) {
    throw new Error('Telegram Bot Token biçimi geçersiz. @BotFather üzerinden alınan "123456:ABC..." biçiminde olmalıdır.');
  }
  if (!cleanChatId) {
    throw new Error('Telegram Chat ID boş olamaz.');
  }

  const url = `${TELEGRAM_API_BASE}/bot${cleanToken}/sendMessage`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let resp;
  try {
    resp = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: cleanChatId,
        text: htmlText,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });
  } catch (err) {
    throw new Error(explainTelegramError(0, '', err, cleanToken));
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try {
    data = await resp.json();
  } catch {
    data = null;
  }

  if (!resp.ok || !data || data.ok !== true) {
    const desc = (data && data.description) ? String(data.description) : `HTTP ${resp.status}`;
    throw new Error(explainTelegramError(resp.status, desc, null, cleanToken));
  }

  return data.result || { ok: true };
}

function formatPlatform(platform, community) {
  const key = String(platform || '').trim().toLowerCase();
  const base = PLATFORM_LABELS[key] || (platform ? String(platform) : 'Web');
  const comm = String(community || '').trim();
  if (comm && comm.toLowerCase() !== base.toLowerCase() && !comm.toLowerCase().includes(base.toLowerCase())) {
    return `${base} (${comm})`;
  }
  return base;
}

function resolvePublicUrl(fallbackUrl = '') {
  const candidate = String(process.env.PUBLIC_URL || '').trim() || String(fallbackUrl || '').trim();
  return safeHttpUrl(candidate);
}

function formatLeadsMessage(campaign, leads, { publicUrl = '' } = {}) {
  const items = (Array.isArray(leads) ? leads : []).slice(0, MAX_LEADS_PER_NOTIFY);
  if (items.length === 0) return '';

  const productName = escapeTgHtml((campaign && campaign.name) ? campaign.name : 'AI-CustomerHunter');
  const header = items.length === 1
    ? `🎯 <b>Yeni Sıcak Fırsat · ${productName}</b>`
    : `🎯 <b>${items.length} Yeni Sıcak Fırsat · ${productName}</b>`;

  const blocks = [header];

  items.forEach((lead, idx) => {
    const score = Number.isFinite(Number(lead.intentScore)) ? Math.round(Number(lead.intentScore)) : 0;
    const source = escapeTgHtml(formatPlatform(lead.platform, lead.community));
    const trTitle = (lead.i18n && lead.i18n.tr && lead.i18n.tr.title) ? lead.i18n.tr.title : (lead.title || 'Başlıksız fırsat');
    const trWhyHot = (lead.i18n && lead.i18n.tr && lead.i18n.tr.whyHot) ? lead.i18n.tr.whyHot : (lead.whyHot || '');
    const titleEsc = escapeTgHtml(truncateText(trTitle, 180));
    const whyEsc = escapeTgHtml(truncateText(trWhyHot, 220));
    const postUrl = safeHttpUrl(lead.url);

    const lines = [
      `${idx + 1}. <b>%${score}</b> · <i>${source}</i>`,
      `<b>${titleEsc}</b>`
    ];
    if (whyEsc) {
      lines.push(`🔥 <b>Neden sıcak:</b> ${whyEsc}`);
    }
    if (postUrl) {
      lines.push(`🔗 <a href="${escapeHref(postUrl)}">Gönderiyi aç</a>`);
    }
    blocks.push(lines.join('\n'));
  });

  const appUrl = resolvePublicUrl(publicUrl);
  if (appUrl) {
    blocks.push(`🚀 <a href="${escapeHref(appUrl)}">AI-CustomerHunter Panelini Aç</a>`);
  }

  let message = blocks.join('\n\n');
  if (message.length > MAX_MESSAGE_CHARS) {
    message = `${message.slice(0, MAX_MESSAGE_CHARS - 1)}…`;
  }
  return message;
}

async function notifyNewLeads(campaign, leads, opts = {}) {
  const cfg = getTelegramConfig(opts.cfgOverride || null);
  if (!cfg.botToken || cfg.chatIds.length === 0) {
    return { sent: false, skipped: 'not_configured', count: 0 };
  }

  const eligible = (Array.isArray(leads) ? leads : [])
    .filter(l => l && typeof l === 'object' && Number(l.intentScore) >= cfg.minScore)
    .sort((a, b) => Number(b.intentScore || 0) - Number(a.intentScore || 0))
    .slice(0, MAX_LEADS_PER_NOTIFY);

  if (eligible.length === 0) {
    return { sent: false, skipped: 'below_threshold', count: 0 };
  }

  const html = formatLeadsMessage(campaign, eligible, { publicUrl: opts.publicUrl || '' });
  if (!html) {
    return { sent: false, skipped: 'empty_message', count: 0 };
  }

  const results = await Promise.allSettled(
    cfg.chatIds.map(chatId => sendTelegramMessage(cfg.botToken, chatId, html))
  );

  let sentTargets = 0;
  for (const res of results) {
    if (res.status === 'fulfilled') {
      sentTargets += 1;
    } else {
      console.warn('[telegram] Fırsat bildirimi gönderilemedi:', redactToken(res.reason && res.reason.message ? res.reason.message : res.reason, cfg.botToken));
    }
  }

  return {
    sent: sentTargets > 0,
    sentTargets,
    totalTargets: cfg.chatIds.length,
    count: eligible.length
  };
}

async function sendTestTelegram(override = null, fallbackUrl = '') {
  const cfg = getTelegramConfig(override);
  if (!cfg.botToken) {
    throw new Error('Telegram Bot Token girilmemiş.');
  }
  if (cfg.chatIds.length === 0) {
    throw new Error('Telegram Chat ID girilmemiş.');
  }

  const appUrl = resolvePublicUrl(fallbackUrl);
  const nowStr = new Date().toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
  const lines = [
    '✅ <b>AI-CustomerHunter · Telegram Deneme Bildirimi</b>',
    '',
    'Telegram bildirim bağlantısı başarıyla doğrulandı.',
    `🎯 Minimum satın alma ihtimali eşiği: <b>%${cfg.minScore}</b>`,
    `🕒 Test zamanı: ${escapeTgHtml(nowStr)}`
  ];
  if (appUrl) {
    lines.push('', `🚀 <a href="${escapeHref(appUrl)}">AI-CustomerHunter Panelini Aç</a>`);
  }
  const html = lines.join('\n');

  let sentCount = 0;
  for (const chatId of cfg.chatIds) {
    await sendTelegramMessage(cfg.botToken, chatId, html);
    sentCount += 1;
  }

  return { ok: true, sentCount, chatIds: cfg.chatIds };
}

module.exports = {
  MAX_CHAT_TARGETS,
  MAX_LEADS_PER_NOTIFY,
  escapeTgHtml,
  safeHttpUrl,
  parseChatIds,
  parseMinScore,
  getTelegramConfig,
  isTelegramConfigured,
  redactToken,
  explainTelegramError,
  formatLeadsMessage,
  sendTelegramMessage,
  notifyNewLeads,
  sendTestTelegram
};
