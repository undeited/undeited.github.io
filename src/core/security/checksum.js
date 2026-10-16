window.addEventListener('DOMContentLoaded', () => {
    const targets = [
        { file: 'exe', elementId: 'hash-exe' },
        { file: 'dmg', elementId: 'hash-dmg' }
    ];

    targets.forEach(target => {
        const display = document.getElementById(target.elementId);
        if (!display) return;

        const link = document.querySelector(`[data-file="${target.file}"]`);
        if (!link || !link.hasAttribute('href')) {
            display.textContent = 'Download unavailable';
            return;
        }

        fetch(link.href)
            .then(response => {
                if (response.status === 404) {
                    link.removeAttribute('href');
                    link.removeAttribute('download');
                    link.setAttribute('aria-disabled', 'true');
                    const label = link.querySelector('span');
                    if (label) label.textContent = 'Unavailable';
                    display.textContent = 'Download unavailable';
                    return null;
                }
                if (!response.ok) throw new Error(`Download check failed (${response.status}).`);
                if (!window.crypto || !window.crypto.subtle) {
                    display.textContent = 'SHA-256: Verification unavailable';
                    return null;
                }
                return response.arrayBuffer();
            })
            .then(buffer => buffer && window.crypto.subtle.digest('SHA-256', buffer))
            .then(hashBuffer => {
                if (!hashBuffer) return;
                const hashArray = Array.from(new Uint8Array(hashBuffer));
                const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                display.textContent = `SHA-256: ${hashHex}`;
            })
            .catch(() => {
                display.textContent = 'SHA-256: Verification unavailable';
            });
    });
});