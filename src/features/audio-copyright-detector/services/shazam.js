const ShazamService = {
    async detectSong(base64Audio) {
        if (!base64Audio) return null;
        const response = await fetch('https://shazam.p.rapidapi.com/songs/v2/detect?timezone=America%2FChicago&locale=en-US', {
            method: 'POST',
            headers: {
                'content-type': 'text/plain',
                'x-rapidapi-key': 'REVOKED_API_KEY',
                'x-rapidapi-host': 'shazam.p.rapidapi.com'
            },
            body: base64Audio
        });
        return await response.json();
    }
};