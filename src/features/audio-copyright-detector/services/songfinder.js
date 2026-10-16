const SongFinderService = {
    async detectSong(file, startTime, sessionToken, apiBaseUrl) {
        if (!file || !sessionToken || !apiBaseUrl) {
            throw new Error('Audio copyright detector is not configured.');
        }
        const formData = new FormData();
        formData.append('file', file);
        const url = new URL(`${apiBaseUrl}/api/recognize/songfinder`);
        url.searchParams.set('startTime', String(startTime));
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'x-proxy-session': sessionToken },
            body: formData
        });
        const result = await response.json();
        if (!response.ok) {
            const error = new Error(result.error || `Song recognition request failed (${response.status}).`);
            error.status = response.status;
            throw error;
        }
        return result;
    }
};
