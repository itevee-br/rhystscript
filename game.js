// Substituição da definição fixa por leitura dinâmica:
const chartData = JSON.parse(document.getElementById("chart-data").textContent);

// (Todo o restante do seu código original segue abaixo)

// Configurações básicas com hitWindow proporcional
const config = {
  baseSpeed: 0.3,
  speed: 0.6,//0.5
  judgePosition: 0.2,
  noteSize: 80,
  baseHitWindow: 50,
  get hitWindow() {
    const speedDifference = this.speed - this.baseSpeed;
    const increaseFactor = 1 + (speedDifference * 1);
    return Math.round(this.baseHitWindow * increaseFactor * 100) / 100;
  },
  fundoMuda: false
};

// Função para alterar a velocidade
function setGameSpeed(newSpeed) {
  config.speed = newSpeed;
  console.log(`Velocidade: ${newSpeed}, Área de acerto: ${config.hitWindow}px`);
}

// Estado do jogo
const state = {
  activeNotes: [],
  lastTime: 0,
  score: 0,
  combo: 0,
  maxCombo: 0,
  notas_antes: [],
  musicaIniciada: false,
  songElement: null,
  carregamentoInstantaneo: false,
  bgColorTimeout: null,
  currentBgColor: '#111',
  gamepadAtivo: false,
  gameFinished: false,
  resultsScreen: null,
  metaTotal: 0,
  notesTotal:0,
  acertos: 0
};

// Referências das pistas
const lanes = {
  up: document.getElementById('lane-up'),
  left: document.getElementById('lane-left'),
  right: document.getElementById('lane-right'),
  down: document.getElementById('lane-down')
};

// Controle por toque/click
function setupTouchControls() {
  const receptors = document.querySelectorAll('.receptor');
  receptors.forEach(receptor => {
    const direction = receptor.textContent.trim() === '↑' ? 'up' :
                      receptor.textContent.trim() === '←' ? 'left' :
                      receptor.textContent.trim() === '→' ? 'right' : 'down';
    receptor.addEventListener('touchstart', e => { e.preventDefault(); checkHit(direction); });
    receptor.addEventListener('click', () => checkHit(direction));
  });
}

// Mapeamento de teclas
const keyMap = {
  'ArrowUp': 'up', 'ArrowDown': 'down',
  'ArrowLeft': 'left', 'ArrowRight': 'right',
  'w': 'up', 's': 'down', 'a': 'left', 'd': 'right'
};

const gamepadMap = {
  3: 'up', 0: 'down', 2: 'left', 1: 'right'
};

const keyState = {}, gamepadState = {};

// Teclado
document.addEventListener('keydown', e => {
  const dir = keyMap[e.key];
  if (dir && !keyState[e.key]) {
    keyState[e.key] = true;
    checkHit(dir);
  }
});
document.addEventListener('keyup', e => {
  const dir = keyMap[e.key];
  if (dir) keyState[e.key] = false;
});

// Gamepad
window.addEventListener('gamepadconnected', e => {
  console.log('Gamepad conectado:', e.gamepad.id);
  state.gamepadAtivo = true;
});
window.addEventListener('gamepaddisconnected', e => {
  console.log('Gamepad desconectado:', e.gamepad.id);
  state.gamepadAtivo = false;
});

function checkGamepadInput() {
  const gp = navigator.getGamepads()[0];
  if (!gp) return;
  state.gamepadAtivo = true;
  for (const [index, direction] of Object.entries(gamepadMap)) {
    const button = gp.buttons[parseInt(index)];
    if (button.pressed && !gamepadState[index]) {
      gamepadState[index] = true;
      checkHit(direction);
    } else if (!button.pressed && gamepadState[index]) {
      gamepadState[index] = false;
    }
  }
  requestAnimationFrame(checkGamepadInput);
}

// Função para carregar áudio
function loadAudio() {
  return new Promise(resolve => {
    state.songElement = new Audio(chartData.song);
    state.songElement.preload = "auto";

    const checkIfLoaded = () => {
      if (state.songElement.readyState >= 3) {
        state.carregamentoInstantaneo = true;
        document.getElementById('loading-bar').style.display = 'none';
        document.getElementById('start-button').style.display = 'block';
        resolve();
        return true;
      }
      return false;
    };
    if (checkIfLoaded()) return;

    let progressInterval;
    const onLoaded = () => {
      clearInterval(progressInterval);
      setTimeout(() => {
        if (document.getElementById('loading-bar')) {
          document.getElementById('loading-bar').style.display = 'none';
          document.getElementById('start-button').style.display = 'block';
        }
        resolve();
      }, 300);
    };

    progressInterval = setInterval(() => {
      if (state.songElement.buffered.length > 0) {
        const end = state.songElement.buffered.end(0);
        const duration = state.songElement.duration || 1;
        const percent = Math.min((end / duration) * 100, 100);
        document.getElementById('loading-progress').style.width = `${percent}%`;
      }
      if (checkIfLoaded()) clearInterval(progressInterval);
    }, 100);

    state.songElement.addEventListener('canplaythrough', onLoaded);
    state.songElement.addEventListener('error', () => {
      clearInterval(progressInterval);
      document.getElementById('loading-bar').style.display = 'none';
      document.getElementById('loading-status').textContent = "Erro ao carregar música";
      resolve();
    });

    state.songElement.load();
  });
}

