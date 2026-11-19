'use strict';

const store = require('./store');
const mailer = require('./mailer');

const SUPPORTED_LANGS = new Set(['tr', 'en']);
const MAX_BATCH = 10;
const CONCURRENCY = 2;
const MYMEMORY_MAX_BYTES = 450;

const INTENT_LABEL_TR = {
  'Competitor Churn Signal': 'Rakip Değiştirme Sinyali',
  'Active Tool Request': 'Aktif Araç Arayışı',
  'Budget-Ready Buyer': 'Bütçesi Hazır Alıcı',
  'Workflow Pain Point': 'İş Akışı Sorunu',
  'Urgent Competitor Switch': 'Acil Rakip Değişimi',
  'Jira/Trello Churn + Telegram Workflow': 'Jira/Trello Değişimi + Telegram İş Akışı',
  'Active Team Kanban Buyer': 'Aktif Ekip Kanban Alıcısı',
  'Otter.ai Switcher + PPTX Need': 'Otter.ai Değişimi + Sunum İhtiyacı',
  'Architecture Diagram Buyer': 'Mimari Diyagram Alıcısı',
  'Workspace + Document AI Buyer': 'Ofis + Doküman YZ Alıcısı',
  'SOC Malware Triage Buyer': 'SOC Zararlı Analiz Alıcısı',
  'EdTech Study Coach Buyer': 'Eğitim / Sınav Koçu Alıcısı',
  'Moveworks Alternative Buyer': 'Moveworks Alternatifi Alıcısı',
  'Smart Grocery Optimizer User': 'Akıllı Market Sepeti Kullanıcısı'
};

const INTENT_LABEL_EN = Object.fromEntries(
  Object.entries(INTENT_LABEL_TR).map(([en, tr]) => [tr, en])
);

const TURKISH_STOP_WORDS = /\b(ve|bir|için|ile|ama|fakat|nasıl|neden|hangi|istiyorum|arıyorum|kullanıyoruz|ürün|müşteri|ekip|uygulama|çözüm|öneri|alternatif|ücretsiz|aylık|yıllık|yardım)\b/gi;
const ENGLISH_STOP_WORDS = /\b(the|and|for|with|looking|alternative|tool|team|software|recommend|anyone|using|need|want|best|switch|from|that|this|what|how)\b/gi;

function normalizeLang(lang) {
  const l = String(lang || 'tr').trim().toLowerCase().slice(0, 2);
  return SUPPORTED_LANGS.has(l) ? l : 'tr';
}

function detectLanguage(text) {
  const s = String(text || '').trim();
  if (!s) return 'en';
  const trChars = (s.match(/[ğüşöçıİĞÜŞÖÇ]/g) || []).length;
  const trWords = (s.match(TURKISH_STOP_WORDS) || []).length;
  const enWords = (s.match(ENGLISH_STOP_WORDS) || []).length;

  if (trChars >= 2 || (trChars >= 1 && trWords >= 1) || trWords >= 3) {
    if (enWords < trWords * 2) return 'tr';
  }
  return 'en';
}

function translateIntentLabel(label, targetLang) {
  const s = String(label || '').trim();
  if (!s) return '';
  if (targetLang === 'tr') return INTENT_LABEL_TR[s] || s;
  return INTENT_LABEL_EN[s] || s;
}

function splitTextByBytes(text, maxBytes = MYMEMORY_MAX_BYTES) {
  const str = String(text || '').trim();
  if (!str) return [];
  if (Buffer.byteLength(str, 'utf8') <= maxBytes) return [str];

  // Cümlelere böl, sığmazsa kelime bazlı böl
  const sentences = str.split(/(?<=[.!?])\s+|\n+/);
  const chunks = [];
  let current = '';

  const pushCurrent = () => {
    if (current.trim()) chunks.push(current.trim());
    current = '';
  };

  for (const sentence of sentences) {
    if (!sentence) continue;
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (Buffer.byteLength(candidate, 'utf8') <= maxBytes) {
      current = candidate;
      continue;
    }
    if (current) pushCurrent();
    if (Buffer.byteLength(sentence, 'utf8') <= maxBytes) {
      current = sentence;
      continue;
    }
    // Çok uzun tek cümleyi kelime kelime böl
    const words = sentence.split(/\s+/);
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (Buffer.byteLength(next, 'utf8') <= maxBytes) {
        current = next;
      } else {
        if (current) pushCurrent();
        // Tek kelime bile sınırı aşıyorsa güvenli kırp
        if (Buffer.byteLength(word, 'utf8') > maxBytes) {
          let slice = word;
          while (Buffer.byteLength(slice, 'utf8') > maxBytes && slice.length > 1) {
            slice = slice.slice(0, Math.floor(slice.length * 0.8));
          }
          chunks.push(slice);
        } else {
          current = word;
        }
      }
    }
  }
  pushCurrent();
  return chunks;
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function getAiConfig(override = null) {
  if (override) {
    return {
      provider: String(override.aiProvider || 'none').trim().toLowerCase(),
      apiKey: String(override.aiApiKey || '').trim(),
      model: String(override.aiModel || '').trim(),
      baseUrl: String(override.aiBaseUrl || '').trim().replace(/\/+$/, ''),
      mymemoryEmail: String(override.mymemoryEmail || '').trim()
    };
  }
  return {
    provider: store.getSetting('aiProvider').toLowerCase(),
    apiKey: store.getSetting('aiApiKey'),
    model: store.getSetting('aiModel'),
    baseUrl: store.getSetting('aiBaseUrl').replace(/\/+$/, ''),
    mymemoryEmail: store.getSetting('mymemoryEmail')
  };
}

