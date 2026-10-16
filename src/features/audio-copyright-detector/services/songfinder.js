const SongFinderService = {
    async detectSong(file, startTime = 0) {
        if (!file) return null;
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch(`https://songfinder-file-recognition.p.rapidapi.com/api/rapidapi/recognize/file?startTime=${startTime}`, {
            method: 'POST',
            headers: {
                'x-rapidapi-key': 'REVOKED_API_KEY',
                'x-rapidapi-host': 'songfinder-file-recognition.p.rapidapi.com'
            },
            body: formData
        });
        return await response.json();
    }
};