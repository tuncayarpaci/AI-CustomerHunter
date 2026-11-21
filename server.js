'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const dns = require('dns');
const net = require('net');
const { URL } = require('url');

const store = require('./lib/store');
const auth = require('./lib/auth');
const translate = require('./lib/translate');
const notifier = require('./lib/notifier');
const yonetim = require('./lib/yonetim');
const {
  verifyInternalToken,
  validateDemandSignalInput,
  createDemandSignalService
} = require('./lib/demand-signal');
const {
  APPCOOK_PORTFOLIO_CAMPAIGNS,
  INITIAL_LEADS,
  generateReplies
} = require('./lib/portfolio');

const PORT = process.env.PORT || 3090;
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_ANALYZE_BODY_BYTES = 256 * 1024;
const MAX_ANALYZE_REDIRECTS = 3;
const VALID_LEAD_STATUSES = new Set(['new', 'replied', 'converted', 'ignored']);
const VALID_REPLY_TONES = new Set(['helpful', 'founder', 'comparison']);
const MAX_CUSTOM_REPLY_LENGTH = 4000;

class InvalidUrlError extends Error {
  constructor(message) {
    super(message);
    this.name = 'InvalidUrlError';
    this.statusCode = 400;
  }
}

// Veri dizini ve ilk yerel yönetici hazırlığı
store.getDataDir();
auth.bootstrapAdmin();

function syncPortfolioDb(db) {
  let changed = false;

  // 1. Bozuk kampanya kayıtlarını temizle
  const beforeCampCount = db.campaigns.length;
  db.campaigns = db.campaigns.filter(c => {
    const isCorruptedLinear = (c.name && c.name.includes('Linear – The system for product development')) ||
      (c.url && c.url.includes('task.appcook.store') && c.id !== 'camp-ai-task');
    return !isCorruptedLinear;
  });
  if (db.campaigns.length !== beforeCampCount) {
    changed = true;
  }

  // 2. 8 AppCook portföy kampanyasını güncel tut
  for (let i = APPCOOK_PORTFOLIO_CAMPAIGNS.length - 1; i >= 0; i--) {
    const target = APPCOOK_PORTFOLIO_CAMPAIGNS[i];
    const existingIdx = db.campaigns.findIndex(c =>
      c.id === target.id ||
      (c.url && c.url.toLowerCase().replace(/\/+$/, '') === target.url.toLowerCase().replace(/\/+$/, ''))
    );
    if (existingIdx === -1) {
      db.campaigns.unshift({ ...target, active: false });
      changed = true;
    } else {
      const existing = db.campaigns[existingIdx];
      if (
        existing.name !== target.name ||
        existing.category !== target.category ||
        JSON.stringify(existing.competitors) !== JSON.stringify(target.competitors) ||
        JSON.stringify(existing.keywords) !== JSON.stringify(target.keywords)
      ) {
        db.campaigns[existingIdx] = {
          ...target,
          active: existing.active,
          createdAt: existing.createdAt || target.createdAt
        };
        changed = true;
      }
    }
  }

  if (!db.campaigns.some(c => c.active)) {
    const aiTask = db.campaigns.find(c => c.id === 'camp-ai-task') || db.campaigns[0];
    if (aiTask) {
      aiTask.active = true;
      changed = true;
    }
  }

  // 3. Hatalı eski kayıtları temizle
  const validCampIds = new Set(db.campaigns.map(c => c.id));
  const beforeLeadCount = db.leads.length;
  db.leads = db.leads.filter(l => {
    if (!l || typeof l !== 'object') return false;
    const text = `${l.title || ''} ${l.snippet || ''} ${l.competitorMentioned || ''}`;
    const isWrongDatadogLead = (text.includes('Linear – The system for product development')) ||
      (l.campaignId !== 'camp-devflow' && text.includes('Datadog') && (text.includes('Project & Task') || text.includes('task.appcook.store') || !validCampIds.has(l.campaignId)));
    return !isWrongDatadogLead;
  });
  if (db.leads.length !== beforeLeadCount) {
    changed = true;
  }

  // 4. INITIAL_LEADS kayıtlarını ve statik TR/EN i18n verilerini senkronize et
  const leadById = new Map(db.leads.map(l => [l.id, l]));
  for (let i = INITIAL_LEADS.length - 1; i >= 0; i--) {
    const seedLead = INITIAL_LEADS[i];
    const existing = leadById.get(seedLead.id);
    if (!existing) {
      db.leads.unshift(JSON.parse(JSON.stringify(seedLead)));
      changed = true;
    } else {
      if (!existing.i18n || !existing.i18n.tr || !existing.i18n.tr.title || !existing.i18n.tr.replies || !existing.i18n.en) {
        existing.i18n = {
          ...(existing.i18n || {}),
          en: existing.i18n && existing.i18n.en ? existing.i18n.en : JSON.parse(JSON.stringify(seedLead.i18n.en)),
          tr: existing.i18n && existing.i18n.tr && existing.i18n.tr.replies ? existing.i18n.tr : JSON.parse(JSON.stringify(seedLead.i18n.tr))
        };
        changed = true;
      }
    }
  }

  return changed;
}

