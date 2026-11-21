const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createServer } = require('../server');
const {
  LruTtlCache,
  createDemandSignalService
} = require('../lib/demand-signal');

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

function makeMockJsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}

test('503 when INTERNAL_API_TOKEN is not configured', async () => {
  const { server, baseUrl } = await startTestServer({
    getInternalToken: () => ''
  });
  try {
    const res = await fetch(`${baseUrl}/api/internal/demand-signal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': 'anything'
      },
      body: JSON.stringify({ repo_name: 'acme/demo', keywords: ['workflow automation'] })
    });
    assert.equal(res.status, 503);
    const data = await res.json();
    assert.equal(data.ok, false);
  } finally {
    await stopTestServer(server);
  }
});

test('401 when X-Internal-Token is missing or mismatched', async () => {
  const { server, baseUrl } = await startTestServer({
    getInternalToken: () => 'super-secret-internal-token-32bytes'
  });
  try {
    const resMissing = await fetch(`${baseUrl}/api/internal/demand-signal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo_name: 'acme/demo', keywords: ['workflow automation'] })
    });
    assert.equal(resMissing.status, 401);

    const resWrong = await fetch(`${baseUrl}/api/internal/demand-signal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': 'wrong-token'
      },
      body: JSON.stringify({ repo_name: 'acme/demo', keywords: ['workflow automation'] })
    });
    assert.equal(resWrong.status, 401);
  } finally {
    await stopTestServer(server);
  }
});

test('400 on invalid JSON or invalid input schema', async () => {
  const token = 'valid-test-token-123456';
  const { server, baseUrl } = await startTestServer({
    getInternalToken: () => token
  });
  try {
    const cases = [
      { raw: '{not-valid-json', label: 'malformed JSON' },
      { body: { keywords: [] }, label: 'empty keywords' },
      { body: { keywords: ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7'] }, label: 'too many keywords' },
      { body: { keywords: ['valid kw'], competitors: ['c1', 'c2', 'c3', 'c4', 'c5'] }, label: 'too many competitors' },
      { body: { keywords: 'not-an-array' }, label: 'keywords wrong type' },
      { body: { repo_name: 12345, keywords: ['valid kw'] }, label: 'repo_name wrong type' },
      { body: { keywords: ['x'] }, label: 'keyword too short' }
    ];

    for (const tc of cases) {
      const res = await fetch(`${baseUrl}/api/internal/demand-signal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Token': token
        },
        body: tc.raw !== undefined ? tc.raw : JSON.stringify(tc.body)
      });
      assert.equal(res.status, 400, `Expected 400 for ${tc.label}`);
    }
  } finally {
    await stopTestServer(server);
  }
});

