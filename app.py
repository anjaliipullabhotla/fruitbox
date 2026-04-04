import time
import random
from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room

app = Flask(__name__)
app.config['SECRET_KEY'] = 'ut-austin-fruitbox'

socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

ROWS, COLS = 10, 17
rooms = {}

def create_board():
    return [[random.randint(1, 9) for _ in range(COLS)] for _ in range(ROWS)]

def check_valid_moves(board):
    rows = len(board)
    cols = len(board[0])
    
    for r in range(rows):
        for c in range(cols):
            val = board[r][c]
            if val == 0: continue
            if c + 1 < cols and board[r][c+1] != 0:
                if val + board[r][c+1] == 10:
                    return True
            if r + 1 < rows and board[r+1][c] != 0:
                if val + board[r+1][c] == 10:
                    return True
    return False 

def end_game(room_id, reason):
    if room_id not in rooms:
        return
    game = rooms[room_id]
    
    active_list = list(game['active_players'].values())
    winner = max(active_list, key=lambda x: x['score'])
    winner_name = winner['name']
    winner_score = winner['score']

    game['status'] = 'finished'
    game['active_players'] = {} 
    socketio.emit('show_winner_screen', {
        'winner_name': winner_name,
        'winner_score': winner_score,
        'reason': reason
    }, to=room_id)
    broadcast_lobby_update(room_id)

@app.route('/')
def index():
    return render_template('index.html')

def broadcast_lobby_update(room_id):
    room_data = rooms.get(room_id)
    if not room_data:
        return
    all_players = [p['name'] for p in room_data['players'].values()]
    active_names = [p['name'] for p in room_data['active_players'].values()]
    for player_sid in room_data['players']:
        is_host = (player_sid == room_data['host_sid'])
        socketio.emit('update_lobby_list', {
            'room': room_id,
            'players': all_players,
            'active_names': active_names,
            'is_host': is_host
        }, to=player_sid)


@socketio.on('join_game')
def on_join(data):
    sid = request.sid
    room = data.get('room')
    name = data.get('name', 'Anonymous').strip()
    mode = data.get('mode') 
    
    if not room: return

    if mode == 'create':
        rooms[room] = {
            'board': create_board(),
            'players': {}, 
            'active_players': {},
            'host_sid': sid,
            'status': 'waiting',
            'start_time': None
        }
    elif mode == 'join' and room not in rooms:
        emit('error_message', {'msg': 'Room not found!'}, to=sid)
        return
    elif rooms[room]['status'] in ['active', 'restarting']:
        emit('error_message', {'msg': 'Game already in progress! Please wait for the next round.'}, to=sid)
        return

    existing_names = [p['name'] for p in rooms[room]['players'].values()]
    if name in existing_names:
        emit('error_message', {'msg': 'Username already taken. Please choose a different name.'}, to=sid)
        return

    rooms[room]['players'][sid] = {"name": name, "score": 0}
    join_room(room, sid=sid)  

    if rooms[room]['status'] == 'waiting':
        rooms[room]['active_players'][sid] = {"name": name, "score": 0}
    
    broadcast_lobby_update(room)


@socketio.on('start_game_request')
def handle_start(data):
    sid = request.sid
    room_id = data.get('room')
    
    if room_id in rooms and rooms[room_id]['host_sid'] == sid:
        rooms[room_id]['status'] = 'active'
        rooms[room_id]['start_time'] = time.time()
        rooms[room_id]['active_players'] = rooms[room_id]['players'].copy()

        active_room_name = f"{room_id}_active"
        for player_sid in rooms[room_id]['active_players']:
            join_room(active_room_name, sid=player_sid)
        emit('game_start_signal', {
            'board': rooms[room_id]['board'],
            'players': rooms[room_id]['active_players'],
            'start_time': rooms[room_id]['start_time']
        }, to=active_room_name)
        socketio.start_background_task(game_timer_task, room_id)


@socketio.on('claim_box')
def handle_claim(data):
    sid = request.sid
    cells = data.get('cells', [])
    room_id = next((r for r, d in rooms.items() if sid in d['players']), None)
    
    if room_id and rooms[room_id]['status'] == 'active':
        game = rooms[room_id]

        if game['start_time'] is None: return

        if not check_valid_moves(game['board']):
            end_game(room_id, 'No valid moves remaining.')
            return

        board = game['board']
        total = sum(board[r][c] for r, c in cells if board[r][c] != 0)
        
        if total == 10:
            for r, c in cells:
                board[r][c] = 0
            game['active_players'][sid]['score'] += len(cells)
            emit('update', {
                'board': rooms[room_id]['board'],
                'players': rooms[room_id]['active_players']
            }, to=f"{room_id}_active")


def game_timer_task(room_id):
    print(f"Timer started for room: {room_id}")
    while room_id in rooms and rooms[room_id]['status'] == 'active':
        socketio.sleep(1)
        
        game = rooms[room_id]
        elapsed = time.time() - game['start_time'] 
        remaining = max(0, int(120 - elapsed))
        socketio.emit('timer_sync', {'remaining': remaining}, to=f"{room_id}_active")       
        if elapsed >= 120:
            end_game(room_id, "Time's up!")
            break

@socketio.on('request_time_sync')
def handle_time_sync_request(data):
    room_id = data.get('room')
    if room_id in rooms and rooms[room_id]['status'] == 'active':
        elapsed = time.time() - rooms[room_id]['start_time']
        remaining = max(0, int(120 - elapsed))
        # Send ONLY to the person who just woke up
        emit('manual_time_update', {'remaining': remaining}, to=request.sid)

@socketio.on('request_reset')
def handle_reset(data):
    sid = request.sid
    room_id = data.get('room')
    
    if room_id in rooms:
        if rooms[room_id]['status'] != 'restarting':
            print(f'Restarting game with host: {sid}')
            rooms[room_id]['status'] = 'restarting'
            rooms[room_id]['board'] = create_board()
            rooms[room_id]['start_time'] = None
            rooms[room_id]['host_sid'] = sid
            rooms[room_id]['active_players'] = {}
            

        player_data = rooms[room_id]['players'].get(sid)
        if player_data:
            rooms[room_id]['active_players'][sid] = {
                'name': player_data['name'], 
                'score': 0
            }
            join_room(f"{room_id}_active", sid=sid)
            emit('player_joined_next_round', {
                'count': len(rooms[room_id]['active_players'])
            }, to=room_id)
        broadcast_lobby_update(room_id)


if __name__ == '__main__':
    # Port 5001 avoids macOS AirPlay 403 issues
    socketio.run(app, host='127.0.0.1', port=5001, debug=True)