function defaultDbFactory() {
  return {
    campaigns: JSON.parse(JSON.stringify(APPCOOK_PORTFOLIO_CAMPAIGNS)),
    leads: JSON.parse(JSON.stringify(INITIAL_LEADS)),
    settings: {
      minIntentThreshold: 78,
      autoAlert90Plus: true,
      language: 'tr'
    }
  };
}

function loadDb() {
  return store.loadDb(syncPortfolioDb, defaultDbFactory);
}

function saveDb(db) {
  store.saveDb(db);
}

function computeIntentAnalysis(text, campaign) {
  const lower = (text || '').toLowerCase();
  let score = 68;
  let intentType = 'pain_point';
  let intentLabel = 'Workflow Pain Point';
  let competitorMentioned = 'Manual Process';

  const churnPatterns = ['alternative to', 'switching from', 'tired of', 'hate ', 'frustrated with', 'too expensive', 'shut down', 'replacing', 'cancel'];
  const buyerPatterns = ['looking for', 'recommend', 'what tool', 'best tool', 'any suggestions', 'what are you using', 'which software', 'advice on'];
  const budgetPatterns = ['budget', 'ready to pay', 'pricing', 'per month', '/mo', 'paid tool', 'worth paying', 'under $'];

  for (const c of (campaign.competitors || [])) {
    if (lower.includes(c.toLowerCase())) {
      competitorMentioned = c;
      score += 14;
      break;
    }
  }

  if (churnPatterns.some(p => lower.includes(p))) {
    intentType = 'competitor_churn';
    intentLabel = 'Competitor Churn Signal';
    score += 18;
  } else if (budgetPatterns.some(p => lower.includes(p))) {
    intentType = 'budget_ready';
    intentLabel = 'Budget-Ready Buyer';
    score += 16;
  } else if (buyerPatterns.some(p => lower.includes(p))) {
    intentType = 'active_buyer';
    intentLabel = 'Active Tool Request';
    score += 14;
  } else {
    score += 10;
  }

  if (lower.includes('?')) score += 4;
  if (lower.length > 140) score += 3;

  score = Math.min(99, Math.max(72, score));

  const matchedKeywords = (campaign.keywords || []).filter(k => {
    const words = k.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    return words.some(w => lower.includes(w));
  }).slice(0, 3);

  if (matchedKeywords.length === 0 && campaign.keywords && campaign.keywords[0]) {
    matchedKeywords.push(campaign.keywords[0]);
  }

  return {
    intentScore: score,
    intentType,
    intentLabel,
    competitorMentioned,
    matchedKeywords
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        'User-Agent': 'AI-CustomerHunter/1.1 (https://customerhunter.appcook.store)',
        'Accept': 'application/json, text/html, */*',
        ...(options.headers || {})
      }
    });
  } finally {
    clearTimeout(timer);
  }
}

