const socket = io({
    transports: ["polling", "websocket"]
});
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const CELL_SIZE = 45; 
const TOTAL_TIME = 120;

let board = [];
let roomCode = "";
let countdownInterval = null;
let isDragging = false;
let startCell = null;
let currentSelection = [];
let imageLoaded = false;
const appleImg = new Image();
let gameInterval = null;
let isCreating = false;
let mySid = "";
let isSpectator = false;


socket.on('connect', () => {
    mySid = socket.id; 
    console.log("Connected with SID:", mySid);
});

function showMenu(mode) {
    const name = document.getElementById('username-input').value.trim();
    if (!name) return alert("Please enter your name first!");

    document.getElementById('initial-buttons').style.display = 'none';
    document.getElementById('room-controls').style.display = 'block';

    if (mode === 'create') {
        isCreating = true;
        const randomCode = Math.floor(1000 + Math.random() * 9000).toString();
        document.getElementById('room-input').value = randomCode;
        document.getElementById('room-input').readOnly = true; // Host shouldn't change it
        document.getElementById('action-button').innerText = "Create & Wait";
    } else {
        isCreating = false;
        document.getElementById('room-input').value = "";
        document.getElementById('room-input').readOnly = false;
        document.getElementById('action-button').innerText = "Join Game";
    }
}

function finalizeJoin() {
    const name = document.getElementById('username-input').value;
    roomCode = document.getElementById('room-input').value;
    const mode = isCreating ? 'create' : 'join'; 
    socket.emit('join_game', { name: name, room: roomCode, mode: mode });
}

function resetMenu() {
    document.getElementById('initial-buttons').style.display = 'block';
    document.getElementById('room-controls').style.display = 'none';
}


function updateScoreBoard(players) {
    const scoreBoard = document.getElementById('score-board');
    if (!scoreBoard) return;

    const scoresHtml = Object.entries(players)
        .map(([sid, p]) => {
            const isMe = (sid === mySid);
            const displayName = isMe ? `${p.name} (You)` : p.name;
            const activeClass = isMe ? 'style="color: #2e7d32; font-weight: 800;"' : '';

            return `<span ${activeClass}>${displayName}: <b>${p.score}</b></span>`;
        })
        .join(" | ");

    scoreBoard.innerHTML = scoresHtml;
}

function draw() {
    if (!ctx || !board || board.length === 0) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = "#98fb98"; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let r = 0; r < board.length; r++) {
        for (let c = 0; c < board[r].length; c++) {
            const val = board[r][c];
            if (val === 0) continue; 

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
            ctx.textBaseline = "middle"; 
            ctx.strokeStyle = "rgba(0,0,0,0.4)";
            ctx.fillText(val, centerX - 1, centerY + 5); 
        }
    }

    if (currentSelection.length > 0) {
        ctx.fillStyle = "rgba(0, 123, 255, 0.2)";
        ctx.strokeStyle = "rgba(0, 123, 255, 0.8)"; 
        ctx.lineWidth = 3;
        
        const rMin = Math.min(...currentSelection.map(c => c[0])), rMax = Math.max(...currentSelection.map(c => c[0]));
        const cMin = Math.min(...currentSelection.map(c => c[1])), cMax = Math.max(...currentSelection.map(c => c[1]));
        
        const x = cMin * CELL_SIZE;
        const y = rMin * CELL_SIZE;
        const w = (cMax - cMin + 1) * CELL_SIZE;
        const h = (rMax - rMin + 1) * CELL_SIZE;
        
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
    }
}


