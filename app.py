from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room
import random
import time

app = Flask(__name__)
app.config['SECRET_KEY'] = 'ut-austin-fruitbox'

# Using 'threading' mode is the safest way to avoid macOS networking bugs
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

ROWS, COLS = 10, 17
rooms = {}

def create_board():
    return [[random.randint(1, 9) for _ in range(COLS)] for _ in range(ROWS)]

def check_valid_moves(board):
    # This is a classic "Subarray Sum" problem logic (O(N^2 * M^2) but fine for 10x17)
    # Check every possible rectangle to see if any sum to 10
    rows = len(board)
    cols = len(board[0])
    for r1 in range(rows):
        for c1 in range(cols):
            for r2 in range(r1, rows):
                for c2 in range(c1, cols):
                    total = 0
                    for r in range(r1, r2 + 1):
                        for c in range(c1, c2 + 1):
                            total += board[r][c]
                    if total == 10:
                        return True
    return False

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('join_game')
def on_join(data):
    sid = request.sid
    room = data.get('room')
    name = data.get('name', 'Anonymous')
    
    join_room(room)
    
    # Check if we need to initialize OR reset the room
    # We reset if the room exists but the 2-minute timer is up
    if room not in rooms or (time.time() - rooms[room]['start_time'] > 120):
        print(f"Generating fresh board for Room {room}")
        rooms[room] = {
            'board': create_board(),
            'players': {}, # Note: This clears old scores too!
            'start_time': time.time()
        }
    
    rooms[room]['players'][sid] = {"name": name, "score": 0}
    
    emit('update_players', rooms[room]['players'], to=room)
    emit('init', {
        'board': rooms[room]['board'], 
        'players': rooms[room]['players']
    }, to=sid)


@socketio.on('claim_box')
def handle_claim(data):
    sid = request.sid
    cells = data.get('cells', [])
    
    # 1. Identify the room ID via the SID mapping
    room_id = next((r for r, d in rooms.items() if sid in d['players']), None)
    
    if room_id:
        game = rooms[room_id]
        
        # 2. Check if the 2-minute (120s) timer has expired
        elapsed = time.time() - game['start_time']
        if elapsed > 120:
            emit('game_over', {'reason': 'Time is up!'}, to=room_id)
            return

        board = game['board']
        total = sum(board[r][c] for r, c in cells if board[r][c] != 0)
        
        if total == 10:
            for r, c in cells:
                board[r][c] = 0
            
            game['players'][sid]['score'] += len(cells)
            
            # 3. Check if any valid moves remain after this clear
            if not check_valid_moves(board):
                emit('game_over', {'reason': 'No moves left! Board cleared.'}, to=room_id)
            
            emit('update', {
                'board': board, 
                'players': game['players']
            }, to=room_id)


@socketio.on('disconnect')
def on_disconnect():
    sid = request.sid
    for room in list(rooms.keys()):
        if sid in rooms[room]['players']:
            del rooms[room]['players'][sid]
            if not rooms[room]['players']:
                del rooms[room]
            else:
                emit('update_players', rooms[room]['players'], to=room)
            break

if __name__ == '__main__':
    # Use 127.0.0.1 to bypass the localhost/IPv6 403 error
    socketio.run(app, host='127.0.0.1', port=5000, debug=True)