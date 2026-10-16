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
    const allowedExtensions = ['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac', '.alac', '.aif', '.aiff', '.wma', '.mp4', '.mkv'];

    if (dropZone) {
        dropZone.addEventListener('click', () => { if (fileInput) fileInput.click(); });
        dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('active'); });
        dropZone.addEventListener('dragleave', () => { dropZone.classList.remove('active'); });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.classList.remove('active');
            const file = e.dataTransfer.files[0];
            if (file) {
                const fileName = file.name.toLowerCase();
                if (file.type.startsWith('audio/') || allowedExtensions.some(ext => fileName.endsWith(ext))) {
                    handleAudioAnalysis(file);
                } else {
                    alert('Unsupported file format.');
                }
            }
        });
    }
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) handleAudioAnalysis(file);
        });
    }
    if (closePopupBtn) closePopupBtn.addEventListener('click', () => { if (popupModal) popupModal.style.display = 'none'; });
    window.addEventListener('click', (e) => { if (popupModal && e.target === popupModal) popupModal.style.display = 'none'; });

    async function handleAudioAnalysis(file) {
        if (progressContainer) progressContainer.style.display = 'block';
        if (resultsContainer) resultsContainer.style.display = 'none';
        if (progressBar) { progressBar.style.width = '10%'; progressBar.style.backgroundColor = ''; }
        if (progressStatus) progressStatus.textContent = 'Decoding audio file...';
        try {
            const metadata = await extractAudioMetadata(file);
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
                } catch (e) {
                }

                try {
                    const songFinderRes = await SongFinderService.detectSong(file, Math.floor(currentTime));
                    if (songFinderRes && songFinderRes.track) {
                        result = songFinderRes;
                        break;
                    }
                } catch (e) {
                }

                currentTime += 10;
                if (currentTime < totalDuration) await new Promise(resolve => setTimeout(resolve, 1500));
            }
            if (!result || !result.track) {
                if (metadata && (metadata.title || metadata.artist)) {
                    result = {
                        track: {
                            title: metadata.title || 'Unknown Title',
                            subtitle: metadata.artist || 'Unknown Artist',
                            images: { coverart: '../../public/icons/default-cover.png' }
                        }
                    };
                }
            }
            if (progressBar) progressBar.style.width = '100%';
            displayResults(result);
        } catch (error) {
            if (progressStatus) progressStatus.textContent = 'Error during analysis';
            if (progressBar) progressBar.style.backgroundColor = 'red';
        }
    }

    function displayResults(data) {
        if (progressContainer) progressContainer.style.display = 'none';
        if (resultsContainer) resultsContainer.style.display = 'block';
        const isMatch = data && data.track;
        if (statusVal) statusVal.textContent = 'Complete';
        if (matchVal) {
            matchVal.textContent = isMatch ? `${data.track.title} by ${data.track.subtitle}` : 'No Match Found';
            matchVal.style.color = isMatch ? '#ff4d4d' : '#2ecc71';
        }
        if (isMatch) {
            if (popupTitle) popupTitle.textContent = data.track.title;
            if (popupArtist) popupArtist.textContent = data.track.subtitle;
            if (popupThumbnail) popupThumbnail.src = data.track.images && data.track.images.coverart ? data.track.images.coverart : '../../public/icons/default-cover.png';
            if (popupModal) popupModal.style.display = 'flex';
        }
    }
});