'use strict';

const nodemailer = require('nodemailer');
const store = require('./store');

const APP_NAME = 'AI-CustomerHunter';

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isGmailHost(host) {
  const h = String(host || '').trim().toLowerCase();
  return h === 'smtp.gmail.com' || h === 'smtp.googlemail.com';
}

function getSmtpConfig(overrides = null) {
  if (overrides) {
    return {
      host: String(overrides.smtpHost || '').trim(),
      port: String(overrides.smtpPort || '587').trim(),
      security: String(overrides.smtpSecurity || 'starttls').trim().toLowerCase(),
      username: String(overrides.smtpUsername || '').trim(),
      password: String(overrides.smtpPassword || ''),
      from: String(overrides.smtpFrom || '').trim()
    };
  }
  return {
    host: store.getSetting('smtpHost'),
    port: store.getSetting('smtpPort'),
    security: store.getSetting('smtpSecurity').toLowerCase(),
    username: store.getSetting('smtpUsername'),
    password: store.getSetting('smtpPassword'),
    from: store.getSetting('smtpFrom')
  };
}

function isSmtpEnabled(cfg = null) {
  const c = cfg || getSmtpConfig();
  return Boolean(c.host && c.from);
}

function getNotifyAddresses() {
  const raw = store.getSetting('notifyEmails');
  const listed = raw
    .replace(/;/g, ',')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  if (listed.length > 0) return Array.from(new Set(listed));

  const envAdmins = store.getSetting('adminEmails')
    .replace(/;/g, ',')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  const dbAdmins = store.getAdminEmailsFromDb();
  return Array.from(new Set([...dbAdmins, ...envAdmins]));
}

function buildMailBodies(text, buttons = []) {
  const btnList = Array.isArray(buttons) ? buttons : [];
  const textLinks = btnList.map(([label, url]) => `\n\n${label}: ${url}`).join('');
  const plainText = `${text}${textLinks}\n\n—\n${APP_NAME}`;

  const paragraphs = String(text || '')
    .split('\n\n')
    .map(p => `<p style="margin:0 0 12px">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('');

  const linksHtml = btnList.map(([label, url]) => {
    const isDanger = String(label || '').toLowerCase().includes('reddet');
    const bg = isDanger ? '#c4302b' : '#2563eb';
    return `<a href="${escapeHtml(url)}" style="display:inline-block;margin:6px 8px 6px 0;padding:11px 20px;border-radius:10px;background:${bg};color:#ffffff;text-decoration:none;font-weight:600">${escapeHtml(label)}</a>`;
  }).join('');

  const htmlBody = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1b1f24;max-width:560px">${paragraphs}${linksHtml ? `<p style="margin:16px 0">${linksHtml}</p>` : ''}<p style="color:#667085;font-size:13px;margin-top:24px">— ${escapeHtml(APP_NAME)}</p></div>`;

  return { text: plainText, html: htmlBody };
}

class PlaintextCredentialsError extends Error {
  constructor(msg) {
    super(msg);
    this.name = 'PlaintextCredentialsError';
  }
}

function createTransport(cfg) {
  const security = (cfg.security || 'starttls').toLowerCase();
  if (security !== 'starttls' && security !== 'ssl' && (cfg.username || cfg.password)) {
    throw new PlaintextCredentialsError(
      'Şifresiz SMTP bağlantısında kullanıcı adı/parola gönderilmez; STARTTLS ya da SSL seçin.'
    );
  }
  const port = parseInt(cfg.port || '587', 10) || 587;
  const opts = {
    host: cfg.host,
    port,
    secure: security === 'ssl',
    requireTLS: security === 'starttls',
    ignoreTLS: security === 'none',
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000
  };
  if (cfg.username) {
    // Gmail 16 haneli uygulama şifresindeki boşlukları temizle
    const password = isGmailHost(cfg.host)
      ? String(cfg.password || '').replace(/\s+/g, '')
      : String(cfg.password || '');
    opts.auth = {
      user: cfg.username.trim(),
      pass: password
    };
  }
  return nodemailer.createTransport(opts);
}

async function sendMailNow(to, subject, text, buttons = [], cfgOverride = null) {
  const cfg = cfgOverride || getSmtpConfig();
  if (!isSmtpEnabled(cfg)) {
    throw new Error('SMTP ayarları tamamlanmamış (sunucu ve gönderen adresi gerekli).');
  }
  const transporter = createTransport(cfg);
  const { text: plainText, html } = buildMailBodies(text, buttons);
  await transporter.sendMail({
    from: `"${APP_NAME}" <${cfg.from}>`,
    to,
    subject,
    text: plainText,
    html
  });
}

function sendMailAsync(to, subject, text, buttons = []) {
  const recipients = Array.isArray(to) ? to.filter(Boolean) : (to ? [to] : []);
  const cfg = getSmtpConfig();
  if (recipients.length === 0 || !isSmtpEnabled(cfg)) {
    if (recipients.length > 0) {
      console.warn(`[mailer] SMTP ayarlı değil; e-posta gönderilmedi: ${subject}`);
    }
    return false;
  }

  setImmediate(async () => {
    for (const recipient of recipients) {
      try {
        await sendMailNow(recipient, subject, text, buttons, cfg);
      } catch (err) {
        console.error(`[mailer] E-posta gönderilemedi (${recipient}):`, err.message || err);
      }
    }
  });
  return true;
}

function explainSmtpError(err, cfg = null) {
  const c = cfg || getSmtpConfig();
  if (!err) return 'Bilinmeyen SMTP hatası.';
  if (err instanceof PlaintextCredentialsError) return err.message;
  const code = String(err.responseCode || err.code || '');
  const msg = String(err.message || '');
  if (code === '535' || code === 'EAUTH' || /auth|535/i.test(msg)) {
    if (isGmailHost(c.host)) {
      return 'Gmail kullanıcı adı ya da parolayı kabul etmedi. Normal Gmail şifresi yerine Google hesabınızda 2 adımlı doğrulamayı açıp 16 haneli uygulama şifresi oluşturun.';
    }
    return 'SMTP sunucusu kullanıcı adı ya da parolayı kabul etmedi.';
  }
  if (code === 'ECONNECTION' || code === 'ETIMEDOUT' || code === 'ENOTFOUND' || code === 'ECONNREFUSED') {
    return `Sunucuya bağlanılamadı (${c.host}:${c.port}). Adresi, portu ve güvenlik türünü kontrol edin.`;
  }
  return msg || 'SMTP gönderimi başarısız oldu.';
}

async function sendTestEmail(to, cfgOverride = null) {
  const subject = `${APP_NAME} — Deneme e-postası`;
  const text = `Merhaba,\n\nBu ileti ${APP_NAME} SMTP ayarlarınızın çalıştığını doğrulamak için gönderildi.`;
  await sendMailNow(to, subject, text, [], cfgOverride);
}

module.exports = {
  APP_NAME,
  escapeHtml,
  getSmtpConfig,
  isSmtpEnabled,
  getNotifyAddresses,
  sendMailNow,
  sendMailAsync,
  sendTestEmail,
  explainSmtpError,
  PlaintextCredentialsError
};
