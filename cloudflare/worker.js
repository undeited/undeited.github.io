const MAX_AUDIO_FILE_SIZE = 15 * 1024 * 1024;
const MAX_SHAZAM_BODY_SIZE = 6 * 1024 * 1024;
const SESSION_LIFETIME_SECONDS = 600;
const RATE_LIMIT_PER_MINUTE = 15;
const RATE_LIMIT_PER_DAY = 240;
const RATE_LIMIT_STORAGE_TTL_MS = 25 * 60 * 60 * 1000;

function jsonResponse(body, status, origin) {
    const headers = {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'vary': 'Origin'
    };
    if (origin) {
        headers['access-control-allow-origin'] = origin;
        headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
        headers['access-control-allow-headers'] = 'content-type, x-turnstile-token, x-proxy-session';
        headers['access-control-max-age'] = '86400';
    }
    return new Response(JSON.stringify(body), { status, headers });
}

function configured(env) {
    return Boolean(
        env.ALLOWED_ORIGIN &&
        env.TURNSTILE_HOSTNAME &&
        env.TURNSTILE_SITE_KEY &&
        env.TURNSTILE_SECRET_KEY &&
        env.PROXY_SESSION_SECRET &&
        new TextEncoder().encode(env.PROXY_SESSION_SECRET).byteLength >= 32 &&
        env.SHAZAM_RAPIDAPI_KEY &&
        env.SONGFINDER_RAPIDAPI_KEY
    );
}

function encodeBase64Url(bytes) {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decodeBase64Url(value) {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid token encoding.');
    const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

async function hmacKey(secret) {
    return crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign', 'verify']
    );
}

async function createSessionToken(ip, secret) {
    const payload = {
        exp: Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS,
        ip: await hash(ip),
        nonce: crypto.randomUUID()
    };
    const encodedPayload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
    const signature = await crypto.subtle.sign(
        'HMAC',
        await hmacKey(secret),
        new TextEncoder().encode(encodedPayload)
    );
    return `${encodedPayload}.${encodeBase64Url(new Uint8Array(signature))}`;
}

async function verifySessionToken(token, ip, secret) {
    if (!token || token.length > 2048) return false;
    const parts = token.split('.');
    if (parts.length !== 2) return false;
    try {
        const validSignature = await crypto.subtle.verify(
            'HMAC',
            await hmacKey(secret),
            decodeBase64Url(parts[1]),
            new TextEncoder().encode(parts[0])
        );
        if (!validSignature) return false;
        const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[0])));
        return Number.isInteger(payload.exp) &&
            payload.exp > Math.floor(Date.now() / 1000) &&
            payload.ip === await hash(ip) &&
            typeof payload.nonce === 'string';
    } catch {
        return false;
    }
}

async function hash(value) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return encodeBase64Url(new Uint8Array(digest));
}

async function readBoundedBody(request, maximumSize) {
    const reader = request.body?.getReader();
    if (!reader) return new Uint8Array();
    const chunks = [];
    let totalSize = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalSize += value.byteLength;
        if (totalSize > maximumSize) {
            await reader.cancel();
            return null;
        }
        chunks.push(value);
    }
    const body = new Uint8Array(totalSize);
    let offset = 0;
    for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return body;
}

async function verifyTurnstile(token, ip, env) {
    if (!token || token.length > 4096) return false;
    const body = new URLSearchParams({
        secret: env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: ip
    });
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(20000)
    });
    if (!response.ok) return false;
    const result = await response.json();
    return result.success === true &&
        result.hostname === env.TURNSTILE_HOSTNAME &&
        result.action === 'audio_recognition';
}

async function allowRequest(ip, env) {
    const id = env.RATE_LIMITER.idFromName(await hash(ip));
    const limiter = env.RATE_LIMITER.get(id);
    const response = await limiter.fetch('https://rate-limiter/check', { method: 'POST' });
    return response.ok;
}

async function proxyJson(response) {
    if (!response.ok) {
        return jsonResponse({ error: 'The audio recognition provider rejected the request.' }, 502);
    }
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.toLowerCase().includes('application/json')) {
        return jsonResponse({ error: 'The audio recognition provider returned an invalid response.' }, 502);
    }
    const body = await readBoundedBody(response, 1024 * 1024);
    if (!body) {
        return jsonResponse({ error: 'The audio recognition provider response was too large.' }, 502);
    }
    try {
        return jsonResponse(JSON.parse(new TextDecoder().decode(body)), 200);
    } catch {
        return jsonResponse({ error: 'The audio recognition provider returned an invalid response.' }, 502);
    }
}