// Criação de nota
function createNote(direction) {
  const note = document.createElement('div');
  note.className = 'note';
  const styles = {
    up: { symbol: '↑', color: 'rgba(255, 200, 0, 0.8)' },
    left: { symbol: '←', color: 'rgba(255, 50, 50, 0.8)' },
    right: { symbol: '→', color: 'rgba(150, 50, 255, 0.8)' },
    down: { symbol: '↓', color: 'rgba(0, 200, 100, 0.8)' }
  };
  note.textContent = styles[direction].symbol;
  note.style.backgroundColor = styles[direction].color;
  note.style.right = '-80px';
  lanes[direction].appendChild(note);

  const noteObj = {
    element: note, direction, x: window.innerWidth, hit: false
  };
  state.activeNotes.push(noteObj);
  return noteObj;
}

// Atualiza notas
function updateNotes(timestamp) {
  if (!state.lastTime) state.lastTime = timestamp;
  const delta = timestamp - state.lastTime;
  state.lastTime = timestamp;

  // Verificar se a música acabou
  if (state.songElement && state.songElement.ended && !state.gameFinished) {
    showResults();
    state.gameFinished = true;
    return;
  }

  const judgeX = window.innerWidth * config.judgePosition;
  const missThreshold = judgeX - 100;

  state.activeNotes.forEach(note => {
    if (note.hit) return;
    note.x -= config.speed * delta;
    note.element.style.right = `${window.innerWidth - note.x}px`;
    if (note.x < missThreshold) {
      note.hit = true;
      note.element.remove();
      updateScore(-10);
    }
  });

  state.activeNotes = state.activeNotes.filter(n => !n.hit);
  requestAnimationFrame(updateNotes);
}

// Score
function updateScore(points) {
  state.score += points;
  if (points > 0) {
    state.combo++;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;
  } else {
    state.combo = 0;
  }

  document.getElementById('score').textContent = `Pontuação: ${state.score}`;
  document.getElementById('combo').textContent = `Combo: ${state.combo}`;
}

// Cores para feedback visual
const noteColors = {
  up: 'rgba(255, 200, 0, 0.7)',
  left: 'rgba(255, 50, 50, 0.7)',
  right: 'rgba(150, 50, 255, 0.7)',
  down: 'rgba(0, 255, 100, 0.7)'
};

function checkHit(direction) {
  const judgeX = window.innerWidth * config.judgePosition;
  let closestDistance = Infinity, hitNote = null;

  state.activeNotes.forEach(note => {
    if (note.direction !== direction || note.hit) return;
    const dist = Math.abs(note.x - judgeX);
    if (dist < config.hitWindow && dist < closestDistance) {
      closestDistance = dist;
      hitNote = note;
    }
  });

  if (hitNote) {
    hitNote.hit = true;
    hitNote.element.remove();
    const accuracy = closestDistance / config.hitWindow;
    const points = accuracy > 0.7 ? 10 : accuracy > 0.3 ? 15 : 20;
    updateScore(points);
    state.acertos++;

    if (config.fundoMuda) {
      if (state.bgColorTimeout) clearTimeout(state.bgColorTimeout);
      document.body.style.backgroundColor = noteColors[direction];
      state.bgColorTimeout = setTimeout(() => {
        document.body.style.backgroundColor = '#111';
      }, 300);
    }

    const receptor = lanes[direction].querySelector('.receptor');
    receptor.style.transform = 'scale(1.2)';
    receptor.style.boxShadow = '0 0 15px white';
    setTimeout(() => {
      receptor.style.transform = 'scale(1)';
      receptor.style.boxShadow = 'none';
    }, 100);
  }
}

// Cálculo e agendamento de notas
function calculateSpawnTime(noteTime, speed) {
  const judgeX = window.innerWidth * config.judgePosition;
  const travelTime = (window.innerWidth - judgeX) / (speed * 1000);
  return noteTime - travelTime;
}

