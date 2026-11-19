(function () {
  'use strict';

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async function api(url, opts) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', ...(opts && opts.headers ? opts.headers : {}) },
      ...(opts || {})
    });
    if (res.status === 401) {
      window.location.href = '/giris?next=' + encodeURIComponent(window.location.pathname);
      throw new Error('Oturum kapandı.');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || ('İstek başarısız (' + res.status + ')'));
    }
    return data;
  }

  function currentPageKey() {
    const p = window.location.pathname.replace(/\/+$/, '') || '/yonetim';
    if (p === '/yonetim/kullanicilar') return 'kullanicilar';
    if (p === '/yonetim/giris') return 'giris';
    if (p === '/yonetim/eposta') return 'eposta';
    if (p === '/yonetim/yapay-zeka') return 'yapay-zeka';
    if (p === '/yonetim/bildirimler' || p === '/yonetim/webhook') return 'bildirimler';
    return 'genel';
  }

  function markActiveNav(key) {
    document.querySelectorAll('#yonetimNav a[data-sayfa]').forEach(a => {
      if (a.getAttribute('data-sayfa') === key) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
  }

  function updatePendingBadge(count) {
    const el = document.getElementById('navPendingBadge');
    if (!el) return;
    if (count > 0) {
      el.textContent = String(count);
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  }

  function formatDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return iso;
    }
  }

  function statusBadge(status) {
    const map = {
      active: ['ok', 'Etkin'],
      pending: ['uyari', 'Onay bekliyor'],
      disabled: ['hata', 'Askıda'],
      rejected: ['hata', 'Reddedildi']
    };
    const [cls, lbl] = map[status] || ['notr', status || '—'];
    return `<span class="y-rozet ${cls}">${esc(lbl)}</span>`;
  }

  function secretHint(meta) {
    if (!meta) return '';
    if (meta.set) {
      return `Kayıtlı (${esc(meta.value)} · kaynak: ${esc(meta.source)}). Değiştirmeyecekseniz boş bırakın.`;
    }
    return 'Henüz ayarlanmadı.';
  }

  // ---------------------------------------------------------------- 1. Genel Bakış
  async function renderGenel(container) {
    const data = await api('/api/yonetim/ozet');
    updatePendingBadge(data.users.pending);

    const trMode = data.services.translation.mode === 'llm'
      ? `${data.services.translation.provider} (${data.services.translation.model})`
      : `MyMemory (${data.services.translation.model})`;

    container.innerHTML = `
      <div class="y-baslik">
        <h1>Genel bakış</h1>
        <p>Kullanıcı hesapları, fırsat havuzu ve servis bağlantılarının anlık durumu.</p>
      </div>

      <div class="y-kart-grid">
        <a class="y-stat" href="/yonetim/kullanicilar">
          <span>Toplam kullanıcı</span>
          <strong>${esc(data.users.total)}</strong>
        </a>
        <a class="y-stat ${data.users.pending > 0 ? 'dikkat' : ''}" href="/yonetim/kullanicilar">
          <span>Onay bekleyen</span>
          <strong>${esc(data.users.pending)}</strong>
        </a>
        <div class="y-stat">
          <span>Kayıtlı ürün / kampanya</span>
          <strong>${esc(data.app.campaigns)}</strong>
        </div>
        <div class="y-stat">
          <span>Fırsat havuzu (Sıcak)</span>
          <strong>${esc(data.app.leads)} <small style="font-size:14px;color:var(--ok);">(${esc(data.app.hotLeads)})</small></strong>
        </div>
      </div>

      <section class="y-panel">
        <div class="y-tablo-sar">
          <table class="y-tablo">
            <thead>
              <tr><th>Servis</th><th>Durum</th><th style="text-align:right;">İşlem</th></tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Google ile giriş (OAuth 2.0)</strong></td>
                <td><span class="y-rozet ${data.services.googleConfigured ? 'ok' : 'uyari'}">${data.services.googleConfigured ? 'Ayarlı' : 'Ayarlanmadı'}</span></td>
                <td style="text-align:right;"><a href="/yonetim/giris">Düzenle →</a></td>
              </tr>
              <tr>
                <td><strong>E-posta (SMTP)</strong></td>
                <td><span class="y-rozet ${data.services.smtpEnabled ? 'ok' : 'uyari'}">${data.services.smtpEnabled ? 'Ayarlı' : 'Ayarlanmadı'}</span></td>
                <td style="text-align:right;"><a href="/yonetim/eposta">Düzenle →</a></td>
              </tr>
              <tr>
                <td><strong>Yapay zekâ / Çeviri</strong></td>
                <td><span class="y-rozet ${data.services.translation.mode === 'llm' ? 'ok' : 'notr'}">${esc(trMode)}</span></td>
                <td style="text-align:right;"><a href="/yonetim/yapay-zeka">Düzenle →</a></td>
              </tr>
              <tr>
                <td><strong>Bildirimler (Telegram)</strong></td>
                <td><span class="y-rozet ${data.services.telegramConfigured ? 'ok' : 'notr'}">${data.services.telegramConfigured ? 'Aktif' : 'Kapalı'}</span></td>
                <td style="text-align:right;"><a href="/yonetim/bildirimler">Düzenle →</a></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  // ---------------------------------------------------------------- 2. Kullanıcılar
  async function renderKullanicilar(container) {
    const data = await api('/api/yonetim/kullanicilar');
    updatePendingBadge(data.pendingCount);

    const rows = data.users.map(u => {
      const isSelf = u.id === data.currentUserId;
      const actions = [];
      if (u.status === 'pending') {
        actions.push(`<button class="y-btn kucuk ok" data-act="onayla" data-uid="${u.id}">Onayla</button>`);
        actions.push(`<button class="y-btn kucuk tehlike" data-act="reddet" data-uid="${u.id}">Reddet</button>`);
      } else if (u.status === 'rejected' || u.status === 'disabled') {
        actions.push(`<button class="y-btn kucuk ok" data-act="aktiflestir" data-uid="${u.id}">Aktifleştir</button>`);
      } else if (u.status === 'active' && !isSelf) {
        actions.push(`<button class="y-btn kucuk" data-act="askiya_al" data-uid="${u.id}">Askıya al</button>`);
      }

      if (!isSelf && u.status === 'active') {
        if (u.role === 'admin') {
          actions.push(`<button class="y-btn kucuk" data-act="kullanici_yap" data-uid="${u.id}">Kullanıcı yap</button>`);
        } else {
          actions.push(`<button class="y-btn kucuk" data-act="yonetici_yap" data-uid="${u.id}">Yönetici yap</button>`);
        }
      }
      if (!isSelf) {
        actions.push(`<button class="y-btn kucuk tehlike" data-act="sil" data-uid="${u.id}">Sil</button>`);
      } else {
        actions.push(`<span class="y-rozet notr">Siz</span>`);
      }

      return `
        <tr>
          <td>
            <strong>${esc(u.displayName)}</strong><br />
            <small style="color:var(--soluk);">${esc(u.email || u.username)} · ${u.authType === 'google' ? 'Google' : 'Yerel'}</small>
          </td>
          <td><span class="y-rozet ${u.role === 'admin' ? 'ok' : 'notr'}">${u.role === 'admin' ? 'Yönetici' : 'Kullanıcı'}</span></td>
          <td>${statusBadge(u.status)}</td>
          <td><small style="color:var(--soluk);">${esc(formatDate(u.lastLoginAt || u.createdAt))}</small></td>
          <td><div class="y-aksiyonlar">${actions.join('')}</div></td>
        </tr>
      `;
    }).join('');

    container.innerHTML = `
      <div class="y-baslik">
        <h1>Kullanıcılar</h1>
        <p>Google başvurularını onaylayın veya reddedin; ekip üyelerinin rollerini yönetin.</p>
      </div>
      <p id="userActionMsg" class="y-durum" role="status" hidden></p>
      <section class="y-panel">
        <div class="y-tablo-sar">
          <table class="y-tablo">
            <thead>
              <tr><th>Kullanıcı</th><th>Rol</th><th>Durum</th><th>Son etkinlik</th><th>İşlemler</th></tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="5">Kayıtlı kullanıcı yok.</td></tr>'}</tbody>
          </table>
        </div>
      </section>
    `;

    container.querySelectorAll('button[data-act]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const uid = btn.getAttribute('data-uid');
        const act = btn.getAttribute('data-act');
        if (act === 'sil' && !window.confirm('Bu kullanıcı kalıcı olarak silinsin mi?')) return;
        btn.disabled = true;
        const msgEl = document.getElementById('userActionMsg');
        try {
          const res = await api(`/api/yonetim/kullanicilar/${uid}/${act}`, { method: 'POST', body: '{}' });
          await renderKullanicilar(container);
          const refreshedMsg = document.getElementById('userActionMsg');
          if (refreshedMsg) {
            refreshedMsg.textContent = res.message || 'İşlem tamamlandı.';
            refreshedMsg.className = 'y-durum ok';
            refreshedMsg.hidden = false;
          }
        } catch (err) {
          btn.disabled = false;
          if (msgEl) {
            msgEl.textContent = err.message;
            msgEl.className = 'y-durum hata';
            msgEl.hidden = false;
          }
        }
      });
    });
  }

  // ---------------------------------------------------------------- Ayar Formu Yardımcıları
  function bindSettingsForm(form, onSaved) {
    const statusEl = form.querySelector('[data-durum]');
    const clearSecrets = new Set();

    form.querySelectorAll('button[data-sil]').forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-sil');
        clearSecrets.add(key);
        const inp = form.querySelector(`[data-ayar="${key}"]`);
        if (inp) {
          inp.value = '';
          inp.placeholder = 'Kayıt silinecek (Kaydet’e basın)';
        }
        btn.disabled = true;
      });
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;
      if (statusEl) {
        statusEl.textContent = 'Kaydediliyor…';
        statusEl.className = 'y-durum';
      }

      const payload = {};
      form.querySelectorAll('[data-ayar]').forEach(inp => {
        const key = inp.getAttribute('data-ayar');
        if (clearSecrets.has(key)) {
          payload[key] = null;
        } else {
          payload[key] = inp.value;
        }
      });

      try {
        const res = await api('/api/yonetim/ayarlar', {
          method: 'PUT',
          body: JSON.stringify(payload)
        });
        clearSecrets.clear();
        if (statusEl) {
          statusEl.textContent = res.message || 'Ayarlar kaydedildi.';
          statusEl.className = 'y-durum ok';
        }
        if (typeof onSaved === 'function') onSaved(res);
      } catch (err) {
        if (statusEl) {
          statusEl.textContent = err.message;
          statusEl.className = 'y-durum hata';
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // ---------------------------------------------------------------- 3. Giriş Yöntemleri
  async function renderGiris(container) {
    const data = await api('/api/yonetim/ayarlar');
    const s = data.settings;

    container.innerHTML = `
      <div class="y-baslik">
        <h1>Giriş yöntemleri</h1>
        <p>Google OAuth 2.0 (PKCE + OIDC) ve otomatik yönetici e-posta listesini yapılandırın.</p>
      </div>

      <section class="y-panel">
        <div class="y-alan" style="margin-bottom:16px;">
          <label>Google Cloud Console — Yetkili Yönlendirme URI (Callback URL)</label>
          <div class="y-kopyala-kutu">
            <code id="callbackCode">${esc(data.callbackUrl)}</code>
            <button type="button" class="y-btn kucuk" id="copyCallbackBtn">Kopyala</button>
          </div>
          <small class="y-ipucu">Bu adresi Google Cloud Console → OAuth 2.0 İstemcisi → Yetkili yönlendirme URI'leri listesine ekleyin.</small>
        </div>

        <form class="y-form" id="girisForm" autocomplete="off">
          <div class="y-alan-grid">
            <div class="y-alan tam">
              <label for="googleClientId">Google Client ID</label>
              <input id="googleClientId" class="y-girdi" data-ayar="googleClientId" value="${esc(s.googleClientId.value)}" placeholder="1234567890-xxx.apps.googleusercontent.com" spellcheck="false" />
            </div>
            <div class="y-alan tam">
              <label for="googleClientSecret">Google Client Secret</label>
              <div class="y-gizli-satir">
                <input id="googleClientSecret" class="y-girdi" type="password" data-ayar="googleClientSecret" autocomplete="new-password" placeholder="${s.googleClientSecret.set ? esc(s.googleClientSecret.value) : 'GOCSPX-...'}" spellcheck="false" />
                ${s.googleClientSecret.source === 'panel' ? '<button type="button" class="y-btn kucuk tehlike" data-sil="googleClientSecret">Kaydı sil</button>' : ''}
              </div>
              <small class="y-ipucu">${secretHint(s.googleClientSecret)}</small>
            </div>
            <div class="y-alan tam">
              <label for="adminEmails">Yönetici E-posta Adresleri (ADMIN_EMAILS)</label>
              <input id="adminEmails" class="y-girdi" data-ayar="adminEmails" value="${esc(s.adminEmails.value)}" placeholder="yonetici@ornek.com, diger@ornek.com" spellcheck="false" />
              <small class="y-ipucu">Virgülle ayrılmış bu adreslerle Google girişi yapanlar onay beklemeden doğrudan yönetici olur.</small>
            </div>
          </div>
          <div class="y-form-alt">
            <p class="y-durum" data-durum role="status"></p>
            <button type="submit" class="y-btn birincil">Kaydet</button>
          </div>
        </form>
      </section>
    `;

    document.getElementById('copyCallbackBtn').addEventListener('click', () => {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(data.callbackUrl).catch(() => {});
      }
      const btn = document.getElementById('copyCallbackBtn');
      btn.textContent = 'Kopyalandı ✓';
      setTimeout(() => { btn.textContent = 'Kopyala'; }, 1600);
    });

    bindSettingsForm(document.getElementById('girisForm'), () => renderGiris(container));
  }

  // ---------------------------------------------------------------- 4. E-posta (SMTP)
  async function renderEposta(container) {
    const data = await api('/api/yonetim/ayarlar');
    const s = data.settings;

    container.innerHTML = `
      <div class="y-baslik">
        <h1>E-posta (SMTP)</h1>
        <p>Yeni kullanıcı başvuruları ve onay/ret bildirimleri için SMTP sunucusunu yapılandırın.</p>
      </div>

      <section class="y-panel">
        <form class="y-form" id="epostaForm" autocomplete="off">
          <div class="y-alan-grid">
            <div class="y-alan">
              <label for="smtpHost">SMTP Sunucu</label>
              <input id="smtpHost" class="y-girdi" data-ayar="smtpHost" value="${esc(s.smtpHost.value)}" placeholder="smtp.gmail.com" spellcheck="false" />
            </div>
            <div class="y-alan">
              <label for="smtpPort">Port</label>
              <input id="smtpPort" class="y-girdi" data-ayar="smtpPort" value="${esc(s.smtpPort.value || '587')}" placeholder="587" />
            </div>
            <div class="y-alan">
              <label for="smtpSecurity">Güvenlik</label>
              <select id="smtpSecurity" class="y-girdi" data-ayar="smtpSecurity">
                <option value="starttls" ${s.smtpSecurity.value === 'starttls' ? 'selected' : ''}>STARTTLS (587)</option>
                <option value="ssl" ${s.smtpSecurity.value === 'ssl' ? 'selected' : ''}>SSL / TLS (465)</option>
                <option value="none" ${s.smtpSecurity.value === 'none' ? 'selected' : ''}>Şifresiz (önerilmez)</option>
              </select>
            </div>
            <div class="y-alan">
              <label for="smtpFrom">Gönderen adresi</label>
              <input id="smtpFrom" class="y-girdi" type="email" data-ayar="smtpFrom" value="${esc(s.smtpFrom.value)}" placeholder="bildirim@appcook.store" />
            </div>
            <div class="y-alan">
              <label for="smtpUsername">Kullanıcı adı</label>
              <input id="smtpUsername" class="y-girdi" data-ayar="smtpUsername" value="${esc(s.smtpUsername.value)}" placeholder="hesap@gmail.com" spellcheck="false" />
            </div>
            <div class="y-alan">
              <label for="smtpPassword">Parola / Uygulama şifresi</label>
              <div class="y-gizli-satir">
                <input id="smtpPassword" class="y-girdi" type="password" data-ayar="smtpPassword" autocomplete="new-password" placeholder="${s.smtpPassword.set ? esc(s.smtpPassword.value) : '•••• •••• •••• ••••'}" spellcheck="false" />
                ${s.smtpPassword.source === 'panel' ? '<button type="button" class="y-btn kucuk tehlike" data-sil="smtpPassword">Sil</button>' : ''}
              </div>
              <small class="y-ipucu">${secretHint(s.smtpPassword)}</small>
            </div>
            <div class="y-alan tam">
              <label for="notifyEmails">Bildirim alacak yönetici adresleri (opsiyonel)</label>
              <input id="notifyEmails" class="y-girdi" data-ayar="notifyEmails" value="${esc(s.notifyEmails.value)}" placeholder="Boş bırakılırsa aktif yöneticilere gönderilir" />
            </div>
          </div>

          <div class="y-form-alt">
            <p class="y-durum" data-durum role="status"></p>
            <button type="submit" class="y-btn birincil">Kaydet</button>
          </div>
        </form>
      </section>

      <section class="y-panel">
        <h3 style="margin:0 0 8px;">Deneme e-postası gönder</h3>
        <p style="margin:0 0 12px; color:var(--soluk); font-size:13.5px;">Yukarıdaki ayarlarla anlık bağlantı ve gönderim testi yapın.</p>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <input id="testMailTo" class="y-girdi" type="email" style="flex:1; min-width:220px;" placeholder="test@ornek.com" />
          <button type="button" class="y-btn" id="sendTestMailBtn">Deneme e-postası gönder</button>
        </div>
        <p id="testMailStatus" class="y-durum" style="margin-top:10px;" role="status"></p>
      </section>
    `;

    const form = document.getElementById('epostaForm');
    bindSettingsForm(form, () => renderEposta(container));

    document.getElementById('sendTestMailBtn').addEventListener('click', async () => {
      const btn = document.getElementById('sendTestMailBtn');
      const status = document.getElementById('testMailStatus');
      const to = document.getElementById('testMailTo').value.trim();
      const overrides = {};
      form.querySelectorAll('[data-ayar]').forEach(inp => {
        const k = inp.getAttribute('data-ayar');
        if (inp.value.trim() !== '') overrides[k] = inp.value.trim();
      });

      btn.disabled = true;
      status.textContent = 'Gönderiliyor…';
      status.className = 'y-durum';
      try {
        const res = await api('/api/yonetim/eposta-test', {
          method: 'POST',
          body: JSON.stringify({ to, overrides })
        });
        status.textContent = res.message || 'Deneme e-postası gönderildi.';
        status.className = 'y-durum ok';
      } catch (err) {
        status.textContent = err.message;
        status.className = 'y-durum hata';
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ---------------------------------------------------------------- 5. Yapay Zekâ / Çeviri
  async function renderYapayZeka(container) {
    const data = await api('/api/yonetim/ayarlar');
    const s = data.settings;

    container.innerHTML = `
      <div class="y-baslik">
        <h1>Yapay zekâ / Çeviri</h1>
        <p>İçerik çeviri zinciri: Kalıcı önbellek → LLM API (yapılandırılmışsa) → MyMemory ücretsiz API → Orijinal metin.</p>
      </div>

      <section class="y-panel">
        <form class="y-form" id="aiForm" autocomplete="off">
          <div class="y-alan-grid">
            <div class="y-alan">
              <label for="aiProvider">Çeviri Sağlayıcısı</label>
              <select id="aiProvider" class="y-girdi" data-ayar="aiProvider">
                <option value="none" ${s.aiProvider.value === 'none' ? 'selected' : ''}>Kapalı (Yalnız MyMemory Ücretsiz API)</option>
                <option value="anthropic" ${s.aiProvider.value === 'anthropic' ? 'selected' : ''}>Anthropic (Claude)</option>
                <option value="openai" ${s.aiProvider.value === 'openai' ? 'selected' : ''}>OpenAI / Uyumlu API</option>
                <option value="gemini" ${s.aiProvider.value === 'gemini' ? 'selected' : ''}>Google Gemini</option>
              </select>
            </div>
            <div class="y-alan">
              <label for="aiModel">Model Adı (opsiyonel)</label>
              <input id="aiModel" class="y-girdi" data-ayar="aiModel" value="${esc(s.aiModel.value)}" placeholder="Varsayılan: claude-haiku-4-5 / gpt-4o-mini / gemini-3.5-flash-lite" spellcheck="false" />
            </div>
            <div class="y-alan tam">
              <label for="aiApiKey">API Anahtarı</label>
              <div class="y-gizli-satir">
                <input id="aiApiKey" class="y-girdi" type="password" data-ayar="aiApiKey" autocomplete="new-password" placeholder="${s.aiApiKey.set ? esc(s.aiApiKey.value) : 'sk-... / AIza...'}" spellcheck="false" />
                ${s.aiApiKey.source === 'panel' ? '<button type="button" class="y-btn kucuk tehlike" data-sil="aiApiKey">Kaydı sil</button>' : ''}
              </div>
              <small class="y-ipucu">${secretHint(s.aiApiKey)}</small>
            </div>
            <div class="y-alan">
              <label for="aiBaseUrl">Özel Base URL (opsiyonel)</label>
              <input id="aiBaseUrl" class="y-girdi" data-ayar="aiBaseUrl" value="${esc(s.aiBaseUrl.value)}" placeholder="https://api.openai.com/v1" spellcheck="false" />
            </div>
            <div class="y-alan">
              <label for="mymemoryEmail">MyMemory İletişim E-postası</label>
              <input id="mymemoryEmail" class="y-girdi" type="email" data-ayar="mymemoryEmail" value="${esc(s.mymemoryEmail.value)}" placeholder="destek@appcook.store (50k kar/gün kota)" />
            </div>
          </div>

          <div class="y-form-alt">
            <p class="y-durum" data-durum role="status"></p>
            <button type="submit" class="y-btn birincil">Kaydet</button>
          </div>
        </form>
      </section>

      <section class="y-panel">
        <h3 style="margin:0 0 8px;">Çeviriyi test et</h3>
        <p style="margin:0 0 12px; color:var(--soluk); font-size:13.5px;">Örnek İngilizce fırsat metnini aktif çeviri motoruyla Türkçeye çevirin.</p>
        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          <input id="testTrInput" class="y-girdi" style="flex:1; min-width:240px;" value="Looking for a lightweight alternative to Jira for our 12-person remote team." />
          <button type="button" class="y-btn" id="runTrTestBtn">Çeviriyi test et</button>
        </div>
        <div id="testTrOut" class="y-test-sonuc" style="margin-top:12px;" hidden></div>
      </section>
    `;

    const form = document.getElementById('aiForm');
    bindSettingsForm(form, () => renderYapayZeka(container));

    document.getElementById('runTrTestBtn').addEventListener('click', async () => {
      const btn = document.getElementById('runTrTestBtn');
      const out = document.getElementById('testTrOut');
      const text = document.getElementById('testTrInput').value.trim();
      const overrides = {};
      form.querySelectorAll('[data-ayar]').forEach(inp => {
        const k = inp.getAttribute('data-ayar');
        if (inp.value.trim() !== '') overrides[k] = inp.value.trim();
      });

      btn.disabled = true;
      out.hidden = false;
      out.textContent = 'Çevriliyor…';
      try {
        const res = await api('/api/yonetim/ceviri-test', {
          method: 'POST',
          body: JSON.stringify({ text, lang: 'tr', overrides })
        });
        out.innerHTML = `<strong>Sonuç:</strong> ${esc(res.translatedText)}<br /><small style="color:var(--soluk);">Sağlayıcı: ${esc(res.provider)} · Süre: ${esc(res.durationMs)} ms</small>`;
      } catch (err) {
        out.innerHTML = `<span style="color:var(--hata);">${esc(err.message)}</span>`;
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ---------------------------------------------------------------- 6. Bildirimler (Telegram)
  async function renderBildirimler(container) {
    const data = await api('/api/yonetim/ayarlar');
    const s = data.settings;

    container.innerHTML = `
      <div class="y-baslik">
        <h1>Bildirimler (Telegram)</h1>
        <p>Canlı taramalarda yüksek satın alma ihtimalli yeni fırsatlar bulunduğunda Telegram botu üzerinden anlık bildirim alın.</p>
      </div>

      <section class="y-panel">
        <form class="y-form" id="telegramForm" autocomplete="off">
          <div class="y-alan-grid">
            <div class="y-alan tam">
              <label for="telegramBotToken">Telegram Bot Token</label>
              <div class="y-gizli-satir">
                <input id="telegramBotToken" class="y-girdi" type="password" data-ayar="telegramBotToken" autocomplete="new-password" placeholder="${s.telegramBotToken.set ? esc(s.telegramBotToken.value) : '123456789:AAH...'}" spellcheck="false" />
                ${s.telegramBotToken.source === 'panel' ? '<button type="button" class="y-btn kucuk tehlike" data-sil="telegramBotToken">Kaydı sil</button>' : ''}
              </div>
              <small class="y-ipucu">${secretHint(s.telegramBotToken)} Bot oluşturmak için Telegram’da <strong>@BotFather → /newbot</strong> komutunu kullanın.</small>
            </div>
            <div class="y-alan">
              <label for="telegramChatId">Telegram Chat ID</label>
              <input id="telegramChatId" class="y-girdi" data-ayar="telegramChatId" value="${esc(s.telegramChatId.value)}" placeholder="123456789 veya grup için -100..." spellcheck="false" />
              <small class="y-ipucu">Kendi ID’nizi öğrenmek için <strong>@userinfobot</strong>’a yazın. Virgülle en fazla 5 sohbet/grup ID’si girebilirsiniz.</small>
            </div>
            <div class="y-alan">
              <label for="telegramMinScore">Minimum Satın Alma İhtimali (%)</label>
              <input id="telegramMinScore" class="y-girdi" type="number" min="0" max="100" step="1" data-ayar="telegramMinScore" value="${esc(s.telegramMinScore.value || '80')}" placeholder="80" />
              <small class="y-ipucu">Yalnızca bu puan ve üzerindeki yeni fırsatlar bildirilir (0–100, varsayılan: 80).</small>
            </div>
          </div>
          <div class="y-form-alt">
            <p class="y-durum" data-durum role="status"></p>
            <button type="submit" class="y-btn birincil">Kaydet</button>
          </div>
        </form>
      </section>

      <section class="y-panel">
        <h3 style="margin:0 0 8px;">Deneme bildirimi gönder</h3>
        <p style="margin:0 0 12px; color:var(--soluk); font-size:13.5px;">Yukarıdaki bot token ve sohbet ID ayarlarıyla Telegram bağlantısını anlık test edin.</p>
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          <button type="button" class="y-btn" id="sendTestTelegramBtn">Deneme bildirimi gönder</button>
        </div>
        <p id="testTelegramStatus" class="y-durum" style="margin-top:10px;" role="status"></p>
      </section>
    `;

    const form = document.getElementById('telegramForm');
    bindSettingsForm(form, () => renderBildirimler(container));

    document.getElementById('sendTestTelegramBtn').addEventListener('click', async () => {
      const btn = document.getElementById('sendTestTelegramBtn');
      const status = document.getElementById('testTelegramStatus');
      const overrides = {};
      form.querySelectorAll('[data-ayar]').forEach(inp => {
        const k = inp.getAttribute('data-ayar');
        if (inp.value.trim() !== '') overrides[k] = inp.value.trim();
      });

      btn.disabled = true;
      status.textContent = 'Gönderiliyor…';
      status.className = 'y-durum';
      try {
        const res = await api('/api/yonetim/telegram-test', {
          method: 'POST',
          body: JSON.stringify({ overrides })
        });
        status.textContent = res.message || 'Deneme bildirimi gönderildi.';
        status.className = 'y-durum ok';
      } catch (err) {
        status.textContent = err.message;
        status.className = 'y-durum hata';
      } finally {
        btn.disabled = false;
      }
    });
  }

  // ---------------------------------------------------------------- Başlatma
  async function init() {
    const key = currentPageKey();
    markActiveNav(key);
    const container = document.getElementById('yonetimIcerik');

    document.getElementById('logoutBtn').addEventListener('click', async () => {
      try {
        await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
      } catch {}
      window.location.href = '/giris?cikis=1';
    });

    // Bekleyen rozetini arka planda da güncelle
    api('/api/yonetim/ozet').then(d => updatePendingBadge(d.users.pending)).catch(() => {});

    try {
      if (key === 'kullanicilar') await renderKullanicilar(container);
      else if (key === 'giris') await renderGiris(container);
      else if (key === 'eposta') await renderEposta(container);
      else if (key === 'yapay-zeka') await renderYapayZeka(container);
      else if (key === 'bildirimler') await renderBildirimler(container);
      else await renderGenel(container);
    } catch (err) {
      container.innerHTML = `<div class="y-panel"><p class="y-durum hata">${esc(err.message)}</p></div>`;
    }
  }

  init();
})();
