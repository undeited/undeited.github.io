import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = [
    '404.html',
    'captcha.html',
    'download.html',
    'index.html',
    'tools.html',
    'src/features/audio-copyright-detector/index.html',
    'src/features/audio-loudness-analyzer/index.html'
];

test('all expected site pages exist', async () => {
    for (const page of pages) {
        const pageStat = await stat(path.join(root, page));
        assert.ok(pageStat.isFile(), `${page} must be a file`);
    }
});

test('all local HTML references resolve to files', async () => {
    for (const page of pages) {
        const source = await readFile(path.join(root, page), 'utf8');
        const attributes = source.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi);
        const baseUrl = pathToFileURL(path.join(root, page));

        for (const [, reference] of attributes) {
            if (!reference || reference.startsWith('#')) continue;
            const url = new URL(reference, baseUrl);
            if (url.protocol !== 'file:') continue;
            const referencedPath = fileURLToPath(url);
            const referenceStat = await stat(referencedPath);
            assert.ok(referenceStat.isFile(), `${page} references a non-file ${reference}`);
        }
    }
});

test('download page lists six Windows versions and hides versions after 1.0.0', async () => {
    const source = await readFile(path.join(root, 'download.html'), 'utf8');
    for (const [index, minor] of ['0', '1', '2', '3', '4', '5'].entries()) {
        const version = `1.0.${minor}`;
        const item = source.match(new RegExp(`<div class="version-item"( hidden)?>\\s*<div class="version-meta">\\s*<span class="version-title-text">Version ${version}</span>([\\s\\S]*?)</div>\\s*</div>`, 'i'));
        assert.ok(item, `version ${version} must be listed`);
        assert.equal(Boolean(item[1]), index > 0, `version ${version} visibility is incorrect`);
        assert.match(item[2], new RegExp(`data-file="exe" data-version="${version}" data-download="download/${index === 0 ? 'voidacity.exe' : `${version}/voidacity.exe`}"`));
    }
    assert.doesNotMatch(source, /macOS|data-file="dmg"|hash-dmg/);
});

test('browser and Worker scripts pass Node.js syntax checks', async () => {
    const scripts = [];
    const directories = ['cloudflare', 'public', 'src'];

    async function collectScripts(directory) {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            const entryPath = path.join(directory, entry.name);
            if (entry.isDirectory()) {
                await collectScripts(entryPath);
            } else if (/\.(?:js|mjs)$/.test(entry.name)) {
                scripts.push(entryPath);
            }
        }
    }

    for (const directory of directories) {
        await collectScripts(path.join(root, directory));
    }

    for (const script of scripts) {
        await execFileAsync(process.execPath, ['--check', script]);
    }
});

test('the app manifest references existing icons', async () => {
    const manifestPath = path.join(root, 'public/manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    const iconPaths = manifest.icons.map(icon => icon.src);

    for (const iconPath of iconPaths) {
        const iconStat = await stat(path.join(path.dirname(manifestPath), iconPath));
        assert.ok(iconStat.isFile(), `${iconPath} must exist`);
    }
});
