const ShazamService = {
    async detectSong(base64Audio, sessionToken, apiBaseUrl) {
        if (!base64Audio || !sessionToken || !apiBaseUrl) {
            throw new Error('Audio copyright detector is not configured.');
        }
        const response = await fetch(`${apiBaseUrl}/api/recognize/shazam`, {
            method: 'POST',
            headers: {
                'content-type': 'text/plain',
                'x-proxy-session': sessionToken
            },
            body: base64Audio
        });
        const result = await response.json();
        if (!response.ok) {
            const error = new Error(result.error || `Shazam recognition request failed (${response.status}).`);
            error.status = response.status;
            throw error;
        }
        return result;
    }
};
