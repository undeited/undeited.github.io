window.AudioWaveformGenerator = {
  draw: function(audioBuffer, canvasElement) {
    const canvas = canvasElement;
    const ctx = canvas.getContext('2d');
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    if (width <= 0 || height <= 0) return;
    const pixelRatio = window.devicePixelRatio || 1;
    
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    ctx.scale(pixelRatio, pixelRatio);
    
    ctx.clearRect(0, 0, width, height);
    
    const leftChannel = audioBuffer.getChannelData(0);
    const step = Math.ceil(leftChannel.length / width);
    const amp = height / 2;
    
    ctx.fillStyle = '#6a578c';
    
    for (let i = 0; i < width; i++) {
      let min = 1.0;
      let max = -1.0;
      
      for (let j = 0; j < step; j++) {
        const datum = leftChannel[(i * step) + j];
        if (datum < min) min = datum;
        if (datum > max) max = datum;
      }
      
      const y1 = (1 + min) * amp;
      const y2 = (1 + max) * amp;
      const barHeight = Math.max(1, y2 - y1);
      
      ctx.fillRect(i, y1, 1, barHeight);
    }
  }
};