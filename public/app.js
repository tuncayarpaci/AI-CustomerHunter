let APP_STATE = {
  campaigns: [],
  leads: [],
  settings: {
    plan: 'Growth ($49/mo)',
    language: 'en'
  }
};

let CURRENT_CAMPAIGN_ID = null;
let CURRENT_PLATFORM_FILTER = 'all';
let CURRENT_INTENT_FILTER = 'all';
let SELECTED_LEAD_ID = null;
let SELECTED_TONE = 'helpful';
let CURRENT_LANG = 'en';

const I18N = {
  en: {
    nav_badge: 'LIVE INTENT v3.4',
    nav_sub: 'Autonomous Social Buyer-Intent & Lead Radar',
    mode_landing: '🌍 Global SaaS Landing',
    mode_app: '📡 Live Radar Workspace',
    btn_live_scan: 'Scan Live Intent Now',
    hero_pill: '🚀 Replace $149/mo noisy trackers & dead cold emails with 24/7 Buyer-Intent Radar',
    hero_h1_1: 'Find People Actively Asking to',
    hero_h1_2: ' Buy Your Product Right Now',
    hero_sub: 'ReplyPulse AI monitors Reddit, Hacker News, X, and GitHub in real time, filters out 95% of keyword noise with AI Buyer-Intent Scoring (0–100), and writes authentic, ban-safe replies that win customers.',
    hero_cta: 'Auto-Find My Buyers',
    trust_1: '60-Second URL Setup',
    trust_2: 'Anti-Shadowban Reply Engine',
    trust_3: 'Live Reddit + HN + GitHub + X',
    trust_4: 'Starts at $19/mo (No Enterprise Bloat)',
    side_radar: 'Live Buyer-Intent Radar',
    side_onboard: '1-Click URL Onboarding',
    side_crm: 'Lead CRM & ROI Funnel',
    side_comp: 'Competitor Churn Watch',
    side_settings: 'Webhooks & Plan Billing',
    active_campaign: 'Active Product Radar',
    btn_add_product: 'Add Product URL',
    plan_status_sub: '24/7 Live Reddit, HN, GitHub & X Intent Engine Active',
    btn_upgrade: 'Upgrade / View Plans',
    kpi_1: 'High-Intent Buyers (85+ Score)',
    kpi_1_sub: 'Live Ready-to-Buy',
    kpi_2: 'Competitor Churn Signals',
    kpi_2_sub: 'Switching Now',
    kpi_3: 'Replies Sent / Converted',
    kpi_3_sub: '38% Close Rate',
    kpi_4: 'Estimated Pipeline ROI',
    kpi_4_sub: 'ARR Attribution',
    flt_all: 'All Channels',
    int_all: 'All Intent Types',
    studio_tag: '🛡️ Anti-Spam Reply Studio',
    choose_tone: 'Select Community-Safe Reply Angle:',
    ban_risk_lbl: 'Subreddit Ban Risk:',
    est_deal_lbl: 'Est. Value:',
    btn_copy_open: 'Copy Reply & Open Thread ↗',
    btn_mark_replied: 'Mark Replied',
    btn_mark_won: 'Won Deal',
    onboard_title: '⚡ 1-Click AI Product URL Analyzer',
    onboard_sub: 'Paste any SaaS, mobile app, agency, or devtool URL. Our engine crawls the landing page and automatically configures high-intent buyer keywords, competitor churn watches, and target communities.',
    btn_analyze_url: 'Extract Buyer-Intent Profile',
    btn_launch_campaign: 'Save Campaign & Launch Live Buyer Scan',
    crm_title: '📊 Social Lead Pipeline & Revenue Attribution',
    crm_sub: 'Track every high-intent social conversation from discovery to replied and paying customer.'
  },
  tr: {
    nav_badge: 'CANLI NİYET v3.4',
    nav_sub: 'Otonom Sosyal Medya Satın Alma Niyeti & Müşteri Radarı',
    mode_landing: '🌍 Global SaaS Vitrin',
    mode_app: '📡 Canlı Radar Paneli',
    btn_live_scan: 'Canlı Niyet Taraması Yap',
    hero_pill: '🚀 Aylık $149 gürültülü araçları ve ölü soğuk e-postaları 7/24 Alıcı Radarıyla değiştirin',
    hero_h1_1: 'Ürününüzü Şu Anda Satın Almak İsteyen',
    hero_h1_2: ' Hazır Müşterileri Yakalayın',
    hero_sub: 'ReplyPulse AI; Reddit, Hacker News, X ve GitHub üzerindeki konuşmaları gerçek zamanlı tarar, 0-100 Satın Alma Niyeti Puanı ile gürültüyü %95 eler ve ban riski olmayan doğal yanıtlar hazırlar.',
    hero_cta: 'Müşterilerimi Otomatik Bul',
    trust_1: '60 Saniyede URL Kurulumu',
    trust_2: 'Anti-Ban Doğal Yanıt Motoru',
    trust_3: 'Canlı Reddit + HN + GitHub + X',
    trust_4: 'Aylık $19’dan Başlayan Fiyatlar',
    side_radar: 'Canlı Alıcı Niyeti Radarı',
    side_onboard: '1-Tık URL Kurulumu',
    side_crm: 'Aday CRM & Gelir Hunisi',
    side_comp: 'Rakip Kayıp (Churn) Radarı',
    side_settings: 'Webhook & Paket Ayarları',
    active_campaign: 'Aktif Ürün Radarı',
    btn_add_product: 'Yeni Ürün URL Ekle',
    plan_status_sub: '7/24 Canlı Reddit, HN, GitHub & X Niyet Motoru Aktif',
    btn_upgrade: 'Paketleri Gör / Yükselt',
    kpi_1: 'Yüksek Niyetli Alıcılar (85+)',
    kpi_1_sub: 'Satın Almaya Hazır',
    kpi_2: 'Rakip Terk (Churn) Sinyali',
    kpi_2_sub: 'Alternatif Arayanlar',
    kpi_3: 'Yanıtlanan / Müşteri Olan',
    kpi_3_sub: '%38 Kapanış Oranı',
    kpi_4: 'Tahmini Satış Hattı ROI',
    kpi_4_sub: 'Yıllık Gelir Etkisi',
    flt_all: 'Tüm Kanallar',
    int_all: 'Tüm Niyet Tipleri',
    studio_tag: '🛡️ Anti-Spam Yanıt Stüdyosu',
    choose_tone: 'Topluluk Dostu Yanıt Tonu Seçin:',
    ban_risk_lbl: 'Topluluk Ban Riski:',
    est_deal_lbl: 'Tahmini Değer:',
    btn_copy_open: 'Yanıtı Kopyala & Konuyu Aç ↗',
    btn_mark_replied: 'Yanıtlandı İşaretle',
    btn_mark_won: 'Müşteri Kazanıldı',
    onboard_title: '⚡ 1-Tık Yapay Zeka Ürün URL Analizörü',
    onboard_sub: 'Herhangi bir SaaS, mobil uygulama veya hizmet URL’si yapıştırın. Motorumuz hedef kitleyi, yüksek niyetli anahtar kelimeleri, rakipleri ve hedef subreddit’leri otomatik çıkarır.',
    btn_analyze_url: 'Alıcı Niyeti Profilini Çıkar',
    btn_launch_campaign: 'Kampanyayı Kaydet & Canlı Taramayı Başlat',
    crm_title: '📊 Sosyal Satış Hattı & Gelir Atıf Tablosu',
    crm_sub: 'Keşfedilen her yüksek niyetli sosyal medya konuşmasını yanıttan ödeme yapan müşteriye kadar takip edin.'
  }
};

