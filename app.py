from flask import Flask, render_template
from flask_socketio import SocketIO, emit
import random

app = Flask(__name__)
app.config['SECRET_KEY'] = 'apple-secret!'
socketio = SocketIO(app, cors_allowed_origins="*")

# Game Constants
ROWS, COLS = 10, 17
board = [[random.randint(1, 9) for _ in range(COLS)] for _ in range(ROWS)]
scores = {"player1": 0, "player2": 0}

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('connect')
def start():
    emit('init', {'board': board, 'scores': scores})

@socketio.on('claim_box')
def handle_claim(data):
    # data: {'cells': [[r,c], [r,c]], 'player': 'player1'}
    cells = data['cells']
    player = data['player']
    
    # Validation: Sum must be 10
    total = sum(board[r][c] for r, c in cells if board[r][c] != 0)
    
    if total == 10:
        for r, c in cells:
            board[r][c] = 0  # Clear the apple
        scores[player] += len(cells)
        emit('update', {'board': board, 'scores': scores}, broadcast=True)

if __name__ == '__main__':
    socketio.run(app, debug=True, port=5000)