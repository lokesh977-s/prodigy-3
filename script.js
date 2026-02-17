/**
 * NEXUS — Tic-Tac-Toe
 * script.js
 *
 * Features:
 *  - PvP and PvAI (Minimax with alpha-beta pruning) modes
 *  - Animated win-line SVG overlay
 *  - Confetti modal on win/draw
 *  - Sound effects via Web Audio API
 *  - Theme toggle, score tracking, 3D board tilt
 */

'use strict';

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════ */

/** All possible winning index combinations on a 3×3 board */
const WIN_COMBOS = [
  [0,1,2],[3,4,5],[6,7,8], // rows
  [0,3,6],[1,4,7],[2,5,8], // cols
  [0,4,8],[2,4,6]          // diagonals
];

/**
 * Pre-computed SVG line coordinates for each winning combo.
 * viewBox is 0 0 300 300. Cells are ~100px each.
 * We draw from center of first cell to center of last.
 */
const LINE_COORDS = {
  '0,1,2': { x1:50,  y1:50,  x2:250, y2:50  },
  '3,4,5': { x1:50,  y1:150, x2:250, y2:150 },
  '6,7,8': { x1:50,  y1:250, x2:250, y2:250 },
  '0,3,6': { x1:50,  y1:50,  x2:50,  y2:250 },
  '1,4,7': { x1:150, y1:50,  x2:150, y2:250 },
  '2,5,8': { x1:250, y1:50,  x2:250, y2:250 },
  '0,4,8': { x1:50,  y1:50,  x2:250, y2:250 },
  '2,4,6': { x1:250, y1:50,  x2:50,  y2:250 },
};

/* ═══════════════════════════════════════════════════════════
   STATE
   ═══════════════════════════════════════════════════════════ */
const state = {
  mode:       null,     // 'pvp' | 'pvai'
  board:      Array(9).fill(null), // null | 'X' | 'O'
  current:    'X',      // whose turn
  gameOver:   false,
  score:      { X: 0, O: 0, draw: 0 },
  sound:      true,
  theme:      'dark',
};

/* ═══════════════════════════════════════════════════════════
   DOM REFERENCES
   ═══════════════════════════════════════════════════════════ */
const $ = id => document.getElementById(id);

const dom = {
  modeSelector: $('modeSelector'),
  gameArena:    $('gameArena'),
  pvpBtn:       $('pvpBtn'),
  pvaiBtn:      $('pvaiBtn'),
  board:        $('board'),
  boardWrapper: $('boardWrapper'),
  winLine:      $('winLine'),
  winLineSvg:   $('winLineSvg'),
  turnDot:      $('turnDot'),
  turnLabel:    $('turnLabel'),
  pillX:        $('pillX'),
  pillO:        $('pillO'),
  nameX:        $('nameX'),
  nameO:        $('nameO'),
  scoreX:       $('scoreX'),
  scoreO:       $('scoreO'),
  scoreDraw:    $('scoreDraw'),
  resetBtn:     $('resetBtn'),
  menuBtn:      $('menuBtn'),
  // Modal
  backdrop:     $('modalBackdrop'),
  modal:        $('modal'),
  modalSymbol:  $('modalSymbol'),
  modalTitle:   $('modalTitle'),
  modalSub:     $('modalSub'),
  modalConfetti:$('modalConfetti'),
  playAgainBtn: $('playAgainBtn'),
  menuBtn2:     $('menuBtn2'),
  // Header
  themeBtn:     $('themeBtn'),
  themeSvg:     $('themeSvg'),
  soundBtn:     $('soundBtn'),
  soundSvg:     $('soundSvg'),
};

/* ═══════════════════════════════════════════════════════════
   WEB AUDIO — Synthesized sound effects
   ═══════════════════════════════════════════════════════════ */
let audioCtx = null;

/** Lazily init AudioContext (browser autoplay policy) */
function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

/**
 * Play a short synthesized sound.
 * @param {'click'|'win'|'draw'} type
 */
