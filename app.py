from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room
import random

app = Flask(__name__)
app.config['SECRET_KEY'] = 'ut-austin-fruitbox'

# Using 'threading' mode is the safest way to avoid macOS networking bugs
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

ROWS, COLS = 10, 17
rooms = {}

def create_board():
    return [[random.randint(1, 9) for _ in range(COLS)] for _ in range(ROWS)]

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('join_game')
def on_join(data):
    room = data.get('room')
    name = data.get('name', 'Anonymous')
    sid = request.sid
    
    join_room(room)
    
    if room not in rooms:
        rooms[room] = {'board': create_board(), 'players': {}}
    
    rooms[room]['players'][sid] = {"name": name, "score": 0}
    
    print(f"User {name} joined Room {room}")
    
    # Broadcast to room and send board to the new player
    emit('update_players', rooms[room]['players'], to=room)
    emit('init', {
        'board': rooms[room]['board'], 
        'players': rooms[room]['players']
    }, to=sid)

@socketio.on('claim_box')
def handle_claim(data):
    sid = request.sid
    cells = data.get('cells', [])
    
    # Find room for this SID
    room = next((r for r, d in rooms.items() if sid in d['players']), None)
    
    if room:
        board = rooms[room]['board']
        total = sum(board[r][c] for r, c in cells if board[r][c] != 0)
        
        if total == 10:
            for r, c in cells:
                board[r][c] = 0
            rooms[room]['players'][sid]['score'] += len(cells)
            emit('update', {
                'board': board, 
                'players': rooms[room]['players']
            }, to=room)

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