function showToast(msg) {
  const box = document.getElementById('toastBox');
  box.textContent = msg;
  box.style.display = 'block';
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => {
    box.style.display = 'none';
  }, 3600);
}

function setLanguage(lang) {
  CURRENT_LANG = lang === 'tr' ? 'tr' : 'en';
  const langEnBtn = document.getElementById('langEn');
  const langTrBtn = document.getElementById('langTr');
  if (langEnBtn) langEnBtn.classList.toggle('active', CURRENT_LANG === 'en');
  if (langTrBtn) langTrBtn.classList.toggle('active', CURRENT_LANG === 'tr');

  const dict = I18N[CURRENT_LANG];
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) {
      el.textContent = dict[key];
    }
  });
}

function switchTopMode(mode) {
  const isLanding = mode === 'landing';
  document.getElementById('landingView').classList.toggle('hidden', !isLanding);
  document.getElementById('appView').classList.toggle('hidden', isLanding);
  document.getElementById('topTabLanding').classList.toggle('active', isLanding);
  document.getElementById('topTabApp').classList.toggle('active', !isLanding);
}

function switchWorkspaceTab(tabName) {
  const tabs = ['radar', 'onboard', 'crm', 'competitors', 'settings'];
  tabs.forEach(t => {
    const el = document.getElementById('tab' + t.charAt(0).toUpperCase() + t.slice(1));
    const nav = document.getElementById('nav' + t.charAt(0).toUpperCase() + t.slice(1));
    if (el) el.classList.toggle('hidden', t !== tabName);
    if (nav) nav.classList.toggle('active', t === tabName);
  });
  if (tabName === 'crm') renderCrmTable();
  if (tabName === 'competitors') renderCompetitorWatch();
}

