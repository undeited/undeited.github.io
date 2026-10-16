window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-file="exe"]').forEach(link => {
        if (link.closest('[hidden]')) return;

        const display = link.closest('.download-block')?.querySelector('.hash-display');
        const label = link.querySelector('span');
        if (!display || !link.dataset.download) {
            if (display) display.textContent = 'Download unavailable';
            return;
        }

        const version = link.dataset.version;
        const downloadLabel = version ? `Download Windows ${version}` : 'Download for Windows';
        const unavailableLabel = version ? `Windows ${version} download unavailable` : 'Windows download unavailable';

        link.addEventListener('click', event => {
            if (link.getAttribute('aria-disabled') === 'true') event.preventDefault();
        });

        fetch(link.dataset.download)
            .then(async response => {
                if (response.status === 404) {
                    if (label) label.textContent = unavailableLabel;
                    display.textContent = 'Download unavailable';
                    return;
                }
                if (!response.ok) throw new Error(`Download check failed (${response.status}).`);
                link.href = link.dataset.download;
                link.download = link.dataset.download.split('/').pop();
                link.removeAttribute('aria-disabled');
                if (label) label.textContent = downloadLabel;
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
                if (label) label.textContent = unavailableLabel;
                link.removeAttribute('href');
                link.removeAttribute('download');
                link.setAttribute('aria-disabled', 'true');
                display.textContent = 'Download unavailable';
            });
    });
});