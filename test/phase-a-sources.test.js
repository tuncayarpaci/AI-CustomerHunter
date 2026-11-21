'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { fetchStackExchangeSignals, resetBackoff } = require('../lib/sources/stackexchange');
const { fetchAppStoreSignals, clearAppStoreCache } = require('../lib/sources/appstore');
const { parseXmlFeed, fetchRssSourceSignals, clearRssCache } = require('../lib/sources/rss-feeds');
const { fetchBlueskySignals, clearBlueskySession } = require('../lib/sources/bluesky');
const {
  validateDemandSignalInput,
  classifyRealSignal,
  scanRealSourcesForDemand
} = require('../lib/demand-signal');
const { scanLiveSourcesDetailed } = require('../server');

function makeJsonRes(payload, status = 200, headersMap = {}) {
  const headers = new Map(
    Object.entries(headersMap).map(([k, v]) => [k.toLowerCase(), v])
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers.get(String(name).toLowerCase()) || null },
    async json() { return payload; },
    async text() { return JSON.stringify(payload); }
  };
}

function makeTextRes(text, status = 200, headersMap = {}) {
  const headers = new Map(
    Object.entries(headersMap).map(([k, v]) => [k.toLowerCase(), v])
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => headers.get(String(name).toLowerCase()) || null },
    async text() { return text; }
  };
}

