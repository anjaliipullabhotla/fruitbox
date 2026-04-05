const socket = io({
    transports: ["polling", "websocket"]
});
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const CELL_SIZE = 45; 
const TOTAL_TIME = 120;

let board = [];
let roomCode = "";
let mySid = "";
let isSpectator = false;
let isCreating = false;

let gameInterval = null;

let isDragging = false;
let startCell = null;
let currentSelection = [];

let imageLoaded = false;
const appleImg = new Image();
appleImg.onload = () => { imageLoaded = true; draw(); };
appleImg.src = '/static/apple.png';

/** Game UI **/

function switchScreen(screenId) {
    const screens = ['login-overlay', 'lobby-overlay', 'game-container', 'game-over-overlay'];
    screens.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = (id === screenId) ? (id.includes('overlay') ? 'flex' : 'block') : 'none';
    });
}

function draw() {
    if (!ctx || !board || board.length === 0) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#98fb98"; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    board.forEach((row, r) => {
        row.forEach((val, c) => {
            if (val === 0) return;
            const centerX = c * CELL_SIZE + CELL_SIZE / 2;
            const centerY = r * CELL_SIZE + CELL_SIZE / 2;
            
            if (imageLoaded) {
                ctx.drawImage(appleImg, centerX - 19, centerY - 19, 38, 38);
            } else {
                ctx.fillStyle = "#ff4d4d";
                ctx.beginPath(); ctx.arc(centerX, centerY, 15, 0, Math.PI*2); ctx.fill();
            }

            ctx.fillStyle = "white";
            ctx.font = "bold 18px Arial";
            ctx.textAlign = "center";
            ctx.fillText(val, centerX - 1, centerY + 10);
        });
    });

    if (currentSelection.length > 0) {
        ctx.fillStyle = "rgba(0, 123, 255, 0.2)";
        ctx.strokeStyle = "rgba(0, 123, 255, 0.8)";
        ctx.lineWidth = 3;
        
        const rMin = Math.min(...currentSelection.map(c => c[0]));
        const rMax = Math.max(...currentSelection.map(c => c[0]));
        const cMin = Math.min(...currentSelection.map(c => c[1]));
        const cMax = Math.max(...currentSelection.map(c => c[1]));
        
        const x = cMin * CELL_SIZE;
        const y = rMin * CELL_SIZE;
        const w = (cMax - cMin + 1) * CELL_SIZE;
        const h = (rMax - rMin + 1) * CELL_SIZE;
        
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
    }
}

function updateScoreBoard(players) {
    const scoreBoard = document.getElementById('score-board');
    if (!scoreBoard) return;

    scoreBoard.innerHTML = Object.entries(players)
        .map(([sid, p]) => {
            const isMe = (sid === mySid);
            const displayName = isMe ? `${p.name} (You)` : p.name;
            const activeClass = isMe ? 'style="color: #2e7d32; font-weight: 800;"' : '';
            return `<span ${activeClass}>${displayName}: <b>${p.score}</b></span>`;
        })
        .join(" | ");
}

function updateTimerUI(secondsLeft) {
    const timerBar = document.getElementById('timer-bar');
    const timerText = document.getElementById('timer-text');
    if (!timerBar || !timerText) return;

    const min = Math.floor(secondsLeft / 60);
    const sec = secondsLeft % 60;
    timerText.textContent = `${min}:${sec < 10 ? '0' : ''}${sec}`;

    const percentage = (secondsLeft / TOTAL_TIME) * 100;
    timerBar.style.width = `${Math.max(0, percentage)}%`;

    if (secondsLeft > 60) timerBar.style.backgroundColor = "#4CAF50";
    else if (secondsLeft > 20) timerBar.style.backgroundColor = "#FF9800";
    else timerBar.style.backgroundColor = "#f44336";

    timerBar.classList.toggle('pulse-animation', secondsLeft <= 10);
}

function showSpectatorError() {
    const alertBox = document.getElementById('interaction-alert');
    if (alertBox) {
        alertBox.innerText = "⚠️ You are spectating - wait for next round!";
        alertBox.style.color = "red";
    }
}

/** Game Flow  **/

function showMenu(mode) {
    const name = document.getElementById('username-input').value.trim();
    if (!name) return alert("Please enter your name first!");

    document.getElementById('initial-buttons').style.display = 'none';
    document.getElementById('room-controls').style.display = 'flex';

    isCreating = (mode === 'create');
    const roomInput = document.getElementById('room-input');
    const actionBtn = document.getElementById('action-button');
    if (isCreating) {
        isCreating = true;
        roomInput.value = Math.floor(1000 + Math.random() * 9000).toString();
        roomInput.readOnly = true;
        actionBtn.innerText = "Create & Wait";
    } else {
        roomInput.value = "";
        roomInput.readOnly = false;
        actionBtn.innerText = "Join Game";
    }
}

function resetMenu() {
    document.getElementById('initial-buttons').style.display = 'block';
    document.getElementById('room-controls').style.display = 'none';
}

function finalizeJoin() {
    const name = document.getElementById('username-input').value;
    roomCode = document.getElementById('room-input').value;
    socket.emit('join_game', { name: name, room: roomCode, mode: isCreating ? 'create' : 'join' });
}