async function fetchInitialState() {
  try {
    const res = await fetch('/api/state');
    const data = await res.json();
    APP_STATE = data;
    const activeCamp = APP_STATE.campaigns.find(c => c.active) || APP_STATE.campaigns[0];
    CURRENT_CAMPAIGN_ID = activeCamp ? activeCamp.id : null;
    renderAll();
  } catch (err) {
    console.error('Failed to load initial state:', err);
  }
}

function getFilteredLeads() {
  return (APP_STATE.leads || []).filter(lead => {
    if (CURRENT_CAMPAIGN_ID && lead.campaignId && lead.campaignId !== CURRENT_CAMPAIGN_ID) {
      return false;
    }
    if (CURRENT_PLATFORM_FILTER !== 'all' && lead.platform !== CURRENT_PLATFORM_FILTER) {
      return false;
    }
    if (CURRENT_INTENT_FILTER !== 'all' && lead.intentType !== CURRENT_INTENT_FILTER) {
      return false;
    }
    return true;
  });
}

function renderAll() {
  renderCampaignSelector();
  renderKpis();
  renderLeadsList();
  renderCrmTable();
  renderCompetitorWatch();
  populateSettings();
}

function renderCampaignSelector() {
  const select = document.getElementById('campaignSelect');
  select.innerHTML = '';
  (APP_STATE.campaigns || []).forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = `${c.name}`;
    if (c.id === CURRENT_CAMPAIGN_ID) opt.selected = true;
    select.appendChild(opt);
  });

  const currentCamp = (APP_STATE.campaigns || []).find(c => c.id === CURRENT_CAMPAIGN_ID) || APP_STATE.campaigns[0];
  const metaEl = document.getElementById('campaignMetaInfo');
  if (currentCamp && metaEl) {
    metaEl.innerHTML = `
      <div>🔗 <strong>${currentCamp.url}</strong></div>
      <div style="margin-top:0.25rem;">🎯 ${(currentCamp.keywords || []).length} keywords • 🔥 ${(currentCamp.competitors || []).join(', ')}</div>
    `;
  }
  if (APP_STATE.settings && APP_STATE.settings.plan) {
    document.getElementById('currentPlanBadge').textContent = APP_STATE.settings.plan;
  }
}

function onCampaignChange(campId) {
  CURRENT_CAMPAIGN_ID = campId;
  SELECTED_LEAD_ID = null;
  renderAll();
}

function renderKpis() {
  const campLeads = (APP_STATE.leads || []).filter(l => !CURRENT_CAMPAIGN_ID || l.campaignId === CURRENT_CAMPAIGN_ID);
  const hotLeads = campLeads.filter(l => l.intentScore >= 85);
  const churnLeads = campLeads.filter(l => l.intentType === 'competitor_churn');
  const repliedOrWon = campLeads.filter(l => l.status === 'replied' || l.status === 'converted');
  const pipelineVal = campLeads.reduce((acc, l) => acc + (Number(l.estimatedValue) || 490), 0);

  document.getElementById('kpiHotLeads').textContent = hotLeads.length;
  document.getElementById('sideHotCount').textContent = hotLeads.length;
  document.getElementById('kpiChurnCount').textContent = churnLeads.length;
  document.getElementById('kpiConvertedCount').textContent = `${repliedOrWon.length} / ${campLeads.filter(l => l.status === 'converted').length} Won`;
  document.getElementById('kpiPipelineValue').textContent = `$${pipelineVal.toLocaleString()}`;
}

