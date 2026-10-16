if (window.location.pathname.includes('captcha.html')) {
    let currentCaptcha = "";
    const canvas = document.getElementById('captcha-canvas');
    const captchaForm = document.getElementById('captcha-form');
    const answerInput = document.getElementById('captcha-answer');
    const errorEl = document.getElementById('captcha-error');

    function generateCaptcha() {
        const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
        let result = "";
        for (let i = 0; i < 6; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        currentCaptcha = result;

        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const theme = {
                bg: "#140d21",
                dots: "168, 92, 240",
                lines: "214, 199, 245",
                char1: "#a85cf0",
                char2: "#d6c7f5"
            };

            ctx.fillStyle = theme.bg;
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            for (let i = 0; i < 30; i++) {
                ctx.fillStyle = `rgba(${theme.dots}, ${Math.random() * 0.3})`;
                ctx.beginPath();
                ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, Math.random() * 3, 0, Math.PI * 2);
                ctx.fill();
            }

            for (let i = 0; i < 4; i++) {
                ctx.strokeStyle = `rgba(${theme.lines}, ${Math.random() * 0.4})`;
                ctx.lineWidth = Math.random() * 2 + 1;
                ctx.beginPath();
                ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
                ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
                ctx.stroke();
            }

            ctx.textBaseline = "middle";
            const startX = 20;
            const spaceX = (canvas.width - 40) / 5;

            for (let i = 0; i < currentCaptcha.length; i++) {
                const char = currentCaptcha[i];
                ctx.font = `italic bold ${Math.floor(Math.random() * 8) + 24}px Arial`;
                ctx.fillStyle = i % 2 === 0 ? theme.char1 : theme.char2;

                ctx.save();
                const x = startX + (i * spaceX);
                const y = canvas.height / 2 + (Math.random() * 10 - 5);
                const angle = (Math.random() * 30 - 15) * Math.PI / 180;

                ctx.translate(x, y);
                ctx.rotate(angle);
                ctx.fillText(char, 0, 0);
                ctx.restore();
            }
        }
    }

    generateCaptcha();

    if (captchaForm && answerInput) {
        captchaForm.addEventListener('submit', event => {
            event.preventDefault();
            const userAnswer = answerInput.value.trim();
            if (userAnswer.toLowerCase() === currentCaptcha.toLowerCase()) {
                sessionStorage.removeItem('flagged');
                window.location.href = 'index.html';
            } else {
                if (errorEl) {
                    errorEl.style.display = 'block';
                }
                answerInput.value = '';
                generateCaptcha();
                answerInput.focus();
            }
        });
    }
}