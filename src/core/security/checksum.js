window.addEventListener('DOMContentLoaded', () => {
    const targets = [
        { url: '../../releases/1.0.0/voidacity-1.0.0.exe', elementId: 'hash-exe' },
        { url: '../../releases/1.0.0/voidacity-1.0.0.dmg', elementId: 'hash-dmg' }
    ];

    targets.forEach(target => {
        const display = document.getElementById(target.elementId);
        if (!display) return;

        fetch(target.url)
            .then(response => {
                if (!response.ok) throw new Error();
                return response.arrayBuffer();
            })
            .then(buffer => crypto.subtle.digest('SHA-256', buffer))
            .then(hashBuffer => {
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                display.textContent = `SHA-256: ${hashHex}`;
            })
            .catch(() => {
                display.textContent = 'SHA-256: Verification unavailable';
            });
    });
});