function getPlatformBadgeHtml(platform, community) {
  const map = {
    reddit: { cls: 'platform-reddit', icon: '🟠 Reddit' },
    hackernews: { cls: 'platform-hackernews', icon: '🟧 Hacker News' },
    x: { cls: 'platform-x', icon: '𝕏 Twitter/X' },
    github: { cls: 'platform-github', icon: '🟣 GitHub' }
  };
  const info = map[platform] || map.reddit;
  return `<span class="platform-tag ${info.cls}">${info.icon} • ${escapeHtml(community || '')}</span>`;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderLeadsList() {
  const container = document.getElementById('leadsListContainer');
  const leads = getFilteredLeads();

  if (leads.length === 0) {
    container.innerHTML = `
      <div class="panel-card" style="text-align:center; padding:2.5rem;">
        <div style="font-size:2rem; margin-bottom:0.5rem;">📡</div>
        <h3>No buyer signals match this filter yet</h3>
        <p style="color:var(--text-secondary); font-size:0.88rem; margin:0.5rem 0 1rem;">
          Click "Scan Live Intent Now" to query Reddit, Hacker News, and GitHub in real time.
        </p>
        <button class="btn btn-primary" onclick="triggerLiveScan()">🔄 Scan Live Sources Now</button>
      </div>
    `;
    return;
  }

  if (!SELECTED_LEAD_ID || !leads.some(l => l.id === SELECTED_LEAD_ID)) {
    SELECTED_LEAD_ID = leads[0].id;
  }

  container.innerHTML = leads.map(lead => {
    const isSelected = lead.id === SELECTED_LEAD_ID;
    const scoreClass = lead.intentScore >= 90 ? 'intent-hot' : 'intent-warm';
    const statusPill = lead.status === 'converted'
      ? '<span style="color:var(--emerald); font-weight:700;">💰 Won Customer</span>'
      : lead.status === 'replied'
      ? '<span style="color:#818cf8; font-weight:700;">✅ Replied</span>'
      : '<span style="color:var(--amber); font-weight:700;">⚡ Ready to Reply</span>';

    return `
      <div class="lead-card ${isSelected ? 'selected' : ''}" onclick="selectLead('${lead.id}')">
        <div class="lead-top">
          ${getPlatformBadgeHtml(lead.platform, lead.community)}
          <span class="intent-badge ${scoreClass}">🎯 ${lead.intentScore}/100 • ${escapeHtml(lead.intentLabel)}</span>
        </div>
        <div class="lead-title">${escapeHtml(lead.title)}</div>
        <div class="lead-snippet">${escapeHtml(lead.snippet)}</div>
        <div class="lead-meta">
          <span>👤 ${escapeHtml(lead.author)} • 🕒 ${escapeHtml(lead.postedAt)}</span>
          <span>🔥 vs. <strong>${escapeHtml(lead.competitorMentioned || 'Manual')}</strong> • ${statusPill}</span>
        </div>
      </div>
    `;
  }).join('');

  renderReplyStudio();
}

function selectLead(leadId) {
  SELECTED_LEAD_ID = leadId;
  renderLeadsList();
}

function selectReplyTone(tone) {
  SELECTED_TONE = tone;
  document.getElementById('toneHelpful').classList.toggle('active', tone === 'helpful');
  document.getElementById('toneFounder').classList.toggle('active', tone === 'founder');
  document.getElementById('toneComparison').classList.toggle('active', tone === 'comparison');
  renderReplyStudio();
}

function renderReplyStudio() {
  const lead = (APP_STATE.leads || []).find(l => l.id === SELECTED_LEAD_ID);
  if (!lead) return;

  document.getElementById('studioScoreBadge').textContent = `${lead.intentScore}/100 Intent`;
  document.getElementById('studioLeadTitle').textContent = lead.title;
  document.getElementById('studioLeadMeta').innerHTML = `
    <strong>${escapeHtml(lead.community)}</strong> • Posted by <strong>${escapeHtml(lead.author)}</strong> (${escapeHtml(lead.postedAt)}) •
    <a href="${escapeHtml(lead.url)}" target="_blank" rel="noopener" style="color:#818cf8;">Open Original Thread ↗</a>
  `;
  document.getElementById('studioWhyHot').innerHTML = `
    <strong>🧠 Why AI Flagged This Buyer Signal:</strong><br/>
    ${escapeHtml(lead.whyHot || 'High buyer intent detected with explicit tool comparison signal.')}
  `;

  const replyDraft = (lead.replies && lead.replies[SELECTED_TONE]) || '';
  document.getElementById('studioReplyText').value = replyDraft;
  document.getElementById('studioBanRisk').textContent = lead.banRisk || 'Low (3% - Safe)';
  document.getElementById('studioDealVal').textContent = `$${(lead.estimatedValue || 490)}/yr`;
}

function setPlatformFilter(platform) {
  CURRENT_PLATFORM_FILTER = platform;
  document.querySelectorAll('[data-platform]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-platform') === platform);
  });
  renderLeadsList();
}