async function handleRequest(request, env) {
    const origin = request.headers.get('origin');
    if (!env.ALLOWED_ORIGIN || origin !== env.ALLOWED_ORIGIN) {
        return jsonResponse({ error: 'Origin not allowed.' }, 403);
    }
    if (request.method === 'OPTIONS') {
        return new Response(null, {
            status: 204,
            headers: {
                'access-control-allow-origin': env.ALLOWED_ORIGIN,
                'access-control-allow-methods': 'GET, POST, OPTIONS',
                'access-control-allow-headers': 'content-type, x-turnstile-token, x-proxy-session',
                'access-control-max-age': '86400',
                'vary': 'Origin'
            }
        });
    }

    const url = new URL(request.url);
    if (url.pathname === '/api/config' && request.method === 'GET') {
        if (!configured(env)) {
            return jsonResponse({ error: 'The recognition proxy is not fully configured.' }, 503, env.ALLOWED_ORIGIN);
        }
        return jsonResponse({ turnstileSiteKey: env.TURNSTILE_SITE_KEY }, 200, env.ALLOWED_ORIGIN);
    }
    if (request.method !== 'POST') {
        return jsonResponse({ error: 'Method not allowed.' }, 405, env.ALLOWED_ORIGIN);
    }
    if (!configured(env)) {
        return jsonResponse({ error: 'The recognition proxy is not fully configured.' }, 503, env.ALLOWED_ORIGIN);
    }

    const ip = request.headers.get('CF-Connecting-IP');
    if (!ip) return jsonResponse({ error: 'Client address is unavailable.' }, 400, env.ALLOWED_ORIGIN);
    const allowed = await allowRequest(ip, env);
    if (!allowed) {
        return jsonResponse({ error: 'Request limit reached. Try again later.' }, 429, env.ALLOWED_ORIGIN);
    }

    if (url.pathname === '/api/session') {
        if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
            return jsonResponse({ error: 'Expected a JSON request.' }, 415, env.ALLOWED_ORIGIN);
        }
        const declaredLength = Number(request.headers.get('content-length') || 0);
        if (declaredLength > 8192) {
            return jsonResponse({ error: 'Request body is too large.' }, 413, env.ALLOWED_ORIGIN);
        }
        const rawBody = await readBoundedBody(request, 8192);
        if (!rawBody) {
            return jsonResponse({ error: 'Request body is too large.' }, 413, env.ALLOWED_ORIGIN);
        }
        let body;
        try {
            body = JSON.parse(new TextDecoder().decode(rawBody));
        } catch {
            return jsonResponse({ error: 'Invalid request body.' }, 400, env.ALLOWED_ORIGIN);
        }
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return jsonResponse({ error: 'Invalid request body.' }, 400, env.ALLOWED_ORIGIN);
        }
        let passed;
        try {
            passed = await verifyTurnstile(body.turnstileToken, ip, env);
        } catch {
            return jsonResponse({ error: 'Could not verify the security challenge.' }, 502, env.ALLOWED_ORIGIN);
        }
        if (!passed) {
            return jsonResponse({ error: 'Security challenge failed. Please try again.' }, 403, env.ALLOWED_ORIGIN);
        }
        return jsonResponse({
            sessionToken: await createSessionToken(ip, env.PROXY_SESSION_SECRET),
            expiresIn: SESSION_LIFETIME_SECONDS
        }, 200, env.ALLOWED_ORIGIN);
    }

    const sessionToken = request.headers.get('x-proxy-session');
    if (!await verifySessionToken(sessionToken, ip, env.PROXY_SESSION_SECRET)) {
        return jsonResponse({ error: 'Recognition session is invalid or expired.' }, 401, env.ALLOWED_ORIGIN);
    }

    if (url.pathname === '/api/recognize/shazam') {
        if (!request.headers.get('content-type')?.toLowerCase().startsWith('text/plain')) {
            return jsonResponse({ error: 'Expected a plain-text audio fingerprint.' }, 415, env.ALLOWED_ORIGIN);
        }
        const declaredLength = Number(request.headers.get('content-length') || 0);
        if (declaredLength > MAX_SHAZAM_BODY_SIZE) {
            return jsonResponse({ error: 'Audio fingerprint is too large.' }, 413, env.ALLOWED_ORIGIN);
        }
        const rawBody = await readBoundedBody(request, MAX_SHAZAM_BODY_SIZE);
        if (!rawBody) {
            return jsonResponse({ error: 'Audio fingerprint is too large.' }, 413, env.ALLOWED_ORIGIN);
        }
        const fingerprint = new TextDecoder().decode(rawBody);
        if (!fingerprint || fingerprint.length > MAX_SHAZAM_BODY_SIZE ||
            !/^[A-Za-z0-9+/]+={0,2}$/.test(fingerprint)) {
            return jsonResponse({ error: 'Invalid audio fingerprint.' }, 400, env.ALLOWED_ORIGIN);
        }
        const upstream = await fetch(
            'https://shazam.p.rapidapi.com/songs/v2/detect?timezone=UTC&locale=en-US',
            {
                method: 'POST',
                headers: {
                    'content-type': 'text/plain',
                    'x-rapidapi-key': env.SHAZAM_RAPIDAPI_KEY,
                    'x-rapidapi-host': 'shazam.p.rapidapi.com'
                },
                    body: fingerprint,
                    signal: AbortSignal.timeout(20000)
                }
        );
        return addCors(await proxyJson(upstream), env.ALLOWED_ORIGIN);
    }

    if (url.pathname === '/api/recognize/songfinder') {
        const startTime = Number(url.searchParams.get('startTime') || 0);
        if (!Number.isInteger(startTime) || startTime < 0 || startTime > 3600) {
            return jsonResponse({ error: 'Invalid audio start time.' }, 400, env.ALLOWED_ORIGIN);
        }
        const declaredLength = Number(request.headers.get('content-length') || 0);
        if (declaredLength > MAX_AUDIO_FILE_SIZE + 1024 * 1024) {
            return jsonResponse({ error: 'Audio file is too large.' }, 413, env.ALLOWED_ORIGIN);
        }
        const rawBody = await readBoundedBody(request, MAX_AUDIO_FILE_SIZE + 1024 * 1024);
        if (!rawBody) {
            return jsonResponse({ error: 'Audio file is too large.' }, 413, env.ALLOWED_ORIGIN);
        }
        let form;
        try {
            const boundedRequest = new Request(request.url, {
                method: 'POST',
                headers: { 'content-type': request.headers.get('content-type') },
                body: rawBody
            });
            form = await boundedRequest.formData();
        } catch {
            return jsonResponse({ error: 'Expected a multipart audio upload.' }, 400, env.ALLOWED_ORIGIN);
        }
        const file = form.get('file');
        if (!(file instanceof File) || file.size === 0) {
            return jsonResponse({ error: 'Audio file is missing or empty.' }, 400, env.ALLOWED_ORIGIN);
        }
        if (file.size > MAX_AUDIO_FILE_SIZE) {
            return jsonResponse({ error: 'Audio file is too large.' }, 413, env.ALLOWED_ORIGIN);
        }
        const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
        const supportedExtensions = new Set([
            '.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac',
            '.alac', '.aif', '.aiff', '.wma', '.mp4'
        ]);
        if (!file.type.startsWith('audio/') && !supportedExtensions.has(extension)) {
            return jsonResponse({ error: 'Unsupported audio file format.' }, 415, env.ALLOWED_ORIGIN);
        }
        const upstreamForm = new FormData();
        upstreamForm.append('file', file, file.name);
        const upstreamUrl = new URL('https://songfinder-file-recognition.p.rapidapi.com/api/rapidapi/recognize/file');
        upstreamUrl.searchParams.set('startTime', String(startTime));
        const upstream = await fetch(upstreamUrl, {
            method: 'POST',
            headers: {
                'x-rapidapi-key': env.SONGFINDER_RAPIDAPI_KEY,
                'x-rapidapi-host': 'songfinder-file-recognition.p.rapidapi.com'
            },
            body: upstreamForm,
            signal: AbortSignal.timeout(20000)
        });
        return addCors(await proxyJson(upstream), env.ALLOWED_ORIGIN);
    }

    return jsonResponse({ error: 'Not found.' }, 404, env.ALLOWED_ORIGIN);
}