test('FA-01 StackExchange: softwarerecs + stackoverflow, API key, backoff ve KVKK owner yokluğu', async () => {
  resetBackoff();
  const seenUrls = [];
  let nowMs = 1_700_000_000_000;

  const mockFetch = async (url) => {
    seenUrls.push(url);
    if (url.includes('site=softwarerecs')) {
      return makeJsonRes({
        items: [
          {
            question_id: 101,
            title: 'Looking for self-hosted alternative to Jira?',
            link: 'https://softwarerecs.stackexchange.com/questions/101/jira-alt',
            creation_date: Math.floor(nowMs / 1000) - 3600,
            tags: ['project-management', 'self-hosted'],
            owner: {
              user_id: 9999,
              display_name: 'SecretAuthorName',
              link: 'https://softwarerecs.stackexchange.com/users/9999/secret'
            }
          }
        ],
        backoff: 15,
        quota_remaining: 250
      });
    }
    if (url.includes('site=stackoverflow')) {
      return makeJsonRes({
        items: [
          {
            question_id: 202,
            title: 'Migrate from Jira to lightweight kanban API — contact dev@secret.io',
            link: 'https://stackoverflow.com/questions/202/migrate-jira',
            creation_date: Math.floor(nowMs / 1000) - 7200,
            tags: ['kanban', 'jira'],
            owner: {
              user_id: 8888,
              display_name: 'AnotherPrivateUser'
            }
          }
        ],
        quota_remaining: 249
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const res = await fetchStackExchangeSignals(
    { keywords: ['kanban tool'], competitors: ['Jira'] },
    { fetchImpl: mockFetch, apiKey: 'test-se-secret-key', now: () => nowMs }
  );

  assert.equal(res.status, 'ok');
  assert.equal(res.count, 2);
  assert.equal(seenUrls.length, 2);
  assert.ok(seenUrls.every(u => u.includes('key=test-se-secret-key')));

  // KVKK: owner adı/ID'si ve e-posta sızmamalı; API key yanıt içinde olmamalı
  const serialized = JSON.stringify(res);
  assert.equal(serialized.includes('SecretAuthorName'), false);
  assert.equal(serialized.includes('AnotherPrivateUser'), false);
  assert.equal(serialized.includes('owner'), false);
  assert.equal(serialized.includes('dev@secret.io'), false);
  assert.equal(serialized.includes('test-se-secret-key'), false);

  // Backoff aktifken (15 sn içinde) yeni HTTP isteği atılmamalı
  nowMs += 5000;
  const resBackoff = await fetchStackExchangeSignals(
    { keywords: ['kanban tool'] },
    { fetchImpl: mockFetch, now: () => nowMs }
  );
  assert.equal(seenUrls.length, 2);
  assert.equal(resBackoff.count, 0);
  assert.equal(resBackoff.reason, 'backoff');

  resetBackoff();
});

test('FA-02 App Store TR/US: yalnız 1-3★ yorumlar, KVKK author=0, PII maskeleme ve 30 dk LRU önbellek', async () => {
  clearAppStoreCache();
  let fetchCount = 0;
  let nowMs = 1_700_000_000_000;

  const mockFetch = async (url) => {
    fetchCount += 1;
    if (url.includes('itunes.apple.com/search')) {
      return makeJsonRes({
        results: [
          {
            trackId: 123456,
            trackName: 'TaskPro TR',
            trackViewUrl: 'https://apps.apple.com/tr/app/taskpro/id123456',
            primaryGenreName: 'Productivity'
          }
        ]
      });
    }
    if (url.includes('/tr/rss/customerreviews/page=1/id=123456/sortby=mostrecent/json')) {
      return makeJsonRes({
        feed: {
          entry: [
            {
              title: { label: 'Çok pahalı abonelik' },
              content: { label: 'Aylık abonelik çok pahalı, dışa aktarım çalışmıyor. Ulaşın: ali.veli@example.com 0532 123 45 67' },
              'im:rating': { label: '1' },
              updated: { label: '2026-11-20T10:00:00Z' },
              author: {
                name: { label: 'GercekKullaniciAdi123' },
                uri: { label: 'https://itunes.apple.com/tr/reviews/id999999' }
              }
            },
            {
              title: { label: 'Eksik Türkçe destek' },
              content: { label: 'Uygulama kilitleniyor ve alternatif arıyorum.' },
              'im:rating': { label: '3' },
              updated: { label: '2026-11-20T09:00:00Z' },
              author: { name: { label: 'BaskaKullanici456' } }
            },
            {
              title: { label: 'Harika uygulama!' },
              content: { label: 'Çok beğendim 5 yıldız.' },
              'im:rating': { label: '5' },
              updated: { label: '2026-11-20T08:00:00Z' },
              author: { name: { label: 'MutluKullanici' } }
            },
            {
              title: { label: 'Gayet iyi' },
              content: { label: '4 yıldız verdim.' },
              'im:rating': { label: '4' },
              updated: { label: '2026-11-20T07:00:00Z' },
              author: { name: { label: 'DortYildiz' } }
            }
          ]
        }
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const res1 = await fetchAppStoreSignals(
    { keywords: ['görev yönetimi'], competitors: ['TaskPro'] },
    'tr',
    { fetchImpl: mockFetch, now: () => nowMs }
  );

  assert.equal(res1.status, 'ok');
  assert.equal(res1.count, 2);
  assert.equal(fetchCount, 2); // 1 search + 1 reviews

  // Sadece 1-3★ kalmalı, 4-5★ tamamen elenmeli
  for (const item of res1.items) {
    assert.ok(item.rating >= 1 && item.rating <= 3);
    assert.equal(item.source, 'appstore_tr');
    assert.equal(item.country, 'TR');
    assert.equal('author' in item, false, 'KVKK: author alanı kesinlikle bulunmamalı');
  }

  // KVKK: yazar adı, profil URL, e-posta ve telefon sızıntısı = 0
  const serialized = JSON.stringify(res1);
  assert.equal(serialized.includes('GercekKullaniciAdi123'), false);
  assert.equal(serialized.includes('BaskaKullanici456'), false);
  assert.equal(serialized.includes('id999999'), false);
  assert.equal(serialized.includes('ali.veli@example.com'), false);
  assert.equal(serialized.includes('0532 123 45 67'), false);
  assert.ok(serialized.includes('[maskelendi]'));

  // Türkçe niyet sınıflandırma doğrulaması
  const cls = classifyRealSignal(
    'Aylık abonelik çok pahalı, Excel dışa aktarım çalışmıyor',
    new Date(nowMs).toISOString(),
    { keywords: ['abonelik', 'dışa aktarım'], competitors: [] },
    nowMs
  );
  assert.equal(cls.intent_type, 'competitor_churn');
  assert.ok(cls.score >= 50);

  // 30 dk içinde ikinci çağrı önbellekten dönmeli (sıfır ek HTTP çağrısı)
  nowMs += 10 * 60 * 1000;
  const res2 = await fetchAppStoreSignals(
    { keywords: ['görev yönetimi'], competitors: ['TaskPro'] },
    'tr',
    { fetchImpl: mockFetch, now: () => nowMs }
  );
  assert.equal(fetchCount, 2);
  assert.equal(res2.count, 2);

  clearAppStoreCache();
});

test('FA-03 RSS Feeds: Atom/RSS2 ayrıştırma, XXE/KVKK güvenliği, 30 dk önbellek ve 304 desteği', async () => {
  clearRssCache();
  let nowMs = 1_700_000_000_000;
  let fetchCalls = 0;

  const atomXml = `<?xml version="1.0" encoding="UTF-8"?>
  <!DOCTYPE feed [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
  <feed xmlns="http://www.w3.org/2005/Atom">
    <entry>
      <title><![CDATA[FlowPilot — Open Source Workflow Automation]]></title>
      <link rel="alternate" href="https://www.producthunt.com/posts/flowpilot" />
      <summary>Automate &amp; simplify workflow tasks without Zapier.</summary>
      <author><name>SecretMakerName</name></author>
      <published>2026-11-20T12:00:00Z</published>
    </entry>
  </feed>`;

  const technopatRss = `<?xml version="1.0" encoding="UTF-8"?>
  <rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">
    <channel>
      <item>
        <title>Ücretsiz görev yönetimi yazılımı önerisi arıyorum</title>
        <link>https://www.technopat.net/sosyal/konu/gorev-yonetimi.12345/</link>
        <description><![CDATA[Trello çok pahalı oldu, iletişim test@mail.com.]]></description>
        <dc:creator>TechnopatRumuz99</dc:creator>
        <pubDate>Thu, 20 Nov 2026 11:00:00 +0000</pubDate>
      </item>
    </channel>
  </rss>`;

  const parsedAtom = parseXmlFeed(atomXml, 'producthunt', 'global');
  assert.equal(parsedAtom.length, 1);
  assert.equal(parsedAtom[0].url, 'https://www.producthunt.com/posts/flowpilot');
  assert.equal(JSON.stringify(parsedAtom).includes('SecretMakerName'), false);

  const mockFetch = async (url, opts) => {
    fetchCalls += 1;
    if (url.includes('technopat.net')) {
      if (opts && opts.headers && opts.headers['If-None-Match'] === '"tp-etag-1"') {
        return makeTextRes('', 304);
      }
      return makeTextRes(technopatRss, 200, { ETag: '"tp-etag-1"' });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const res1 = await fetchRssSourceSignals(
    'technopat_tr',
    { keywords: ['görev yönetimi'], competitors: ['Trello'] },
    { fetchImpl: mockFetch, now: () => nowMs }
  );
  assert.equal(res1.status, 'ok');
  assert.equal(res1.count, 1);
  assert.equal(fetchCalls, 1);
  const serialized = JSON.stringify(res1);
  assert.equal(serialized.includes('TechnopatRumuz99'), false);
  assert.equal(serialized.includes('test@mail.com'), false);
  assert.ok(serialized.includes('[maskelendi]'));

  // 30 dk içinde tekrar çekilmemeli
  nowMs += 15 * 60 * 1000;
  const res2 = await fetchRssSourceSignals(
    'technopat_tr',
    { keywords: ['görev yönetimi'] },
    { fetchImpl: mockFetch, now: () => nowMs }
  );
  assert.equal(fetchCalls, 1);
  assert.equal(res2.count, 1);

  // 31 dk sonra ETag ile 304 Not Modified gelince önbellek korunmalı
  nowMs += 20 * 60 * 1000;
  const res3 = await fetchRssSourceSignals(
    'technopat_tr',
    { keywords: ['görev yönetimi'] },
    { fetchImpl: mockFetch, now: () => nowMs }
  );
  assert.equal(fetchCalls, 2);
  assert.equal(res3.count, 1);

  clearRssCache();
});

test('FA-03 Bluesky: unconfigured sıfır HTTP çağrısı & configured oturum + KVKK author yokluğu', async () => {
  clearBlueskySession();
  let calls = 0;
  const failIfCalled = async () => {
    calls += 1;
    throw new Error('Must not call network when unconfigured');
  };

  const unconf = await fetchBlueskySignals(
    { keywords: ['workflow'] },
    { handle: '', appPassword: '', fetchImpl: failIfCalled }
  );
  assert.deepEqual(unconf, { status: 'unconfigured', count: 0, items: [] });
  assert.equal(calls, 0);

  let sessionCalls = 0;
  let searchCalls = 0;
  let nowMs = 1_700_000_000_000;
  const mockFetch = async (url, opts) => {
    if (url.includes('com.atproto.server.createSession')) {
      sessionCalls += 1;
      return makeJsonRes({ accessJwt: `jwt-token-${sessionCalls}` });
    }
    if (url.includes('app.bsky.feed.searchPosts')) {
      searchCalls += 1;
      assert.equal(opts.headers.Authorization, `Bearer jwt-token-${sessionCalls}`);
      return makeJsonRes({
        posts: [
          {
            uri: 'at://did:plc:abc123xyz/app.bsky.feed.post/3kpost99',
            author: {
              did: 'did:plc:abc123xyz',
              handle: 'privateuser.bsky.social',
              displayName: 'Private Display Name',
              avatar: 'https://cdn.bsky.app/avatar.jpg'
            },
            record: {
              text: 'Looking for a fast alternative to Zapier for workflow automation! mail@test.org',
              createdAt: '2026-11-20T14:00:00Z'
            }
          }
        ]
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const res1 = await fetchBlueskySignals(
    { keywords: ['workflow automation'] },
    { handle: 'bot.bsky.social', appPassword: 'app-password', fetchImpl: mockFetch, now: () => nowMs }
  );
  assert.equal(res1.status, 'ok');
  assert.equal(res1.count, 1);
  assert.equal(sessionCalls, 1);
  assert.equal(searchCalls, 1);
  assert.equal('author' in res1.items[0], false);
  const ser = JSON.stringify(res1);
  assert.equal(ser.includes('privateuser.bsky.social'), false);
  assert.equal(ser.includes('Private Display Name'), false);
  assert.equal(ser.includes('mail@test.org'), false);

  // 45 dk içinde ikinci çağrıda createSession tekrar çağrılmamalı
  nowMs += 20 * 60 * 1000;
  await fetchBlueskySignals(
    { keywords: ['workflow automation'] },
    { handle: 'bot.bsky.social', appPassword: 'app-password', fetchImpl: mockFetch, now: () => nowMs }
  );
  assert.equal(sessionCalls, 1);
  assert.equal(searchCalls, 2);

  clearBlueskySession();
});

test('FA-04 Orkestrasyon: name/repo_name geriye dönük uyumluluk, tüm 10 kaynak ve max 3 anonim sample_posts', async () => {
  resetBackoff();
  clearAppStoreCache();
  clearRssCache();
  clearBlueskySession();

  // name alanı repo_name olarak kabul edilmeli
  const v = validateDemandSignalInput({ name: 'acme/legacy-client', keywords: ['workflow tool'] });
  assert.equal(v.ok, true);
  assert.equal(v.value.repo_name, 'acme/legacy-client');

  const nowSec = Math.floor(Date.now() / 1000);
  const mockFetch = async (url) => {
    if (url.includes('reddit.com')) {
      return makeJsonRes({
        data: {
          children: [
            {
              data: {
                title: 'Switching from Zapier to self-hosted workflow tool?',
                selftext: 'Too expensive.',
                permalink: '/r/SaaS/comments/1/zapier_alt/',
                created_utc: nowSec - 1000
              }
            }
          ]
        }
      });
    }
    if (url.includes('hn.algolia.com')) {
      return makeJsonRes({ hits: [] });
    }
    if (url.includes('api.github.com')) {
      return makeJsonRes({ items: [] });
    }
    if (url.includes('api.stackexchange.com')) {
      return makeJsonRes({
        items: [
          {
            question_id: 501,
            title: 'Best workflow tool recommendation under $20/mo?',
            link: 'https://softwarerecs.stackexchange.com/questions/501/workflow',
            creation_date: nowSec - 2000,
            tags: ['workflow'],
            owner: { display_name: 'HiddenSEUser' }
          }
        ]
      });
    }
    if (url.includes('itunes.apple.com/search')) {
      return makeJsonRes({
        results: [
          {
            trackId: 777,
            trackName: 'ZapierApp',
            trackViewUrl: 'https://apps.apple.com/tr/app/zapier/id777'
          }
        ]
      });
    }
    if (url.includes('itunes.apple.com/tr/rss/customerreviews')) {
      return makeJsonRes({
        feed: {
          entry: [
            {
              title: { label: 'Çok pahalı' },
              content: { label: 'Abonelik çok pahalı, alternatif workflow tool arıyorum.' },
              'im:rating': { label: '1' },
              updated: { label: new Date().toISOString() },
              author: { name: { label: 'HiddenAppleUser' } }
            }
          ]
        }
      });
    }
    if (url.includes('itunes.apple.com/us/rss/customerreviews')) {
      return makeJsonRes({ feed: { entry: [] } });
    }
    if (url.includes('producthunt.com/feed')) {
      return makeTextRes(`<feed><entry><title>New Workflow Tool Launch</title><link href="https://www.producthunt.com/posts/wf-tool"/><summary>Alternative to Zapier</summary><published>${new Date().toISOString()}</published></entry></feed>`);
    }
    if (url.includes('webrazzi.com/feed')) {
      return makeTextRes('<rss><channel></channel></rss>');
    }
    if (url.includes('technopat.net')) {
      return makeTextRes('<rss><channel></channel></rss>');
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const result = await scanRealSourcesForDemand(
    {
      repo_name: 'acme/flow',
      keywords: ['workflow tool'],
      competitors: ['Zapier'],
      category: 'Automation',
      region: 'all',
      sources: null
    },
    { fetchImpl: mockFetch }
  );

  const expectedSources = [
    'reddit', 'hackernews', 'github', 'stackexchange',
    'appstore_tr', 'appstore_us', 'producthunt',
    'webrazzi_tr', 'technopat_tr', 'bluesky'
  ];
  for (const key of expectedSources) {
    assert.ok(result.sources[key], `Missing source key: ${key}`);
    assert.ok(['ok', 'error', 'unconfigured'].includes(result.sources[key].status));
    assert.equal(typeof result.sources[key].count, 'number');
  }

  assert.equal(result.sources.reddit.count, 1);
  assert.equal(result.sources.stackexchange.count, 1);
  assert.equal(result.sources.appstore_tr.count, 1);
  assert.equal(result.sources.producthunt.count, 1);
  assert.equal(result.sources.bluesky.status, 'unconfigured');

  // sample_posts en fazla 3 ve tamamen anonim + https://
  assert.equal(result.sample_posts.length, 3);
  for (const post of result.sample_posts) {
    assert.ok(post.url.startsWith('https://'));
    assert.equal('author' in post, false);
    assert.ok(typeof post.title === 'string' && post.title.length > 0);
    assert.ok(typeof post.source === 'string');
    assert.ok(['active_buyer', 'competitor_churn', 'pain_point'].includes(post.intent_type));
    assert.equal(typeof post.score, 'number');
    assert.equal(typeof post.created_at, 'string');
  }

  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes('HiddenSEUser'), false);
  assert.equal(serialized.includes('HiddenAppleUser'), false);

  // /api/scan çoklu kaynak motorunda yeni kaynak lead'leri KVKK anonim olmalı
  const scanRes = await scanLiveSourcesDetailed(
    { id: 'camp-1', name: 'Flow', url: 'https://flow.example.com', keywords: ['workflow tool'], competitors: ['Zapier'], dealValue: 490 },
    { sources: ['stackexchange', 'appstore_tr', 'bluesky'], fetchImpl: mockFetch }
  );
  assert.equal(scanRes.sourceSummary.bluesky.status, 'unconfigured');
  assert.ok(scanRes.leads.length >= 1);
  for (const lead of scanRes.leads) {
    assert.equal(lead.author, 'Anonim');
  }
});
