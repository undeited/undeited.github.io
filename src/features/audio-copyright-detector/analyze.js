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
    const allowedExtensions = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.alac', '.aif', '.aiff', '.wma', '.mp4'];

    function isValidAudioFile(file) {
        return file.type.startsWith('audio/') ||
            allowedExtensions.some(extension => file.name.toLowerCase().endsWith(extension));
    }

    if (dropZone && fileInput && !fileInput.disabled) {
        dropZone.addEventListener('click', () => fileInput.click());
        dropZone.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
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
        if (!ShazamService.isConfigured && !SongFinderService.isConfigured) {
            displayResults(null, new Error('Audio recognition requires a secure server-side API proxy.'));
            return;
        }

        if (progressContainer) progressContainer.style.display = 'block';
        if (resultsContainer) resultsContainer.style.display = 'none';
        if (progressBar) { progressBar.style.width = '10%'; progressBar.style.backgroundColor = ''; }
        if (progressStatus) progressStatus.textContent = 'Decoding audio file...';
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const arrayBuffer = await file.arrayBuffer();
            let audioBuffer;
            try {
                audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
            } catch (e) {
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
                    const shazamRes = await ShazamService.detectSong(fingerprint);
                    if (shazamRes && shazamRes.track) {
                        result = shazamRes;
                        break;
                    }
                } catch (error) {
                    recognitionError = error;
                }

                try {
                    const songFinderRes = await SongFinderService.detectSong(file, Math.floor(currentTime));
                    if (songFinderRes && songFinderRes.track) {
                        result = songFinderRes;
                        break;
                    }
                } catch (error) {
                    recognitionError = error;
                }

                currentTime += 10;
                if (currentTime < totalDuration) await new Promise(resolve => setTimeout(resolve, 1500));
            }
            if (progressBar) progressBar.style.width = '100%';
            displayResults(result, recognitionError);
        } catch {
            if (progressStatus) progressStatus.textContent = 'Error during analysis';
            if (progressBar) progressBar.style.backgroundColor = 'red';
        }
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
                    : 'No Match Found';
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