test('200 with zero matches returns 0/yok and never injects synthetic leads', async () => {
  const token = 'valid-test-token-empty';
  const mockFetch = async (url) => {
    if (url.includes('reddit.com')) return makeMockJsonResponse({ data: { children: [] } });
    if (url.includes('hn.algolia.com')) return makeMockJsonResponse({ hits: [] });
    if (url.includes('api.github.com')) return makeMockJsonResponse({ items: [] });
    throw new Error(`Unexpected URL: ${url}`);
  };

  const service = createDemandSignalService({ fetchImpl: mockFetch });
  const { server, baseUrl } = await startTestServer({
    getInternalToken: () => token,
    demandSignalService: service
  });

  try {
    const res = await fetch(`${baseUrl}/api/internal/demand-signal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': token
      },
      body: JSON.stringify({
        repo_name: 'acme/niche-tool',
        keywords: ['obscure xyzzy workflow'],
        competitors: ['LegacyTool']
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.demand_score, 0);
    assert.equal(data.demand_level, 'yok');
    assert.equal(data.total_matches, 0);
    assert.equal(data.active_buyer_count, 0);
    assert.equal(data.competitor_churn_count, 0);
    assert.equal(data.pain_point_count, 0);
    assert.deepEqual(data.sample_posts, []);
    assert.equal(data.sources.reddit.status, 'ok');
    assert.equal(data.sources.hackernews.status, 'ok');
    assert.equal(data.sources.github.status, 'ok');
    assert.equal(data.cached, false);
    assert.equal(JSON.stringify(data).includes('growth_cto_sf'), false);
  } finally {
    await stopTestServer(server);
  }
});

test('200 calibrated score, https-only sample_posts (max 3), LRU cache hit, and db.json untouched', async () => {
  const token = 'valid-test-token-live';
  const nowSec = Math.floor(Date.now() / 1000);
  let fetchCalls = 0;

  const mockFetch = async (url) => {
    fetchCalls += 1;
    if (url.includes('reddit.com')) {
      return makeMockJsonResponse({
        data: {
          children: [
            {
              data: {
                title: 'Switching from Zapier — too expensive for our mcp workflow?',
                selftext: 'Looking for an alternative to Zapier for mcp workflow automation.',
                permalink: '/r/SaaS/comments/abc123/switching_from_zapier/',
                created_utc: nowSec - 3600
              }
            },
            {
              data: {
                title: 'Looking for best tool for mcp workflow automation, ready to pay $50/mo',
                selftext: 'Any suggestions for a paid tool?',
                permalink: '/r/devops/comments/def456/looking_for_mcp/',
                created_utc: nowSec - 7200
              }
            },
            {
              data: {
                title: 'Insecure http link should be ignored',
                url: 'http://insecure.example.com/post',
                created_utc: nowSec - 1000
              }
            }
          ]
        }
      });
    }
    if (url.includes('hn.algolia.com')) {
      return makeMockJsonResponse({
        hits: [
          {
            objectID: '9001',
            title: 'Ask HN: What tool are you using instead of Zapier for mcp workflow?',
            story_text: 'Frustrated with Zapier pricing and limits.',
            url: 'https://news.ycombinator.com/item?id=9001',
            created_at: new Date().toISOString()
          },
          {
            objectID: '9002',
            title: 'Manual mcp workflow bottleneck in CI pipelines',
            story_text: 'This manual process is slow and broken.',
            url: 'https://news.ycombinator.com/item?id=9002',
            created_at: new Date().toISOString()
          }
        ]
      });
    }
    if (url.includes('api.github.com')) {
      return makeMockJsonResponse({
        items: [
          {
            title: 'Feature request: looking for mcp workflow recommendation',
            body: 'We have a budget for a better solution.',
            html_url: 'https://github.com/acme/mcp-tools/issues/42',
            created_at: new Date().toISOString()
          }
        ]
      });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const dbPath = path.join(__dirname, '..', 'data', 'db.json');
  const dbBefore = fs.existsSync(dbPath) ? fs.readFileSync(dbPath, 'utf8') : null;

  const service = createDemandSignalService({ fetchImpl: mockFetch });
  const { server, baseUrl } = await startTestServer({
    getInternalToken: () => token,
    demandSignalService: service
  });

  try {
    const payload = {
      repo_name: 'acme/flow-agent',
      keywords: ['mcp workflow', 'ai agent'],
      competitors: ['Zapier', 'Make'],
      category: 'Automation'
    };

    const res1 = await fetch(`${baseUrl}/api/internal/demand-signal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': token
      },
      body: JSON.stringify(payload)
    });
    assert.equal(res1.status, 200);
    const data1 = await res1.json();

    assert.equal(fetchCalls, 3);
    assert.equal(data1.cached, false);
    assert.equal(data1.total_matches, 5);
    assert.equal(data1.sources.reddit.count, 2);
    assert.equal(data1.sources.hackernews.count, 2);
    assert.equal(data1.sources.github.count, 1);
    assert.ok(data1.demand_score >= 70 && data1.demand_score <= 100, `Expected high score, got ${data1.demand_score}`);
    assert.equal(data1.demand_level, 'yuksek');
    assert.equal(data1.competitor_churn_count, 2);
    assert.equal(data1.active_buyer_count, 2);
    assert.equal(data1.pain_point_count, 1);
    assert.equal(data1.sample_posts.length, 3);
    for (const post of data1.sample_posts) {
      assert.ok(post.url.startsWith('https://'), `Non-https URL leaked: ${post.url}`);
      assert.ok(['reddit', 'hackernews', 'github'].includes(post.source));
      assert.ok(['active_buyer', 'competitor_churn', 'pain_point'].includes(post.intent_type));
      assert.equal(typeof post.score, 'number');
      assert.equal(typeof post.created_at, 'string');
    }

    // Second call must hit LRU cache without additional external fetch
    const res2 = await fetch(`${baseUrl}/api/internal/demand-signal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': token
      },
      body: JSON.stringify(payload)
    });
    assert.equal(res2.status, 200);
    const data2 = await res2.json();
    assert.equal(fetchCalls, 3);
    assert.equal(data2.cached, true);
    assert.equal(data2.demand_score, data1.demand_score);

    // Ensure db.json was never modified or created
    const dbAfter = fs.existsSync(dbPath) ? fs.readFileSync(dbPath, 'utf8') : null;
    assert.equal(dbAfter, dbBefore);
  } finally {
    await stopTestServer(server);
  }
});

test('200 degrades gracefully when one source errors (partial source failure)', async () => {
  const token = 'valid-test-token-partial';
  const mockFetch = async (url) => {
    if (url.includes('reddit.com')) {
      return makeMockJsonResponse({ error: 'rate limited' }, 429);
    }
    if (url.includes('hn.algolia.com')) {
      return makeMockJsonResponse({
        hits: [
          {
            objectID: '777',
            title: 'Struggling with slow manual docker deploy',
            story_text: 'This is a huge pain point.',
            url: 'https://news.ycombinator.com/item?id=777',
            created_at: new Date().toISOString()
          }
        ]
      });
    }
    if (url.includes('api.github.com')) {
      return makeMockJsonResponse({ items: [] });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  const service = createDemandSignalService({ fetchImpl: mockFetch });
  const { server, baseUrl } = await startTestServer({
    getInternalToken: () => token,
    demandSignalService: service
  });

  try {
    const res = await fetch(`${baseUrl}/api/internal/demand-signal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': token
      },
      body: JSON.stringify({
        repo_name: 'acme/deploy-cli',
        keywords: ['docker deploy']
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.sources.reddit.status, 'error');
    assert.equal(data.sources.reddit.count, 0);
    assert.equal(data.sources.hackernews.status, 'ok');
    assert.equal(data.sources.hackernews.count, 1);
    assert.equal(data.sources.github.status, 'ok');
    assert.equal(data.total_matches, 1);
    assert.equal(data.demand_level, 'zayif');
  } finally {
    await stopTestServer(server);
  }
});

