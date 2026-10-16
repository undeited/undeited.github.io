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

test('Turnstile container is visible before the widget is rendered', async () => {
    const source = await readFile(
        path.join(root, 'src/features/audio-copyright-detector/analyze.js'),
        'utf8'
    );
    const revealIndex = source.indexOf('turnstileContainer.hidden = false;');
    const renderIndex = source.indexOf('window.turnstile.render(turnstileContainer,');

    assert.notEqual(revealIndex, -1);
    assert.notEqual(renderIndex, -1);
    assert.ok(revealIndex < renderIndex);
});
