document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('drop-zone');
    const audioInput = document.getElementById('audio-input');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressStatus = document.getElementById('progress-status');
    const resultsContainer = document.getElementById('results-container');
    const lufsVal = document.getElementById('lufs-val');
    const dbfsVal = document.getElementById('dbfs-val');
    const playerContainer = document.getElementById('player-container');
    const waveformCanvas = document.getElementById('waveform-canvas');
    let analysisRequestId = 0;

    dropZone.addEventListener('click', () => audioInput.click());
    dropZone.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            audioInput.click();
        }
    });

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('drag-over');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('drag-over');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('drag-over');
        if (e.dataTransfer.files.length > 0) {
            processAudioFile(e.dataTransfer.files[0]);
        }
    });

    audioInput.addEventListener('change', () => {
        const file = audioInput.files[0];
        audioInput.value = '';
        if (file) processAudioFile(file);
    });

    function isValidAudioFile(file) {
        if (file.type && file.type.startsWith('audio/')) {
            return true;
        }

        const commonAudioExtensions = [
            'mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'wma',
            'alac', 'aif', 'aiff', 'opus', 'webm', 'mp4'
        ];

        const fileExtension = file.name.split('.').pop().toLowerCase();
        return commonAudioExtensions.includes(fileExtension);
    }

    async function processAudioFile(file) {
        const requestId = ++analysisRequestId;

        if (!isValidAudioFile(file)) {
            alert('Please select a valid audio file format.');
            return;
        }

        progressContainer.style.display = 'block';
        resultsContainer.style.display = 'none';
        playerContainer.style.display = 'none';
        progressBar.style.width = '0%';
        progressStatus.textContent = 'Reading audio file headers...';

        let audioCtx;
        try {
            const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextConstructor) {
                throw new Error('Web Audio is not supported by this browser.');
            }
            audioCtx = new AudioContextConstructor();
            const fileBuffer = await file.arrayBuffer();

            progressStatus.textContent = 'Decoding audio arrays...';
            progressBar.style.width = '25%';

            const audioBuffer = await audioCtx.decodeAudioData(fileBuffer);
            await audioCtx.close();
            if (requestId !== analysisRequestId) return;

            progressStatus.textContent = 'Running loudness analysis...';
            progressBar.style.width = '50%';

            setTimeout(() => {
                if (requestId !== analysisRequestId) return;
                try {
                    analyzeLoudnessMetrics(audioBuffer);
                } catch {
                    progressStatus.textContent = 'Unable to analyze this audio file.';
                    progressBar.style.width = '0%';
                }
            }, 60);

        } catch (error) {
            if (audioCtx && audioCtx.state !== 'closed') {
                await audioCtx.close();
            }
            if (requestId !== analysisRequestId) return;
            progressStatus.textContent = error instanceof Error && error.message.includes('not supported')
                ? error.message
                : 'Error parsing file format.';
            progressBar.style.width = '0%';
        }
    }

    function analyzeLoudnessMetrics(audioBuffer) {
        const numChannels = audioBuffer.numberOfChannels;
        const sampleRate = audioBuffer.sampleRate;
        const length = audioBuffer.length;

        let absolutePeak = 0;

        const channels = [];
        for (let c = 0; c < numChannels; c++) {
            channels.push(audioBuffer.getChannelData(c));
        }

        const dbGain = 3.999843853973347;
        const f0 = 1681.974450955533;
        const Q = 0.7071752369554193;

        const w0 = 2 * Math.PI * f0 / sampleRate;
        const alpha = Math.sin(w0) / (2 * Q);
        const A = Math.pow(10, dbGain / 40);

        const b0 = A * ((A + 1) + (A - 1) * Math.cos(w0) + 2 * Math.sqrt(A) * alpha);
        const b1 = -2 * A * ((A - 1) + (A + 1) * Math.cos(w0));
        const b2 = A * ((A + 1) + (A - 1) * Math.cos(w0) - 2 * Math.sqrt(A) * alpha);
        const a0 = (A + 1) - (A - 1) * Math.cos(w0) + 2 * Math.sqrt(A) * alpha;
        const a1 = 2 * ((A - 1) - (A + 1) * Math.cos(w0));
        const a2 = (A + 1) - (A - 1) * Math.cos(w0) - 2 * Math.sqrt(A) * alpha;

        const f1 = 38.13547087613982;
        const w1 = 2 * Math.PI * f1 / sampleRate;
        const alpha1 = Math.sin(w1) / (2 * 0.5003270373258709);

        const hp_b0 = (1 + Math.cos(w1)) / 2;
        const hp_b1 = -(1 + Math.cos(w1));
        const hp_b2 = (1 + Math.cos(w1)) / 2;
        const hp_a0 = 1 + alpha1;
        const hp_a1 = -2 * Math.cos(w1);
        const hp_a2 = 1 - alpha1;

        progressBar.style.width = '75%';

        const filteredChannels = [];
        const channelWeights = [];
        for (let c = 0; c < numChannels; c++) {
            filteredChannels.push(new Float32Array(length));
            channelWeights.push(c >= 3 ? 1.41 : 1.0);
        }

        for (let c = 0; c < numChannels; c++) {
            const data = channels[c];
            const out = filteredChannels[c];
            let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
            let hpx1 = 0, hpx2 = 0, hpy1 = 0, hpy2 = 0;

            for (let i = 0; i < length; i++) {
                const sample = data[i];
                const absSample = Math.abs(sample);
                if (absSample > absolutePeak) absolutePeak = absSample;

                const stage1Filtered = (b0/a0)*sample + (b1/a0)*x1 + (b2/a0)*x2 - (a1/a0)*y1 - (a2/a0)*y2;
                x2 = x1; x1 = sample; y2 = y1; y1 = stage1Filtered;

                const stage2Filtered = (hp_b0/hp_a0)*stage1Filtered + (hp_b1/hp_a0)*hpx1 + (hp_b2/hp_a0)*hpx2 - (hp_a1/hp_a0)*hpy1 - (hp_a2/hp_a0)*hpy2;
                hpx2 = hpx1; hpx1 = stage1Filtered; hpy2 = hpy1; hpy1 = stage2Filtered;

                out[i] = stage2Filtered;
            }
        }

        const blockLength = Math.round(0.4 * sampleRate);
        const blockStep = Math.round(0.1 * sampleRate);
        const blocks = [];

        for (let start = 0; start + blockLength <= length; start += blockStep) {
            let blockPower = 0;
            for (let c = 0; c < numChannels; c++) {
                const out = filteredChannels[c];
                let channelSum = 0;
                for (let i = start; i < start + blockLength; i++) {
                    channelSum += out[i] * out[i];
                }
                blockPower += (channelSum / blockLength) * channelWeights[c];
            }
            blocks.push(blockPower);
        }

        const absoluteThreshold = Math.pow(10, (-70 - (-0.691)) / 10);
        const absoluteGatedBlocks = [];
        let absoluteGatedPowerSum = 0;

        for (let j = 0; j < blocks.length; j++) {
            if (blocks[j] >= absoluteThreshold) {
                absoluteGatedBlocks.push(blocks[j]);
                absoluteGatedPowerSum += blocks[j];
            }
        }

        let lufs = -120;
        if (absoluteGatedBlocks.length > 0) {
            const averageAbsoluteGatedPower = absoluteGatedPowerSum / absoluteGatedBlocks.length;
            const relativeThreshold = averageAbsoluteGatedPower * Math.pow(10, -10 / 10);

            let finalPowerSum = 0;
            let finalBlockCount = 0;
            for (let j = 0; j < absoluteGatedBlocks.length; j++) {
                if (absoluteGatedBlocks[j] >= relativeThreshold) {
                    finalPowerSum += absoluteGatedBlocks[j];
                    finalBlockCount++;
                }
            }

            if (finalBlockCount > 0) {
                lufs = -0.691 + 10 * Math.log10(finalPowerSum / finalBlockCount);
            }
        }

        let dbfs = 20 * Math.log10(absolutePeak);
        if (dbfs === -Infinity || isNaN(dbfs)) dbfs = -120;
        if (lufs === -Infinity || isNaN(lufs)) lufs = -120;

        progressBar.style.width = '100%';
        progressStatus.textContent = 'Analysis Completed successfully!';

        setTimeout(() => {
            progressContainer.style.display = 'none';
            resultsContainer.style.display = 'grid';
            playerContainer.style.display = 'block';

            lufsVal.textContent = lufs <= -100 ? '-∞ LUFS' : `${lufs.toFixed(1)} LUFS`;
            dbfsVal.textContent = dbfs <= -100 ? '-∞ dBFS' : `${dbfs.toFixed(2)} dBFS`;

            if (window.AudioWaveformGenerator && typeof window.AudioWaveformGenerator.draw === 'function') {
                window.AudioWaveformGenerator.draw(audioBuffer, waveformCanvas);
            }
        }, 300);
    }
});