function getMyMemoryEmail(cfg) {
  if (cfg && cfg.mymemoryEmail) return cfg.mymemoryEmail;
  const smtpFrom = store.getSetting('smtpFrom');
  if (smtpFrom && smtpFrom.includes('@')) return smtpFrom;
  const admins = mailer.getNotifyAddresses();
  return admins.find(e => e.includes('@')) || '';
}

function extractJsonObject(rawText) {
  const s = String(rawText || '').trim();
  if (!s) return null;
  const cleaned = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------- 2. Katman: LLM API

async function translatePayloadWithLlm(payloadObj, targetLang, cfg) {
  if (!cfg || !cfg.apiKey || !cfg.provider || cfg.provider === 'none') {
    return null;
  }

  const targetName = targetLang === 'tr' ? 'Turkish' : 'English';
  const systemPrompt = `You are a professional B2B sales translator. Translate all string values in the input JSON naturally into ${targetName}. Keep product names, brand names, URLs, subreddit names (r/...), and JSON keys unchanged. Return ONLY valid JSON with the exact same keys.`;
  const userPrompt = JSON.stringify(payloadObj);

  if (cfg.provider === 'anthropic') {
    const model = cfg.model || 'claude-haiku-4-5';
    const url = `${cfg.baseUrl || 'https://api.anthropic.com'}/v1/messages`;
    const resp = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': cfg.apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    }, 15000);
    if (!resp.ok) throw new Error(`Anthropic HTTP ${resp.status}`);
    const data = await resp.json();
    const text = (data.content && data.content[0] && data.content[0].text) || '';
    const parsed = extractJsonObject(text);
    if (!parsed) throw new Error('Anthropic JSON yanıtı ayrıştırılamadı');
    return { translated: parsed, provider: 'anthropic' };
  }

  if (cfg.provider === 'openai') {
    const model = cfg.model || 'gpt-4o-mini';
    const base = cfg.baseUrl || 'https://api.openai.com/v1';
    const url = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`;
    const resp = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${cfg.apiKey}`
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    }, 15000);
    if (!resp.ok) throw new Error(`OpenAI HTTP ${resp.status}`);
    const data = await resp.json();
    const text = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
    const parsed = extractJsonObject(text);
    if (!parsed) throw new Error('OpenAI JSON yanıtı ayrıştırılamadı');
    return { translated: parsed, provider: 'openai' };
  }

  if (cfg.provider === 'gemini') {
    const model = cfg.model || 'gemini-3.5-flash-lite';
    const base = cfg.baseUrl || 'https://generativelanguage.googleapis.com/v1beta';
    const url = `${base}/models/${encodeURIComponent(model)}:generateContent`;
    const resp = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': cfg.apiKey
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
      })
    }, 15000);
    if (!resp.ok) throw new Error(`Gemini HTTP ${resp.status}`);
    const data = await resp.json();
    const text = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts && data.candidates[0].content.parts[0] && data.candidates[0].content.parts[0].text) || '';
    const parsed = extractJsonObject(text);
    if (!parsed) throw new Error('Gemini JSON yanıtı ayrıştırılamadı');
    return { translated: parsed, provider: 'gemini' };
  }

  return null;
}

// ---------------------------------------------------------------- 3. Katman: MyMemory Resmi Ücretsiz API

