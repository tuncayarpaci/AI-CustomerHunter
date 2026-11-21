(function () {
  'use strict';

  const i18n = window.CHI18n;
  const t = (key, vars) => (i18n ? i18n.t(key, vars) : key);

  const state = {
    user: null,
    campaigns: [],
    leads: [],
    activeTab: 'radar',
    activeProduct: 'all',
    activeSource: 'all',
    lang: i18n ? i18n.getLang() : 'tr',
    cardUi: new Map(), // leadId -> { tone: 'helpful', replyLang: 'en' }
    ossResults: new Map(), // leadId -> { loading, ok, items, reason }
    translatingIds: new Set(),
    highlightedLeadId: null,
    loading: false
  };

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function safeUrl(raw) {
    try {
      const u = new URL(String(raw || '').trim());
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        return u.href;
      }
    } catch {}
    return '';
  }

  function safeHttpsUrl(raw) {
    try {
      const u = new URL(String(raw || '').trim());
      if (u.protocol === 'https:') {
        return u.href;
      }
    } catch {}
    return '';
  }

  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('acik');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('acik'), 2800);
  }

  async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(options.headers || {})
      },
      ...options
    });
    if (res.status === 401) {
      window.location.href = '/giris';
      throw new Error('Unauthorized');
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || t('toast_err_generic'));
    }
    return data;
  }

  function getCardUi(leadId) {
    if (!state.cardUi.has(leadId)) {
      state.cardUi.set(leadId, { tone: 'helpful', replyLang: 'en' });
    }
    return state.cardUi.get(leadId);
  }

  function getCampaignName(campaignId) {
    const c = state.campaigns.find(x => x.id === campaignId);
    return c ? c.name : 'AppCook';
  }

  function platformLabel(platform) {
    if (platform === 'reddit') return 'Reddit';
    if (platform === 'hackernews') return 'HackerNews';
    if (platform === 'github') return 'GitHub';
    return String(platform || 'Web');
  }

  function platformBadgeClass(platform) {
    if (platform === 'reddit') return 'rozet-reddit';
    if (platform === 'hackernews') return 'rozet-hn';
    return 'rozet-github';
  }

  function formatProbability(score) {
    const n = Number(score) || 0;
    let label = t('prob_medium');
    let cls = 'rozet-ihtimal-orta';
    if (n >= 92) {
      label = t('prob_very_high');
      cls = 'rozet-ihtimal-yuksek';
    } else if (n >= 85) {
      label = t('prob_high');
      cls = 'rozet-ihtimal-yuksek';
    }
    const text = state.lang === 'tr' ? `%${n} · ${label}` : `${n}% · ${label}`;
    return { text, cls };
  }

  function stageInfo(status) {
    if (status === 'replied') return { label: t('stage_replied'), cls: 'rozet-bilgi' };
    if (status === 'converted') return { label: t('stage_converted'), cls: 'rozet-ihtimal-yuksek' };
    if (status === 'ignored') return { label: t('stage_ignored'), cls: 'rozet-urun' };
    return { label: t('stage_new'), cls: 'rozet-ihtimal-orta' };
  }

  function getLocalizedLead(lead) {
    const lang = state.lang;
    const entry = lead.i18n && lead.i18n[lang];
    const hasEntry = Boolean(entry && entry.title);
    return {
      title: hasEntry ? entry.title : (lead.title || ''),
      snippet: hasEntry ? (entry.snippet || lead.snippet || '') : (lead.snippet || ''),
      whyHot: hasEntry ? (entry.whyHot || lead.whyHot || '') : (lead.whyHot || ''),
      intentLabel: (entry && entry.intentLabel) || lead.intentLabel || '',
      repliesTr: (lead.i18n && lead.i18n.tr && lead.i18n.tr.replies) || null,
      provider: (entry && entry.provider) || (hasEntry ? 'cache' : 'original'),
      isTranslated: hasEntry && entry.provider !== 'original'
    };
  }

  function getFilteredLeads({ includeIgnored = false } = {}) {
    return state.leads.filter(l => {
      if (!includeIgnored && l.status === 'ignored') return false;
      if (state.activeProduct !== 'all' && l.campaignId !== state.activeProduct) return false;
      if (state.activeSource !== 'all' && l.platform !== state.activeSource) return false;
      return true;
    });
  }

  // ---------------------------------------------------------------- Üst Çubuk & Kullanıcı
  function renderUserHeader() {
    if (!state.user) return;
    const chip = document.getElementById('userChip');
    const avatar = document.getElementById('userAvatar');
    const nameEl = document.getElementById('userName');
    const adminLink = document.getElementById('adminLink');

    const name = state.user.displayName || state.user.username || 'Kullanıcı';
    const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('') || '?';

    avatar.textContent = initials;
    nameEl.textContent = name;
    chip.title = `${name}${state.user.isAdmin ? ' (Yönetici)' : ''}`;
    chip.hidden = false;

    if (state.user.isAdmin) {
      adminLink.hidden = false;
    } else {
      adminLink.hidden = true;
    }
  }

  function renderProductSelector() {
    const sel = document.getElementById('urunSec');
    if (!sel) return;
    const allLabel = `${t('all_products')} (${state.campaigns.length})`;
    const opts = [`<option value="all">${escapeHtml(allLabel)}</option>`];
    state.campaigns.forEach(c => {
      opts.push(`<option value="${escapeHtml(c.id)}">${escapeHtml(c.name)}</option>`);
    });
    sel.innerHTML = opts.join('');
    if (state.activeProduct !== 'all' && !state.campaigns.some(c => c.id === state.activeProduct)) {
      state.activeProduct = 'all';
    }
    sel.value = state.activeProduct;
  }

  function renderKpisAndCounts() {
    const productScoped = state.leads.filter(l =>
      l.status !== 'ignored' &&
      (state.activeProduct === 'all' || l.campaignId === state.activeProduct)
    );
    const filtered = getFilteredLeads();

    const readyCount = productScoped.filter(l => Number(l.intentScore) >= 85).length;
    const compCount = productScoped.filter(l =>
      l.intentType === 'competitor_churn' ||
      (l.competitorMentioned && l.competitorMentioned !== 'Manual Process')
    ).length;
    const totalVal = productScoped.reduce((sum, l) => sum + (Number(l.estimatedValue) || 0), 0);

    document.getElementById('kpiReady').textContent = String(readyCount);
    document.getElementById('kpiComp').textContent = String(compCount);
    document.getElementById('kpiPot').textContent = state.lang === 'tr'
      ? `${totalVal.toLocaleString('tr-TR')} $`
      : `$${totalVal.toLocaleString('en-US')}`;

    document.getElementById('radarCountBadge').textContent = String(filtered.length);
    document.getElementById('fltAllBtn').textContent = `${t('flt_all')} (${productScoped.length})`;
  }

  // ---------------------------------------------------------------- Sekme 1: Fırsat Kartları
  function renderLeadCards() {
    const listEl = document.getElementById('firsatListe');
    const emptyEl = document.getElementById('bosAlani');
    const loadingEl = document.getElementById('yukleniyorAlani');
    const errEl = document.getElementById('hataAlani');

    if (state.loading) {
      loadingEl.hidden = false;
      emptyEl.hidden = true;
      errEl.hidden = true;
      listEl.hidden = true;
      return;
    }

    loadingEl.hidden = true;
    errEl.hidden = true;

    const filtered = getFilteredLeads();
    if (filtered.length === 0) {
      listEl.innerHTML = '';
      listEl.hidden = true;
      emptyEl.hidden = false;
      return;
    }

    emptyEl.hidden = true;
    listEl.hidden = false;

    listEl.innerHTML = filtered.map(lead => {
      const ui = getCardUi(lead.id);
      const loc = getLocalizedLead(lead);
      const prob = formatProbability(lead.intentScore);
      const prodName = getCampaignName(lead.campaignId);
      const isTranslating = state.translatingIds.has(lead.id);
      const enReply = (lead.replies && lead.replies[ui.tone]) || '';
      const trReply = (loc.repliesTr && loc.repliesTr[ui.tone]) || '';
      const shownReply = (ui.replyLang === 'tr' && trReply) ? trReply : enReply;
      const showTrPreview = state.lang === 'tr' && ui.replyLang === 'en';
      const replyHeader = ui.replyLang === 'tr' ? t('reply_title_tr') : t('reply_title_en');
      const postUrl = safeUrl(lead.url);
      const isHighlighted = state.highlightedLeadId === lead.id;

      const trStatusBadge = isTranslating
        ? `<span class="rozet rozet-bilgi">${escapeHtml(t('translating_badge'))}</span>`
        : (state.lang === 'tr' && !loc.isTranslated
          ? `<span class="rozet rozet-urun">${escapeHtml(t('original_badge'))}</span>`
          : '');

      return `
        <article class="firsat-kart ${isHighlighted ? 'vurgulu' : ''}" id="lead-card-${escapeHtml(lead.id)}" data-lead-id="${escapeHtml(lead.id)}">
          <div class="firsat-ust">
            <div class="firsat-meta">
              <div class="meta-sol">
                <span class="rozet ${platformBadgeClass(lead.platform)}">${escapeHtml(platformLabel(lead.platform))} · ${escapeHtml(lead.community || '')}</span>
                <span class="rozet ${prob.cls}">${escapeHtml(prob.text)}</span>
                <span class="rozet rozet-urun">${escapeHtml(prodName)}</span>
                ${trStatusBadge}
              </div>
              <span class="meta-zaman">${escapeHtml(lead.author || '')} · ${escapeHtml(lead.postedAt || '')}</span>
            </div>

            <h2 class="firsat-baslik">${escapeHtml(loc.title)}</h2>
            <p class="firsat-ozet">${escapeHtml(loc.snippet)}</p>

            <div class="neden-kutu">
              <span class="neden-baslik">${escapeHtml(t('why_lbl'))}</span>
              <span class="neden-metin">${escapeHtml(loc.whyHot)}</span>
            </div>

            ${state.lang === 'tr' && lead.title && lead.title !== loc.title ? `
              <details class="orijinal-detay">
                <summary>${escapeHtml(t('orig_btn'))}</summary>
                <div class="orijinal-kutu" lang="en">
                  <strong>${escapeHtml(lead.title)}</strong>
                  ${escapeHtml(lead.snippet || '')}
                </div>
              </details>
            ` : ''}
          </div>

          <div class="yanit-bolum">
            <div class="yanit-bas">
              <span class="yanit-etiket">${escapeHtml(replyHeader)}</span>
              <div class="ton-satir">
                <button type="button" class="ton-btn" data-tone="helpful" aria-pressed="${ui.tone === 'helpful'}">${escapeHtml(t('tone_helpful'))}</button>
                <button type="button" class="ton-btn" data-tone="founder" aria-pressed="${ui.tone === 'founder'}">${escapeHtml(t('tone_founder'))}</button>
                <button type="button" class="ton-btn" data-tone="comparison" aria-pressed="${ui.tone === 'comparison'}">${escapeHtml(t('tone_comparison'))}</button>
                <button type="button" class="ton-btn" data-toggle-reply-lang="1" title="EN / TR">
                  ${ui.replyLang === 'en' ? 'EN → TR' : 'TR → EN'}
                </button>
              </div>
            </div>

            <textarea class="yanit-alan" data-reply-textarea="1" aria-label="${escapeHtml(replyHeader)}">${escapeHtml(shownReply)}</textarea>

            ${showTrPreview ? `
              <div class="ceviri-onizleme">
                <div class="ceviri-onizleme-bas">
                  <span>${escapeHtml(t('tr_preview_lbl'))}</span>
                </div>
                <div>${escapeHtml(trReply || (isTranslating ? t('tr_preview_loading') : enReply))}</div>
              </div>
            ` : ''}

            <div class="yanit-alt">
              <div class="guven-bilgi">
                <span>${escapeHtml(t('spam_lbl'))} <b>${escapeHtml(t('spam_val'))}</b></span>
                <span>${escapeHtml(t('val_lbl'))} <strong>${escapeHtml(String(lead.estimatedValue || 0))} $${escapeHtml(t('per_year'))}</strong></span>
              </div>
              <div class="aksiyon-grup">
                <button type="button" class="btn birincil" data-copy-open="${escapeHtml(postUrl)}">${escapeHtml(t('copy_btn'))}</button>
                <button type="button" class="btn kucuk oss-btn" data-oss-suggest="1">Hazır OSS Çözüm Öner (AI-RepoRadar)</button>
                <button type="button" class="btn kucuk ${lead.status === 'new' ? 'aktif-durum' : ''}" data-set-status="new">${escapeHtml(t('stage_new'))}</button>
                <button type="button" class="btn kucuk ${lead.status === 'replied' ? 'aktif-durum' : ''}" data-set-status="replied">${escapeHtml(t('stage_replied'))}</button>
                <button type="button" class="btn kucuk ${lead.status === 'converted' ? 'aktif-durum' : ''}" data-set-status="converted">${escapeHtml(t('stage_converted'))}</button>
                <button type="button" class="btn kucuk ${lead.status === 'ignored' ? 'aktif-durum' : ''}" data-set-status="ignored">${escapeHtml(t('stage_ignored'))}</button>
              </div>
            </div>
            <div class="oss-panel" data-oss-panel="1" hidden></div>
          </div>
        </article>
      `;
    }).join('');

    listEl.querySelectorAll('.firsat-kart[data-lead-id]').forEach(card => {
      const leadId = card.getAttribute('data-lead-id');
      const entry = state.ossResults.get(leadId);
      if (entry) {
        const panel = card.querySelector('[data-oss-panel]');
        if (panel) renderOssPanel(panel, entry);
      }
    });
  }

  function renderOssPanel(panelEl, entry) {
    if (!panelEl) return;
    panelEl.replaceChildren();
    if (!entry) {
      panelEl.hidden = true;
      return;
    }
    panelEl.hidden = false;

    const header = document.createElement('div');
    header.className = 'oss-panel-bas';

    const titleEl = document.createElement('span');
    titleEl.className = 'oss-panel-baslik';
    titleEl.textContent = 'AI-RepoRadar · Hazır Açık Kaynak Çözüm Önerileri';
    header.appendChild(titleEl);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'oss-kapat';
    closeBtn.setAttribute('data-oss-close', '1');
    closeBtn.setAttribute('aria-label', 'Kapat');
    closeBtn.textContent = '×';
    header.appendChild(closeBtn);

    panelEl.appendChild(header);

    if (entry.loading) {
      const loadingP = document.createElement('p');
      loadingP.className = 'oss-durum';
      loadingP.textContent = 'AI-RepoRadar taranıyor...';
      panelEl.appendChild(loadingP);
      return;
    }

    if (!entry.ok) {
      const errP = document.createElement('p');
      errP.className = 'oss-durum';
      errP.textContent = 'AI-RepoRadar öneri servisi şu an yanıt vermiyor. Kısa süre sonra tekrar deneyebilirsiniz.';
      panelEl.appendChild(errP);
      return;
    }

    const items = Array.isArray(entry.items) ? entry.items.slice(0, 3) : [];
    if (items.length === 0) {
      const emptyP = document.createElement('p');
      emptyP.className = 'oss-durum';
      emptyP.textContent = "Bu acı noktası için AI-RepoRadar'da eşleşen izin verici lisanslı açık kaynak proje bulunamadı.";
      panelEl.appendChild(emptyP);
      return;
    }

    const list = document.createElement('div');
    list.className = 'oss-liste';

    items.forEach(item => {
      const card = document.createElement('div');
      card.className = 'oss-kart';

      const top = document.createElement('div');
      top.className = 'oss-kart-ust';

      const nameEl = document.createElement('strong');
      nameEl.className = 'oss-repo-ad';
      nameEl.textContent = String(item.full_name || '');
      top.appendChild(nameEl);

      const badges = document.createElement('div');
      badges.className = 'oss-rozetler';

      const licBadge = document.createElement('span');
      licBadge.className = 'rozet rozet-oss-lisans';
      licBadge.textContent = String(item.spdx_license || 'OSS');
      badges.appendChild(licBadge);

      if (typeof item.total_commercial_score === 'number' && Number.isFinite(item.total_commercial_score)) {
        const scoreVal = Math.max(0, Math.min(100, Math.round(item.total_commercial_score)));
        const scoreBadge = document.createElement('span');
        scoreBadge.className = 'rozet ' + (scoreVal >= 75 ? 'rozet-ihtimal-yuksek' : 'rozet-ihtimal-orta');
        scoreBadge.textContent = `Skor: ${scoreVal}/100`;
        badges.appendChild(scoreBadge);
      }

      top.appendChild(badges);
      card.appendChild(top);

      if (item.summary_tr) {
        const summaryEl = document.createElement('p');
        summaryEl.className = 'oss-ozet';
        summaryEl.textContent = String(item.summary_tr);
        card.appendChild(summaryEl);
      }

      const repoHref = safeHttpsUrl(item.repo_url);
      const githubHref = safeHttpsUrl(item.github_url);
      const targetHref = repoHref || githubHref;

      if (targetHref) {
        const footer = document.createElement('div');
        footer.className = 'oss-kart-alt';

        const link = document.createElement('a');
        link.className = 'oss-link';
        link.href = targetHref;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = repoHref ? "AI-RepoRadar'da Aç →" : "GitHub'da Aç →";
        footer.appendChild(link);

        card.appendChild(footer);
      }

      list.appendChild(card);
    });

    panelEl.appendChild(list);
  }

  async function requestOssSuggestions(leadId) {
    const lead = state.leads.find(l => l.id === leadId);
    if (!lead) return;

    const existing = state.ossResults.get(leadId);
    if (existing && existing.loading) return;

    const campaign = state.campaigns.find(c => c.id === lead.campaignId);
    const loc = getLocalizedLead(lead);
    const title = String(lead.title || loc.title || '').trim();

    const kwSet = [];
    if (campaign && Array.isArray(campaign.keywords)) {
      campaign.keywords.forEach(k => {
        if (typeof k === 'string' && k.trim()) kwSet.push(k.trim());
      });
    }
    if (lead.competitorMentioned && lead.competitorMentioned !== 'Manual Process') {
      kwSet.push(String(lead.competitorMentioned).trim());
    }

    const loadingState = { loading: true, ok: true, items: [], reason: '' };
    state.ossResults.set(leadId, loadingState);
    const cardEl = document.getElementById('lead-card-' + leadId);
    const panelEl = cardEl ? cardEl.querySelector('[data-oss-panel]') : null;
    if (panelEl) renderOssPanel(panelEl, loadingState);

    try {
      const res = await fetch('/api/oss-suggestions', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          title,
          query: title,
          keywords: kwSet.slice(0, 8),
          limit: 3
        })
      });

      if (res.status === 401) {
        window.location.href = '/giris';
        return;
      }

      const data = await res.json().catch(() => ({}));
      const nextState = {
        loading: false,
        ok: Boolean(res.ok && data && data.ok === true),
        items: Array.isArray(data && data.items) ? data.items.slice(0, 3) : [],
        reason: (data && typeof data.reason === 'string') ? data.reason : ''
      };
      state.ossResults.set(leadId, nextState);
    } catch {
      state.ossResults.set(leadId, {
        loading: false,
        ok: false,
        items: [],
        reason: 'network_error'
      });
    }

    const latestCard = document.getElementById('lead-card-' + leadId);
    const latestPanel = latestCard ? latestCard.querySelector('[data-oss-panel]') : null;
    if (latestPanel) {
      renderOssPanel(latestPanel, state.ossResults.get(leadId));
    }
  }

  // ---------------------------------------------------------------- Sekme 2: Müşteri Takibi
  function renderTrackerTable() {
    const tbody = document.getElementById('trackerTableBody');
    if (!tbody) return;
    const rowsData = state.leads.filter(l =>
      state.activeProduct === 'all' || l.campaignId === state.activeProduct
    );

    if (!rowsData.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="color:var(--soluk);">${escapeHtml(t('track_empty'))}</td></tr>`;
      return;
    }

    tbody.innerHTML = rowsData.map(lead => {
      const loc = getLocalizedLead(lead);
      const prob = formatProbability(lead.intentScore);
      const prodName = getCampaignName(lead.campaignId);
      const st = stageInfo(lead.status);
      return `
        <tr data-lead-id="${escapeHtml(lead.id)}">
          <td><span class="rozet ${platformBadgeClass(lead.platform)}">${escapeHtml(platformLabel(lead.platform))}</span></td>
          <td><span class="rozet ${prob.cls}">${escapeHtml(prob.text)}</span></td>
          <td><strong>${escapeHtml(loc.title)}</strong></td>
          <td>${escapeHtml(prodName)}</td>
          <td><span class="rozet ${st.cls}">${escapeHtml(st.label)}</span></td>
          <td>
            <select class="secim" style="min-height:32px; font-size:12.5px;" data-tracker-status="${escapeHtml(lead.id)}">
              <option value="new" ${lead.status === 'new' ? 'selected' : ''}>${escapeHtml(t('stage_new'))}</option>
              <option value="replied" ${lead.status === 'replied' ? 'selected' : ''}>${escapeHtml(t('stage_replied'))}</option>
              <option value="converted" ${lead.status === 'converted' ? 'selected' : ''}>${escapeHtml(t('stage_converted'))}</option>
              <option value="ignored" ${lead.status === 'ignored' ? 'selected' : ''}>${escapeHtml(t('stage_ignored'))}</option>
            </select>
          </td>
        </tr>
      `;
    }).join('');
  }

  // ---------------------------------------------------------------- Sekme 3: Rakip Şikayetleri
  function renderCompetitorComplaints() {
    const grid = document.getElementById('competitorGrid');
    if (!grid) return;
    const comps = state.leads.filter(l =>
      l.status !== 'ignored' &&
      (state.activeProduct === 'all' || l.campaignId === state.activeProduct) &&
      (l.intentType === 'competitor_churn' || (l.competitorMentioned && l.competitorMentioned !== 'Manual Process'))
    );

    if (!comps.length) {
      grid.innerHTML = `<p style="color:var(--soluk);">${escapeHtml(t('comp_empty'))}</p>`;
      return;
    }

    grid.innerHTML = comps.map(lead => {
      const loc = getLocalizedLead(lead);
      return `
        <div class="rakip-kart">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
            <span class="rozet ${platformBadgeClass(lead.platform)}">${escapeHtml(platformLabel(lead.platform))} · ${escapeHtml(lead.community || '')}</span>
            <span class="rozet rozet-ihtimal-yuksek">${state.lang === 'tr' ? `%${lead.intentScore}` : `${lead.intentScore}%`}</span>
          </div>
          <h3>${escapeHtml(lead.competitorMentioned || 'Rakip')} — ${escapeHtml(getCampaignName(lead.campaignId))}</h3>
          <p style="font-size:14px; color:var(--soluk);">${escapeHtml(loc.whyHot || loc.snippet)}</p>
          <button type="button" class="btn kucuk birincil" data-jump-lead="${escapeHtml(lead.id)}">${escapeHtml(t('comp_btn'))}</button>
        </div>
      `;
    }).join('');
  }

  function renderAll() {
    renderProductSelector();
    renderKpisAndCounts();
    renderLeadCards();
    renderTrackerTable();
    renderCompetitorComplaints();
  }

  // ---------------------------------------------------------------- Arka Plan Çeviri
  async function triggerMissingTranslations() {
    const lang = state.lang;
    const needReplies = lang === 'tr';
    const missing = state.leads.filter(l => {
      if (state.translatingIds.has(l.id)) return false;
      const entry = l.i18n && l.i18n[lang];
      if (!entry || !entry.title || entry.provider === 'original') return true;
      if (needReplies && l.replies && (!entry.replies || !entry.replies.helpful)) return true;
      return false;
    }).slice(0, 10);

    if (missing.length === 0) return;

    missing.forEach(l => state.translatingIds.add(l.id));
    renderLeadCards();

    try {
      const res = await apiFetch('/api/translate', {
        method: 'POST',
        body: JSON.stringify({
          leadIds: missing.map(l => l.id),
          lang,
          includeReplies: needReplies
        })
      });

      if (Array.isArray(res.results)) {
        const byId = new Map(state.leads.map(l => [l.id, l]));
        res.results.forEach(item => {
          const lead = byId.get(item.leadId);
          if (lead && item.i18n) {
            lead.i18n = lead.i18n || {};
            lead.i18n[lang] = item.i18n;
          }
        });
      }
    } catch {
      // Sessizce orijinal metinle devam et
    } finally {
      missing.forEach(l => state.translatingIds.delete(l.id));
      renderAll();
    }
  }

  // ---------------------------------------------------------------- Veri Yükleme
  async function loadState({ showSkeleton = false } = {}) {
    if (showSkeleton) {
      state.loading = true;
      renderLeadCards();
    }
    try {
      const data = await apiFetch(`/api/state?lang=${encodeURIComponent(state.lang)}`);
      state.campaigns = Array.isArray(data.campaigns) ? data.campaigns : [];
      state.leads = Array.isArray(data.leads) ? data.leads : [];
      state.loading = false;
      renderAll();
      triggerMissingTranslations();
    } catch (err) {
      state.loading = false;
      document.getElementById('yukleniyorAlani').hidden = true;
      document.getElementById('firsatListe').hidden = true;
      document.getElementById('bosAlani').hidden = true;
      document.getElementById('hataAlani').hidden = false;
    }
  }

  async function loadMe() {
    try {
      const data = await apiFetch('/api/auth/me');
      state.user = data.user;
      renderUserHeader();
      if (data.pendingCount > 0 && state.user && state.user.isAdmin) {
        const b = document.getElementById('adminPendingBadge');
        b.textContent = String(data.pendingCount);
        b.hidden = false;
      }
    } catch {
      // 401 zaten /giris'e yönlendirir
    }
  }

  // ---------------------------------------------------------------- Aksiyonlar
  function switchTab(tabName) {
    state.activeTab = tabName;
    ['radar', 'takip', 'rakip', 'urun'].forEach(name => {
      const panel = document.getElementById('panel-' + name);
      if (panel) panel.hidden = (name !== tabName);
      const tBtn = document.getElementById('tab-' + name);
      const mBtn = document.getElementById('mtab-' + name);
      if (tBtn) tBtn.setAttribute('aria-selected', String(name === tabName));
      if (mBtn) mBtn.setAttribute('aria-selected', String(name === tabName));
    });
  }

  async function changeLanguage(nextLang) {
    state.lang = i18n ? i18n.setLang(nextLang) : nextLang;
    document.getElementById('dilTr').setAttribute('aria-pressed', String(state.lang === 'tr'));
    document.getElementById('dilEn').setAttribute('aria-pressed', String(state.lang === 'en'));
    await loadState({ showSkeleton: false });
  }

  async function updateLeadStatus(leadId, status) {
    try {
      const res = await apiFetch(`/api/leads/${encodeURIComponent(leadId)}`, {
        method: 'PUT',
        body: JSON.stringify({ status })
      });
      if (res.state && Array.isArray(res.state.leads)) {
        state.leads = res.state.leads;
      } else {
        const l = state.leads.find(x => x.id === leadId);
        if (l) l.status = status;
      }
      renderAll();
      showToast(t('toast_stage_updated'));
    } catch (err) {
      showToast(err.message || t('toast_err_generic'));
    }
  }

  async function runLiveScan() {
    const btn = document.getElementById('scanBtn');
    btn.disabled = true;
    btn.textContent = t('btn_scanning');
    try {
      const campaignId = state.activeProduct !== 'all' ? state.activeProduct : undefined;
      const res = await apiFetch('/api/scan', {
        method: 'POST',
        body: JSON.stringify({ campaignId, lang: state.lang })
      });
      if (res.state && Array.isArray(res.state.leads)) {
        state.leads = res.state.leads;
      }
      renderAll();
      if (res.addedCount > 0) {
        showToast(t('toast_scan_found', { n: res.addedCount }));
        triggerMissingTranslations();
      } else {
        showToast(t('toast_scan_empty'));
      }
    } catch (err) {
      showToast(err.message || t('toast_err_generic'));
    } finally {
      btn.disabled = false;
      btn.textContent = t('btn_scan');
    }
  }

  function csvSafeCell(val) {
    let s = String(val == null ? '' : val).replace(/\r?\n/g, ' ');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
  }

  function exportCsv() {
    const header = ['Platform', 'Community', 'Author', 'IntentScore', 'Product', 'Stage', 'Title', 'URL'];
    const lines = [header.join(',')];
    state.leads.forEach(l => {
      const loc = getLocalizedLead(l);
      lines.push([
        csvSafeCell(platformLabel(l.platform)),
        csvSafeCell(l.community),
        csvSafeCell(l.author),
        csvSafeCell(l.intentScore),
        csvSafeCell(getCampaignName(l.campaignId)),
        csvSafeCell(l.status),
        csvSafeCell(loc.title),
        csvSafeCell(safeUrl(l.url))
      ].join(','));
    });
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customerhunter-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(t('toast_csv'));
  }

  // ---------------------------------------------------------------- Olay Dinleyicileri
  function bindEvents() {
    document.getElementById('dilTr').addEventListener('click', () => changeLanguage('tr'));
    document.getElementById('dilEn').addEventListener('click', () => changeLanguage('en'));

    document.getElementById('logoutBtn').addEventListener('click', async () => {
      try {
        await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Accept': 'application/json' } });
      } catch {}
      window.location.href = '/giris?cikis=1';
    });

    document.getElementById('brandLink').addEventListener('click', (e) => {
      e.preventDefault();
      switchTab('radar');
    });

    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
    });

    document.getElementById('urunSec').addEventListener('change', (e) => {
      state.activeProduct = e.target.value;
      renderAll();
    });

    document.getElementById('sourceFilterGroup').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-src]');
      if (!btn) return;
      state.activeSource = btn.getAttribute('data-src');
      document.querySelectorAll('#sourceFilterGroup .cip').forEach(b => b.setAttribute('aria-pressed', 'false'));
      btn.setAttribute('aria-pressed', 'true');
      renderLeadCards();
      renderKpisAndCounts();
    });

    document.getElementById('scanBtn').addEventListener('click', runLiveScan);
    document.getElementById('resetFilterBtn').addEventListener('click', () => {
      state.activeSource = 'all';
      state.activeProduct = 'all';
      document.querySelectorAll('#sourceFilterGroup .cip').forEach(b => {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-src') === 'all'));
      });
      renderAll();
    });
    document.getElementById('retryBtn').addEventListener('click', () => loadState({ showSkeleton: true }));
    document.getElementById('exportCsvBtn').addEventListener('click', exportCsv);

    // Fırsat kartı içi etkileşimler (delegation)
    document.getElementById('firsatListe').addEventListener('click', (e) => {
      const card = e.target.closest('.firsat-kart[data-lead-id]');
      if (!card) return;
      const leadId = card.getAttribute('data-lead-id');
      const ui = getCardUi(leadId);

      const toneBtn = e.target.closest('button[data-tone]');
      if (toneBtn) {
        ui.tone = toneBtn.getAttribute('data-tone');
        renderLeadCards();
        return;
      }

      const toggleLangBtn = e.target.closest('button[data-toggle-reply-lang]');
      if (toggleLangBtn) {
        ui.replyLang = ui.replyLang === 'en' ? 'tr' : 'en';
        renderLeadCards();
        return;
      }

      const copyBtn = e.target.closest('button[data-copy-open]');
      if (copyBtn) {
        const textarea = card.querySelector('textarea[data-reply-textarea]');
        const text = textarea ? textarea.value : '';
        if (navigator.clipboard && text) {
          navigator.clipboard.writeText(text).catch(() => {});
        }
        const url = safeUrl(copyBtn.getAttribute('data-copy-open'));
        if (url) {
          window.open(url, '_blank', 'noopener,noreferrer');
          showToast(t('toast_copied'));
        } else {
          showToast(t('toast_copied_only'));
        }
        return;
      }

      const ossBtn = e.target.closest('button[data-oss-suggest]');
      if (ossBtn) {
        requestOssSuggestions(leadId);
        return;
      }

      const ossCloseBtn = e.target.closest('button[data-oss-close]');
      if (ossCloseBtn) {
        state.ossResults.delete(leadId);
        const panel = card.querySelector('[data-oss-panel]');
        if (panel) renderOssPanel(panel, null);
        return;
      }

      const statusBtn = e.target.closest('button[data-set-status]');
      if (statusBtn) {
        updateLeadStatus(leadId, statusBtn.getAttribute('data-set-status'));
      }
    });

    // Müşteri Takibi tablosu durum seçici
    document.getElementById('trackerTableBody').addEventListener('change', (e) => {
      const sel = e.target.closest('select[data-tracker-status]');
      if (!sel) return;
      updateLeadStatus(sel.getAttribute('data-tracker-status'), sel.value);
    });

    // Rakip şikayetlerinden ilgili fırsata atla
    document.getElementById('competitorGrid').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-jump-lead]');
      if (!btn) return;
      const leadId = btn.getAttribute('data-jump-lead');
      state.activeSource = 'all';
      document.querySelectorAll('#sourceFilterGroup .cip').forEach(b => {
        b.setAttribute('aria-pressed', String(b.getAttribute('data-src') === 'all'));
      });
      state.highlightedLeadId = leadId;
      switchTab('radar');
      renderAll();
      const targetEl = document.getElementById('lead-card-' + leadId);
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      setTimeout(() => {
        if (state.highlightedLeadId === leadId) {
          state.highlightedLeadId = null;
          renderLeadCards();
        }
      }, 2600);
    });

    // Ürün Ekle — URL Analiz
    document.getElementById('analyzeUrlBtn').addEventListener('click', async () => {
      const btn = document.getElementById('analyzeUrlBtn');
      const urlVal = document.getElementById('urlInput').value.trim();
      btn.disabled = true;
      btn.textContent = t('btn_analyzing');
      try {
        const res = await apiFetch('/api/analyze-url', {
          method: 'POST',
          body: JSON.stringify({ url: urlVal })
        });
        const a = res.analysis || {};
        if (a.url) document.getElementById('urlInput').value = a.url;
        if (a.name) document.getElementById('uAd').value = a.name;
        if (a.audience) document.getElementById('uMusteri').value = a.audience;
        if (a.valueProp) document.getElementById('uOzet').value = a.valueProp;
        if (Array.isArray(a.competitors)) document.getElementById('uRakip').value = a.competitors.join(', ');
        if (Array.isArray(a.keywords)) document.getElementById('uKelimeler').value = a.keywords.join(', ');
        if (a.suggestedDealValue) document.getElementById('uDeger').value = String(a.suggestedDealValue);
        showToast(t('toast_analyzed'));
      } catch (err) {
        showToast(err.message || t('toast_err_generic'));
      } finally {
        btn.disabled = false;
        btn.textContent = t('btn_analyze');
      }
    });

    // Ürün Ekle — Kaydet
    document.getElementById('addProductForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('uAd').value.trim();
      if (!name) {
        showToast(t('err_name_required'));
        return;
      }
      const btn = document.getElementById('saveProductBtn');
      btn.disabled = true;
      btn.textContent = t('btn_saving');
      try {
        const res = await apiFetch('/api/campaigns', {
          method: 'POST',
          body: JSON.stringify({
            name,
            url: document.getElementById('urlInput').value.trim() || 'https://example.com',
            audience: document.getElementById('uMusteri').value.trim(),
            valueProp: document.getElementById('uOzet').value.trim(),
            competitors: document.getElementById('uRakip').value.trim(),
            keywords: document.getElementById('uKelimeler').value.trim(),
            dealValue: Number(document.getElementById('uDeger').value) || 490,
            lang: state.lang
          })
        });
        if (res.state) {
          state.campaigns = res.state.campaigns || state.campaigns;
          state.leads = res.state.leads || state.leads;
        }
        if (res.campaign && res.campaign.id) {
          state.activeProduct = res.campaign.id;
        }
        switchTab('radar');
        renderAll();
        showToast(t('toast_saved_camp'));
        triggerMissingTranslations();
      } catch (err) {
        showToast(err.message || t('toast_err_generic'));
      } finally {
        btn.disabled = false;
        btn.textContent = t('btn_save');
      }
    });
  }

  // ---------------------------------------------------------------- URL Ön-Doldurma (CH-01)
  function sanitizeQueryText(raw, maxLen) {
    if (typeof raw !== 'string') return '';
    return raw.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, maxLen);
  }

  function sanitizeQueryList(raw, maxItems = 8, maxItemLen = 64, maxTotalLen = 300) {
    if (typeof raw !== 'string') return '';
    const items = raw
      .split(',')
      .map(item => sanitizeQueryText(item, maxItemLen))
      .filter(Boolean)
      .slice(0, maxItems);
    return items.join(', ').slice(0, maxTotalLen);
  }

  function sanitizeGithubRepoUrl(raw) {
    const cleaned = sanitizeQueryText(raw, 300);
    if (!cleaned) return '';
    try {
      const parsed = new URL(cleaned);
      if (parsed.protocol !== 'https:') return '';
      if (parsed.hostname.toLowerCase() !== 'github.com') return '';
      if (!parsed.pathname || parsed.pathname === '/') return '';
      return parsed.href;
    } catch (e) {
      return '';
    }
  }

  function applyUrlPrefillFromQuery() {
    const params = new URLSearchParams(window.location.search);
    const source = sanitizeQueryText(params.get('source') || '', 40).toLowerCase();
    const hasPrefillParams =
      source === 'reporadar' ||
      params.has('keywords') ||
      params.has('product') ||
      params.has('name') ||
      params.has('competitors') ||
      params.has('url');

    if (!hasPrefillParams) {
      return false;
    }

    const safeUrl = sanitizeGithubRepoUrl(params.get('url') || '');
    const safeName = sanitizeQueryText(params.get('name') || params.get('product') || '', 120);
    const safeAudience = sanitizeQueryText(params.get('audience') || '', 300);
    const safeValueProp = sanitizeQueryText(params.get('valueProp') || '', 300);
    const safeKeywords = sanitizeQueryList(params.get('keywords') || '', 8, 64, 300);
    const safeCompetitors = sanitizeQueryList(params.get('competitors') || '', 8, 64, 300);
    const rawDealValue = Number(params.get('dealValue'));
    const safeDealValue = Number.isFinite(rawDealValue) && rawDealValue >= 1 && rawDealValue <= 1000000
      ? Math.round(rawDealValue)
      : 490;

    const setInputVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };

    setInputVal('urlInput', safeUrl);
    setInputVal('uAd', safeName);
    setInputVal('uMusteri', safeAudience);
    setInputVal('uOzet', safeValueProp);
    setInputVal('uRakip', safeCompetitors);
    setInputVal('uKelimeler', safeKeywords);
    setInputVal('uDeger', String(safeDealValue));

    switchTab('urun');

    const noticeText = source === 'reporadar'
      ? "AI-RepoRadar'dan aktarıldı — inceleyip Ürünü Kaydet ve Müşteri Ara'ya tıklayın."
      : "Kampanya alanları ön-dolduruldu — inceleyip Ürünü Kaydet ve Müşteri Ara'ya tıklayın.";

    const bannerEl = document.getElementById('reporadarPrefillBanner');
    if (bannerEl) {
      bannerEl.textContent = noticeText;
      bannerEl.hidden = false;
    }
    showToast(noticeText);

    if (window.history && typeof window.history.replaceState === 'function') {
      window.history.replaceState(null, '', window.location.pathname);
    }

    return true;
  }

  // ---------------------------------------------------------------- Başlatma
  function init() {
    if (i18n) {
      i18n.applyDom();
    }
    document.getElementById('dilTr').setAttribute('aria-pressed', String(state.lang === 'tr'));
    document.getElementById('dilEn').setAttribute('aria-pressed', String(state.lang === 'en'));
    bindEvents();
    applyUrlPrefillFromQuery();
    loadMe();
    loadState({ showSkeleton: true });
  }

  init();
})();
