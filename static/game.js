const socket = io();
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const CELL_SIZE = 45; 

const appleImg = new Image();
appleImg.src = '/static/apple.png';
let imageLoaded = false;

appleImg.onload = () => {
    imageLoaded = true;
    draw();
};

let board = [];
let isDragging = false;
let startCell = null;
let currentSelection = [];

socket.on('init', (data) => {
    board = data.board;
    draw();
});

socket.on('update', (data) => {
    board = data.board;
    document.getElementById('p1-score').innerText = data.scores.player1;
    document.getElementById('p2-score').innerText = data.scores.player2;
    draw();
});

// Helper to get row/col from mouse position
function getCell(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    return {
        r: Math.floor(y / CELL_SIZE),
        c: Math.floor(x / CELL_SIZE)
    };
}

canvas.addEventListener('mousedown', e => {
    isDragging = true;
    startCell = getCell(e);
});

canvas.addEventListener('mousemove', e => {
    if (!isDragging) return;
    const endCell = getCell(e);
    
    currentSelection = [];
    // Ensure we stay within board bounds
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
        socket.emit('claim_box', { cells: currentSelection, player: 'player1' });
    }
    isDragging = false;
    currentSelection = [];
    draw();
});

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (!board || board.length === 0) return;

    // Outer loop: Rows (10)
    for (let r = 0; r < board.length; r++) {
        // Inner loop: Columns (17)
        for (let c = 0; c < board[r].length; c++) {
            const val = board[r][c];
            if (val === 0) continue; 

            const centerX = c * CELL_SIZE + CELL_SIZE / 2;
            const centerY = r * CELL_SIZE + CELL_SIZE / 2;
            const imgSize = 38; // Slightly smaller apple for better spacing

            if (imageLoaded) {
                ctx.drawImage(appleImg, centerX - imgSize/2, centerY - imgSize/2, imgSize, imgSize);
            }

            // --- NICER, SMALLER FONT ---
            ctx.fillStyle = "white";
            ctx.font = "bold 18px 'Helvetica Neue', Arial, sans-serif"; // Smaller & cleaner
            ctx.textAlign = "center";
            ctx.textBaseline = "middle"; 
            
            // Adding a tiny +2 y-offset often makes it look more "centered" 
            // visually because of how apple stems are shaped.
            ctx.fillText(val, centerX - 1, centerY + 5); 
        }
    }

    // Selection box styling
    if (currentSelection.length > 0) {
        ctx.strokeStyle = "rgba(0, 123, 255, 0.6)";
        ctx.lineWidth = 3;
        const rows = currentSelection.map(cell => cell[0]);
        const cols = currentSelection.map(cell => cell[1]);
        const rMin = Math.min(...rows), rMax = Math.max(...rows);
        const cMin = Math.min(...cols), cMax = Math.max(...cols);
        
        ctx.strokeRect(
            cMin * CELL_SIZE + 2, 
            rMin * CELL_SIZE + 2, 
            (cMax - cMin + 1) * CELL_SIZE - 4, 
            (rMax - rMin + 1) * CELL_SIZE - 4
        );
    }
}

// Function to get coordinates from either Mouse or Touch
function getEventPos(e) {
    const rect = canvas.getBoundingClientRect();
    // Check if it's a touch event or mouse event
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    
    // Calculate the scale (in case CSS resized the canvas)
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    
    return {
        r: Math.floor(((clientY - rect.top) * scaleY) / CELL_SIZE),
        c: Math.floor(((clientX - rect.left) * scaleX) / CELL_SIZE)
    };
}

// Attach Touch Listeners
canvas.addEventListener('touchstart', e => {
    e.preventDefault(); // Stop scrolling
    isDragging = true;
    startCell = getEventPos(e);
}, { passive: false });

canvas.addEventListener('touchmove', e => {
    e.preventDefault();
    if (!isDragging) return;
    const endCell = getEventPos(e);
    updateSelection(startCell, endCell);
    draw();
}, { passive: false });

canvas.addEventListener('touchend', () => {
    if (isDragging && currentSelection.length > 0) {
        socket.emit('claim_box', { cells: currentSelection, player: 'player1' });
    }
    isDragging = false;
    currentSelection = [];
    draw();
});