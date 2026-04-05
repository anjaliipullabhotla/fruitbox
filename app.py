import os
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


def initialize_room_state(host_sid):
    return {
        'board': create_board(),
        'players': {}, 
        'active_players': {}, 
        'host_sid': host_sid,
        'status': 'waiting',
        'start_time': None
    }


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


def broadcast_lobby_update(room_id):
    room_data = rooms.get(room_id)
    if not room_data:
        return
    all_players = list(room_data['players'].values())
    active_names = [p['name'] for p in room_data['active_players'].values()]
    for player_sid in room_data['players']:
        is_host = (player_sid == room_data['host_sid'])
        socketio.emit('update_lobby_list', {
            'room': room_id,
            'players': all_players,
            'active_names': active_names,
            'is_host': is_host
        }, to=player_sid)


def emit_game_start(sid, room_id, is_spectator=False):
    room_data = rooms.get(room_id)
    if not room_data:
        return
    socketio.emit('game_start_signal', {
        'board': room_data['board'],
        'players': room_data['active_players'],
        'start_time': room_data['start_time'],
        'is_spectator': is_spectator
    }, to=sid)


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


def emit_error(sid, message):
    socketio.emit('error_message', {'msg': message}, to=sid)


@app.route('/')
def index():
    return render_template('index.html')


@socketio.on('join_game')
def on_join(data):
    sid = request.sid
    room = data.get('room')
    name = data.get('name', 'Anonymous').strip()
    mode = data.get('mode') 
    
    if not room: return

    if mode == 'create':
        rooms[room] = initialize_room_state(sid)
    elif mode == 'join' and room not in rooms:
        emit_error(sid, 'Room not found!')
        return
    elif name in rooms[room]['players'].values():
        emit_error(sid, 'Username already taken. Please choose a different name.')
        return
    elif rooms[room]['status'] in ['active', 'restarting']:
        emit_error(sid, 'Game already in progress! You are spectating.')
        emit_game_start(sid, room, True)
    if rooms[room]['host_sid'] == None:
        rooms[room]['board'] = create_board()
        rooms[room]['host_sid'] = sid

    rooms[room]['players'][sid] = name
    join_room(room)
    if rooms[room]['status'] != 'active':
        rooms[room]['active_players'][sid] = {'name': name, 'score': 0}
    broadcast_lobby_update(room)


@socketio.on('start_game_request')
def handle_start(data):
    sid = request.sid
    room_id = data.get('room')
    
    if room_id in rooms and rooms[room_id]['host_sid'] == sid:
        rooms[room_id]['status'] = 'active'
        rooms[room_id]['start_time'] = time.time()
        for sid, name in rooms[room_id]['players'].items():
            rooms[room_id]['active_players'][sid] = {'name': name, 'score': 0}

        emit_game_start(room_id, room_id)
        socketio.start_background_task(game_timer_task, room_id)


@socketio.on('claim_box')
def handle_claim(data):
    sid = request.sid
    room_id = data.get('room')
    cells = data.get('cells', [])
    
    if room_id and rooms[room_id]['status'] == 'active':
        if sid not in rooms[room_id]['active_players']:
            print(f"Unauthorized claim attempt by spectator: {sid}")
            return
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
            }, to=room_id)


def game_timer_task(room_id):
    while room_id in rooms and rooms[room_id]['status'] == 'active':
        socketio.sleep(1)
        game = rooms[room_id]
        elapsed = time.time() - game['start_time'] 
        remaining = max(0, int(120 - elapsed))
        socketio.emit('timer_sync', {'remaining': remaining}, to=room_id)       
        if elapsed >= 120:
            end_game(room_id, "Time's up!")
            break


@socketio.on('request_time_sync')
def handle_time_sync_request(data):
    room_id = data.get('room')
    if room_id in rooms and rooms[room_id]['status'] == 'active':
        elapsed = time.time() - rooms[room_id]['start_time']
        remaining = max(0, int(120 - elapsed))
        emit('manual_time_update', {'remaining': remaining}, to=request.sid)


@socketio.on('request_reset')
def handle_reset(data):
    sid = request.sid
    room_id = data.get('room')
    
    if room_id in rooms:
        if rooms[room_id]['status'] == 'finished':
            rooms[room_id]['board'] = create_board()
            rooms[room_id]['host_sid'] = sid
        player_name = rooms[room_id]['players'].get(sid)
        if player_name:
            rooms[room_id]['active_players'][sid] = {
                'name': player_name, 
                'score': 0
            }
            emit('player_joined_next_round', {
                'count': len(rooms[room_id]['active_players'])
            }, to=room_id)
        broadcast_lobby_update(room_id)


@socketio.on('leave_game_request')
def handle_leave(data):
    sid = request.sid
    room_id = data.get('room')
    if room_id in rooms:
        rooms[room_id]['players'].pop(sid, None)
        rooms[room_id]['active_players'].pop(sid, None)
        if rooms[room_id]['host_sid'] == sid:
            rooms[room_id]['host_sid'] = None
        broadcast_lobby_update(room_id)
    print(f"Player {sid} explicitly left room {room_id}")


if __name__ == '__main__':
    # Port 5001 avoids macOS AirPlay 403 issues
    port = int(os.environ.get('PORT', 5001))
    socketio.run(app, host='0.0.0.0', port=port, debug=True)