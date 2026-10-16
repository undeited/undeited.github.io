let RealDate = window.Date;

function isDateSpoofed() {
    if (!Date.toString().includes('[native code]') || Date.name !== 'Date') {
        return true;
    }
    return false;
}

if (isDateSpoofed()) {
    try {
        const iframe = document.createElement('iframe');
        iframe.style.display = 'none';
        document.documentElement.appendChild(iframe);
        RealDate = iframe.contentWindow.Date;
        iframe.remove();
    } catch (e) { }
}

const yearSpan = document.getElementById('year');
if (yearSpan) {
    yearSpan.textContent = new RealDate().getFullYear();
}