'use strict';

const fs = require('fs');
const path = require('path');
const store = require('./store');
const auth = require('./auth');
const mailer = require('./mailer');
const translate = require('./translate');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const ADMIN_PAGE_PATHS = new Set([
  '/yonetim',
  '/yonetim/kullanicilar',
  '/yonetim/giris',
  '/yonetim/eposta',
  '/yonetim/yapay-zeka',
  '/yonetim/webhook'
]);

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function parseJsonBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function renderForbiddenHtml() {
  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Yetki yok · AI-CustomerHunter</title>
  <link rel="stylesheet" href="/appcook-tema.css">
  <style>
    body { display: grid; place-items: center; padding: 24px; }
    .kutu { max-width: 440px; width: 100%; background: var(--yuzey); border: 1px solid var(--cizgi); border-radius: 16px; padding: 28px; box-shadow: var(--golge); }
    h1 { margin: 0 0 8px; font-size: 22px; }
    p { margin: 0 0 18px; color: var(--soluk); }
  </style>
</head>
<body>
  <main class="kutu">
    <h1>Yetki yok</h1>
    <p>Bu sayfa yalnızca yöneticilere açıktır.</p>
    <a class="btn birincil" href="/">← Uygulamaya dön</a>
  </main>
</body>
</html>`;
}

function countActiveAdmins() {
  return store.listUsers().filter(u => u.role === 'admin' && u.status === 'active').length;
}

async function handleYonetimRoutes(req, res, parsedUrl, { loadDb }) {
  const pathname = parsedUrl.pathname.replace(/\/+$/, '') || '/';
  const method = req.method;

  // 1. HTML Yönetim Sayfaları (/yonetim, /yonetim/*)
  if (method === 'GET' && (ADMIN_PAGE_PATHS.has(pathname) || pathname === '/kullanicilar')) {
    if (pathname === '/kullanicilar') {
      res.writeHead(301, { Location: '/yonetim/kullanicilar', 'Cache-Control': 'no-store' });
      res.end();
      return true;
    }

    const user = auth.getCurrentUser(req);
    if (!user) {
      res.writeHead(302, {
        Location: `/giris?next=${encodeURIComponent(pathname)}`,
        'Cache-Control': 'no-store'
      });
      res.end();
      return true;
    }
    if (user.role !== 'admin') {
      res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(renderForbiddenHtml());
      return true;
    }

    const htmlPath = path.join(PUBLIC_DIR, 'yonetim.html');
    fs.readFile(htmlPath, (err, content) => {
      if (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Yönetim arayüzü yüklenemedi.');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(content);
    });
    return true;
  }

  // 2. Yönetim API'leri (/api/yonetim/*)
  if (!pathname.startsWith('/api/yonetim/')) {
    return false;
  }

  if (method === 'POST' || method === 'PUT' || method === 'DELETE') {
    if (!auth.requireSameOrigin(req, res)) return true;
  }

  const admin = auth.requireAdmin(req, res);
  if (!admin) return true;

  // GET /api/yonetim/ozet
  if (pathname === '/api/yonetim/ozet' && method === 'GET') {
    const users = store.listUsers();
    const db = typeof loadDb === 'function' ? loadDb() : { campaigns: [], leads: [] };
    const baseUrl = auth.getBaseUrl(req);
    return sendJson(res, 200, {
      ok: true,
      admin: auth.sanitizeUser(admin),
      users: {
        total: users.length,
        active: users.filter(u => u.status === 'active').length,
        pending: users.filter(u => u.status === 'pending').length,
        admins: users.filter(u => u.role === 'admin' && u.status === 'active').length
      },
      app: {
        campaigns: Array.isArray(db.campaigns) ? db.campaigns.length : 0,
        leads: Array.isArray(db.leads) ? db.leads.length : 0,
        hotLeads: Array.isArray(db.leads) ? db.leads.filter(l => Number(l.intentScore) >= 85).length : 0
      },
      services: {
        googleConfigured: auth.isGoogleConfigured(),
        smtpEnabled: mailer.isSmtpEnabled(),
        translation: translate.getActiveProviderInfo(),
        webhookConfigured: Boolean(store.getSetting('slackWebhook') || store.getSetting('discordWebhook'))
      },
      callbackUrl: `${baseUrl}/auth/google/callback`
    });
  }

  // GET /api/yonetim/kullanicilar
  if (pathname === '/api/yonetim/kullanicilar' && method === 'GET') {
    const users = store.listUsers()
      .sort((a, b) => {
        const order = { pending: 0, active: 1, disabled: 2, rejected: 3 };
        const diff = (order[a.status] ?? 9) - (order[b.status] ?? 9);
        if (diff !== 0) return diff;
        return Number(b.id) - Number(a.id);
      })
      .map(auth.sanitizeUser);

    return sendJson(res, 200, {
      ok: true,
      currentUserId: admin.id,
      pendingCount: users.filter(u => u.status === 'pending').length,
      users
    });
  }

  // POST /api/yonetim/kullanicilar/:id/:action
  const userActionMatch = pathname.match(/^\/api\/yonetim\/kullanicilar\/(\d+)\/([a-z_]+)$/);
  if (userActionMatch && method === 'POST') {
    const targetId = Number(userActionMatch[1]);
    const action = userActionMatch[2];
    const target = store.getUserById(targetId);
    if (!target) {
      return sendJson(res, 404, { ok: false, error: 'Kullanıcı bulunamadı.' });
    }

    const baseUrl = auth.getBaseUrl(req);
    const isSelf = target.id === admin.id;
    const isLastActiveAdmin = target.role === 'admin' && target.status === 'active' && countActiveAdmins() <= 1;

    try {
      if (action === 'onayla') {
        if (target.status === 'disabled') {
          const updated = store.updateUser(targetId, { status: 'active' });
          return sendJson(res, 200, { ok: true, message: 'Kullanıcı etkinleştirildi.', user: auth.sanitizeUser(updated) });
        }
        const result = auth.decideUser(targetId, true, baseUrl);
        return sendJson(res, 200, {
          ok: true,
          message: result.mailed
            ? 'Kullanıcı onaylandı ve e-posta gönderildi.'
            : 'Kullanıcı onaylandı (SMTP ayarlı olmadığı için e-posta gönderilmedi).',
          mailed: result.mailed,
          user: auth.sanitizeUser(result.user)
        });
      }

      if (action === 'reddet') {
        const result = auth.decideUser(targetId, false, baseUrl);
        return sendJson(res, 200, {
          ok: true,
          message: result.mailed
            ? 'Başvuru reddedildi ve e-posta gönderildi.'
            : 'Başvuru reddedildi.',
          mailed: result.mailed,
          user: auth.sanitizeUser(result.user)
        });
      }

      if (action === 'yonetici_yap') {
        const updated = store.updateUser(targetId, { role: 'admin' });
        return sendJson(res, 200, { ok: true, message: 'Kullanıcı yönetici yapıldı.', user: auth.sanitizeUser(updated) });
      }

      if (action === 'kullanici_yap') {
        if (isSelf) {
          return sendJson(res, 400, { ok: false, error: 'Kendi yönetici yetkinizi kaldıramazsınız.' });
        }
        if (isLastActiveAdmin) {
          return sendJson(res, 400, { ok: false, error: 'Son etkin yöneticinin yetkisi kaldırılamaz.' });
        }
        const updated = store.updateUser(targetId, { role: 'user' });
        return sendJson(res, 200, { ok: true, message: 'Kullanıcı standart rolüne alındı.', user: auth.sanitizeUser(updated) });
      }

      if (action === 'askiya_al') {
        if (isSelf) {
          return sendJson(res, 400, { ok: false, error: 'Kendi hesabınızı askıya alamazsınız.' });
        }
        if (isLastActiveAdmin) {
          return sendJson(res, 400, { ok: false, error: 'Son etkin yönetici askıya alınamaz.' });
        }
        store.bumpTokenVersion(targetId);
        const updated = store.updateUser(targetId, { status: 'disabled' });
        return sendJson(res, 200, { ok: true, message: 'Kullanıcı askıya alındı ve oturumları kapatıldı.', user: auth.sanitizeUser(updated) });
      }

      if (action === 'aktiflestir') {
        const updated = store.updateUser(targetId, { status: 'active' });
        return sendJson(res, 200, { ok: true, message: 'Kullanıcı etkinleştirildi.', user: auth.sanitizeUser(updated) });
      }

      if (action === 'oturumlari_kapat') {
        const updated = store.bumpTokenVersion(targetId);
        return sendJson(res, 200, { ok: true, message: 'Kullanıcının tüm oturumları kapatıldı.', user: auth.sanitizeUser(updated) });
      }

      if (action === 'sil') {
        if (isSelf) {
          return sendJson(res, 400, { ok: false, error: 'Kendi hesabınızı silemezsiniz.' });
        }
        if (isLastActiveAdmin) {
          return sendJson(res, 400, { ok: false, error: 'Son etkin yönetici silinemez.' });
        }
        store.deleteUser(targetId);
        return sendJson(res, 200, { ok: true, message: 'Kullanıcı silindi.' });
      }

      return sendJson(res, 400, { ok: false, error: 'Bilinmeyen kullanıcı işlemi.' });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message || 'İşlem başarısız.' });
    }
  }

  // GET /api/yonetim/ayarlar
  if (pathname === '/api/yonetim/ayarlar' && method === 'GET') {
    const baseUrl = auth.getBaseUrl(req);
    return sendJson(res, 200, {
      ok: true,
      settings: store.getPublicSettings(),
      callbackUrl: `${baseUrl}/auth/google/callback`,
      translation: translate.getActiveProviderInfo()
    });
  }

  // PUT /api/yonetim/ayarlar
  if (pathname === '/api/yonetim/ayarlar' && method === 'PUT') {
    const body = await parseJsonBody(req);
    try {
      const updated = store.updateSettings(body);
      return sendJson(res, 200, {
        ok: true,
        message: 'Ayarlar kaydedildi.',
        settings: updated,
        translation: translate.getActiveProviderInfo()
      });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message || 'Ayarlar kaydedilemedi.' });
    }
  }

  // POST /api/yonetim/eposta-test
  if (pathname === '/api/yonetim/eposta-test' && method === 'POST') {
    const body = await parseJsonBody(req);
    const to = String(body.to || admin.email || '').trim();
    if (!to || !to.includes('@')) {
      return sendJson(res, 400, { ok: false, error: 'Geçerli bir hedef e-posta adresi girin.' });
    }
    let smtpCfg;
    try {
      const merged = store.mergedSettings(body.overrides || {});
      smtpCfg = mailer.getSmtpConfig(merged);
      await mailer.sendTestEmail(to, smtpCfg);
      return sendJson(res, 200, { ok: true, message: `Deneme e-postası ${to} adresine gönderildi.` });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: mailer.explainSmtpError(err, smtpCfg) });
    }
  }

  // POST /api/yonetim/ceviri-test
  if (pathname === '/api/yonetim/ceviri-test' && method === 'POST') {
    const body = await parseJsonBody(req);
    try {
      const merged = store.mergedSettings(body.overrides || {});
      const result = await translate.testTranslation(body.text, body.lang || 'tr', merged);
      return sendJson(res, 200, {
        ok: true,
        provider: result.provider,
        translatedText: result.translatedText,
        durationMs: result.durationMs
      });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err.message || 'Çeviri testi başarısız oldu.' });
    }
  }

  return sendJson(res, 404, { ok: false, error: 'Yönetim API ucu bulunamadı.' });
}

module.exports = {
  ADMIN_PAGE_PATHS,
  handleYonetimRoutes
};