function sendStartSignal() {
    if (roomCode) {
        socket.emit('start_game_request', { room: roomCode });
    } else {
        console.error("No room code found to start game.");
    }
}

function requestReset() {
    socket.emit('request_reset', { room: roomCode });
    document.getElementById('game-over-overlay').style.display = 'none';
    document.getElementById('game-container').style.display = 'none';
    const lobby = document.getElementById('lobby-overlay');
    if (lobby) {
        lobby.style.display = 'flex';
    }
}


function leaveRoom() {
    const roomID = document.getElementById('display-room-code').innerText;
    socket.emit('leave_game_request', { room: roomID });
    location.reload();
}

function getEventPos(e) {
    const rect = canvas.getBoundingClientRect();

    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
        r: Math.floor(((clientY - rect.top) * scaleY) / CELL_SIZE),
        c: Math.floor(((clientX - rect.left) * scaleX) / CELL_SIZE)
    };
}




/** Socket Listeners **/

socket.on('connect', () => {
    mySid = socket.id; 
    console.log("Connected with SID:", mySid);
});

socket.on('update_lobby_list', (data) => {
    roomCode = data.room;
    document.getElementById('display-room-code').innerText = data.room;
    document.getElementById('game-room-code').innerText = data.room;

    const list = document.getElementById('player-names-list');
    list.innerHTML = data.players.map(pName => {
        const isReady = data.active_names?.includes(pName);
        return `<li class="${isReady ? 'player-ready' : ''}">🍎 ${pName} ${isReady ? '(READY) ✓' : ''}</li>`;
    }).join("");

    document.getElementById('host-controls').style.display = data.is_host ? 'block' : 'none';
    document.getElementById('guest-msg').style.display = data.is_host ? 'none' : 'block';

    const gameActive = document.getElementById('game-container').style.display === 'block';
    const gameOver = document.getElementById('game-over-overlay').style.display === 'flex';
    if (!gameActive && !gameOver) switchScreen('lobby-overlay');
});

socket.on('game_start_signal', (data) => {
    isSpectator = !!data.is_spectator;
    const alertBox = document.getElementById('interaction-alert');
    if (alertBox) {
        alertBox.innerText = isSpectator ? "👀 Spectating - wait for next round!" : "";
        alertBox.style.display = isSpectator ? 'block' : 'none';
    }    
    switchScreen('game-container');
    board = data.board;
    updateScoreBoard(data.players);
    draw();
});

socket.on('update', (data) => {
    board = data.board;
    updateScoreBoard(data.players);
    draw();
});

socket.on('show_winner_screen', (data) => {
    switchScreen('game-over-overlay');
    document.getElementById('game-over-room-code').innerText = roomCode;
    document.getElementById('winner-name').innerText = `Winner: ${data.winner_name}!`;
    document.getElementById('final-score-text').innerText = `Final Score: ${data.winner_score}`;
});

socket.on('player_joined_next_round', (data) => {
    const readySpan = document.getElementById('ready-count');
    if (readySpan) {
        readySpan.innerText = `(${data.count} Ready)`;
    }
});

socket.on('timer_sync', (data) => {
    updateTimerUI(data.remaining); 
});

socket.on('manual_time_update', (data) => {
    updateTimerUI(data.remaining);
});

socket.on('error_message', (data) => {
    const err = document.getElementById('error-display');
    err.innerText = data.msg;
    err.style.display = 'block';
});

/** Input Handlers **/

function handleMove(e) {
    if (!isDragging) return;
    const endCell = getEventPos(e);
    currentSelection = [];
    
    const rStart = Math.max(0, Math.min(startCell.r, endCell.r));
    const rEnd = Math.min(board.length - 1, Math.max(startCell.r, endCell.r));
    const cStart = Math.max(0, Math.min(startCell.c, endCell.c));
    const cEnd = Math.min(board[0].length - 1, Math.max(startCell.c, endCell.c));

    for (let r = rStart; r <= rEnd; r++) {
        for (let c = cStart; c <= cEnd; c++) {
            currentSelection.push([r, c]);
        }
    }
    draw();
}

function handleEnd() {
    if (isDragging && currentSelection.length > 0) {
        if (isSpectator) {
            const alertBox = document.getElementById('interaction-alert');
            alertBox.innerText = "⚠️ Spectators cannot move!";
        } else {
            socket.emit('claim_box', { room: roomCode, cells: currentSelection });
        }
    }
    isDragging = false;
    currentSelection = [];
    draw();
}

canvas.addEventListener('mousedown', e => { isDragging = true; startCell = getEventPos(e); });
canvas.addEventListener('mousemove', handleMove);
window.addEventListener('mouseup', handleEnd);

canvas.addEventListener('touchstart', e => { e.preventDefault(); isDragging = true; startCell = getEventPos(e); }, {passive: false});
canvas.addEventListener('touchmove', e => { e.preventDefault(); handleMove(e); }, {passive: false});
canvas.addEventListener('touchend', handleEnd);

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') socket.emit('request_time_sync', { room: roomCode });
});