async function translateChunkMyMemory(chunk, sourceLang, targetLang, email) {
  const params = new URLSearchParams({
    q: chunk,
    langpair: `${sourceLang}|${targetLang}`
  });
  if (email) params.set('de', email);

  const resp = await fetchWithTimeout(`https://api.mymemory.translated.net/get?${params.toString()}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' }
  }, 8000);

  if (!resp.ok) {
    throw new Error(`MyMemory HTTP ${resp.status}`);
  }
  const data = await resp.json();
  if (Number(data.responseStatus) === 429 || /MYMEMORY WARNING/i.test(String(data.responseDetails || ''))) {
    throw new Error('MyMemory günlük kotası doldu (429)');
  }
  const out = data && data.responseData && data.responseData.translatedText;
  if (!out || typeof out !== 'string') {
    throw new Error('MyMemory boş yanıt döndü');
  }
  return out;
}

async function translateTextMyMemory(text, targetLang, cfg) {
  const str = String(text || '').trim();
  if (!str) return '';
  const sourceLang = detectLanguage(str);
  if (sourceLang === targetLang) return str;

  const email = getMyMemoryEmail(cfg);
  const chunks = splitTextByBytes(str, MYMEMORY_MAX_BYTES);
  const translatedChunks = [];
  for (const chunk of chunks) {
    const t = await translateChunkMyMemory(chunk, sourceLang, targetLang, email);
    translatedChunks.push(t);
  }
  return translatedChunks.join(' ');
}

// ---------------------------------------------------------------- Lead Çeviri Orkestrasyonu

function hasValidCache(lead, lang, needReplies) {
  const entry = lead && lead.i18n && lead.i18n[lang];
  if (!entry || !entry.title) return false;
  if (entry.provider === 'original') return false;
  if (needReplies && lead.replies && (!entry.replies || !entry.replies.helpful)) {
    return false;
  }
  return true;
}

function buildOriginalView(lead, lang) {
  return {
    title: lead.title || '',
    snippet: lead.snippet || '',
    whyHot: lead.whyHot || '',
    intentLabel: translateIntentLabel(lead.intentLabel, lang),
    replies: lead.replies ? { ...lead.replies } : undefined,
    provider: 'original',
    translatedAt: null
  };
}

async function translateLead(lead, targetLang = 'tr', { includeReplies = false, cfgOverride = null } = {}) {
  const lang = normalizeLang(targetLang);
  if (!lead || typeof lead !== 'object') return null;

  const needReplies = Boolean(includeReplies && lang === 'tr' && lead.replies);

  // 1. Katman: Kalıcı önbellek
  if (hasValidCache(lead, lang, needReplies)) {
    return { entry: lead.i18n[lang], changed: false, provider: lead.i18n[lang].provider || 'cache' };
  }

  // Hızlı dil algılama: metin zaten hedef dildeyse dış API'ye gitme
  const combinedText = `${lead.title || ''} ${lead.snippet || ''}`;
  const detected = detectLanguage(combinedText);
  if (detected === lang && !needReplies) {
    const entry = {
      title: lead.title || '',
      snippet: lead.snippet || '',
      whyHot: lead.whyHot || '',
      intentLabel: translateIntentLabel(lead.intentLabel, lang),
      replies: lead.replies ? { ...lead.replies } : undefined,
      provider: 'native',
      translatedAt: new Date().toISOString()
    };
    lead.i18n = lead.i18n || {};
    lead.i18n[lang] = entry;
    return { entry, changed: true, provider: 'native' };
  }

  const cfg = getAiConfig(cfgOverride);
  const existingEntry = (lead.i18n && lead.i18n[lang] && lead.i18n[lang].provider !== 'original')
    ? lead.i18n[lang]
    : null;

  const toTranslate = {};
  if (!existingEntry || !existingEntry.title) {
    toTranslate.title = lead.title || '';
    toTranslate.snippet = lead.snippet || '';
    toTranslate.whyHot = lead.whyHot || '';
  }
  if (needReplies && (!existingEntry || !existingEntry.replies || !existingEntry.replies.helpful)) {
    toTranslate.replies = {
      helpful: lead.replies.helpful || '',
      founder: lead.replies.founder || '',
      comparison: lead.replies.comparison || ''
    };
  }

  // 2. Katman: LLM API
  if (cfg.apiKey && cfg.provider && cfg.provider !== 'none') {
    try {
      const llmRes = await translatePayloadWithLlm(toTranslate, lang, cfg);
      if (llmRes && llmRes.translated) {
        const t = llmRes.translated;
        const entry = {
          title: t.title || (existingEntry && existingEntry.title) || lead.title || '',
          snippet: t.snippet || (existingEntry && existingEntry.snippet) || lead.snippet || '',
          whyHot: t.whyHot || (existingEntry && existingEntry.whyHot) || lead.whyHot || '',
          intentLabel: translateIntentLabel(lead.intentLabel, lang),
          replies: (t.replies && typeof t.replies === 'object')
            ? {
                helpful: t.replies.helpful || (lead.replies && lead.replies.helpful) || '',
                founder: t.replies.founder || (lead.replies && lead.replies.founder) || '',
                comparison: t.replies.comparison || (lead.replies && lead.replies.comparison) || ''
              }
            : (existingEntry && existingEntry.replies) || undefined,
          provider: llmRes.provider,
          translatedAt: new Date().toISOString()
        };
        lead.i18n = lead.i18n || {};
        lead.i18n[lang] = entry;
        return { entry, changed: true, provider: llmRes.provider };
      }
    } catch (err) {
      console.warn(`[translate] LLM (${cfg.provider}) hatası, MyMemory'ye düşülüyor:`, err.message);
    }
  }

  // 3. Katman: MyMemory Resmi Ücretsiz API
  try {
    const title = toTranslate.title !== undefined
      ? await translateTextMyMemory(toTranslate.title, lang, cfg)
      : (existingEntry && existingEntry.title) || lead.title || '';
    const snippet = toTranslate.snippet !== undefined
      ? await translateTextMyMemory(toTranslate.snippet, lang, cfg)
      : (existingEntry && existingEntry.snippet) || lead.snippet || '';
    const whyHot = toTranslate.whyHot !== undefined
      ? await translateTextMyMemory(toTranslate.whyHot, lang, cfg)
      : (existingEntry && existingEntry.whyHot) || lead.whyHot || '';

    let replies = existingEntry && existingEntry.replies ? { ...existingEntry.replies } : undefined;
    if (toTranslate.replies) {
      replies = {
        helpful: await translateTextMyMemory(toTranslate.replies.helpful, lang, cfg),
        founder: await translateTextMyMemory(toTranslate.replies.founder, lang, cfg),
        comparison: await translateTextMyMemory(toTranslate.replies.comparison, lang, cfg)
      };
    }

    const entry = {
      title,
      snippet,
      whyHot,
      intentLabel: translateIntentLabel(lead.intentLabel, lang),
      replies,
      provider: 'mymemory',
      translatedAt: new Date().toISOString()
    };
    lead.i18n = lead.i18n || {};
    lead.i18n[lang] = entry;
    return { entry, changed: true, provider: 'mymemory' };
  } catch (err) {
    console.warn('[translate] MyMemory hatası, orijinal metin korunuyor:', err.message);
  }

  // 4. Katman: Orijinal metin (kalıcı önbelleğe yazılmaz ki sonraki denemede tekrar çevrilebilsin)
  return { entry: buildOriginalView(lead, lang), changed: false, provider: 'original' };
}

