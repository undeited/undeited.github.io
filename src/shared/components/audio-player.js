(function() {
  let audioContext = null;
  let audioBuffer = null;
  let audioNode = null;
  
  let isPlaying = false;
  let startTime = 0;
  let pausedAt = 0;
  let duration = 0;
  let animationFrameId = null;
  let isDragging = false;
  
  const audioInput = document.getElementById('audio-input');
  const playerContainer = document.getElementById('player-container');
  const canvas = document.getElementById('waveform-canvas');
  const container = document.getElementById('waveform-container');
  const playhead = document.getElementById('waveform-playhead');
  const playerTime = document.getElementById('player-time');
  
  const btnPlay = document.getElementById('btn-play');
  const btnBack = document.getElementById('btn-back');
  const btnSkip = document.getElementById('btn-skip');

  const PLAY_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="16" height="16" fill="currentColor"><path d="M187.2 100.9C174.8 94.1 159.8 94.4 147.6 101.6C135.4 108.8 128 121.9 128 136L128 504C128 518.1 135.5 531.2 147.6 538.4C159.7 545.6 174.8 545.9 187.2 539.1L523.2 355.1C536 348.1 544 334.6 544 320C544 305.4 536 291.9 523.2 284.9L187.2 100.9z"/></svg>`;
  const PAUSE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" width="16" height="16" fill="currentColor"><path d="M176 96C149.5 96 128 117.5 128 144L128 496C128 522.5 149.5 544 176 544L240 544C266.5 544 288 522.5 288 496L288 144C288 117.5 266.5 96 240 96L176 96zM400 96C373.5 96 352 117.5 352 144L352 496C352 522.5 373.5 544 400 544L464 544C490.5 544 512 522.5 512 496L512 144C512 117.5 490.5 96 464 96L400 96z"/></svg>`;

  function formatTime(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function updateTimeDisplay() {
    if (!playerTime) return;
    const current = getCurrentTime();
    playerTime.textContent = `${formatTime(current)} / ${formatTime(duration)}`;
  }

  audioInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    stop(false); 

    const reader = new FileReader();
    reader.onload = function(evt) {
      if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      audioContext.decodeAudioData(evt.target.result, function(buffer) {
        audioBuffer = buffer;
        duration = buffer.duration;
        pausedAt = 0;
        isPlaying = false;
        
        btnPlay.innerHTML = PLAY_SVG;
        btnPlay.setAttribute('aria-label', 'Play');
        
        playhead.style.left = '0px';
        updateTimeDisplay();
        
        playerContainer.style.display = 'block';
        window.AudioWaveformGenerator.draw(audioBuffer, canvas);
      });
    };
    reader.readAsArrayBuffer(file);
  });

  function play() {
    if (isPlaying) return;
    
    if (audioNode) {
      try { audioNode.stop(); } catch(e) {}
      audioNode.disconnect();
    }
    
    audioNode = audioContext.createBufferSource();
    audioNode.buffer = audioBuffer;
    audioNode.connect(audioContext.destination);
    
    if (pausedAt >= duration) {
      pausedAt = 0;
    }
    
    audioNode.start(0, pausedAt);
    startTime = audioContext.currentTime - pausedAt;
    isPlaying = true;
    
    btnPlay.innerHTML = PAUSE_SVG;
    btnPlay.setAttribute('aria-label', 'Pause');
    
    audioNode.onended = function() {
      if (isPlaying && (audioContext.currentTime - startTime) >= duration) {
        stop(false);
        pausedAt = 0;
        playhead.style.left = '0px';
        updateTimeDisplay();
      }
    };
    
    updatePlayhead();
  }

  function stop(keepPosition = true) {
    if (!isPlaying && !audioNode) return;
    
    if (keepPosition && audioContext) {
      pausedAt = audioContext.currentTime - startTime;
    }
    
    isPlaying = false;
    
    btnPlay.innerHTML = PLAY_SVG;
    btnPlay.setAttribute('aria-label', 'Play');
    
    if (audioNode) {
      try {
        audioNode.stop();
      } catch(e) {
      }
      audioNode.disconnect();
      audioNode = null;
    }
    
    cancelAnimationFrame(animationFrameId);
    updateTimeDisplay();
  }

  function updatePlayhead() {
    if (!isPlaying) return;
    
    const elapsed = audioContext.currentTime - startTime;
    if (elapsed <= duration && !isDragging) {
      const ratio = elapsed / duration;
      playhead.style.left = (ratio * container.offsetWidth) + 'px';
    }
    
    updateTimeDisplay();
    animationFrameId = requestAnimationFrame(updatePlayhead);
  }

  btnPlay.addEventListener('click', function() {
    if (!audioBuffer) return;
    if (isPlaying) {
      stop(true);
    } else {
      play();
    }
  });

  btnBack.addEventListener('click', function() {
    if (!audioBuffer) return;
    seek(Math.max(0, getCurrentTime() - 10));
  });

  btnSkip.addEventListener('click', function() {
    if (!audioBuffer) return;
    seek(Math.min(duration, getCurrentTime() + 10));
  });

  function getCurrentTime() {
    if (isPlaying && audioContext) {
      return audioContext.currentTime - startTime;
    }
    return pausedAt;
  }

  function seek(time) {
    const wasPlaying = isPlaying;
    if (wasPlaying) {
      stop(false);
    }
    pausedAt = time;
    const ratio = pausedAt / duration;
    playhead.style.left = (ratio * container.offsetWidth) + 'px';
    updateTimeDisplay();
    if (wasPlaying) {
      play();
    }
  }

  function handleDrag(e) {
    if (!audioBuffer) return;
    const rect = container.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    let x = clientX - rect.left;
    x = Math.max(0, Math.min(x, rect.width));
    
    playhead.style.left = x + 'px';
    pausedAt = (x / rect.width) * duration;
    updateTimeDisplay();
    
    if (isPlaying) {
      startTime = audioContext.currentTime - pausedAt;
      if (audioNode) {
        const wasPlaying = isPlaying;
        stop(false);
        pausedAt = (x / rect.width) * duration;
        if (wasPlaying) play();
      }
    }
  }

  container.addEventListener('mousedown', function(e) {
    isDragging = true;
    handleDrag(e);
    
    function onMouseMove(moveEvent) {
      if (!isDragging) return;
      handleDrag(moveEvent);
    }
    
    function onMouseUp() {
      isDragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    }
    
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });

  container.addEventListener('touchstart', function(e) {
    isDragging = true;
    handleDrag(e);
    
    function onTouchMove(moveEvent) {
      if (!isDragging) return;
      handleDrag(moveEvent);
    }
    
    function onTouchEnd() {
      isDragging = false;
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    }
    
    document.addEventListener('touchmove', onTouchMove);
    document.addEventListener('touchend', onTouchEnd);
  }, { passive: true });

  window.addEventListener('resize', function() {
    if (audioBuffer) {
      window.AudioWaveformGenerator.draw(audioBuffer, canvas);
      const ratio = getCurrentTime() / duration;
      playhead.style.left = (ratio * container.offsetWidth) + 'px';
      updateTimeDisplay();
    }
  });
})();