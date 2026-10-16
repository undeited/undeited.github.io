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
