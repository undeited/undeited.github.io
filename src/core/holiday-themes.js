(function () {
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();
    let theme = '';

    if (month === 12 && day >= 1 && day <= 25) {
        theme = 'christmas.css';
    } else if (month === 10 && day >= 24 && day <= 31) {
        theme = 'halloween.css';
    } else if (month === 3 && day >= 10 && day <= 17) {
        theme = 'stpatricks.css';
    } else if (month === 11 && day >= 20 && day <= 30) {
        theme = 'thanksgiving.css';
    }

    if (theme) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `src/assets/css/themes/${theme}`;
        document.head.appendChild(link);
    }
})();