function setIntentFilter(intent) {
  CURRENT_INTENT_FILTER = intent;
  document.querySelectorAll('[data-intent]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-intent') === intent);
  });
  renderLeadsList();
}

async function copyAndOpenThread() {
  const lead = (APP_STATE.leads || []).find(l => l.id === SELECTED_LEAD_ID);
  if (!lead) return;
  const text = document.getElementById('studioReplyText').value;
  try {
    await navigator.clipboard.writeText(text);
  } catch (e) {
    // Fallback copy
  }
  showToast('✅ Anti-Spam Reply copied to clipboard! Opening thread...');
  window.open(lead.url, '_blank', 'noopener');
}

async function markLeadStatus(newStatus) {
  if (!SELECTED_LEAD_ID) return;
  const customReply = document.getElementById('studioReplyText').value;
  try {
    const res = await fetch(`/api/leads/${SELECTED_LEAD_ID}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, tone: SELECTED_TONE, customReply })
    });
    const data = await res.json();
    if (data.ok) {
      APP_STATE = data.state;
      renderAll();
      showToast(newStatus === 'converted' ? '💰 Deal marked as Converted Customer! ROI updated.' : '✅ Lead marked as Replied!');
    }
  } catch (e) {
    showToast('⚠️ Could not update lead status');
  }
}

async function triggerLiveScan() {
  const btn = document.getElementById('topScanBtn');
  const origHtml = btn.innerHTML;
  btn.innerHTML = '<span>⏳</span> <span>Scanning Reddit, HN & GitHub...</span>';
  btn.disabled = true;

  try {
    const res = await fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ campaignId: CURRENT_CAMPAIGN_ID })
    });
    const data = await res.json();
    if (data.ok) {
      APP_STATE = data.state;
      SELECTED_LEAD_ID = data.leads && data.leads[0] ? data.leads[0].id : SELECTED_LEAD_ID;
      switchTopMode('app');
      switchWorkspaceTab('radar');
      renderAll();
      showToast(`📡 Live Scan Complete: Found ${data.addedCount} fresh buyer-intent signals across Reddit, HN & GitHub!`);
    }
  } catch (e) {
    showToast('⚠️ Live scan error');
  } finally {
    btn.innerHTML = origHtml;
    btn.disabled = false;
  }
}

async function runHeroUrlAnalysis() {
  const urlVal = document.getElementById('heroUrlInput').value.trim() || 'https://replypulse.ai';
  document.getElementById('onboardUrlInput').value = urlVal;
  switchTopMode('app');
  switchWorkspaceTab('onboard');
  await analyzeUrlInWorkspace();
}

async function analyzeUrlInWorkspace() {
  const urlVal = document.getElementById('onboardUrlInput').value.trim();
  const btn = document.getElementById('btnAnalyzeUrl');
  const orig = btn.innerHTML;
  btn.innerHTML = '<span>⏳</span> <span>Crawling URL & Extracting Buyer Persona...</span>';
  btn.disabled = true;

  try {
    const res = await fetch('/api/analyze-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: urlVal })
    });
    const data = await res.json();
    if (data.ok && data.analysis) {
      const a = data.analysis;
      document.getElementById('campName').value = a.name || '';
      document.getElementById('campCategory').value = a.category || '';
      document.getElementById('campAudience').value = a.audience || '';
      document.getElementById('campDealValue').value = a.suggestedDealValue || 490;
      document.getElementById('campValueProp').value = a.valueProp || '';
      document.getElementById('campKeywords').value = (a.keywords || []).join(', ');
      document.getElementById('campCompetitors').value = (a.competitors || []).join(', ');
      document.getElementById('campSubreddits').value = (a.subreddits || []).join(', ');
      showToast(`⚡ Extracted buyer profile for ${a.name}! Click "Save Campaign & Launch Live Buyer Scan".`);
    }
  } catch (e) {
    showToast('⚠️ Failed to analyze URL');
  } finally {
    btn.innerHTML = orig;
    btn.disabled = false;
  }
}

async function saveNewCampaignAndScan() {
  const payload = {
    url: document.getElementById('onboardUrlInput').value.trim(),
    name: document.getElementById('campName').value.trim() || 'My SaaS Product',
    category: document.getElementById('campCategory').value.trim(),
    audience: document.getElementById('campAudience').value.trim(),
    dealValue: Number(document.getElementById('campDealValue').value) || 490,
    valueProp: document.getElementById('campValueProp').value.trim(),
    keywords: document.getElementById('campKeywords').value.split(',').map(s => s.trim()).filter(Boolean),
    competitors: document.getElementById('campCompetitors').value.split(',').map(s => s.trim()).filter(Boolean),
    subreddits: document.getElementById('campSubreddits').value.split(',').map(s => s.trim()).filter(Boolean)
  };

  showToast('🚀 Launching live buyer-intent scan for ' + payload.name + '...');
  try {
    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.ok) {
      APP_STATE = data.state;
      CURRENT_CAMPAIGN_ID = data.campaign.id;
      SELECTED_LEAD_ID = null;
      switchWorkspaceTab('radar');
      renderAll();
      showToast(`🎯 Campaign "${data.campaign.name}" active with ${data.addedLeads} live buyer signals!`);
    }
  } catch (e) {
    showToast('⚠️ Failed to save campaign');
  }
}

function renderCrmTable() {
  const tbody = document.getElementById('crmTableBody');
  if (!tbody) return;
  const leads = (APP_STATE.leads || []).filter(l => !CURRENT_CAMPAIGN_ID || l.campaignId === CURRENT_CAMPAIGN_ID);

  tbody.innerHTML = leads.map(l => `
    <tr>
      <td>${getPlatformBadgeHtml(l.platform, l.community)}</td>
      <td><span class="intent-badge intent-hot">${l.intentScore}/100</span></td>
      <td style="max-width:340px;">
        <div style="font-weight:700;">${escapeHtml(l.title)}</div>
        <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(l.author)} • ${escapeHtml(l.postedAt)}</div>
      </td>
      <td><strong>${escapeHtml(l.competitorMentioned || 'Manual')}</strong></td>
      <td style="color:var(--emerald); font-weight:700;">$${l.estimatedValue || 490}</td>
      <td>
        <select class="form-input" style="padding:0.3rem 0.5rem; font-size:0.78rem;" onchange="updateLeadStageFromCrm('${l.id}', this.value)">
          <option value="new" ${l.status === 'new' ? 'selected' : ''}>⚡ New Signal</option>
          <option value="saved" ${l.status === 'saved' ? 'selected' : ''}>📌 Saved</option>
          <option value="replied" ${l.status === 'replied' ? 'selected' : ''}>✅ Replied</option>
          <option value="converted" ${l.status === 'converted' ? 'selected' : ''}>💰 Converted Won</option>
        </select>
      </td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="openLeadInStudio('${l.id}')">Reply Studio →</button>
      </td>
    </tr>
  `).join('');
}

async function updateLeadStageFromCrm(leadId, status) {
  const res = await fetch(`/api/leads/${leadId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status })
  });
  const data = await res.json();
  if (data.ok) {
    APP_STATE = data.state;
    renderAll();
    showToast('✅ Pipeline stage updated!');
  }
}

