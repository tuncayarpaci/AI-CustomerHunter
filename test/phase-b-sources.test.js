'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  PAIN_CACHE_TTL_MS,
  TOP_CHARTS_CACHE_TTL_MS,
  searchGooglePlayPainPoints,
  fetchGooglePlayTopCharts,
  clearGooglePlayCache
} = require('../lib/sources/googleplay');
const {
  CACHE_TTL_MS: DEVTO_LOBSTERS_TTL_MS,
  searchDevTo,
  searchLobsters,
  clearDevToLobstersCache
} = require('../lib/sources/devto-lobsters');
const {
  ALL_SOURCE_KEYS,
  SOURCE_REGIONS,
  scanRealSourcesForDemand
} = require('../lib/demand-signal');
const { createServer, scanLiveSourcesDetailed } = require('../server');

function makeJsonRes(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; },
    async text() { return JSON.stringify(payload); }
  };
}

function startTestServer(options) {
  return new Promise((resolve, reject) => {
    const srv = createServer(options);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      resolve({
        server: srv,
        baseUrl: `http://127.0.0.1:${addr.port}`
      });
    });
    srv.on('error', reject);
  });
}

function stopTestServer(srv) {
  return new Promise((resolve) => srv.close(() => resolve()));
}

test('FB-01 Google Play: 1-3★ filtreleme, KVKK userName/userImage/id sızıntısı = 0 ve 60 dk LRU önbellek', async () => {
  clearGooglePlayCache();
  let searchCalls = 0;
  let reviewCalls = 0;
  let nowMs = 1_700_000_000_000;

  const mockGplay = {
    sort: { NEWEST: 2, RATING: 3, HELPFULNESS: 1 },
    async search(opts) {
      searchCalls += 1;
      assert.equal(opts.num, 2);
      assert.equal(opts.throttle, 2);
      assert.equal(opts.country, 'tr');
      assert.equal(opts.lang, 'tr');
      return [
        { appId: 'com.acme.gorev', title: 'GorevPro' }
      ];
    },
    async reviews(opts) {
      reviewCalls += 1;
      assert.equal(opts.appId, 'com.acme.gorev');
      assert.equal(opts.sort, 2);
      assert.equal(opts.num, 15);
      assert.equal(opts.throttle, 2);
      return {
        data: [
          {
            id: 'gp:AOqpTO_SECRET_REVIEW_ID_1',
            userName: 'Ahmet GizliKullanici',
            userImage: 'https://play-lh.googleusercontent.com/secret-avatar-1.jpg',
            score: 1,
            title: 'Çok pahalı abonelik',
            text: 'Sürekli kilitleniyor, alternatif arıyorum. İletişim: gizli.kisi@example.com 0533 987 65 43',
            date: '2026-11-20T10:00:00.000Z',
            url: 'https://play.google.com/store/apps/details?id=com.acme.gorev&reviewId=gp:AOqpTO_SECRET_REVIEW_ID_1'
          },
          {
            id: 'gp:AOqpTO_SECRET_REVIEW_ID_2',
            userName: 'Mehmet UcYildiz',
            userImage: 'https://play-lh.googleusercontent.com/secret-avatar-2.jpg',
            score: 3,
            title: 'Eksik raporlama',
            text: 'Excel dışa aktarma çalışmıyor.',
            date: '2026-11-20T09:00:00.000Z'
          },
          {
            id: 'gp:AOqpTO_SECRET_REVIEW_ID_3',
            userName: 'Mutlu BesYildiz',
            userImage: 'https://play-lh.googleusercontent.com/secret-avatar-3.jpg',
            score: 5,
            title: 'Mükemmel!',
            text: '5 yıldız verdim.',
            date: '2026-11-20T08:00:00.000Z'
          },
          {
            id: 'gp:AOqpTO_SECRET_REVIEW_ID_4',
            userName: 'Dort Yildiz',
            userImage: 'https://play-lh.googleusercontent.com/secret-avatar-4.jpg',
            score: 4,
            title: 'İyi',
            text: 'Gayet güzel.',
            date: '2026-11-20T07:00:00.000Z'
          }
        ]
      };
    }
  };

  const res1 = await searchGooglePlayPainPoints(
    { keywords: ['görev yönetimi'], competitors: ['GorevPro'], country: 'tr', lang: 'tr', limit: 6 },
    { gplay: mockGplay, now: () => nowMs }
  );

  assert.equal(res1.status, 'ok');
  assert.equal(res1.count, 2);
  assert.equal(searchCalls, 1);
  assert.equal(reviewCalls, 1);

  for (const item of res1.items) {
    assert.ok(item.rating >= 1 && item.rating <= 3, 'Yalnız 1-3 yıldızlı yorumlar kalmalı');
    assert.equal(item.url, 'https://play.google.com/store/apps/details?id=com.acme.gorev');
    assert.equal(item.source, 'googleplay_tr');
    assert.equal(item.country, 'TR');
    assert.equal('userName' in item, false);
    assert.equal('userImage' in item, false);
    assert.equal('id' in item, false);
    assert.equal('author' in item, false);
  }

  // KVKK: userName, userImage, review id, e-posta ve telefon sızıntısı = 0
  const serialized = JSON.stringify(res1);
  assert.equal(serialized.includes('Ahmet GizliKullanici'), false);
  assert.equal(serialized.includes('Mehmet UcYildiz'), false);
  assert.equal(serialized.includes('secret-avatar-1.jpg'), false);
  assert.equal(serialized.includes('AOqpTO_SECRET_REVIEW_ID_1'), false);
  assert.equal(serialized.includes('reviewId='), false);
  assert.equal(serialized.includes('gizli.kisi@example.com'), false);
  assert.equal(serialized.includes('0533 987 65 43'), false);
  assert.ok(serialized.includes('[maskelendi]'));

  // 59 dk içinde ikinci çağrı 60 dk önbellekten dönmeli (0 ek çağrı)
  nowMs += PAIN_CACHE_TTL_MS - 60_000;
  const res2 = await searchGooglePlayPainPoints(
    { keywords: ['görev yönetimi'], competitors: ['GorevPro'], country: 'tr', lang: 'tr', limit: 6 },
    { gplay: mockGplay, now: () => nowMs }
  );
  assert.equal(searchCalls, 1);
  assert.equal(reviewCalls, 1);
  assert.equal(res2.count, 2);

  // 60 dk dolduktan sonra yenilenmeli
  nowMs += 120_000;
  const res3 = await searchGooglePlayPainPoints(
    { keywords: ['görev yönetimi'], competitors: ['GorevPro'], country: 'tr', lang: 'tr', limit: 6 },
    { gplay: mockGplay, now: () => nowMs }
  );
  assert.equal(searchCalls, 2);
  assert.equal(reviewCalls, 2);
  assert.equal(res3.count, 2);

  clearGooglePlayCache();
});