function playSound(type) {
  if (!state.sound) return;
  try {
    const ctx  = getAudio();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    switch (type) {
      case 'click':
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(520, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(380, ctx.currentTime + 0.08);
        gain.gain.setValueAtTime(0.07, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
        osc.start(); osc.stop(ctx.currentTime + 0.1);
        break;

      case 'win':
        // Play a little ascending arpeggio
        [0, 0.12, 0.24].forEach((t, i) => {
          const o = ctx.createOscillator();
          const g = ctx.createGain();
          o.connect(g); g.connect(ctx.destination);
          o.type = 'sine';
          o.frequency.setValueAtTime([440, 554, 659][i], ctx.currentTime + t);
          g.gain.setValueAtTime(0.1, ctx.currentTime + t);
          g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.18);
          o.start(ctx.currentTime + t);
          o.stop(ctx.currentTime + t + 0.2);
        });
        break;

      case 'draw':
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(180, ctx.currentTime + 0.25);
        gain.gain.setValueAtTime(0.06, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
        osc.start(); osc.stop(ctx.currentTime + 0.3);
        break;
    }
  } catch (_) { /* Silent fail — audio is optional */ }
}

/* ═══════════════════════════════════════════════════════════
   BOARD RENDERING
   ═══════════════════════════════════════════════════════════ */

/** Build 9 cell elements and append to the board container */
function buildBoard() {
  dom.board.innerHTML = '';
  dom.board.classList.remove('locked');

  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.dataset.index = i;
    cell.setAttribute('role', 'gridcell');
    cell.setAttribute('aria-label', `Cell ${i + 1}, empty`);
    cell.setAttribute('tabindex', '0');

    // Click
    cell.addEventListener('click', (e) => onCellClick(e, i));
    // Keyboard
    cell.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') onCellClick(e, i);
    });

    dom.board.appendChild(cell);
  }
}

/** Returns the DOM cell at index i */
const getCell = i => dom.board.children[i];

/* ═══════════════════════════════════════════════════════════
   GAME LOGIC
   ═══════════════════════════════════════════════════════════ */

/**
 * Handle a cell click (both human and triggered by AI).
 * @param {Event} e
 * @param {number} index
 */
function onCellClick(e, index) {
  if (state.gameOver) return;
  if (state.board[index] !== null) return;
  if (state.mode === 'pvai' && state.current === 'O') return; // AI's turn

  placeMove(index, state.current);

  const result = checkResult(state.board);

  if (result) {
    endGame(result);
    return;
  }

  toggleTurn();

  // AI move after short delay for natural feel
  if (state.mode === 'pvai' && state.current === 'O') {
    dom.board.classList.add('locked');
    setTimeout(makeAIMove, 480);
  }
}

/**
 * Commit a move to state and update the DOM cell.
 * @param {number} index
 * @param {'X'|'O'} player
 */
function placeMove(index, player) {
  state.board[index] = player;

  const cell = getCell(index);
  cell.classList.add('taken', player === 'X' ? 'cell-x' : 'cell-o');
  cell.setAttribute('aria-label', `Cell ${index + 1}, ${player}`);

  // Ripple from click center (or cell center for AI)
  addCellRipple(cell);
  playSound('click');
}

/** Add a ripple element to a cell */
function addCellRipple(cell) {
  const r = document.createElement('span');
  r.className = 'cell-ripple';
  r.style.left = '50%';
  r.style.top  = '50%';
  cell.appendChild(r);
  r.addEventListener('animationend', () => r.remove());
}

/** Flip whose turn it is */
function toggleTurn() {
  state.current = state.current === 'X' ? 'O' : 'X';
  updateTurnUI();
}

/** Sync turn indicator and player pills */
function updateTurnUI() {
  const isX = state.current === 'X';

  dom.turnLabel.textContent = `${state.current}'s Turn`;
  dom.turnDot.classList.toggle('is-o', !isX);

  dom.pillX.classList.toggle('active-x', isX);
  dom.pillO.classList.toggle('active-o', !isX);
}

/**
 * Check the board for a win or draw.
 * @param {Array} board
 * @returns {null | {winner:'X'|'O'|'draw', combo?: number[]}}
 */
function checkResult(board) {
  for (const combo of WIN_COMBOS) {
    const [a, b, c] = combo;
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return { winner: board[a], combo };
    }
  }
  if (board.every(cell => cell !== null)) {
    return { winner: 'draw' };
  }
  return null;
}