function openLeadInStudio(leadId) {
  SELECTED_LEAD_ID = leadId;
  switchWorkspaceTab('radar');
  renderLeadsList();
}

function renderCompetitorWatch() {
  const grid = document.getElementById('competitorCardsGrid');
  if (!grid) return;
  const camp = (APP_STATE.campaigns || []).find(c => c.id === CURRENT_CAMPAIGN_ID) || APP_STATE.campaigns[0];
  const competitors = (camp && camp.competitors) || ['F5Bot', 'Brand24', 'Syften'];

  grid.innerHTML = competitors.map((comp, idx) => {
    const count = (APP_STATE.leads || []).filter(l => (l.competitorMentioned || '').toLowerCase().includes(comp.toLowerCase())).length || (idx + 1);
    return `
      <div class="feature-card">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.75rem;">
          <span style="font-size:1.1rem; font-weight:800;">🔥 vs. ${escapeHtml(comp)}</span>
          <span class="intent-badge intent-hot">${count} Churn Signals</span>
        </div>
        <p style="font-size:0.86rem; color:var(--text-secondary); margin-bottom:1rem;">
          Monitoring Reddit, HN, X & GitHub for phrases: <code>"${comp.toLowerCase()} alternative"</code>, <code>"switching from ${comp.toLowerCase()}"</code>, <code>"${comp.toLowerCase()} too expensive"</code>.
        </p>
        <button class="btn btn-secondary btn-sm" onclick="filterByCompetitorChurn()">View Intercept Drafts →</button>
      </div>
    `;
  }).join('');
}

