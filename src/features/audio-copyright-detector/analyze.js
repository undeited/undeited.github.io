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
    const turnstileWidget = document.getElementById('turnstile-widget');
    const turnstileStatus = document.getElementById('turnstile-status');
    const turnstileRetry = document.getElementById('turnstile-retry');
    const allowedExtensions = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.alac', '.aif', '.aiff', '.wma', '.mp4'];
    let apiBaseUrl = '';
    let turnstileToken = '';
    let turnstileWidgetId = null;
    let turnstileLoadPromise = null;
    let initializationInProgress = false;
    let widgetVisibilityTimeout = null;
    let widgetSlowTimeout = null;

    window.voidacityTurnstileSuccess = token => {
        window.clearTimeout(widgetVisibilityTimeout);
        window.clearTimeout(widgetSlowTimeout);
        turnstileToken = token;
        turnstileRetry.hidden = true;
        setTurnstileStatus('Verification complete. Choose an audio file to continue.');
        setDropZoneEnabled(true);
    };
    window.voidacityTurnstileExpired = () => {
        turnstileToken = '';
        turnstileRetry.hidden = true;
        setTurnstileStatus('Verification expired. Complete the challenge again.');
        setDropZoneEnabled(false);
    };
    window.voidacityTurnstileError = errorCode => {
        window.clearTimeout(widgetVisibilityTimeout);
        window.clearTimeout(widgetSlowTimeout);
        turnstileToken = '';
        const code = typeof errorCode === 'string' ? ` (${errorCode})` : '';
        const detail = typeof errorCode === 'string' && errorCode.startsWith('300')
            ? 'Cloudflare could not complete the challenge. Check browser extensions or privacy protection, then retry in a private window or another browser.'
            : 'Security verification could not be completed. Check your connection and browser extensions, then retry.';
        setTurnstileStatus(`${detail}${code}`);
        setDropZoneEnabled(false);
        turnstileRetry.hidden = false;
    };

    initializeRecognition();
    turnstileRetry.addEventListener('click', initializeRecognition);

    async function initializeRecognition() {
        if (initializationInProgress) return;
        initializationInProgress = true;
        window.clearTimeout(widgetVisibilityTimeout);
        window.clearTimeout(widgetSlowTimeout);
        turnstileRetry.hidden = true;
        turnstileToken = '';
        setTurnstileStatus('Loading security verification...');
        setDropZoneEnabled(false);
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
            if (turnstileWidgetId !== null) {
                window.turnstile.remove(turnstileWidgetId);
                turnstileWidgetId = null;
            }
            turnstileWidget.replaceChildren();
            turnstileWidgetId = window.turnstile.render(turnstileWidget, {
                sitekey: configuration.turnstileSiteKey,
                action: 'audio_recognition',
                appearance: 'always',
                execution: 'render',
                size: 'normal',
                callback: window.voidacityTurnstileSuccess,
                'expired-callback': window.voidacityTurnstileExpired,
                'error-callback': window.voidacityTurnstileError,
                'timeout-callback': window.voidacityTurnstileExpired,
                'unsupported-callback': window.voidacityTurnstileError
            });
            if (turnstileWidgetId === undefined || turnstileWidgetId === null) {
                throw new Error('Security verification could not be initialized.');
            }
            setTurnstileStatus('Complete the security challenge to enable audio recognition.');
            widgetSlowTimeout = window.setTimeout(() => {
                if (!turnstileToken) {
                    setTurnstileStatus('Security verification is taking longer than usual. Please wait for the challenge to load.');
                }
            }, 8000);
            widgetVisibilityTimeout = window.setTimeout(() => {
                const frame = turnstileWidget.querySelector('iframe');
                const bounds = frame?.getBoundingClientRect();
                const frameStyle = frame && window.getComputedStyle(frame);
                const isVisible = frame &&
                    bounds.width >= 150 &&
                    bounds.height >= 50 &&
                    frameStyle.display !== 'none' &&
                    frameStyle.visibility !== 'hidden';
                if (!turnstileToken && !isVisible) {
                    setTurnstileStatus(
                        'Security verification is still unavailable. Check that the Turnstile key allows undeited.github.io and that browser privacy tools are not blocking it.'
                    );
                    setDropZoneEnabled(false);
                    turnstileRetry.hidden = false;
                }
            }, 45000);
        } catch (error) {
            window.clearTimeout(widgetVisibilityTimeout);
            window.clearTimeout(widgetSlowTimeout);
            setTurnstileStatus(error instanceof Error ? error.message : 'The recognition service is unavailable.');
            turnstileRetry.hidden = false;
        } finally {
            initializationInProgress = false;
        }
    }

    function setTurnstileStatus(message) {
        if (turnstileStatus) turnstileStatus.textContent = message;
        if (serviceStatus) {
            serviceStatus.textContent = 'Identify a recording. A recognition match does not determine copyright status.';
        }
    }

    function setDropZoneEnabled(enabled) {
        if (fileInput) fileInput.disabled = !enabled;
        if (dropZone) {
            dropZone.setAttribute('aria-disabled', String(!enabled));
            dropZone.classList.toggle('drop-zone-disabled', !enabled);
        }
        if (dropZoneLabel) {
            dropZoneLabel.textContent = enabled
                ? 'Drag and drop an audio track or browse'
                : 'Complete security verification before selecting audio';
        }
    }

    function loadTurnstile() {
        if (window.turnstile) return Promise.resolve();
        if (turnstileLoadPromise) return turnstileLoadPromise;
        turnstileLoadPromise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
            script.async = true;
            let timeout;
            const finish = error => {
                window.clearTimeout(timeout);
                script.onload = null;
                script.onerror = null;
                if (error) {
                    script.remove();
                    turnstileLoadPromise = null;
                    reject(error);
                } else {
                    resolve();
                }
            };
            script.onload = () => window.turnstile
                ? finish()
                : finish(new Error('Security verification is unavailable.'));
            script.onerror = () => finish(new Error('Security verification could not be loaded.'));
            timeout = window.setTimeout(
                () => finish(new Error('Security verification took too long to load. Retry to try again.')),
                30000
            );
            document.head.appendChild(script);
        });
        return turnstileLoadPromise;
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
            if (!turnstileToken) {
                setTurnstileStatus('Complete the security challenge above before selecting audio.');
                turnstileContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
                return;
            }
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
        if (!apiBaseUrl) {
            displayResults(null, new Error('The recognition service is unavailable.'));
            return;
        }
        if (!turnstileToken) {
            setTurnstileStatus('Complete the security challenge above before selecting audio.');
            turnstileContainer.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
            setDropZoneEnabled(false);
            setTurnstileStatus('Security challenge used. Complete it again before another recognition.');
            if (turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId);
            if (progressStatus) progressStatus.textContent = 'Decoding audio file...';
            const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
            if (!AudioContextConstructor) throw new Error('Web Audio is not supported by this browser.');
            audioCtx = new AudioContextConstructor();
            const arrayBuffer = await file.arrayBuffer();
            let audioBuffer;
            try {
                audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            } catch {
                await audioCtx.close();
                displayResults(null, new Error('The selected audio file could not be decoded by this browser.'));
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
            setDropZoneEnabled(false);
            if (turnstileWidgetId !== null) window.turnstile.reset(turnstileWidgetId);
            if (audioCtx && audioCtx.state !== 'closed') await audioCtx.close();
            displayResults(null, error);
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
                    ? recognitionError.message || 'Recognition service unavailable'
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