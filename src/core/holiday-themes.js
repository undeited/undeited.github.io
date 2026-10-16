(function () {
    const today = new Date();
    const month = today.getMonth() + 1;
    const day = today.getDate();
    let theme = '';

    if (month === 12 && day >= 1 && day <= 25) {
        theme = { file: 'christmas.css', className: 'theme-christmas' };
    } else if (month === 10 && day >= 24 && day <= 31) {
        theme = { file: 'halloween.css', className: 'theme-halloween' };
    } else if (month === 3 && day >= 10 && day <= 17) {
        theme = { file: 'stpatricks.css', className: 'theme-st-patricks' };
    } else if (month === 11 && day >= 20 && day <= 30) {
        theme = { file: 'thanksgiving.css', className: 'theme-thanksgiving' };
    }

    if (theme) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = `src/assets/css/themes/${theme.file}`;
        document.head.appendChild(link);
        document.body.classList.add(theme.className);
    }
})();