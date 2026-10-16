import assert from 'node:assert/strict';
import test from 'node:test';
import worker, { RateLimiter } from '../cloudflare/worker.js';

const allowedOrigin = 'https://undeited.github.io';
const environment = {
    ALLOWED_ORIGIN: allowedOrigin,
    TURNSTILE_HOSTNAME: 'undeited.github.io',
    TURNSTILE_SITE_KEY: 'public-site-key',
    TURNSTILE_SECRET_KEY: 'private-turnstile-key',
    PROXY_SESSION_SECRET: 'a'.repeat(32),
    SHAZAM_RAPIDAPI_KEY: 'private-shazam-key',
    SONGFINDER_RAPIDAPI_KEY: 'private-songfinder-key'
};

function request(path, options = {}) {
    return new Request(`https://worker.example${path}`, {
        ...options,
        headers: {
            origin: allowedOrigin,
            ...options.headers
        }
    });
}

test('configuration endpoint returns the public Turnstile key', async () => {
    const response = await worker.fetch(request('/api/config'), environment);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), allowedOrigin);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { turnstileSiteKey: 'public-site-key' });
});

test('requests from unconfigured origins are rejected without CORS access', async () => {
    const response = await worker.fetch(new Request('https://worker.example/api/config', {
        headers: { origin: 'https://attacker.example' }
    }), environment);

    assert.equal(response.status, 403);
    assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('unconfigured proxy does not publish configuration', async () => {
    const incompleteEnvironment = { ...environment, TURNSTILE_SECRET_KEY: '' };
    const response = await worker.fetch(request('/api/config'), incompleteEnvironment);

    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
        error: 'The recognition proxy is not fully configured.'
    });
});

test('preflight requests return the configured CORS policy', async () => {
    const response = await worker.fetch(request('/api/recognize/shazam', {
        method: 'OPTIONS'
    }), environment);

    assert.equal(response.status, 204);
    assert.equal(response.headers.get('access-control-allow-origin'), allowedOrigin);
    assert.match(response.headers.get('access-control-allow-headers'), /x-proxy-session/);
});

test('rate limiter rejects requests after the per-minute quota', async () => {
    const values = new Map();
    let initialization;
    const state = {
        blockConcurrencyWhile(callback) {
            initialization = callback();
        },
        storage: {
            async get(key) {
                return values.get(key);
            },
            async put(key, value) {
                values.set(key, value);
            },
            async setAlarm() {},
            async deleteAll() {
                values.clear();
            }
        }
    };
    const limiter = new RateLimiter(state);
    await initialization;

    for (let count = 0; count < 15; count++) {
        assert.equal((await limiter.fetch()).status, 204);
    }
    assert.equal((await limiter.fetch()).status, 429);
});