test('FB-02 Google Play Top Charts: 6 saatlik önbellek, kısmi hata toleransı ve GET /api/internal/play-trends (503/401/405/200)', async () => {
  clearGooglePlayCache();
  let listCalls = 0;
  let nowMs = 1_700_000_000_000;

  const mockGplay = {
    collection: { TOP_FREE: 'TOP_FREE', TOP_PAID: 'TOP_PAID' },
    async list({ collection, country, lang, num }) {
      listCalls += 1;
      assert.equal(num, 12);
      if (country === 'us' && collection === 'TOP_PAID') {
        throw new Error('Simulated Play Store rate limit');
      }
      return [
        {
          appId: `com.demo.${country}.${collection.toLowerCase()}`,
          title: `Demo App ${country.toUpperCase()} ${collection}`,
          genre: lang === 'tr' ? 'Verimlilik' : 'Productivity',
          score: 4.567
        }
      ];
    }
  };

  // Doğrudan fonksiyon: kısmi hata durumunda çökmemeli, diğer 3 liste dönmeli
  const charts1 = await fetchGooglePlayTopCharts({ gplay: mockGplay, now: () => nowMs });
  assert.equal(charts1.ok, true);
  assert.equal(charts1.cached, false);
  assert.equal(listCalls, 4);
  assert.equal(charts1.status.tr_top_free, 'ok');
  assert.equal(charts1.status.tr_top_paid, 'ok');
  assert.equal(charts1.status.us_top_free, 'ok');
  assert.equal(charts1.status.us_top_paid, 'error');
  assert.equal(charts1.items.length, 3);

  const sample = charts1.charts.tr_top_free[0];
  assert.deepEqual(sample, {
    rank: 1,
    name: 'Demo App TR TOP_FREE',
    app_id: 'com.demo.tr.top_free',
    category: 'Verimlilik',
    score: 4.57,
    url: 'https://play.google.com/store/apps/details?id=com.demo.tr.top_free',
    country: 'TR',
    chart: 'TOP_FREE'
  });

  // 5 saat sonra önbellekten dönmeli
  nowMs += TOP_CHARTS_CACHE_TTL_MS - 3600_000;
  const charts2 = await fetchGooglePlayTopCharts({ gplay: mockGplay, now: () => nowMs });
  assert.equal(charts2.cached, true);
  assert.equal(listCalls, 4);

  // HTTP ucu: 503 (token yok)
  {
    const { server, baseUrl } = await startTestServer({
      getInternalToken: () => '',
      fetchPlayTrends: (opts) => fetchGooglePlayTopCharts({ ...opts, gplay: mockGplay, now: () => nowMs })
    });
    try {
      const res503 = await fetch(`${baseUrl}/api/internal/play-trends`, {
        headers: { 'X-Internal-Token': 'any' }
      });
      assert.equal(res503.status, 503);
    } finally {
      await stopTestServer(server);
    }
  }

  // HTTP ucu: 401, 405, 200 (cache) ve 200 (?refresh=1)
  const token = 'play-trends-internal-secret-token';
  {
    const { server, baseUrl } = await startTestServer({
      getInternalToken: () => token,
      fetchPlayTrends: (opts) => fetchGooglePlayTopCharts({ ...opts, gplay: mockGplay, now: () => nowMs })
    });
    try {
      const resMissing = await fetch(`${baseUrl}/api/internal/play-trends`);
      assert.equal(resMissing.status, 401);

      const resWrong = await fetch(`${baseUrl}/api/internal/play-trends`, {
        headers: { 'X-Internal-Token': 'wrong-token' }
      });
      assert.equal(resWrong.status, 401);

      const resMethod = await fetch(`${baseUrl}/api/internal/play-trends`, {
        method: 'POST',
        headers: { 'X-Internal-Token': token }
      });
      assert.equal(resMethod.status, 405);

      const resCached = await fetch(`${baseUrl}/api/internal/play-trends`, {
        headers: { 'X-Internal-Token': token }
      });
      assert.equal(resCached.status, 200);
      const dataCached = await resCached.json();
      assert.equal(dataCached.ok, true);
      assert.equal(dataCached.cached, true);
      assert.equal(listCalls, 4);

      const resRefresh = await fetch(`${baseUrl}/api/internal/play-trends?refresh=1`, {
        headers: { 'X-Internal-Token': token }
      });
      assert.equal(resRefresh.status, 200);
      const dataRefresh = await resRefresh.json();
      assert.equal(dataRefresh.ok, true);
      assert.equal(dataRefresh.cached, false);
      assert.equal(listCalls, 8);
    } finally {
      await stopTestServer(server);
    }
  }

  clearGooglePlayCache();
});