function addCors(response, origin) {
    const headers = new Headers(response.headers);
    headers.set('access-control-allow-origin', origin);
    headers.set('access-control-allow-methods', 'GET, POST, OPTIONS');
    headers.set('access-control-allow-headers', 'content-type, x-turnstile-token, x-proxy-session');
    headers.set('vary', 'Origin');
    return new Response(response.body, { status: response.status, headers });
}

export default {
    async fetch(request, env) {
        try {
            return await handleRequest(request, env);
        } catch {
            const origin = request.headers.get('origin');
            return jsonResponse({ error: 'The recognition proxy could not complete the request.' }, 502,
                origin === env.ALLOWED_ORIGIN ? env.ALLOWED_ORIGIN : null);
        }
    }
};

export class RateLimiter {
    constructor(state) {
        this.state = state;
        this.state.blockConcurrencyWhile(async () => {
            this.usage = await this.state.storage.get('usage') || {
                minute: 0,
                minuteCount: 0,
                day: '',
                dayCount: 0
            };
        });
    }

    async fetch() {
        const now = new Date();
        const minute = Math.floor(now.getTime() / 60000);
        const day = now.toISOString().slice(0, 10);
        if (this.usage.minute !== minute) {
            this.usage.minute = minute;
            this.usage.minuteCount = 0;
        }
        if (this.usage.day !== day) {
            this.usage.day = day;
            this.usage.dayCount = 0;
        }
        if (this.usage.minuteCount >= RATE_LIMIT_PER_MINUTE ||
            this.usage.dayCount >= RATE_LIMIT_PER_DAY) {
            return new Response(null, { status: 429 });
        }
        this.usage.minuteCount++;
        this.usage.dayCount++;
        await this.state.storage.put('usage', this.usage);
        await this.state.storage.setAlarm(Date.now() + RATE_LIMIT_STORAGE_TTL_MS);
        return new Response(null, { status: 204 });
    }

    async alarm() {
        await this.state.storage.deleteAll();
        this.usage = {
            minute: 0,
            minuteCount: 0,
            day: '',
            dayCount: 0
        };
    }
}
