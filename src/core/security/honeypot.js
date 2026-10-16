if (!window.location.pathname.includes('/captcha.html')) {
    let activityDetected = false;
    const honeypot = document.getElementById('honeypot');
    if (honeypot) {
        honeypot.addEventListener('change', () => {
            sessionStorage.setItem('flagged', 'true');
            window.location.href = '../../../captcha.html';
        });
    }
    const markHuman = () => {
        activityDetected = true;
    };
    window.addEventListener('mousemove', markHuman, { once: true });
    window.addEventListener('keydown', markHuman, { once: true });
    window.addEventListener('scroll', markHuman, { once: true });
    window.addEventListener('touchstart', markHuman, { once: true });
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            if (!activityDetected || sessionStorage.getItem('flagged') === 'true') {
                sessionStorage.setItem('flagged', 'true');
                e.preventDefault();
                window.location.href = '../../../captcha.html';
            }
        });
    });
}