function startGame() {
    const name = document.getElementById('username-input').value.trim();
    const room = document.getElementById('room-input').value.trim();
    if (!name || !room) return alert("Enter both name and room!");
    document.getElementById('login-overlay').style.display = 'none';
    socket.emit('join_game', { name: name, room: room });
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

function startTimer(duration) {
    let timer = Math.floor(duration); 
    const totalTime = 120;
    
    const timerBar = document.getElementById('timer-bar');
    const timerText = document.getElementById('timer-text');

    if (gameInterval) {
        clearInterval(gameInterval);
        gameInterval = null; 
    }
    
    updateTimerUI(timer, totalTime);
    gameInterval = setInterval(() => {
        timer--;

        if (timer < 0) {
            clearInterval(gameInterval);
            gameInterval = null;
            return;
        }

        updateTimerUI(timer, totalTime);
    }, 1000); 
}


function updateTimerUI(secondsLeft) {
    const timerBar = document.getElementById('timer-bar');
    const timerText = document.getElementById('timer-text');
    if (!timerBar || !timerText) return;

    let min = Math.floor(secondsLeft / 60);
    let sec = secondsLeft % 60;
    timerText.textContent = `${min}:${sec < 10 ? '0' : ''}${sec}`;
    let percentage = (secondsLeft / TOTAL_TIME) * 100;
    timerBar.style.width = Math.max(0, percentage) + "%";
    if (secondsLeft > 60) {
        timerBar.style.backgroundColor = "#4CAF50"; // Green
    } 
    else if (secondsLeft <= 60 && secondsLeft > 20) {
        timerBar.style.backgroundColor = "#FF9800"; // Orange
    } 
    else {
        timerBar.style.backgroundColor = "#f44336"; // Red
    }    
    if (secondsLeft <= 10) {
        timerBar.classList.add('pulse-animation');
    } else {
        timerBar.classList.remove('pulse-animation');
    }
}


function sendStartSignal() {
    if (roomCode) {
        socket.emit('start_game_request', { room: roomCode });
    } else {
        console.error("No room code found to start game.");
    }
}

function showSpectatorError() {
    const alertBox = document.getElementById('interaction-alert');
    if (alertBox) {
        alertBox.innerText = "⚠️ You are spectating - wait for next round!";
        alertBox.style.color = "red";
    }
}


socket.on('game_start_signal', (data) => {
    isSpectator = data.is_spectator || false;

    const alertBox = document.getElementById('interaction-alert');
    if (alertBox) {
        if (isSpectator) {
            alertBox.innerText = "👀 You are spectating - wait for next round to play!";
            alertBox.style.color = "#666"; // Gray for info, red for errors
        } else {
            alertBox.innerText = ""; // Clear it for active players
            alertBox.style.display = 'none';
        }
    }
    console.log("Game starting!");
    document.getElementById('login-overlay').style.display = 'none';
    document.getElementById('lobby-overlay').style.display = 'none';
    document.getElementById('game-container').style.display = 'block';

    board = data.board;
    players = data.players; 
    updateScoreBoard(data.players); 
    draw();
});


socket.on('update', (data) => {
    board = data.board;
    updateScoreBoard(data.players);
    draw();
});


socket.on('show_winner_screen', (data) => {
    if (gameInterval) clearInterval(gameInterval);

    document.getElementById('game-container').style.display = 'none';
    const overlay = document.getElementById('game-over-overlay');
    if (overlay) overlay.style.display = 'flex';

    document.getElementById('winner-name').innerText = `Winner: ${data.winner_name}!`;
    document.getElementById('final-score-text').innerText = `Final Score: ${data.winner_score}`;
});


socket.on('update_lobby_list', (data) => {
    console.log(data)
    roomCode = data.room;
    document.getElementById('display-room-code').innerText = data.room;
    document.getElementById('game-room-code').innerText = data.room;

    const list = document.getElementById('player-names-list');
    list.innerHTML = "";
    data.players.forEach(playerName => {
        const li = document.createElement('li');
        li.innerText = "🍎 " + playerName;
        console.log(data.active_names, playerName)
        if (data.active_names && data.active_names.includes(playerName)) {
            li.classList.add('player-ready'); // Uses the CSS below
            li.innerText += " (READY) ✓";
        }
        list.appendChild(li);
    });
    if (data.is_host === true) {
        console.log("I am the host. Showing start button.");
        document.getElementById('host-controls').style.display = 'block';
        document.getElementById('guest-msg').style.display = 'none';
    } else {
        console.log("I am a guest. Showing waiting message.");
        document.getElementById('host-controls').style.display = 'none';
        document.getElementById('guest-msg').style.display = 'block';
    }
    const lobby = document.getElementById('lobby-overlay');
    const login = document.getElementById('login-overlay');
    const gameContainer = document.getElementById('game-container');
    const gameOver = document.getElementById('game-over-overlay');
    const isGameActive = gameContainer && gameContainer.style.display === 'block';
    const isGameOver = gameOver && window.getComputedStyle(gameOver).display !== 'none';
    if (isGameActive) {
        if (lobby) lobby.style.display = 'none';
        if (login) login.style.display = 'none';
    } else if (isGameOver) {
        if (lobby) lobby.style.display = 'none';
    } else {
        if (lobby) lobby.style.display = 'flex';
        if (login) login.style.display = 'none';
    }
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


socket.on('error_message', (data) => {
    const err = document.getElementById('error-display');
    err.innerText = data.msg;
    err.style.display = 'block';
});


canvas.addEventListener('mousedown', e => { 
    isDragging = true; 
    startCell = getEventPos(e); 
});
canvas.addEventListener('mousemove', e => {
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
});

canvas.addEventListener('mouseup', () => {
    if (isDragging && currentSelection.length > 0) {
        if (isSpectator) {
            showSpectatorError()
        } else {
            socket.emit('claim_box', { cells: currentSelection });
        } 
    }
    isDragging = false;
    currentSelection = [];
    draw();
});

canvas.addEventListener('touchstart', function(e) {
    e.preventDefault(); // Prevents the page from scrolling while playing
    isDragging = true;
    startCell = getEventPos(e);
}, { passive: false });

canvas.addEventListener('touchmove', function(e) {
    e.preventDefault();
    if (!isDragging) return;
    
    const endCell = getEventPos(e);
    currentSelection = [];
    
    const rStart = Math.min(startCell.r, endCell.r);
    const rEnd = Math.max(startCell.r, endCell.r);
    const cStart = Math.min(startCell.c, endCell.c);
    const cEnd = Math.max(startCell.c, endCell.c);

    for (let r = rStart; r <= rEnd; r++) {
        for (let c = cStart; c <= cEnd; c++) {
            currentSelection.push([r, c]);
        }
    }
    draw();
}, { passive: false });

canvas.addEventListener('touchend', function(e) {
    if (isDragging && currentSelection.length > 0) {
        if (isSpectator) {
            showSpectatorError()
        } else {
            socket.emit('claim_box', { cells: currentSelection });
        }
    }
    isDragging = false;
    currentSelection = [];
    draw();
});

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
        console.log("Tab regained focus. Requesting time sync...");
        socket.emit('request_time_sync', { room: roomCode });
    }
});

socket.on('manual_time_update', (data) => {
    updateTimerUI(data.remaining);
});

appleImg.onload = () => {
    imageLoaded = true;
    draw();
};
appleImg.src = '/static/apple.png';