function scheduleNotes(chartData) {
  state.metaTotal = chartData.notes.length * 10; // Cada nota vale 10 pontos no máximo
  state.notesTotal = chartData.notes.length;
  const futuras = [];
  chartData.notes.forEach(note => {
    const spawnTime = calculateSpawnTime(note.time, config.speed);
    if (spawnTime < 0) {
      state.notas_antes.push({ ...note, spawnTime: Math.abs(spawnTime) });
    } else {
      futuras.push(note);
    }
  });

  state.notas_antes.sort((a, b) => a.spawnTime - b.spawnTime);

  function criarNotasAntes() {
    if (state.notas_antes.length === 0) return iniciarMusica();
    const note = state.notas_antes.shift();
    createNote(note.direction);
    const delay = state.notas_antes.length > 0
      ? state.notas_antes[0].spawnTime - note.spawnTime
      : 0;
    setTimeout(criarNotasAntes, delay * 1000);
  }

  function iniciarMusica() {
    if (state.musicaIniciada) return;
    state.musicaIniciada = true;
    state.songElement.currentTime = 0;
    state.songElement.play().catch(() => {
      alert("Clique para iniciar o som!");
      document.body.addEventListener('click', () => state.songElement.play(), { once: true });
    });
    futuras.forEach(note => {
      setTimeout(() => createNote(note.direction), calculateSpawnTime(note.time, config.speed) * 1000);
    });
  }

  if (state.notas_antes.length > 0) {
    setTimeout(criarNotasAntes, state.notas_antes[0].spawnTime * 1000);
  } else {
    iniciarMusica();
  }
}

function startGame() {
  requestAnimationFrame(updateNotes);
}

async function initGame() {
  document.getElementById('loading-bar').style.display = 'none';
  document.getElementById('loading-status').style.display = 'none';
  
  // Inicializar referência à tela de resultados
  state.resultsScreen = document.getElementById('results-screen');
  if (state.resultsScreen) {
    state.resultsScreen.classList.add('hidden');
    state.resultsScreen.classList.remove('visible');
  }
  
  await loadAudio();
}

window.addEventListener('load', () => {
  initGame();
  if ("getGamepads" in navigator) checkGamepadInput();
  setupTouchControls();

  document.getElementById('start-button').addEventListener('click', () => {
    document.getElementById('loading-menu').remove();
    document.querySelector('.game-container').style.display = 'block';
    scheduleNotes(chartData);
    startGame();
  });
});

function showResults() {
  if (!state.resultsScreen) {
    state.resultsScreen = document.getElementById('results-screen');
  }
  
  const finalScore = document.getElementById('final-score');
  const finalCombo = document.getElementById('final-combo');
  const finalNotes = document.getElementById('final-notes');
  
  // Calcular porcentagem (agora pode ser maior que 100%)
  let porcentagem = 0;
  if (state.metaTotal > 0) {
    porcentagem = Math.round((state.score / state.metaTotal) * 100);
  }
  const totalNotes = chartData.notes.length;
  const porcentagemCombo = Math.round((state.maxCombo / totalNotes) * 100);
  const porcentagemNotes = Math.round((state.acertos / totalNotes) * 100);
  
  // Atualizar elementos com os resultados
  finalScore.textContent = `Pontuação: ${state.score} (${porcentagem}%)`;
  finalCombo.textContent = `Combo Máximo: ${state.maxCombo} (${porcentagemCombo}%)`;
  finalNotes.textContent = `Acertos: ${state.acertos} / ${state.notesTotal} (${porcentagemNotes}%)`;
  
  // Aplicar classe CSS baseada no desempenho
  finalScore.className = ''; // Limpa classes anteriores
  if (porcentagem >= 150) {
    finalScore.classList.add('godlike-score');
  } else if (porcentagem >= 120) {
    finalScore.classList.add('perfect-score');
  } else if (porcentagem >= 100) {
    finalScore.classList.add('excellent-score');
  } else if (porcentagem >= 80) {
    finalScore.classList.add('great-score');
  } else if (porcentagem >= 65) {
    finalScore.classList.add('good-score');
  } else if (porcentagem >= 50) {
    finalScore.classList.add('average-score');
  } else {
    finalScore.classList.add('low-score');
  }

  //para o combo agora
  finalCombo.className = '';
  if (porcentagemCombo >= 100) {
    finalCombo.classList.add('perfect-score');
  } else if (porcentagemCombo >= 80) {
    finalCombo.classList.add('excellent-score');
  } else if (porcentagemCombo >= 60) {
    finalCombo.classList.add('great-score');
  } else if (porcentagemCombo >= 40) {
    finalCombo.classList.add('good-score');
  } else if (porcentagemCombo >= 20) {
    finalCombo.classList.add('average-score');
  } else {
    finalCombo.classList.add('low-score');
  }

  //para as notas
  finalNotes.className = '';
  if (porcentagemNotes >= 100) {
    finalNotes.classList.add('perfect-score');
  } else if (porcentagemNotes >= 80) {
    finalNotes.classList.add('excellent-score');
  } else if (porcentagemNotes >= 60) {
    finalNotes.classList.add('great-score');
  } else if (porcentagemNotes >= 40) {
    finalNotes.classList.add('good-score');
  } else if (porcentagemNotes >= 20) {
    finalNotes.classList.add('average-score');
  } else {
    finalNotes.classList.add('low-score');
  }
  
  // Mostrar a tela de resultados com animação
  state.resultsScreen.classList.remove('hidden');
  setTimeout(() => {
    state.resultsScreen.classList.add('visible');
  }, 10);
  
  // Configurar eventos dos botões
  document.getElementById('play-again-button').onclick = function() {
    location.reload();
  };
  
  document.getElementById('change-song-button').onclick = function() {
    window.location.href = '../index.html';
  };
}