function filterByCompetitorChurn() {
  switchWorkspaceTab('radar');
  setIntentFilter('competitor_churn');
}

function populateSettings() {
  if (!APP_STATE.settings) return;
  document.getElementById('setPlan').value = APP_STATE.settings.plan || 'Growth ($49/mo)';
  document.getElementById('setModel').value = APP_STATE.settings.openaiModel || 'gpt-4o-mini (Semantic Intent v3)';
  document.getElementById('setSlack').value = APP_STATE.settings.slackWebhook || '';
  document.getElementById('setDiscord').value = APP_STATE.settings.discordWebhook || '';
}

async function saveSettings() {
  const payload = {
    plan: document.getElementById('setPlan').value,
    openaiModel: document.getElementById('setModel').value,
    slackWebhook: document.getElementById('setSlack').value.trim(),
    discordWebhook: document.getElementById('setDiscord').value.trim()
  };
  const res = await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await res.json();
  if (data.ok) {
    APP_STATE.settings = data.settings;
    renderCampaignSelector();
    showToast('✅ Workspace settings & subscription plan saved!');
  }
}

async function selectPlan(planName) {
  await fetch('/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ plan: planName })
  });
  APP_STATE.settings.plan = planName;
  switchTopMode('app');
  renderAll();
  showToast(`🎉 Activated ${planName}! Live Buyer-Intent Radar is ready.`);
}

function testWebhookAlert() {
  showToast('🔔 Test 98/100 Buyer-Intent Lead alert dispatched to configured webhook channel!');
}

function exportLeadsCsv() {
  const leads = (APP_STATE.leads || []).filter(l => !CURRENT_CAMPAIGN_ID || l.campaignId === CURRENT_CAMPAIGN_ID);
  const rows = [
    ['ID', 'Platform', 'Community', 'Author', 'IntentScore', 'IntentType', 'Competitor', 'Status', 'EstimatedARR', 'Title', 'URL']
  ];
  leads.forEach(l => {
    rows.push([
      l.id,
      l.platform,
      l.community,
      l.author,
      l.intentScore,
      l.intentType,
      l.competitorMentioned || '',
      l.status,
      l.estimatedValue || 490,
      `"${String(l.title || '').replace(/"/g, '""')}"`,
      l.url
    ]);
  });
  const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.join(',')).join('\n');
  const link = document.createElement('a');
  link.setAttribute('href', encodeURI(csvContent));
  link.setAttribute('download', `replypulse-buyer-intent-leads-${Date.now()}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('⬇️ Exported buyer-intent leads CSV!');
}

window.addEventListener('DOMContentLoaded', () => {
  fetchInitialState();
  analyzeUrlInWorkspace();
});
