'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createServer } = require('../server');
const auth = require('../lib/auth');
const store = require('../lib/store');
const { createOssSuggestionsService } = require('../lib/oss-suggestions');

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

function getActiveSessionCookie() {
  auth.bootstrapAdmin();
  const users = store.listUsers();
  const activeUser = users.find(u => u.status === 'active');
  assert.ok(activeUser, 'Expected at least one active user for session test');
  const jwt = auth.signJwt('session', 3600, { uid: activeUser.id, tv: activeUser.tokenVersion });
  return `${auth.sessionCookieName()}=${encodeURIComponent(jwt)}`;
}

test('POST /api/oss-suggestions returns 401 without session and 403 on cross-origin', async () => {
  const { server, baseUrl } = await startTestServer({
    getInternalToken: () => 'test-internal-token'
  });
  try {
    const resUnauth = await fetch(`${baseUrl}/api/oss-suggestions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Origin': baseUrl
      },
      body: JSON.stringify({ title: 'Looking for Zapier alternative', keywords: ['workflow'] })
    });
    assert.equal(resUnauth.status, 401);

    const cookie = getActiveSessionCookie();
    const resCsrf = await fetch(`${baseUrl}/api/oss-suggestions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookie,
        'Origin': 'https://evil.example.com'
      },
      body: JSON.stringify({ title: 'Looking for Zapier alternative', keywords: ['workflow'] })
    });
    assert.equal(resCsrf.status, 403);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/oss-suggestions proxies to RepoRadar with X-Internal-Token, enforces https URLs, max 3 items, and hits LRU cache', async () => {
  const token = 'reporadar-shared-secret-token';
  const cookie = getActiveSessionCookie();
  let fetchCalls = 0;
  let capturedUrl = '';
  let capturedHeaders = null;
  let capturedBody = null;

  const mockFetch = async (url, init) => {
    fetchCalls += 1;
    capturedUrl = url;
    capturedHeaders = init.headers;
    capturedBody = JSON.parse(init.body);
    return makeMockJsonResponse({
      ok: true,
      items: [
        {
          full_name: 'acme/flow-engine',
          spdx_license: 'MIT',
          total_commercial_score: 88,
          summary_tr: 'Kendi sunucunuzda çalışan açık kaynak iş akışı motoru.',
          repo_url: 'https://radar.appcook.store/repo/acme/flow-engine',
          github_url: 'https://github.com/acme/flow-engine'
        },
        {
          full_name: 'acme/unsafe-links',
          spdx_license: 'Apache-2.0',
          total_commercial_score: 79,
          summary_tr: 'Güvensiz protokol testi.',
          repo_url: 'javascript:alert(1)',
          github_url: 'http://insecure.example.com/repo'
        },
        {
          full_name: 'acme/auto-fallback',
          spdx_license: 'BSD-3-Clause',
          total_commercial_score: 74,
          summary_tr: 'Fallback URL testi.'
        },
        {
          full_name: 'acme/fourth-item-trimmed',
          spdx_license: 'MIT',
          total_commercial_score: 70,
          summary_tr: 'Dördüncü öğe kesilmeli.'
        }
      ]
    });
  };

  const ossService = createOssSuggestionsService({
    fetchImpl: mockFetch,
    getInternalToken: () => token,
    getBaseUrl: () => 'http://ai-reporadar:8070',
    getPublicUrl: () => 'https://radar.appcook.store'
  });

  const { server, baseUrl } = await startTestServer({
    getInternalToken: () => token,
    ossSuggestionsService: ossService
  });

  try {
    const payload = {
      title: 'Switching from Zapier because of pricing',
      keywords: ['workflow automation', 'zapier alternative'],
      limit: 5
    };

    const res1 = await fetch(`${baseUrl}/api/oss-suggestions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookie,
        'Origin': baseUrl
      },
      body: JSON.stringify(payload)
    });
    assert.equal(res1.status, 200);
    const data1 = await res1.json();

    assert.equal(fetchCalls, 1);
    assert.equal(capturedUrl, 'http://ai-reporadar:8070/api/internal/oss-suggestions');
    assert.equal(capturedHeaders['X-Internal-Token'], token);
    assert.equal(capturedBody.limit, 3);
    assert.equal(data1.ok, true);
    assert.equal(data1.cached, false);
    assert.equal(data1.items.length, 3);

    assert.equal(data1.items[0].full_name, 'acme/flow-engine');
    assert.equal(data1.items[0].repo_url, 'https://radar.appcook.store/repo/acme/flow-engine');
    assert.equal(data1.items[0].github_url, 'https://github.com/acme/flow-engine');

    // Non-https URLs must be rejected (null)
    assert.equal(data1.items[1].full_name, 'acme/unsafe-links');
    assert.equal(data1.items[1].repo_url, null);
    assert.equal(data1.items[1].github_url, null);

    // Missing repo_url derives safe https RepoRadar link from full_name
    assert.equal(data1.items[2].repo_url, 'https://radar.appcook.store/repo/acme/auto-fallback');

    // Second identical call must hit LRU cache without hitting RepoRadar again
    const res2 = await fetch(`${baseUrl}/api/oss-suggestions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookie,
        'Origin': baseUrl
      },
      body: JSON.stringify(payload)
    });
    assert.equal(res2.status, 200);
    const data2 = await res2.json();
    assert.equal(fetchCalls, 1);
    assert.equal(data2.ok, true);
    assert.equal(data2.cached, true);
    assert.equal(data2.items.length, 3);
  } finally {
    await stopTestServer(server);
  }
});

test('POST /api/oss-suggestions returns graceful fallback when token is empty or RepoRadar is unreachable', async () => {
  const cookie = getActiveSessionCookie();

  // Case 1: Empty token
  let calledWhenNoToken = false;
  const noTokenService = createOssSuggestionsService({
    fetchImpl: async () => {
      calledWhenNoToken = true;
      return makeMockJsonResponse({ items: [] });
    },
    getInternalToken: () => ''
  });

  const srv1 = await startTestServer({
    getInternalToken: () => '',
    ossSuggestionsService: noTokenService
  });
  try {
    const res = await fetch(`${srv1.baseUrl}/api/oss-suggestions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookie,
        'Origin': srv1.baseUrl
      },
      body: JSON.stringify({ title: 'Need self-hosted analytics', keywords: ['analytics'] })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, false);
    assert.deepEqual(data.items, []);
    assert.equal(data.reason, 'missing_token');
    assert.equal(calledWhenNoToken, false);
  } finally {
    await stopTestServer(srv1.server);
  }

  // Case 2: RepoRadar unreachable (network error)
  const unreachableService = createOssSuggestionsService({
    fetchImpl: async () => {
      throw new Error('ECONNREFUSED');
    },
    getInternalToken: () => 'valid-token'
  });

  const srv2 = await startTestServer({
    getInternalToken: () => 'valid-token',
    ossSuggestionsService: unreachableService
  });
  try {
    const res = await fetch(`${srv2.baseUrl}/api/oss-suggestions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': cookie,
        'Origin': srv2.baseUrl
      },
      body: JSON.stringify({ title: 'Need self-hosted CRM', keywords: ['crm'] })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, false);
    assert.deepEqual(data.items, []);
    assert.equal(data.reason, 'upstream_unreachable');
  } finally {
    await stopTestServer(srv2.server);
  }
});