async function translateLeadsBatch(leads, targetLang = 'tr', { includeReplies = false, maxCount = MAX_BATCH, concurrency = CONCURRENCY } = {}) {
  const lang = normalizeLang(targetLang);
  const targets = (Array.isArray(leads) ? leads : []).slice(0, Math.min(maxCount, MAX_BATCH));
  const results = [];
  let anyChanged = false;

  let cursor = 0;
  const worker = async () => {
    while (cursor < targets.length) {
      const idx = cursor++;
      const lead = targets[idx];
      const res = await translateLead(lead, lang, { includeReplies });
      if (res && res.changed) anyChanged = true;
      results[idx] = { leadId: lead.id, ...(res || {}) };
    }
  };

  const workers = [];
  const count = Math.min(concurrency, targets.length);
  for (let i = 0; i < count; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  return { lang, results, anyChanged };
}

async function testTranslation(sampleText, targetLang = 'tr', cfgOverride = null) {
  const lang = normalizeLang(targetLang);
  const text = String(sampleText || 'Looking for a lightweight alternative to Jira for our 10-person team.').trim();
  const cfg = getAiConfig(cfgOverride);
  const started = Date.now();

  if (cfg.apiKey && cfg.provider && cfg.provider !== 'none') {
    const llmRes = await translatePayloadWithLlm({ text }, lang, cfg);
    if (llmRes && llmRes.translated && llmRes.translated.text) {
      return {
        ok: true,
        provider: llmRes.provider,
        translatedText: llmRes.translated.text,
        durationMs: Date.now() - started
      };
    }
  }

  const translatedText = await translateTextMyMemory(text, lang, cfg);
  return {
    ok: true,
    provider: 'mymemory',
    translatedText,
    durationMs: Date.now() - started
  };
}

function getActiveProviderInfo() {
  const cfg = getAiConfig();
  if (cfg.apiKey && cfg.provider && cfg.provider !== 'none') {
    return { provider: cfg.provider, model: cfg.model || 'varsayılan', mode: 'llm' };
  }
  return { provider: 'mymemory', model: 'Ücretsiz API (50k/gün)', mode: 'free' };
}

module.exports = {
  SUPPORTED_LANGS,
  MAX_BATCH,
  CONCURRENCY,
  MYMEMORY_MAX_BYTES,
  normalizeLang,
  detectLanguage,
  translateIntentLabel,
  splitTextByBytes,
  translateLead,
  translateLeadsBatch,
  testTranslation,
  getActiveProviderInfo
};