/** Handle end of game: update scores, animate, show modal */
function endGame(result) {
  state.gameOver = true;
  dom.board.classList.add('locked');

  if (result.winner !== 'draw') {
    // Highlight winning cells
    result.combo.forEach(i => {
      getCell(i).classList.add('win-cell');
    });

    // Draw animated SVG line
    drawWinLine(result.combo);

    // Update score
    state.score[result.winner]++;
    updateScoreboard(result.winner);
    playSound('win');
  } else {
    state.score.draw++;
    updateScoreboard('draw');
    playSound('draw');
  }

  // Show modal after brief pause for animations
  setTimeout(() => showModal(result), 900);
}

/** Animate the SVG strike-through line */
function drawWinLine(combo) {
  const key    = combo.join(',');
  const coords = LINE_COORDS[key];
  if (!coords) return;

  const line = dom.winLine;
  line.setAttribute('x1', coords.x1);
  line.setAttribute('y1', coords.y1);
  line.setAttribute('x2', coords.x2);
  line.setAttribute('y2', coords.y2);

  // Reset and trigger animation
  line.classList.remove('draw-line');
  void line.offsetWidth;
  line.classList.add('draw-line');
}

/** Bump the score display with animation */
function updateScoreboard(winner) {
  const elMap = { X: dom.scoreX, O: dom.scoreO, draw: dom.scoreDraw };
  const el    = elMap[winner];

  el.classList.remove('bump');
  void el.offsetWidth;
  el.textContent = winner === 'draw' ? state.score.draw : state.score[winner];
  el.classList.add('bump');
}

/* ═══════════════════════════════════════════════════════════
   MINIMAX AI  (Alpha-Beta Pruning)
   ═══════════════════════════════════════════════════════════ */

/** Trigger AI to pick and play the best move */
function makeAIMove() {
  if (state.gameOver) return;

  const best = minimax(state.board, 0, false, -Infinity, Infinity);
  dom.board.classList.remove('locked');

  placeMove(best.index, 'O');
  const result = checkResult(state.board);

  if (result) {
    endGame(result);
    return;
  }

  toggleTurn();
}

/**
 * Minimax with alpha-beta pruning.
 * @param {Array}   board    - current board snapshot
 * @param {number}  depth    - recursion depth
 * @param {boolean} isMax    - true if maximising (AI=O)
 * @param {number}  alpha
 * @param {number}  beta
 * @returns {{ score: number, index?: number }}
 */
function minimax(board, depth, isMax, alpha, beta) {
  const result = checkResult(board);

  // Terminal states
  if (result) {
    if (result.winner === 'O') return { score: 10 - depth };
    if (result.winner === 'X') return { score: depth - 10 };
    return { score: 0 }; // draw
  }

  let bestMove = { score: isMax ? -Infinity : Infinity, index: -1 };

  for (let i = 0; i < 9; i++) {
    if (board[i] !== null) continue;

    // Simulate move
    board[i] = isMax ? 'O' : 'X';
    const result = minimax(board, depth + 1, !isMax, alpha, beta);
    board[i] = null; // undo

    result.index = i;

    if (isMax) {
      if (result.score > bestMove.score) bestMove = result;
      alpha = Math.max(alpha, bestMove.score);
    } else {
      if (result.score < bestMove.score) bestMove = result;
      beta = Math.min(beta, bestMove.score);
    }

    // Prune
    if (beta <= alpha) break;
  }

  return bestMove;
}

/* ═══════════════════════════════════════════════════════════
   MODAL
   ═══════════════════════════════════════════════════════════ */

/** Show result modal with win/draw content */
function showModal(result) {
  const { winner } = result;
  const modal = dom.modal;

  // Reset classes
  modal.className = 'modal';
  dom.modalSymbol.className = 'modal-symbol';
  dom.modalConfetti.innerHTML = '';

  if (winner === 'X' || winner === 'O') {
    const isX = winner === 'X';

    dom.modalSymbol.textContent = winner;
    dom.modalSymbol.classList.add(isX ? 'sym-x' : 'sym-o');
    dom.modalTitle.textContent  = `${winner} Wins!`;

    const name = isX ? dom.nameX.textContent : dom.nameO.textContent;
    dom.modalSub.textContent    = `Congratulations, ${name}!`;

    if (!isX) modal.classList.add('o-wins');

    spawnConfetti(isX ? '#f0a500' : '#00c9b1');
  } else {
    dom.modalSymbol.textContent = '🤝';
    dom.modalSymbol.classList.add('sym-draw');
    dom.modalTitle.textContent  = "It's a Draw!";
    dom.modalSub.textContent    = 'Well played by both sides.';
    modal.classList.add('draw-result');
  }

  dom.backdrop.classList.add('open');
  dom.backdrop.setAttribute('aria-hidden', 'false');
  dom.playAgainBtn.focus();
}