test('FB-03 Dev.to + Lobste.rs: mock, PII temizliği (user & submitter_user = 0) ve 30 dk önbellek', async () => {
  clearDevToLobstersCache();
  let devtoCalls = 0;
  let lobstersCalls = 0;
  let nowMs = 1_700_000_000_000;

  const mockFetch = async (url) => {
    if (url.startsWith('https://dev.to/api/articles')) {
      devtoCalls += 1;
      assert.ok(url.includes('per_page=15'));
      return makeJsonRes([
        {
          id: 1001,
          title: 'Looking for an open source workflow alternative to Zapier',
          description: 'Zapier is too expensive, contact author@secretdev.io for details.',
          url: 'https://dev.to/secretdev/workflow-alternative-zapier',
          published_at: '2026-11-20T12:00:00Z',
          tag_list: ['workflow', 'automation'],
          user: {
            name: 'DevTo Secret Author',
            username: 'secret_devto_user',
            profile_image: 'https://dev.to/avatar/secret.png'
          },
          organization: {
            name: 'SecretOrg'
          }
        }
      ]);
    }
    if (url === 'https://lobste.rs/hottest.json') {
      lobstersCalls += 1;
      return makeJsonRes([
        {
          short_id: 'abc123',
          title: 'Why we migrated from Zapier to self-hosted workflow runner',
          description_plain: 'Call +90 532 111 22 33 or write ops@company.org',
          url: 'https://example.com/workflow-runner',
          comments_url: 'https://lobste.rs/s/abc123/why_we_migrated_workflow',
          created_at: '2026-11-20T11:30:00Z',
          tags: ['workflow', 'devops'],
          submitter_user: 'lobsters_secret_submitter'
        }
      ]);
    }
    if (url === 'https://lobste.rs/newest.json') {
      lobstersCalls += 1;
      return makeJsonRes([
        {
          short_id: 'def456',
          title: 'Unrelated kernel patch note',
          url: 'https://example.com/kernel',
          comments_url: 'https://lobste.rs/s/def456/kernel',
          created_at: '2026-11-20T11:00:00Z',
          tags: ['linux'],
          submitter_user: 'another_secret_submitter'
        }
      ]);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  // Dev.to
  const devRes1 = await searchDevTo(
    { keywords: ['workflow automation'], competitors: ['Zapier'] },
    { fetchImpl: mockFetch, now: () => nowMs }
  );
  assert.equal(devRes1.status, 'ok');
  assert.equal(devRes1.count, 1);
  assert.equal(devtoCalls, 1);
  const devSer = JSON.stringify(devRes1);
  assert.equal(devSer.includes('DevTo Secret Author'), false);
  assert.equal(devSer.includes('secret_devto_user'), false);
  assert.equal(devSer.includes('SecretOrg'), false);
  assert.equal(devSer.includes('author@secretdev.io'), false);
  assert.ok(devSer.includes('[maskelendi]'));

  // Lobste.rs
  const lobRes1 = await searchLobsters(
    { keywords: ['workflow automation'], competitors: ['Zapier'] },
    { fetchImpl: mockFetch, now: () => nowMs }
  );
  assert.equal(lobRes1.status, 'ok');
  assert.equal(lobRes1.count, 1);
  assert.equal(lobstersCalls, 2); // hottest + newest
  const lobSer = JSON.stringify(lobRes1);
  assert.equal(lobSer.includes('lobsters_secret_submitter'), false);
  assert.equal(lobSer.includes('another_secret_submitter'), false);
  assert.equal(lobSer.includes('submitter_user'), false);
  assert.equal(lobSer.includes('ops@company.org'), false);
  assert.equal(lobSer.includes('532 111 22 33'), false);
  assert.ok(lobSer.includes('[maskelendi]'));

  // 29 dk sonra ikisi de 30 dk önbellekten dönmeli (0 ek HTTP çağrısı)
  nowMs += DEVTO_LOBSTERS_TTL_MS - 60_000;
  const devRes2 = await searchDevTo(
    { keywords: ['workflow automation'], competitors: ['Zapier'] },
    { fetchImpl: mockFetch, now: () => nowMs }
  );
  const lobRes2 = await searchLobsters(
    { keywords: ['workflow automation'], competitors: ['Zapier'] },
    { fetchImpl: mockFetch, now: () => nowMs }
  );
  assert.equal(devtoCalls, 1);
  assert.equal(lobstersCalls, 2);
  assert.equal(devRes2.count, 1);
  assert.equal(lobRes2.count, 1);

  // 30 dk geçince önbellek yenilenmeli
  nowMs += 120_000;
  await searchDevTo(
    { keywords: ['workflow automation'], competitors: ['Zapier'] },
    { fetchImpl: mockFetch, now: () => nowMs }
  );
  await searchLobsters(
    { keywords: ['workflow automation'], competitors: ['Zapier'] },
    { fetchImpl: mockFetch, now: () => nowMs }
  );
  assert.equal(devtoCalls, 2);
  assert.equal(lobstersCalls, 4);

  clearDevToLobstersCache();
});

test('FB-04 Orkestrasyon (14 kaynak) ve /api/scan: paralel çalışma, hata toleransı ve KVKK anonimliği', async () => {
  clearGooglePlayCache();
  clearDevToLobstersCache();

  assert.equal(ALL_SOURCE_KEYS.length, 14);
  assert.equal(SOURCE_REGIONS.googleplay_tr, 'tr');
  assert.equal(SOURCE_REGIONS.googleplay_us, 'global');
  assert.equal(SOURCE_REGIONS.devto, 'global');
  assert.equal(SOURCE_REGIONS.lobsters, 'global');

  const mockGplay = {
    sort: { NEWEST: 2 },
    async search({ country }) {
      if (country === 'us') {
        throw new Error('Simulated US Play timeout');
      }
      return [{ appId: 'com.acme.flowtr', title: 'FlowTR' }];
    },
    async reviews() {
      return {
        data: [
          {
            id: 'gp-rev-999',
            userName: 'GizliPlayYazar',
            userImage: 'https://play-lh.googleusercontent.com/hidden.jpg',
            score: 2,
            title: 'Alternatif arıyorum',
            text: 'Abonelik çok pahalı, workflow otomasyonu çalışmıyor.',
            date: new Date().toISOString()
          }
        ]
      };
    }
  };

  const mockFetch = async (url) => {
    if (url.startsWith('https://dev.to/api/articles')) {
      return makeJsonRes([
        {
          title: 'Best workflow tool recommendation instead of Zapier?',
          description: 'Looking for a paid workflow tool under $20/mo.',
          url: 'https://dev.to/anon/best-workflow-tool',
          published_at: new Date().toISOString(),
          tag_list: ['workflow'],
          user: { name: 'HiddenDevToName', username: 'hiddendev' }
        }
      ]);
    }
    if (url.startsWith('https://lobste.rs/')) {
      return makeJsonRes([
        {
          title: 'Switching from Zapier to lightweight workflow engine',
          description_plain: 'Frustrated with Zapier pricing.',
          comments_url: 'https://lobste.rs/s/wf99/switching_from_zapier',
          created_at: new Date().toISOString(),
          tags: ['workflow'],
          submitter_user: 'HiddenLobstersSubmitter'
        }
      ]);
    }
    throw new Error(`Simulated error for other sources: ${url}`);
  };

  const demandRes = await scanRealSourcesForDemand(
    {
      repo_name: 'acme/flow',
      keywords: ['workflow tool'],
      competitors: ['Zapier'],
      category: 'Automation',
      region: 'all',
      sources: null
    },
    { fetchImpl: mockFetch, gplay: mockGplay }
  );

  // Tüm 14 kaynak raporlanmalı
  assert.equal(Object.keys(demandRes.sources).length, 14);
  assert.equal(demandRes.sources.googleplay_tr.status, 'ok');
  assert.equal(demandRes.sources.googleplay_tr.count, 1);
  assert.equal(demandRes.sources.googleplay_us.status, 'error');
  assert.equal(demandRes.sources.devto.status, 'ok');
  assert.equal(demandRes.sources.devto.count, 1);
  assert.equal(demandRes.sources.lobsters.status, 'ok');
  assert.equal(demandRes.sources.lobsters.count, 1);
  assert.ok(demandRes.demand_score > 0);
  assert.ok(demandRes.sample_posts.length <= 3);

  const demandSer = JSON.stringify(demandRes);
  assert.equal(demandSer.includes('GizliPlayYazar'), false);
  assert.equal(demandSer.includes('HiddenDevToName'), false);
  assert.equal(demandSer.includes('HiddenLobstersSubmitter'), false);

  // /api/scan motoru: yeni 4 kaynak hata toleranslı ve KVKK anonim
  const scanRes = await scanLiveSourcesDetailed(
    {
      id: 'camp-flow',
      name: 'Flow',
      url: 'https://flow.example.com',
      keywords: ['workflow tool'],
      competitors: ['Zapier'],
      dealValue: 490
    },
    {
      sources: ['googleplay_tr', 'googleplay_us', 'devto', 'lobsters'],
      fetchImpl: mockFetch,
      gplay: mockGplay
    }
  );

  assert.equal(scanRes.sourceSummary.googleplay_tr.status, 'ok');
  assert.equal(scanRes.sourceSummary.googleplay_us.status, 'error');
  assert.equal(scanRes.sourceSummary.devto.status, 'ok');
  assert.equal(scanRes.sourceSummary.lobsters.status, 'ok');
  assert.equal(scanRes.leads.length, 3);
  for (const lead of scanRes.leads) {
    assert.equal(lead.author, 'Anonim');
    assert.ok(lead.url.startsWith('https://'));
  }

  clearGooglePlayCache();
  clearDevToLobstersCache();
});
