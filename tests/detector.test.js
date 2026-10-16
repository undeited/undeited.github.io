import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('Shazam audio sample is encoded as a valid WAV file', async () => {
    class OfflineAudioContextMock {
        constructor(channels, length, sampleRate) {
            this.destination = {};
            this.length = length;
            this.sampleRate = sampleRate;
        }

        createBufferSource() {
            return { connect() {}, start() {} };
        }

        createGain() {
            return { gain: {}, connect() {} };
        }

        async startRendering() {
            const samples = new Float32Array(this.length);
            samples[0] = 0.5;
            samples[1] = -0.5;
            return { getChannelData: () => samples };
        }
    }

    class FileReaderMock {
        async readAsDataURL(blob) {
            const data = Buffer.from(await blob.arrayBuffer()).toString('base64');
            this.result = `data:${blob.type};base64,${data}`;
            this.onloadend();
        }
    }

    const context = {
        Blob,
        FileReader: FileReaderMock,
        OfflineAudioContext: OfflineAudioContextMock
    };
    const detectorSource = await readFile(
        path.join(root, 'src/features/audio-copyright-detector/detect.js'),
        'utf8'
    );
    vm.runInNewContext(detectorSource, context);

    const audio = {
        sampleRate: 44100,
        length: 44100,
        numberOfChannels: 1,
        getChannelData: () => new Float32Array(44100).fill(0.5)
    };
    const base64Wav = await context.processAudioFingerprintFromBuffer(audio);
    const wav = Buffer.from(base64Wav, 'base64');

    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    assert.equal(wav.toString('ascii', 12, 16), 'fmt ');
    assert.equal(wav.readUInt16LE(20), 1);
    assert.equal(wav.readUInt16LE(22), 1);
    assert.equal(wav.readUInt32LE(24), 44100);
    assert.equal(wav.readUInt16LE(34), 16);
    assert.equal(wav.toString('ascii', 36, 40), 'data');
    assert.equal(wav.readUInt32LE(40), 44100 * 4 * 2);
    assert.equal(wav.length, 44 + 44100 * 4 * 2);
});

test('Turnstile challenge and retry status are visible before scripts load', async () => {
    const html = await readFile(
        path.join(root, 'src/features/audio-copyright-detector/index.html'),
        'utf8'
    );
    const style = await readFile(path.join(root, 'src/assets/css/style.css'), 'utf8');
    const source = await readFile(
        path.join(root, 'src/features/audio-copyright-detector/analyze.js'),
        'utf8'
    );
    const renderIndex = source.indexOf('window.turnstile.render(turnstileWidget,');
    const widgetOptions = source.slice(renderIndex, source.indexOf('});', renderIndex));
    const verificationIndex = html.indexOf('id="turnstile-container"');
    const dropZoneIndex = html.indexOf('id="copyright-drop-zone"');

    assert.match(html, /id="turnstile-container"[^>]*role="group"/);
    assert.match(html, /id="turnstile-status"[^>]*>Loading security verification/);
    assert.match(html, /id="turnstile-retry"[^>]*hidden/);
    assert.match(style, /\.turnstile-container\s*\{[^}]*min-height:\s*144px/s);
    assert.match(style, /#turnstile-widget\s*\{[^}]*min-width:\s*300px[^}]*min-height:\s*65px/s);
    assert.ok(verificationIndex < dropZoneIndex);
    assert.notEqual(renderIndex, -1);
    assert.match(widgetOptions, /appearance:\s*'always'/);
    assert.match(widgetOptions, /execution:\s*'render'/);
    assert.match(widgetOptions, /'unsupported-callback':\s*window\.voidacityTurnstileError/);
    assert.match(widgetOptions, /'timeout-callback':\s*window\.voidacityTurnstileExpired/);
    assert.match(source, /turnstileRetry\.addEventListener\('click', initializeRecognition\)/);
    assert.match(source, /Security verification is taking longer than usual/);
    assert.match(source, /}, 8000\)/);
    assert.match(source, /}, 45000\)/);
    assert.match(source, /Security verification is still unavailable/);
    assert.match(source, /,\s*30000\s*\)/);
    assert.match(source, /errorCode\.startsWith\('300'\)/);
    assert.match(source, /browser extensions or privacy protection/);
    assert.match(source, /setTurnstileStatus\(`\$\{detail\}\$\{code\}`\)/);
    assert.match(source, /Security verification is still unavailable/);
    assert.match(source, /allows undeited\.github\.io/);
    assert.match(source, /bounds\.width >= 150/);
    assert.match(source, /bounds\.height >= 50/);
    assert.match(source, /if \(!turnstileToken\) \{[\s\S]*turnstileContainer\.scrollIntoView/);
    assert.match(source, /dropZone\.addEventListener\('drop', event => \{[\s\S]*if \(!turnstileToken\)/);
});
