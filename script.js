const canvas = document.getElementById('snakeCanvas');
const ctx = canvas.getContext('2d');

let width, height;

// 画面サイズのリサイズ対応
function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
}
window.addEventListener('resize', resize);
resize();

// 状態の管理
const state = {
    mouseX: width / 2,
    mouseY: height / 2,
    targetX: width / 2,
    targetY: height / 2,
    lastMouseMoveTime: Date.now(),
    isIdle: false, // うろつきモード管理フラグ
};

window.addEventListener('mousemove', (e) => {
    state.mouseX = e.clientX;
    state.mouseY = e.clientY;
    state.targetX = state.mouseX;
    state.targetY = state.mouseY;
    state.lastMouseMoveTime = Date.now();
    
    // マウスが動いたらすぐ追従に戻る
    if (state.isIdle) {
        state.isIdle = false;
    }
});

// タッチも簡易対応
window.addEventListener('touchmove', (e) => {
    state.mouseX = e.touches[0].clientX;
    state.mouseY = e.touches[0].clientY;
    state.targetX = state.mouseX;
    state.targetY = state.mouseY;
    state.lastMouseMoveTime = Date.now();
    
    if (state.isIdle) {
        state.isIdle = false;
    }
}, { passive: true });

// ヘビの設定
const snake = {
    segments: [],
    history: [],     // 動いた軌跡を保存
    numSegments: 30, // 節の数（長さ）
    size: 24,        // 基本サイズ
    spacing: 14,     // 節と節の間隔
    speed: 4         // カーソル追従スピード（Slither風の定速）
};

// ヘビの配置初期化
for (let i = 0; i < snake.numSegments; i++) {
    snake.segments.push({
        x: width / 2,
        y: height / 2,
        angle: 0
    });
}
snake.history.push({ x: width / 2, y: height / 2, angle: 0 });

function setRandomTarget() {
    const margin = 100;
    state.targetX = margin + Math.random() * (Math.max(1, width - margin * 2));
    state.targetY = margin + Math.random() * (Math.max(1, height - margin * 2));
}

// 物理演算・目標追従ロジック
function update() {
    const now = Date.now();
    
    // 2秒操作がないとアイドル状態
    if (now - state.lastMouseMoveTime > 2000) {
        if (!state.isIdle) {
            state.isIdle = true;
            setRandomTarget();
        }
    }
    
    // アイドル時はランダムな地点をうろつく
    if (state.isIdle) {
        const dx = state.targetX - snake.segments[0].x;
        const dy = state.targetY - snake.segments[0].y;
        // ターゲットにある程度接近したら次のターゲットへ（迂回して少し大回りになるため、到達判定を広めにする）
        if (Math.sqrt(dx * dx + dy * dy) < 80) {
            setRandomTarget();
        }
    }

    const head = snake.segments[0];
    const hDx = state.targetX - head.x;
    const hDy = state.targetY - head.y;
    const dist = Math.sqrt(hDx * hDx + hDy * hDy);
    
    let isMoving = false;

    // ----- 共通のステアリング（旋回）ロジック -----
    if (dist > 2) { // わずかな遊びを持たせてピタッと止まらせる
        const targetAngle = Math.atan2(hDy, hDx);
        
        let diff = targetAngle - head.angle;
        // 最も近い回転方向を選ぶ（-PI から PI の範囲内に正規化）
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        
        // 旋回速度（小回り力）の計算
        let turnSpeed;
        if (state.isIdle) {
            turnSpeed = 0.04; // アイドル時は大きく迂回
        } else {
            // ターゲットに極端に近いとき「ぐるぐる回り続ける（オービット現象）」のを防ぐため、
            // 70px以内に入ったら距離に応じて大きく小回りが利く（急旋回できる）ようにする
            if (dist < 70) {
                turnSpeed = 0.12 + (1 - dist / 70) * 0.3; // 近づくほど最大 0.42 の急旋回力
            } else {
                turnSpeed = 0.12;
            }
        }
        
        if (Math.abs(diff) < turnSpeed) {
            head.angle = targetAngle;
        } else {
            head.angle += Math.sign(diff) * turnSpeed;
        }
        
        // 移動速度の計算
        let currentMoveSpeed;
        if (state.isIdle) {
            currentMoveSpeed = 2; // うろつき速度
        } else {
            // 50px以内から滑らかにブレーキをかけることで、小回りをさらに助ける
            currentMoveSpeed = (dist > 50) ? snake.speed : (snake.speed * Math.max(0.1, dist / 50));
        }

        // head.angle の向いている方向に進む（車や船と同じ操舵的な動き）
        head.x += Math.cos(head.angle) * currentMoveSpeed;
        head.y += Math.sin(head.angle) * currentMoveSpeed;
        isMoving = true;
    }

    // 履歴に現在の頭の座標を記録する（動いた時のみ）
    if (isMoving) {
        snake.history.unshift({ x: head.x, y: head.y, angle: head.angle });
        // 十分な長さを保持
        if (snake.history.length > 500) {
            snake.history.pop();
        }
    }

    // 胴体は「線形補間付き」で履歴配列を遡って位置を決める
    let currentHistoryIndex = 0;
    for (let i = 1; i < snake.segments.length; i++) {
        let accumulatedDistance = 0;
        let found = false;
        
        for (let j = currentHistoryIndex; j < snake.history.length - 1; j++) {
            const currPoint = snake.history[j];
            const nextPoint = snake.history[j + 1];
            const d = Math.sqrt(Math.pow(currPoint.x - nextPoint.x, 2) + Math.pow(currPoint.y - nextPoint.y, 2));
            accumulatedDistance += d;
            
            if (accumulatedDistance >= snake.spacing) {
                // 履歴の間隔が微小な場合でも正確な距離を描くための線形補間（Interpolation）
                const over = accumulatedDistance - snake.spacing;
                let exactX = nextPoint.x;
                let exactY = nextPoint.y;
                
                if (d > 0) {
                    const ratio = over / d; // 行き過ぎた分戻る割合
                    exactX = nextPoint.x + (currPoint.x - nextPoint.x) * ratio;
                    exactY = nextPoint.y + (currPoint.y - nextPoint.y) * ratio;
                }
                
                currentHistoryIndex = j;
                snake.segments[i].x = exactX;
                snake.segments[i].y = exactY;
                
                // 角度は一つ前の節へ向くように計算し、細かなガタつきを防ぐ
                const prev = snake.segments[i - 1];
                snake.segments[i].angle = Math.atan2(prev.y - exactY, prev.x - exactX);
                
                found = true;
                break;
            }
        }
        
        if (!found && snake.history.length > 0) {
            const lastPoint = snake.history[snake.history.length - 1];
            snake.segments[i].x = lastPoint.x;
            snake.segments[i].y = lastPoint.y;
            
            // 履歴に余りがない場合も、前の節の方向を向く
            const prev = snake.segments[i - 1];
            snake.segments[i].angle = Math.atan2(prev.y - lastPoint.y, prev.x - lastPoint.x);
        }
    }
}