test('LruTtlCache enforces max capacity (LRU eviction) and 15-min TTL', () => {
  const cache = new LruTtlCache(2, 1000);
  cache.set('k1', 'v1', 0);
  cache.set('k2', 'v2', 100);
  // Touch k1 so k2 becomes least recently used
  assert.equal(cache.get('k1', 200), 'v1');
  cache.set('k3', 'v3', 300);
  assert.equal(cache.size, 2);
  assert.equal(cache.get('k2', 350), null);
  assert.equal(cache.get('k1', 350), 'v1');
  assert.equal(cache.get('k3', 350), 'v3');
  // Expire k1 after TTL (0 + 1000 = 1000)
  assert.equal(cache.get('k1', 1001), null);
});

test('AppCook auth wall remains intact on /api/state while /api/internal/demand-signal uses X-Internal-Token before auth', async () => {
  const token = 'valid-internal-token-auth-order';
  const mockFetch = async (url) => {
    if (url.includes('reddit.com')) return makeMockJsonResponse({ data: { children: [] } });
    if (url.includes('hn.algolia.com')) return makeMockJsonResponse({ hits: [] });
    if (url.includes('api.github.com')) return makeMockJsonResponse({ items: [] });
    throw new Error(`Unexpected URL: ${url}`);
  };
  const service = createDemandSignalService({ fetchImpl: mockFetch });
  const { server, baseUrl } = await startTestServer({
    getInternalToken: () => token,
    demandSignalService: service
  });
  try {
    const resState = await fetch(`${baseUrl}/api/state`);
    assert.equal(resState.status, 401);

    const resGetInternal = await fetch(`${baseUrl}/api/internal/demand-signal`, {
      method: 'GET',
      headers: { 'X-Internal-Token': token }
    });
    assert.equal(resGetInternal.status, 405);

    const resPostInternal = await fetch(`${baseUrl}/api/internal/demand-signal`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': token
      },
      body: JSON.stringify({ repo_name: 'acme/test', keywords: ['workflow tool'] })
    });
    assert.equal(resPostInternal.status, 200);
  } finally {
    await stopTestServer(server);
  }
});
