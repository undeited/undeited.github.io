window.addEventListener('DOMContentLoaded', () => {
    const targets = [
        { file: 'exe', elementId: 'hash-exe', label: 'Windows' },
        { file: 'dmg', elementId: 'hash-dmg', label: 'macOS' }
    ];

    targets.forEach(target => {
        const display = document.getElementById(target.elementId);
        if (!display) return;

        const link = document.querySelector(`[data-file="${target.file}"]`);
        if (!link || !link.dataset.download) {
            display.textContent = 'Download unavailable';
            return;
        }

        link.addEventListener('click', event => {
            if (link.getAttribute('aria-disabled') === 'true') event.preventDefault();
        });

        fetch(link.dataset.download)
            .then(async response => {
                if (response.status === 404) {
                    const label = link.querySelector('span');
                    if (label) label.textContent = `${target.label} download unavailable`;
                    display.textContent = 'Download unavailable';
                    return;
                }
                if (!response.ok) throw new Error(`Download check failed (${response.status}).`);
                link.href = link.dataset.download;
                link.download = link.dataset.download.split('/').pop();
                link.removeAttribute('aria-disabled');
                const label = link.querySelector('span');
                if (label) label.textContent = `Download for ${target.label}`;
                const buffer = await response.arrayBuffer();

                if (!window.crypto || !window.crypto.subtle) {
                    display.textContent = 'SHA-256: Verification unavailable';
                    return;
                }

                try {
                    const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);
                    const hashArray = Array.from(new Uint8Array(hashBuffer));
                    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
                    display.textContent = `SHA-256: ${hashHex}`;
                } catch {
                    display.textContent = 'SHA-256: Verification unavailable';
                }
            })
            .catch(() => {
                const label = link.querySelector('span');
                if (label) label.textContent = `${target.label} download unavailable`;
                link.removeAttribute('href');
                link.removeAttribute('download');
                link.setAttribute('aria-disabled', 'true');
                display.textContent = 'Download unavailable';
            });
    });
});