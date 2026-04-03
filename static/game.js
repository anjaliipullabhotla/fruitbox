// 1. Connection Setup
const socket = io({
    transports: ["polling", "websocket"]
});
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const CELL_SIZE = 45; 

// 2. Global State
let board = [];
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
            ctx.fillText(val, centerX - 1, centerY + 5); 
        }
    }

    if (currentSelection.length > 0) {
        ctx.strokeStyle = "rgba(0, 123, 255, 0.6)";
        ctx.lineWidth = 3;
        const rMin = Math.min(...currentSelection.map(c => c[0])), rMax = Math.max(...currentSelection.map(c => c[0]));
        const cMin = Math.min(...cols = currentSelection.map(c => c[1])), cMax = Math.max(...cols);
        ctx.strokeRect(cMin * CELL_SIZE + 2, rMin * CELL_SIZE + 2, (cMax - cMin + 1) * CELL_SIZE - 4, (rMax - rMin + 1) * CELL_SIZE - 4);
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
    draw();
});

socket.on('update', (data) => {
    board = data.board;
    updateScoreboard(data.players);
    draw();
});

socket.on('update_players', (playerData) => {
    updateScoreboard(playerData);
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

// 6. START Execution (Image loading at the very end)
appleImg.onload = () => {
    imageLoaded = true;
    draw();
};
appleImg.src = '/static/apple.png';