function closeModal() {
  dom.backdrop.classList.remove('open');
  dom.backdrop.setAttribute('aria-hidden', 'true');
}

/** Spawn confetti particles inside the modal */
function spawnConfetti(primaryColor) {
  const colors  = [primaryColor, '#ffffff', '#ffcc55', '#4de8d8', '#ff6b9e'];
  const count   = 30;

  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'confetti-particle';

    const color    = colors[Math.floor(Math.random() * colors.length)];
    const x        = Math.random() * 100;
    const delay    = Math.random() * 0.6;
    const duration = 0.9 + Math.random() * 0.8;
    const size     = 5 + Math.random() * 7;

    el.style.cssText = `
      background: ${color};
      left: ${x}%;
      top: -10px;
      width: ${size}px;
      height: ${size}px;
      animation-duration: ${duration}s;
      animation-delay: ${delay}s;
      border-radius: ${Math.random() > 0.5 ? '50%' : '2px'};
    `;

    dom.modalConfetti.appendChild(el);
  }
}

/* ═══════════════════════════════════════════════════════════
   GAME FLOW  (Start / Reset / Menu)
   ═══════════════════════════════════════════════════════════ */

/** Show the mode selector, hide game arena */
function showMenu() {
  dom.gameArena.hidden    = true;
  dom.modeSelector.hidden = false;
  closeModal();
  state.gameOver = false;
  state.board    = Array(9).fill(null);
  state.current  = 'X';
  state.score    = { X: 0, O: 0, draw: 0 };
}

/**
 * Start a new game in the given mode.
 * @param {'pvp'|'pvai'} mode
 */
function startGame(mode) {
  state.mode    = mode;
  state.board   = Array(9).fill(null);
  state.current = 'X';
  state.gameOver= false;

  // Update player name labels
  dom.nameX.textContent = 'Player 1';
  dom.nameO.textContent = mode === 'pvai' ? 'AI' : 'Player 2';

  // Reset scores when switching mode or starting fresh
  state.score = { X: 0, O: 0, draw: 0 };
  dom.scoreX.textContent    = '0';
  dom.scoreO.textContent    = '0';
  dom.scoreDraw.textContent = '0';

  // Clear win line
  resetWinLine();

  // Build fresh board
  buildBoard();

  // Update UI
  updateTurnUI();
  dom.pillX.classList.add('active-x');
  dom.pillO.classList.remove('active-o');

  // Show arena
  dom.modeSelector.hidden = true;
  dom.gameArena.hidden    = false;
}

/** Restart the current game (keep scores, reset board only) */
function restartGame() {
  if (!state.mode) return;

  state.board   = Array(9).fill(null);
  state.current = 'X';
  state.gameOver= false;

  resetWinLine();
  buildBoard();
  updateTurnUI();
  dom.pillX.classList.add('active-x');
  dom.pillO.classList.remove('active-o');
  dom.board.classList.remove('locked');

  closeModal();
}

/** Clear the SVG win line */
function resetWinLine() {
  const line = dom.winLine;
  line.classList.remove('draw-line');
  line.setAttribute('x1', '0'); line.setAttribute('y1', '0');
  line.setAttribute('x2', '0'); line.setAttribute('y2', '0');
}

/* ═══════════════════════════════════════════════════════════
   3D TILT EFFECT on board
   ═══════════════════════════════════════════════════════════ */
