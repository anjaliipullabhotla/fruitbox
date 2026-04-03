// 1. Connection Setup
const socket = io({
    transports: ["polling", "websocket"]
});
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const CELL_SIZE = 45; 
const TOTAL_TIME = 120;

// 2. Global State
let board = [];
let countdownInterval = null;
let isDragging = false;
let startCell = null;
let currentSelection = [];
let imageLoaded = false;
const appleImg = new Image();

// 3. Define Functions FIRST (So they are ready when called)

function updateScoreboard(playerData) {
    const statsDiv = document.querySelector('.stats');
    if (!statsDiv) return;
    let html = "";
    for (let sid in playerData) {
        const p = playerData[sid];
        html += `<strong>${p.name}:</strong> ${p.score} | `;
    }
    statsDiv.innerHTML = html.slice(0, -3);
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
                // Fallback circle if image fails
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
        
        // Calculate the bounding box of the selection
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
    
    // Use a new event name to signal joining a specific room
    socket.emit('join_game', { name: name, room: room });
}

function getEventPos(e) {
    const rect = canvas.getBoundingClientRect();
    
    // Check if it's a touch event or a mouse event
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
        r: Math.floor(((clientY - rect.top) * scaleY) / CELL_SIZE),
        c: Math.floor(((clientX - rect.left) * scaleX) / CELL_SIZE)
    };
}
// 4. Socket Listeners
socket.on('init', (data) => {
    board = data.board;
    updateScoreboard(data.players);
    startTimer(120); // 120 seconds
    draw();
});

function startTimer() {
    if (countdownInterval) clearInterval(countdownInterval);
    
    let timeLeft = TOTAL_TIME;
    const timerBar = document.getElementById('timer-bar');
    const timerText = document.getElementById('timer-text');

    countdownInterval = setInterval(() => {
        timeLeft--;
        
        // 1. Update the Text (2:00 format)
        const mins = Math.floor(timeLeft / 60);
        const secs = timeLeft % 60;
        timerText.innerText = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
        
        // 2. Calculate Percentage and Update Bar Width
        const percentage = (timeLeft / TOTAL_TIME) * 100;
        timerBar.style.width = percentage + "%";

        // 3. Optional: Change color as time gets low (Visual Cues)
        if (percentage < 25) {
            timerBar.style.backgroundColor = "#ff5252"; // Red
        } else if (percentage < 50) {
            timerBar.style.backgroundColor = "#ffa726"; // Orange
        }

        if (timeLeft <= 0) {
            clearInterval(countdownInterval);
            // Trigger your game over logic here
        }
    }, 1000);
}

socket.on('update', (data) => {
    board = data.board;
    updateScoreboard(data.players);
    draw();
});

socket.on('update_players', (playerData) => {
    updateScoreboard(playerData);
});

socket.on('game_over', (data) => {
    alert(data.reason);
    
    // Stop the timer
    if (countdownInterval) clearInterval(countdownInterval);
    
    // Reset local game state
    board = [];
    currentSelection = [];
    draw();

    // Show the login screen again (the inputs will still have the old text)
    document.getElementById('login-overlay').style.display = 'flex';
    document.getElementById('login-overlay').querySelector('h2').innerText = "Game Over! Play again?";
});


// 5. Input Listeners
canvas.addEventListener('mousedown', e => { isDragging = true; startCell = getEventPos(e); });
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
        socket.emit('claim_box', { cells: currentSelection });
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
        socket.emit('claim_box', { cells: currentSelection });
    }
    isDragging = false;
    currentSelection = [];
    draw();
});

// 6. START Execution (Image loading at the very end)
appleImg.onload = () => {
    imageLoaded = true;
    draw();
};
appleImg.src = '/static/apple.png';