// ドット絵風の描画
function drawPixelArtSquare(x, y, size, color, isHead, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle); // 進行方向へ向かせる

    ctx.fillStyle = color;
    // メインの四角
    ctx.fillRect(-size/2, -size/2, size, size);
    
    // ドット絵風の暗い枠・影（内側に下と右）
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(-size/2 + 2, size/2 - 4, size - 2, 4); // 下
    ctx.fillRect(size/2 - 4, -size/2 + 2, 4, size - 2); // 右

    // 頭の装飾（目、舌）
    if (isHead) {
        // 白目
        ctx.fillStyle = 'white';
        ctx.fillRect(size/4, -size/2 - 6, 8, 8); // 左目
        ctx.fillRect(size/4, size/2 - 2, 8, 8); // 右目
        
        // 黒目
        ctx.fillStyle = 'black';
        ctx.fillRect(size/4 + 4, -size/2 - 2, 4, 4);
        ctx.fillRect(size/4 + 4, size/2 + 2, 4, 4);
        
        // 舌 (ピクセルアート風に先割れ)
        ctx.fillStyle = '#e74c3c';
        ctx.fillRect(size/2, -2, 8, 4);
        ctx.fillRect(size/2 + 8, -6, 4, 4);
        ctx.fillRect(size/2 + 8, 2, 4, 4);
    }
    
    ctx.restore();
}

function draw() {
    ctx.clearRect(0, 0, width, height);
    
    // 尻尾から描画することで、頭が上に重なるようにする
    for (let i = snake.segments.length - 1; i >= 0; i--) {
        const seg = snake.segments[i];
        const isHead = (i === 0);
        
        // 尻尾にいくほど小さくする
        const sizeRatio = 1 - (i / snake.segments.length) * 0.6; // 頭が1.0、尻尾が0.4
        const s = snake.size * sizeRatio;
        
        // 尻尾にいくほど暗い緑にする
        const g = Math.floor(204 - i * 4);
        const color = `rgb(46, ${Math.max(g, 50)}, 113)`;
        
        drawPixelArtSquare(seg.x, seg.y, s, color, isHead, seg.angle);
    }
}

function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
}

// アニメーションスタート
loop();