dom.boardWrapper.addEventListener('mousemove', (e) => {
  const rect   = dom.boardWrapper.getBoundingClientRect();
  const cx     = rect.left + rect.width  / 2;
  const cy     = rect.top  + rect.height / 2;
  const dx     = (e.clientX - cx) / (rect.width  / 2);
  const dy     = (e.clientY - cy) / (rect.height / 2);
  const tiltX  = dy * -6; // degrees
  const tiltY  = dx *  6;

  dom.board.style.transform = `rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
});

dom.boardWrapper.addEventListener('mouseleave', () => {
  dom.board.style.transform = 'rotateX(0deg) rotateY(0deg)';
});

/* ═══════════════════════════════════════════════════════════
   THEME TOGGLE
   ═══════════════════════════════════════════════════════════ */
function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
  localStorage.setItem('nexus-theme', state.theme);
  updateThemeIcon();
}

function updateThemeIcon() {
  const svg = dom.themeSvg;
  if (state.theme === 'dark') {
    // Show sun icon
    svg.innerHTML = `
      <circle cx="12" cy="12" r="5"></circle>
      <line x1="12" y1="1" x2="12" y2="3"></line>
      <line x1="12" y1="21" x2="12" y2="23"></line>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
      <line x1="1" y1="12" x2="3" y2="12"></line>
      <line x1="21" y1="12" x2="23" y2="12"></line>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>`;
  } else {
    // Show moon icon
    svg.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>`;
  }
}

/* ═══════════════════════════════════════════════════════════
   SOUND TOGGLE
   ═══════════════════════════════════════════════════════════ */
function toggleSound() {
  state.sound = !state.sound;
  localStorage.setItem('nexus-sound', state.sound);
  updateSoundIcon();
}

function updateSoundIcon() {
  const svg = dom.soundSvg;
  if (state.sound) {
    svg.innerHTML = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>`;
    dom.soundBtn.style.opacity = '1';
  } else {
    svg.innerHTML = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <line x1="23" y1="9" x2="17" y2="15"></line>
      <line x1="17" y1="9" x2="23" y2="15"></line>`;
    dom.soundBtn.style.opacity = '0.5';
  }
}

/* ═══════════════════════════════════════════════════════════
   RIPPLE HELPER (buttons)
   ═══════════════════════════════════════════════════════════ */
function addRipple(btn) {
  btn.addEventListener('click', (e) => {
    const rect  = btn.getBoundingClientRect();
    const r     = document.createElement('span');
    const size  = Math.max(rect.width, rect.height);
    r.style.cssText = `
      position:absolute; width:${size}px; height:${size}px; border-radius:50%;
      background:rgba(255,255,255,0.18); pointer-events:none;
      left:${e.clientX - rect.left - size/2}px;
      top:${e.clientY - rect.top - size/2}px;
      transform:scale(0); animation:cellRippleAnim 0.55s ease-out forwards;
    `;
    btn.style.position = 'relative';
    btn.style.overflow = 'hidden';
    btn.appendChild(r);
    r.addEventListener('animationend', () => r.remove());
  });
}

/* ═══════════════════════════════════════════════════════════
   EVENT LISTENERS
   ═══════════════════════════════════════════════════════════ */

// Mode selection
dom.pvpBtn.addEventListener('click', () => startGame('pvp'));
dom.pvaiBtn.addEventListener('click', () => startGame('pvai'));

// In-game controls
dom.resetBtn.addEventListener('click', restartGame);
dom.menuBtn.addEventListener('click', showMenu);

// Modal actions
dom.playAgainBtn.addEventListener('click', restartGame);
dom.menuBtn2.addEventListener('click', showMenu);

// Header toggles
dom.themeBtn.addEventListener('click', toggleTheme);
dom.soundBtn.addEventListener('click', toggleSound);

// Ripple on action buttons
[dom.pvpBtn, dom.pvaiBtn, dom.resetBtn, dom.menuBtn, dom.playAgainBtn, dom.menuBtn2].forEach(addRipple);

// Close modal on backdrop click
dom.backdrop.addEventListener('click', (e) => {
  if (e.target === dom.backdrop) closeModal();
});

// Keyboard: Escape closes modal
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

/* ═══════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════ */
function init() {
  // Restore preferences
  const savedTheme = localStorage.getItem('nexus-theme');
  if (savedTheme === 'light' || savedTheme === 'dark') {
    state.theme = savedTheme;
    document.documentElement.setAttribute('data-theme', state.theme);
  }
  updateThemeIcon();

  const savedSound = localStorage.getItem('nexus-sound');
  if (savedSound !== null) state.sound = savedSound !== 'false';
  updateSoundIcon();
}

init();
