document.addEventListener('DOMContentLoaded', () => {
    const dropZone = document.getElementById('copyright-drop-zone');
    const fileInput = document.getElementById('audio-input');
    const progressContainer = document.getElementById('copyright-progress-container');
    const progressBar = document.getElementById('copyright-progress-bar');
    const progressStatus = document.getElementById('copyright-progress-status');
    const resultsContainer = document.getElementById('copyright-results-container');
    const statusVal = document.getElementById('copyright-status-val');
    const matchVal = document.getElementById('copyright-match-val');
    const popupModal = document.getElementById('song-popup-modal');
    const closePopupBtn = document.getElementById('close-popup-btn');
    const popupThumbnail = document.getElementById('popup-song-thumbnail');
    const popupTitle = document.getElementById('popup-song-title');
    const popupArtist = document.getElementById('popup-song-artist');
    const serviceStatus = document.getElementById('recognition-service-status');
    const dropZoneLabel = document.getElementById('recognition-drop-zone-label');
    const turnstileContainer = document.getElementById('turnstile-container');
    const allowedExtensions = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.alac', '.aif', '.aiff', '.wma', '.mp4'];
    let apiBaseUrl = '';
    let turnstileToken = '';
    let turnstileWidgetId = null;

    window.voidacityTurnstileSuccess = token => {
        turnstileToken = token;
    };
    window.voidacityTurnstileExpired = () => {
        turnstileToken = '';
    };
    window.voidacityTurnstileError = () => {
        turnstileToken = '';
        setUnavailable('Security verification could not be loaded.');
    };

    initializeRecognition();

    async function initializeRecognition() {
        try {
            const configuredUrl = window.VOIDACITY_CONFIG && window.VOIDACITY_CONFIG.apiBaseUrl;
            if (!configuredUrl) {
                throw new Error('The secure recognition proxy has not been configured.');
            }
            const parsedUrl = new URL(configuredUrl);
            if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost') {
                throw new Error('The recognition proxy must use HTTPS.');
            }
            if (parsedUrl.pathname !== '/' || parsedUrl.search || parsedUrl.hash) {
                throw new Error('The recognition proxy URL must contain only its origin.');
            }
            apiBaseUrl = parsedUrl.origin;
            const response = await fetch(`${apiBaseUrl}/api/config`);
            const configuration = await response.json();
            if (!response.ok || !configuration.turnstileSiteKey) {
                throw new Error(configuration.error || 'The recognition proxy is not fully configured.');
            }
            await loadTurnstile();
            turnstileWidgetId = window.turnstile.render(turnstileContainer, {
                sitekey: configuration.turnstileSiteKey,
                action: 'audio_recognition',
                callback: window.voidacityTurnstileSuccess,
                'expired-callback': window.voidacityTurnstileExpired,
                'error-callback': window.voidacityTurnstileError
            });
            turnstileContainer.hidden = false;
            fileInput.disabled = false;
            dropZone.setAttribute('aria-disabled', 'false');
            dropZone.classList.remove('drop-zone-disabled');
            dropZoneLabel.textContent = 'Drag and drop an audio track or browse';
            serviceStatus.textContent = 'Identify a recording. A recognition match does not determine copyright status.';
        } catch (error) {
            setUnavailable(error instanceof Error ? error.message : 'The recognition service is unavailable.');
        }
    }

    function setUnavailable(message) {
        if (fileInput) fileInput.disabled = true;
        if (dropZone) {
            dropZone.setAttribute('aria-disabled', 'true');
            dropZone.classList.add('drop-zone-disabled');
        }
        if (dropZoneLabel) dropZoneLabel.textContent = message;
        if (serviceStatus) serviceStatus.textContent = message;
    }

    function loadTurnstile() {
        if (window.turnstile) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
            script.async = true;
            script.onload = () => window.turnstile ? resolve() : reject(new Error('Security verification is unavailable.'));
            script.onerror = () => reject(new Error('Security verification could not be loaded.'));
            document.head.appendChild(script);
        });
    }

    function isValidAudioFile(file) {
        return file.type.startsWith('audio/') ||
            allowedExtensions.some(extension => file.name.toLowerCase().endsWith(extension));
    }

    if (dropZone && fileInput) {
        dropZone.addEventListener('click', () => {
            if (!fileInput.disabled) fileInput.click();
        });
        dropZone.addEventListener('keydown', event => {
            if (!fileInput.disabled && (event.key === 'Enter' || event.key === ' ')) {
                event.preventDefault();
                fileInput.click();
            }
        });
        dropZone.addEventListener('dragover', event => {
            event.preventDefault();
            dropZone.classList.add('active');
        });
        dropZone.addEventListener('dragleave', () => dropZone.classList.remove('active'));
        dropZone.addEventListener('drop', event => {
            event.preventDefault();
            dropZone.classList.remove('active');
            const file = event.dataTransfer.files[0];
            if (!file) return;
            if (isValidAudioFile(file)) {
                handleAudioAnalysis(file);
            } else {
                alert('Unsupported file format.');
            }
        });
        fileInput.addEventListener('change', () => {
            const file = fileInput.files[0];
            fileInput.value = '';
            if (file && isValidAudioFile(file)) {
                handleAudioAnalysis(file);
            } else if (file) {
                alert('Unsupported file format.');
                fileInput.value = '';
            }
        });
    }
    if (closePopupBtn) closePopupBtn.addEventListener('click', () => { if (popupModal) popupModal.style.display = 'none'; });
    window.addEventListener('click', (e) => { if (popupModal && e.target === popupModal) popupModal.style.display = 'none'; });

    async function handleAudioAnalysis(file) {
        if (file.size > 15 * 1024 * 1024) {
            displayResults(null, new Error('Audio files must be smaller than 15 MiB.'));
            return;
        }
        if (!apiBaseUrl || !turnstileToken) {
            displayResults(null, new Error('Complete the security verification before selecting audio.'));
            return;
        }
        if (progressContainer) progressContainer.style.display = 'block';
        if (resultsContainer) resultsContainer.style.display = 'none';
        if (progressBar) { progressBar.style.width = '10%'; progressBar.style.backgroundColor = ''; }
        if (progressStatus) progressStatus.textContent = 'Verifying security challenge...';
        let audioCtx;
        try {
            const sessionToken = await createRecognitionSession(turnstileToken);
            turnstileToken = '';
            if (turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId);
            if (progressStatus) progressStatus.textContent = 'Decoding audio file...';
            const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextConstructor) throw new Error('Web Audio is not supported by this browser.');
            audioCtx = new AudioContextConstructor();
            const arrayBuffer = await file.arrayBuffer();
            let audioBuffer;
            try {
                audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            } catch (e) {
                await audioCtx.close();
                if (progressStatus) progressStatus.textContent = 'Error: Unreadable file.';
                if (progressBar) progressBar.style.backgroundColor = 'red';
                return;
            }
            const totalDuration = audioBuffer.duration;
            let currentTime = 0;
            let result = null;
            let recognitionError = null;
            while (currentTime < totalDuration) {
                const progressPercent = Math.min(10 + Math.floor((currentTime / totalDuration) * 80), 90);
                if (progressBar) progressBar.style.width = `${progressPercent}%`;
                if (progressStatus) progressStatus.textContent = `Scanning at ${Math.floor(currentTime)}s...`;

                try {
                    const fingerprint = await processAudioFingerprintFromBuffer(audioBuffer, currentTime);
                    const shazamRes = await ShazamService.detectSong(fingerprint, sessionToken, apiBaseUrl);
                    if (shazamRes && shazamRes.track) {
                        result = shazamRes;
                        break;
                    }
                } catch (error) {
                    recognitionError = error;
                    if (error.status === 401 || error.status === 429) break;
                }

                try {
                    const songFinderRes = await SongFinderService.detectSong(file, Math.floor(currentTime), sessionToken, apiBaseUrl);
                    if (songFinderRes && songFinderRes.track) {
                        result = songFinderRes;
                        break;
                    }
                } catch (error) {
                    recognitionError = error;
                    if (error.status === 401 || error.status === 429) break;
                }

                currentTime += 10;
                if (currentTime < totalDuration) await new Promise(resolve => setTimeout(resolve, 1500));
            }
            await audioCtx.close();
            if (progressBar) progressBar.style.width = '100%';
            displayResults(result, recognitionError);
        } catch (error) {
            turnstileToken = '';
            if (turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId);
            if (audioCtx && audioCtx.state !== 'closed') await audioCtx.close();
            if (progressStatus) progressStatus.textContent = error.message || 'Error during analysis';
            if (progressBar) progressBar.style.backgroundColor = 'red';
        }
    }

    async function createRecognitionSession(token) {
        const response = await fetch(`${apiBaseUrl}/api/session`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ turnstileToken: token })
        });
        const result = await response.json();
        if (!response.ok || !result.sessionToken) {
            throw new Error(result.error || 'Could not authorize audio copyright detector.');
        }
        return result.sessionToken;
    }

    function displayResults(data, recognitionError = null) {
        if (progressContainer) progressContainer.style.display = 'none';
        if (resultsContainer) resultsContainer.style.display = 'block';
        const track = data && data.track;
        const isMatch = Boolean(track && typeof track.title === 'string' && track.title.trim());
        if (statusVal) statusVal.textContent = recognitionError && !isMatch ? 'Unavailable' : 'Complete';
        if (matchVal) {
            matchVal.textContent = isMatch
                ? `${track.title}${typeof track.subtitle === 'string' && track.subtitle.trim() ? ` by ${track.subtitle}` : ''}`
                : recognitionError
                    ? 'Recognition service unavailable'
                    : 'No match found. This is not a copyright clearance.';
            matchVal.style.color = isMatch ? '#d6c7f5' : recognitionError ? '#ffb347' : '#2ecc71';
        }
        if (isMatch) {
            if (popupTitle) popupTitle.textContent = track.title;
            if (popupArtist) popupArtist.textContent = typeof track.subtitle === 'string' ? track.subtitle : '';
            if (popupThumbnail) popupThumbnail.src = track.images && track.images.coverart ? track.images.coverart : '../../../public/icons/default-cover.png';
            if (popupModal) popupModal.style.display = 'flex';
        }
    }
});