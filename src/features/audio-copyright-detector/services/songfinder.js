const SongFinderService = {
    isConfigured: false,
    async detectSong() {
        throw new Error('Audio recognition requires a secure server-side API proxy.');
    }
};