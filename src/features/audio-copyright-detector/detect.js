async function processAudioFingerprintFromBuffer(audioBuffer, startTime = 0) {
    const targetSampleRate = 44100;
    const duration = 4;
    const offlineCtx = new OfflineAudioContext(1, duration * targetSampleRate, targetSampleRate);
    const source = offlineCtx.createBufferSource();
    const gainNode = offlineCtx.createGain();
    let maxVal = 0;
    const startSample = Math.floor(startTime * audioBuffer.sampleRate);
    const endSample = Math.min(startSample + Math.floor(duration * audioBuffer.sampleRate), audioBuffer.length);
    for (let c = 0; c < audioBuffer.numberOfChannels; c++) {
        const data = audioBuffer.getChannelData(c);
        for (let i = startSample; i < endSample; i++) {
            const val = Math.abs(data[i]);
            if (val > maxVal) maxVal = val;
        }
    }
    gainNode.gain.value = maxVal > 0 ? 0.8 / maxVal : 1;
    source.buffer = audioBuffer;
    source.connect(gainNode);
    gainNode.connect(offlineCtx.destination);
    source.start(0, startTime, duration);
    const renderedBuffer = await offlineCtx.startRendering();
    const floatData = renderedBuffer.getChannelData(0);
    const pcmData = new Int16Array(floatData.length);
    for (let i = 0; i < floatData.length; i++) {
        const s = Math.max(-1, Math.min(1, floatData[i]));
        pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    const blob = new Blob([pcmData.buffer], { type: 'application/octet-stream' });
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            resolve(reader.result.split(',')[1]);
        };
        reader.readAsDataURL(blob);
    });
}

function extractAudioMetadata(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = function (e) {
            const arr = new Uint8Array(e.target.result);
            if (arr.length > 10 && arr[0] === 0x49 && arr[1] === 0x44 && arr[2] === 0x33) {
                let title = '';
                let artist = '';
                let i = 10;
                while (i < arr.length - 10) {
                    const frameId = String.fromCharCode(arr[i], arr[i + 1], arr[i + 2], arr[i + 3]);
                    const size = (arr[i + 4] << 24) | (arr[i + 5] << 16) | (arr[i + 6] << 8) | arr[i + 7];
                    if (size <= 0 || i + 10 + size > arr.length) break;
                    if (frameId === 'TIT2' || frameId === 'TPE1') {
                        let textEncoding = arr[i + 10];
                        let dataSlice = arr.subarray(i + 11, i + 10 + size);
                        let text = '';
                        if (textEncoding === 1 || textEncoding === 2) {
                            text = new TextDecoder('utf-16').decode(dataSlice);
                        } else {
                            text = new TextDecoder('windows-1252').decode(dataSlice);
                        }
                        text = text.replace(/^\0+/, '').replace(/\0+$/, '').trim();
                        if (frameId === 'TIT2') title = text;
                        if (frameId === 'TPE1') artist = text;
                    }
                    i += 10 + size;
                }
                if (title || artist) {
                    resolve({ title: title || null, artist: artist || null });
                    return;
                }
            }
            const match = file.name.match(/^(.*?)\s*-\s*(.*?)(?:\.[^.]+)?$/);
            if (match) {
                resolve({ artist: match[1].trim(), title: match[2].trim() });
            } else {
                resolve({ artist: null, title: file.name.split('.')[0].trim() });
            }
        };
        reader.readAsArrayBuffer(file.slice(0, 128 * 1024));
    });
}