async function scanLiveSources(campaign) {
  const query = (campaign.keywords && campaign.keywords[0]) ? campaign.keywords[0] : `${campaign.name} alternative`;
  const discovered = [];

  // 1. HackerNews Algolia Live Search
  try {
    const hnQuery = encodeURIComponent(query.split(' ').slice(0, 3).join(' '));
    const hnRes = await fetchWithTimeout(`https://hn.algolia.com/api/v1/search_by_date?query=${hnQuery}&tags=story&hitsPerPage=4`);
    if (hnRes.ok) {
      const hnData = await hnRes.json();
      for (const hit of (hnData.hits || [])) {
        if (!hit.title) continue;
        const text = `${hit.title} ${hit.story_text || ''}`.replace(/<[^>]+>/g, ' ');
        const analysis = computeIntentAnalysis(text, campaign);
        discovered.push({
          id: `lead-hn-${hit.objectID || Date.now()}`,
          campaignId: campaign.id,
          platform: 'hackernews',
          community: hit.title.startsWith('Ask HN') ? 'Ask HN' : 'Hacker News',
          author: hit.author || 'hn_founder',
          title: hit.title,
          snippet: (hit.story_text ? hit.story_text.replace(/<[^>]+>/g, ' ').slice(0, 260) : `Live Hacker News thread discussing "${query}" with ${hit.num_comments || 0} community comments and active tool comparisons.`),
          url: hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`,
          intentScore: analysis.intentScore,
          intentType: analysis.intentType,
          intentLabel: analysis.intentLabel,
          matchedKeywords: analysis.matchedKeywords,
          competitorMentioned: analysis.competitorMentioned,
          estimatedValue: campaign.dealValue || 490,
          banRisk: 'Low (3%)',
          whyHot: `Live Hacker News discussion matched query "${query}" (${hit.points || 1} pts, ${hit.num_comments || 0} comments).`,
          status: 'new',
          postedAt: 'Just now (Live HN)',
          createdAt: new Date().toISOString(),
          replies: generateReplies(campaign.name, campaign.url, hit.title, analysis.competitorMentioned)
        });
      }
    }
  } catch {
    // Dış kaynak geçici olarak erişilemeyebilir
  }

  // 2. Reddit Public JSON Search
  try {
    const redditQuery = encodeURIComponent(`${query} OR alternative`);
    const redRes = await fetchWithTimeout(`https://www.reddit.com/search.json?q=${redditQuery}&sort=new&limit=4`);
    if (redRes.ok) {
      const redData = await redRes.json();
      const children = (redData && redData.data && redData.data.children) ? redData.data.children : [];
      for (const item of children) {
        const post = item.data;
        if (!post || !post.title) continue;
        const text = `${post.title} ${post.selftext || ''}`;
        const analysis = computeIntentAnalysis(text, campaign);
        discovered.push({
          id: `lead-rd-${post.id || Date.now()}`,
          campaignId: campaign.id,
          platform: 'reddit',
          community: post.subreddit_name_prefixed || 'r/SaaS',
          author: `u/${post.author || 'founder'}`,
          title: post.title,
          snippet: (post.selftext ? post.selftext.slice(0, 280) : `Active thread in ${post.subreddit_name_prefixed || 'r/SaaS'} asking for recommendations around ${query}.`),
          url: `https://www.reddit.com${post.permalink || ''}`,
          intentScore: analysis.intentScore,
          intentType: analysis.intentType,
          intentLabel: analysis.intentLabel,
          matchedKeywords: analysis.matchedKeywords,
          competitorMentioned: analysis.competitorMentioned,
          estimatedValue: campaign.dealValue || 490,
          banRisk: 'Low (4%)',
          whyHot: `Live Reddit thread in ${post.subreddit_name_prefixed || 'r/SaaS'} matching buyer-intent pattern.`,
          status: 'new',
          postedAt: 'Just now (Live Reddit)',
          createdAt: new Date().toISOString(),
          replies: generateReplies(campaign.name, campaign.url, post.title, analysis.competitorMentioned)
        });
      }
    }
  } catch {
    // Dış kaynak geçici olarak erişilemeyebilir
  }

  // 3. GitHub Issues Public Search
  try {
    const ghQuery = encodeURIComponent(query.split(' ').slice(0, 2).join(' '));
    const ghRes = await fetchWithTimeout(`https://api.github.com/search/issues?q=${ghQuery}+in:title,body&sort=updated&per_page=2`);
    if (ghRes.ok) {
      const ghData = await ghRes.json();
      for (const issue of (ghData.items || [])) {
        if (!issue.title) continue;
        const text = `${issue.title} ${issue.body || ''}`;
        const analysis = computeIntentAnalysis(text, campaign);
        discovered.push({
          id: `lead-gh-${issue.id || Date.now()}`,
          campaignId: campaign.id,
          platform: 'github',
          community: 'GitHub Issues',
          author: `@${(issue.user && issue.user.login) || 'dev_builder'}`,
          title: issue.title,
          snippet: (issue.body ? issue.body.replace(/[#*`]/g, '').slice(0, 240) : `Developer issue discussing ${query} workflow pain points.`),
          url: issue.html_url || 'https://github.com/search',
          intentScore: analysis.intentScore,
          intentType: analysis.intentType,
          intentLabel: analysis.intentLabel,
          matchedKeywords: analysis.matchedKeywords,
          competitorMentioned: analysis.competitorMentioned,
          estimatedValue: campaign.dealValue || 490,
          banRisk: 'Low (2%)',
          whyHot: `Live GitHub Issue from active developer discussing "${query}".`,
          status: 'new',
          postedAt: 'Just now (Live GitHub)',
          createdAt: new Date().toISOString(),
          replies: generateReplies(campaign.name, campaign.url, issue.title, analysis.competitorMentioned)
        });
      }
    }
  } catch {
    // Dış kaynak geçici olarak erişilemeyebilir
  }

  return discovered.slice(0, 8);
}

function isPrivateIpv4(ip) {
  const parts = String(ip || '').split('.').map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8 unspecified
  if (a === 10) return true; // 10.0.0.0/8 RFC1918
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 RFC1918
  if (a === 192 && b === 168) return true; // 192.168.0.0/16 RFC1918
  if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  return false;
}

function expandIpv6(rawIp) {
  let s = String(rawIp || '').trim().toLowerCase();
  const zoneIdx = s.indexOf('%');
  if (zoneIdx !== -1) s = s.slice(0, zoneIdx);

  // Embedded IPv4 son eki (ör. ::ffff:127.0.0.1)
  const lastColon = s.lastIndexOf(':');
  if (lastColon !== -1 && s.slice(lastColon + 1).includes('.')) {
    const v4Part = s.slice(lastColon + 1);
    if (!net.isIPv4(v4Part)) return null;
    const octets = v4Part.split('.').map(Number);
    const hi = ((octets[0] << 8) | octets[1]).toString(16);
    const lo = ((octets[2] << 8) | octets[3]).toString(16);
    s = `${s.slice(0, lastColon)}:${hi}:${lo}`;
  }

  const halves = s.split('::');
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = halves.length === 2 ? 8 - (left.length + right.length) : 0;
  if (missing < 0 || (halves.length === 1 && left.length !== 8)) return null;

  const groups = [...left, ...Array(missing).fill('0'), ...right];
  if (groups.length !== 8) return null;

  const nums = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    nums.push(parseInt(g, 16));
  }
  return nums;
}

function isPrivateIp(ip) {
  const clean = String(ip || '').trim().replace(/^\[|\]$/g, '');
  const version = net.isIP(clean);
  if (version === 4) return isPrivateIpv4(clean);
  if (version !== 6) return true;

  const groups = expandIpv6(clean);
  if (!groups) return true;

  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
  // Unspecified (::)
  if (groups.every(g => g === 0)) return true;
  // Loopback (::1)
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0 && g6 === 0 && g7 === 1) return true;
  // IPv4-mapped IPv6 (::ffff:0:0/96)
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    const v4 = `${(g6 >> 8) & 0xff}.${g6 & 0xff}.${(g7 >> 8) & 0xff}.${g7 & 0xff}`;
    return isPrivateIpv4(v4);
  }
  // ULA (fc00::/7)
  if ((g0 & 0xfe00) === 0xfc00) return true;
  // Link-local (fe80::/10)
  if ((g0 & 0xffc0) === 0xfe80) return true;
  // Multicast (ff00::/8)
  if ((g0 & 0xff00) === 0xff00) return true;

  return false;
}

async function assertSafePublicUrl(urlStr) {
  let parsed;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new InvalidUrlError('Geçersiz URL biçimi.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new InvalidUrlError('Yalnızca http:// ve https:// adresleri desteklenir.');
  }
  if (parsed.username || parsed.password) {
    throw new InvalidUrlError('Kimlik bilgisi içeren URL adresleri kabul edilmez.');
  }

  const rawHost = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!rawHost) {
    throw new InvalidUrlError('Geçersiz konak adı.');
  }

  if (net.isIP(rawHost)) {
    if (isPrivateIp(rawHost)) {
      throw new InvalidUrlError('Özel ağ veya yerel IP adresleri analiz edilemez.');
    }
    return parsed;
  }

  const hostNoDot = rawHost.replace(/\.+$/, '');
  if (
    !hostNoDot ||
    !hostNoDot.includes('.') ||
    hostNoDot === 'localhost' ||
    hostNoDot.endsWith('.localhost') ||
    hostNoDot.endsWith('.local') ||
    hostNoDot.endsWith('.internal')
  ) {
    throw new InvalidUrlError('Yerel veya iç ağ konak adları analiz edilemez.');
  }

  let records;
  try {
    records = await dns.promises.lookup(hostNoDot, { all: true });
  } catch {
    throw new InvalidUrlError('Hedef alan adı çözümlenemedi.');
  }

  if (!Array.isArray(records) || records.length === 0) {
    throw new InvalidUrlError('Hedef alan adı çözümlenemedi.');
  }

  for (const rec of records) {
    if (!rec || !rec.address || isPrivateIp(rec.address)) {
      throw new InvalidUrlError('Özel ağ veya yerel IP adresine çözümlenen hedefler analiz edilemez.');
    }
  }

  return parsed;
}

async function readResponseTextLimited(res, maxBytes = MAX_ANALYZE_BODY_BYTES) {
  if (!res || !res.body || typeof res.body.getReader !== 'function') {
    const text = res ? await res.text() : '';
    return Buffer.from(text, 'utf8').subarray(0, maxBytes).toString('utf8');
  }
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      if (total + chunk.length >= maxBytes) {
        const remaining = maxBytes - total;
        if (remaining > 0) chunks.push(chunk.subarray(0, remaining));
        await reader.cancel().catch(() => {});
        break;
      }
      chunks.push(chunk);
      total += chunk.length;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // yoksay
    }
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function analyzeWebsiteUrl(rawUrl) {
  let normalizedUrl = (rawUrl || '').trim();
  if (!normalizedUrl) {
    normalizedUrl = 'https://task.appcook.store';
  }
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(normalizedUrl)) {
    normalizedUrl = 'https://' + normalizedUrl;
  }

  let parsedInitial;
  try {
    parsedInitial = new URL(normalizedUrl);
  } catch {
    throw new InvalidUrlError('Geçersiz URL biçimi.');
  }
  if (parsedInitial.protocol !== 'http:' && parsedInitial.protocol !== 'https:') {
    throw new InvalidUrlError('Yalnızca http:// ve https:// adresleri desteklenir.');
  }

  const hostname = parsedInitial.hostname.replace(/^www\./, '').toLowerCase();

  const portfolioMatch = APPCOOK_PORTFOLIO_CAMPAIGNS.find(c => {
    try {
      return new URL(c.url).hostname.replace(/^www\./, '').toLowerCase() === hostname;
    } catch {
      return false;
    }
  });

  if (portfolioMatch) {
    return {
      url: portfolioMatch.url,
      liveFetched: true,
      name: portfolioMatch.name,
      category: portfolioMatch.category,
      audience: portfolioMatch.audience,
      valueProp: portfolioMatch.valueProp,
      keywords: portfolioMatch.keywords,
      competitors: portfolioMatch.competitors,
      subreddits: portfolioMatch.subreddits,
      suggestedDealValue: portfolioMatch.dealValue
    };
  }

  // SSRF ve özel ağ kontrolü (dış istek yapmadan önce zorunlu)
  await assertSafePublicUrl(normalizedUrl);

  const brandBase = hostname.split('.')[0] || 'Product';
  let title = `${brandBase.charAt(0).toUpperCase() + brandBase.slice(1)}`;
  let description = '';
  let liveFetched = false;

  try {
    let currentUrl = normalizedUrl;
    for (let hop = 0; hop <= MAX_ANALYZE_REDIRECTS; hop++) {
      if (hop > 0) {
        await assertSafePublicUrl(currentUrl);
      }
      const res = await fetchWithTimeout(currentUrl, { redirect: 'manual' }, 4000);
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (res.body && typeof res.body.cancel === 'function') {
          res.body.cancel().catch(() => {});
        }
        if (!location || hop === MAX_ANALYZE_REDIRECTS) {
          break;
        }
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }
      if (res.ok) {
        const html = await readResponseTextLimited(res, MAX_ANALYZE_BODY_BYTES);
        liveFetched = true;
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const descMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
          html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
        if (titleMatch && titleMatch[1]) {
          title = titleMatch[1].trim().split(/[|\-—:]/)[0].trim() || title;
        }
        if (descMatch && descMatch[1]) {
          description = descMatch[1].trim();
        }
      } else if (res.body && typeof res.body.cancel === 'function') {
        res.body.cancel().catch(() => {});
      }
      break;
    }
  } catch (err) {
    if (err instanceof InvalidUrlError) {
      throw err;
    }
    // Çevrimdışı veya hedef site engelledi
  }

  const lowerContext = `${hostname} ${title} ${description}`.toLowerCase();

  let category = 'B2B SaaS & Productivity';
  let audience = 'Founders, Product Teams, Operators, and Growth Marketers';
  let competitors = ['Notion', 'Airtable', 'Zapier', 'Monday.com'];
  let subreddits = ['r/SaaS', 'r/entrepreneur', 'r/startups', 'r/productivity'];
  let keywords = [
    `best tool for ${brandBase}`,
    `${brandBase} alternative`,
    'looking for saas tool recommendation',
    'automate workflow for startup'
  ];

  if (lowerContext.includes('task') || lowerContext.includes('kanban') || lowerContext.includes('todo') || lowerContext.includes('project') || lowerContext.includes('sprint') || lowerContext.includes('trello')) {
    category = 'Project & Task Management / Team Kanban';
    audience = 'Startup Teams, Agencies, Remote Engineering & Operations Teams, Project Managers';
    competitors = ['Trello', 'Jira', 'Asana', 'ClickUp', 'Monday.com', 'Linear'];
    subreddits = ['r/projectmanagement', 'r/SaaS', 'r/entrepreneur', 'r/smallbusiness', 'r/productivity'];
    keywords = ['trello alternative', 'jira too complex', 'lightweight kanban tool', 'telegram task manager', 'team task tracker'];
  } else if (lowerContext.includes('dev') || lowerContext.includes('api') || lowerContext.includes('cloud') || lowerContext.includes('git') || lowerContext.includes('supabase') || lowerContext.includes('vercel')) {
    category = 'Developer Tools & Cloud Infrastructure';
    audience = 'Software Engineers, CTOs, DevOps Teams, Indie Developers';
    competitors = ['Datadog', 'Vercel', 'Firebase', 'AWS Amplify'];
    subreddits = ['r/webdev', 'r/devops', 'r/nextjs', 'r/selfhosted', 'r/programming'];
    keywords = [`${competitors[0].toLowerCase()} alternative`, `switching from ${competitors[2].toLowerCase()}`, `best developer tool for ${brandBase}`, 'bill too high looking for alternative'];
  } else if (lowerContext.includes('ai') || lowerContext.includes('agent') || lowerContext.includes('lead') || lowerContext.includes('sales') || lowerContext.includes('market') || lowerContext.includes('reply')) {
    category = 'AI Growth, Sales & Marketing Automation';
    audience = 'SaaS Founders, Growth Teams, Agencies, B2B Marketers';
    competitors = ['F5Bot', 'Syften', 'Brand24', 'Apollo.io', 'Clay'];
    subreddits = ['r/SaaS', 'r/growthhacking', 'r/indiehackers', 'r/sales', 'r/marketing'];
    keywords = ['find customers on reddit', 'f5bot alternative', 'social listening with buyer intent', 'how to get first 100 saas customers', 'b2b lead generation without cold email'];
  } else if (lowerContext.includes('design') || lowerContext.includes('video') || lowerContext.includes('figma') || lowerContext.includes('ui')) {
    category = 'Design, Creative & UI Tooling';
    audience = 'Product Designers, Creative Directors, Frontend Developers, Agencies';
    competitors = ['Figma', 'Canva', 'Framer', 'Webflow'];
    subreddits = ['r/UI_Design', 'r/web_design', 'r/Design', 'r/indiehackers'];
    keywords = ['faster alternative to figma', 'looking for landing page builder', 'best tool for design handoff'];
  }

  return {
    url: normalizedUrl,
    liveFetched,
    name: title,
    category,
    audience,
    valueProp: description || `${title} helps ${audience.toLowerCase()} eliminate manual bottlenecks and scale faster with automated workflows.`,
    keywords,
    competitors,
    subreddits,
    suggestedDealValue: 490
  };
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function isPublicStaticAsset(pathname) {
  if (pathname.startsWith('/appcook/') || pathname.startsWith('/appcook-') || pathname.startsWith('/static/appcook-fonts/')) {
    return true;
  }
  return pathname === '/ceviri.js' ||
    pathname === '/ceviri/tr.js' ||
    pathname === '/ceviri/en.js' ||
    pathname === '/manifest.json' ||
    pathname === '/favicon.ico';
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8'
};

function serveStaticFile(res, relPath, fallbackFile = null) {
  const resolvedPath = path.normalize(path.join(PUBLIC_DIR, relPath));
  const rel = path.relative(PUBLIC_DIR, resolvedPath);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(resolvedPath, (err, content) => {
    if (err) {
      if (fallbackFile) {
        return fs.readFile(path.join(PUBLIC_DIR, fallbackFile), (err2, fallback) => {
          if (err2) {
            res.writeHead(404);
            return res.end('Not found');
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
          res.end(fallback);
        });
      }
      res.writeHead(404);
      return res.end('Not found');
    }
    const ext = path.extname(resolvedPath).toLowerCase();
    const headers = { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' };
    if (ext === '.html') headers['Cache-Control'] = 'no-store';
    res.writeHead(200, headers);
    res.end(content);
  });
}

function renderFallbackLoginHtml() {
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Giriş · AI-CustomerHunter</title></head><body style="font-family:sans-serif;max-width:420px;margin:60px auto;padding:20px"><h1>AI-CustomerHunter Giriş</h1><form method="post" action="/auth/login"><p><label>Kullanıcı adı<br><input name="username" required></label></p><p><label>Parola<br><input name="password" type="password" required></label></p><button type="submit">Giriş yap</button></form></body></html>`;
}

function parseBodyStrict(req, maxBytes = 64 * 1024) {
  return new Promise((resolve) => {
    let body = '';
    let tooLarge = false;
    req.on('data', chunk => {
      if (tooLarge) return;
      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > maxBytes) {
        tooLarge = true;
      }
    });
    req.on('end', () => {
      if (tooLarge) {
        return resolve({ ok: false, status: 413, error: 'Payload too large' });
      }
      if (!body.trim()) {
        return resolve({ ok: false, status: 400, error: 'Request body is required' });
      }
      try {
        return resolve({ ok: true, data: JSON.parse(body) });
      } catch (e) {
        return resolve({ ok: false, status: 400, error: 'Invalid JSON body' });
      }
    });
    req.on('error', () => {
      resolve({ ok: false, status: 400, error: 'Request stream error' });
    });
  });
}

function createServer(options = {}) {
  const demandSignalService = options.demandSignalService || createDemandSignalService();
  const getInternalToken = typeof options.getInternalToken === 'function'
    ? options.getInternalToken
    : () => process.env.INTERNAL_API_TOKEN || '';

  return http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    // Güvenlik başlıkları
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', pathname === '/onay' ? 'no-referrer' : 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");

    // 1. Sağlık kontrolü (oturumsuz açık)
    if (pathname === '/api/health' && req.method === 'GET') {
      return sendJson(res, 200, { ok: true, status: 'healthy' });
    }

    // 1.5. Dahili Talep Sinyali Ucu (X-Internal-Token korumalı, oturum duvarından önce)
    if (pathname === '/api/internal/demand-signal') {
      if (req.method !== 'POST') {
        return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
      }
      const authCheck = verifyInternalToken(req.headers['x-internal-token'], getInternalToken());
      if (!authCheck.ok) {
        return sendJson(res, authCheck.status, { ok: false, error: authCheck.error });
      }

      const parsedBody = await parseBodyStrict(req);
      if (!parsedBody.ok) {
        return sendJson(res, parsedBody.status, { ok: false, error: parsedBody.error });
      }

      const validated = validateDemandSignalInput(parsedBody.data);
      if (!validated.ok) {
        return sendJson(res, 400, { ok: false, error: validated.error });
      }

      try {
        const result = await demandSignalService.getDemandSignal(validated.value);
        return sendJson(res, 200, result);
      } catch (err) {
        return sendJson(res, 502, { ok: false, error: 'Failed to collect demand signals' });
      }
    }

    // 2. Kimlik doğrulama ve onay rotaları (/auth/*, /api/me, /api/auth/*, /onay, POST /giris, POST /cikis)
    const handledAuth = await auth.handleAuthRoutes(req, res, parsedUrl);
    if (handledAuth !== false) return;

    // 3. Giriş sayfası (GET /giris)
    if (pathname === '/giris' && req.method === 'GET') {
      if (auth.getCurrentUser(req)) {
        res.writeHead(302, { Location: '/', 'Cache-Control': 'no-store' });
        return res.end();
      }
      const girisPath = path.join(PUBLIC_DIR, 'giris.html');
      if (fs.existsSync(girisPath)) {
        return serveStaticFile(res, '/giris.html');
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(renderFallbackLoginHtml());
    }

    // 4. Statik giriş kiti varlıkları (oturumsuz erişilebilir)
    if (req.method === 'GET' && isPublicStaticAsset(pathname)) {
      const mappedPath = pathname.startsWith('/static/appcook-fonts/')
        ? pathname.replace(/^\/static/, '')
        : pathname;
      return serveStaticFile(res, mappedPath);
    }

    // 4.5. Yönetim paneli ve yönetim API rotaları (/yonetim/*, /api/yonetim/*)
    const handledYonetim = await yonetim.handleYonetimRoutes(req, res, parsedUrl, { loadDb });
    if (handledYonetim !== false) return;

    // 5. Korumalı API rotaları
    if (pathname.startsWith('/api/')) {
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') {
        if (!auth.requireSameOrigin(req, res)) return;
      }

      if (pathname === '/api/state' && req.method === 'GET') {
        const user = auth.requireAuth(req, res);
        if (!user) return;
        const lang = translate.normalizeLang(parsedUrl.searchParams.get('lang') || 'tr');
        const db = loadDb();
        return sendJson(res, 200, {
          ...db,
          activeLang: lang,
          translationProvider: translate.getActiveProviderInfo()
        });
      }

      if (pathname === '/api/translate' && req.method === 'POST') {
        const user = auth.requireAuth(req, res);
        if (!user) return;
        const body = await parseBody(req);
        const lang = translate.normalizeLang(body.lang || 'tr');
        const includeReplies = Boolean(body.includeReplies);
        const db = loadDb();

        let targets;
        if (Array.isArray(body.leadIds) && body.leadIds.length > 0) {
          const wanted = new Set(body.leadIds.map(String));
          targets = db.leads.filter(l => wanted.has(l.id)).slice(0, translate.MAX_BATCH);
        } else {
          targets = db.leads
            .filter(l => {
              const entry = l.i18n && l.i18n[lang];
              if (!entry || !entry.title || entry.provider === 'original') return true;
              if (includeReplies && lang === 'tr' && l.replies && (!entry.replies || !entry.replies.helpful)) return true;
              return false;
            })
            .slice(0, translate.MAX_BATCH);
        }

        const batch = await translate.translateLeadsBatch(targets, lang, { includeReplies });
        if (batch.anyChanged) {
          saveDb(db);
        }

        return sendJson(res, 200, {
          ok: true,
          lang,
          translatedCount: batch.results.filter(r => r && r.changed).length,
          results: batch.results.map(r => ({
            leadId: r.leadId,
            provider: r.provider,
            i18n: r.entry
          }))
        });
      }

      if (pathname === '/api/analyze-url' && req.method === 'POST') {
        const user = auth.requireAuth(req, res);
        if (!user) return;
        const body = await parseBody(req);
        try {
          const analysis = await analyzeWebsiteUrl(body.url);
          return sendJson(res, 200, { ok: true, analysis });
        } catch (err) {
          if (err instanceof InvalidUrlError) {
            return sendJson(res, 400, { ok: false, error: err.message });
          }
          throw err;
        }
      }

      if (pathname === '/api/campaigns' && req.method === 'POST') {
        const user = auth.requireAuth(req, res);
        if (!user) return;
        const body = await parseBody(req);
        const lang = translate.normalizeLang(body.lang || 'tr');
        const db = loadDb();
        db.campaigns.forEach(c => { c.active = false; });

        const newCamp = {
          id: `camp-${Date.now()}`,
          name: (body.name || 'New Product Campaign').trim(),
          url: (body.url || 'https://example.com').trim(),
          category: body.category || 'B2B SaaS',
          audience: body.audience || 'Founders & Product Teams',
          valueProp: body.valueProp || 'High-ROI workflow automation for modern teams.',
          keywords: Array.isArray(body.keywords) && body.keywords.length
            ? body.keywords
            : String(body.keywords || 'looking for alternative, best tool for').split(',').map(s => s.trim()).filter(Boolean),
          competitors: Array.isArray(body.competitors) && body.competitors.length
            ? body.competitors
            : String(body.competitors || 'F5Bot, Brand24').split(',').map(s => s.trim()).filter(Boolean),
          subreddits: Array.isArray(body.subreddits) && body.subreddits.length
            ? body.subreddits
            : String(body.subreddits || 'r/SaaS, r/entrepreneur').split(',').map(s => s.trim()).filter(Boolean),
          dealValue: Number(body.dealValue) || 490,
          active: true,
          createdAt: new Date().toISOString()
        };

        db.campaigns.unshift(newCamp);
        const freshLeads = await scanLiveSources(newCamp);
        if (freshLeads.length > 0) {
          await translate.translateLeadsBatch(freshLeads, lang, { includeReplies: lang === 'tr' });
          db.leads = [...freshLeads, ...db.leads];
        }
        saveDb(db);
        return sendJson(res, 201, { ok: true, campaign: newCamp, addedLeads: freshLeads.length, state: db });
      }

      if (pathname === '/api/scan' && req.method === 'POST') {
        const user = auth.requireAuth(req, res);
        if (!user) return;
        const body = await parseBody(req);
        const lang = translate.normalizeLang(body.lang || 'tr');
        const db = loadDb();
        const campaign = db.campaigns.find(c => c.id === body.campaignId) || db.campaigns.find(c => c.active) || db.campaigns[0];
        if (!campaign) {
          return sendJson(res, 400, { ok: false, error: 'Kampanya bulunamadı.' });
        }

        const freshLeads = await scanLiveSources(campaign);
        const existingIds = new Set(db.leads.map(l => l.id));
        const existingUrls = new Set(db.leads.map(l => l.url).filter(Boolean));
        const existingTitles = new Set(db.leads.map(l => l.title).filter(Boolean));

        const uniqueNew = freshLeads.filter(l =>
          l &&
          !existingIds.has(l.id) &&
          (!l.url || !existingUrls.has(l.url)) &&
          (!l.title || !existingTitles.has(l.title))
        );

        if (uniqueNew.length > 0) {
          await translate.translateLeadsBatch(uniqueNew, lang, { includeReplies: lang === 'tr' });
          db.leads = [...uniqueNew, ...db.leads];
          saveDb(db);
          notifier.notifyNewLeads(campaign, uniqueNew, { publicUrl: auth.getBaseUrl(req) })
            .catch(err => console.warn('[telegram] Bildirim gönderilemedi:', err && err.message ? err.message : err));
        }

        return sendJson(res, 200, {
          ok: true,
          scannedSources: ['Reddit JSON API', 'HackerNews Algolia API', 'GitHub Issues API'],
          addedCount: uniqueNew.length,
          message: uniqueNew.length > 0
            ? `${uniqueNew.length} yeni gerçek fırsat bulundu.`
            : 'Şu an yeni bir gerçek fırsat bulunamadı. Kısa süre sonra tekrar deneyebilirsiniz.',
          leads: uniqueNew,
          state: db
        });
      }

      if (pathname.startsWith('/api/leads/') && req.method === 'PUT') {
        const user = auth.requireAuth(req, res);
        if (!user) return;
        const leadId = pathname.replace('/api/leads/', '');
        const body = await parseBody(req);
        if (body.status !== undefined) {
          if (typeof body.status !== 'string' || !VALID_LEAD_STATUSES.has(body.status)) {
            return sendJson(res, 400, { ok: false, error: 'Geçersiz durum değeri.' });
          }
        }
        if (body.tone !== undefined) {
          if (typeof body.tone !== 'string' || !VALID_REPLY_TONES.has(body.tone)) {
            return sendJson(res, 400, { ok: false, error: 'Geçersiz yanıt tonu.' });
          }
        }
        if (body.customReply !== undefined) {
          if (typeof body.customReply !== 'string') {
            return sendJson(res, 400, { ok: false, error: 'Geçersiz yanıt metni.' });
          }
          if (body.customReply.length > MAX_CUSTOM_REPLY_LENGTH) {
            return sendJson(res, 400, { ok: false, error: `Yanıt metni en fazla ${MAX_CUSTOM_REPLY_LENGTH} karakter olabilir.` });
          }
        }
        const db = loadDb();
        const lead = db.leads.find(l => l.id === leadId);
        if (!lead) {
          return sendJson(res, 404, { ok: false, error: 'Fırsat kaydı bulunamadı.' });
        }
        if (body.status !== undefined) lead.status = body.status;
        if (body.customReply !== undefined && body.tone && lead.replies) {
          lead.replies[body.tone] = body.customReply;
        }
        saveDb(db);
        return sendJson(res, 200, { ok: true, lead, state: db });
      }

      if (pathname === '/api/settings' && req.method === 'PUT') {
        const admin = auth.requireAdmin(req, res);
        if (!admin) return;
        const body = await parseBody(req);
        const db = loadDb();
        db.settings = { ...db.settings, ...body };
        saveDb(db);
        return sendJson(res, 200, { ok: true, settings: db.settings });
      }

      // Diğer tüm /api/* yolları: oturum yoksa 401, varsa 404
      const user = auth.requireAuth(req, res);
      if (!user) return;
      return sendJson(res, 404, { ok: false, error: 'API uç noktası bulunamadı.' });
    }

    // 6. Korumalı sayfa ve statik uygulama dosyaları (oturumsuz -> 302 /giris)
    const user = auth.getCurrentUser(req);
    if (!user) {
      res.writeHead(302, { Location: '/giris', 'Cache-Control': 'no-store' });
      return res.end();
    }

    const filePath = pathname === '/' ? '/index.html' : pathname;
    return serveStaticFile(res, filePath, 'index.html');
  } catch (err) {
    console.error('[server] İstek hatası:', err);
    if (!res.headersSent) {
      sendJson(res, 500, { ok: false, error: 'Sunucu hatası.' });
    }
  }
  });
}

const server = createServer();

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n==================================================================`);
    console.log(`🎯 AI-CustomerHunter Server Running`);
    console.log(`🌍 Local URL: http://localhost:${PORT}`);
    console.log(`📡 Live Radar: Reddit + HackerNews + GitHub Buyer-Intent Engine`);
    console.log(`==================================================================\n`);
  });
}

module.exports = {
  server,
  createServer,
  loadDb,
  saveDb,
  scanLiveSources,
  syncPortfolioDb,
  analyzeWebsiteUrl,
  isPrivateIp,
  assertSafePublicUrl
};
