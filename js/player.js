// 自車(DESIGN.md 7.3)。道路座標での位置、目標への追従、ロール、描画。
import { CFG } from './config.js';

// 素材が無いときのプレースホルダー: 角丸四角+黒いタイヤ2つ(DESIGN.md 13.2)。
// 段階5で assets.js の画像に差し替える
const BODY = '#F24E4E';
const GLASS = '#CDEBFA';
const TYRE = '#2E2E33';
const LAMP = '#F2F2EC';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.fill();
}

// 原点を自車の中心として、真後ろから見た車を描く
function drawPlaceholder(ctx, w, h) {
  const x = -w / 2;
  const y = -h / 2;

  ctx.fillStyle = TYRE;
  roundRect(ctx, x + w * 0.04, y + h * 0.62, w * 0.24, h * 0.30, w * 0.07);
  roundRect(ctx, x + w * 0.72, y + h * 0.62, w * 0.24, h * 0.30, w * 0.07);

  ctx.fillStyle = BODY;
  roundRect(ctx, x, y + h * 0.16, w, h * 0.68, w * 0.16);

  ctx.fillStyle = GLASS;
  roundRect(ctx, x + w * 0.18, y + h * 0.20, w * 0.64, h * 0.32, w * 0.10);

  ctx.fillStyle = LAMP;
  roundRect(ctx, x + w * 0.06, y + h * 0.62, w * 0.14, h * 0.12, w * 0.05);
  roundRect(ctx, x + w * 0.80, y + h * 0.62, w * 0.14, h * 0.12, w * 0.05);
}

// 中心 (cx, cy) に、一辺 size の車を描く。起動画面でも使う
export function drawCar(ctx, cx, cy, size, rollDeg = 0) {
  ctx.save();
  ctx.translate(cx, cy);
  if (rollDeg) ctx.rotate(rollDeg * Math.PI / 180);
  drawPlaceholder(ctx, size, size);
  ctx.restore();
}

// 衝突したときの跳ね(DESIGN.md 7.3)
const BOUNCE_SEC = 0.3;
const BOUNCE_RATIO = 0.16;   // 車の幅に対する跳ねの高さ

export function createPlayer() {
  let x = 0;        // 道路座標 [-1, 1]
  let roll = 0;     // 見た目の傾き(度)
  let bounceT = -1; // 跳ねの経過秒。-1 は跳ねていない

  function width(W, H) {
    return CFG.CAR_WIDTH_RATIO * Math.min(W, H);
  }

  // 自車の左右端が画面に収まるように CAR_X_LIMIT を実効的に狭める(DESIGN.md 6章)。
  // safe area のぶんを差し引くのは段階8。
  // 平坦な直線での道幅から決めるので、カーブや丘で可動範囲が動くことはない
  function limitFor(W, H, roadHalfWidth) {
    const room = (W / 2 - width(W, H) / 2) / roadHalfWidth;
    return Math.min(CFG.CAR_X_LIMIT, Math.max(0, room));
  }

  // steer: [-1, 1]。maxX: 実効的な CAR_X_LIMIT
  function update(dt, steer, maxX) {
    const target = clamp(steer, -1, 1) * maxX;
    const follow = 1 - Math.exp(-dt / CFG.FOLLOW_TAU);
    // 1秒あたりの移動量は LATERAL_SPEED を超えない(DESIGN.md 5.2)
    const move = clamp((target - x) * follow, -CFG.LATERAL_SPEED * dt, CFG.LATERAL_SPEED * dt);
    x = clamp(x + move, -maxX, maxX);

    // 動いている向きに合わせて少しだけ傾ける
    const rate = dt > 0 ? clamp(move / dt / CFG.LATERAL_SPEED, -1, 1) : 0;
    roll += (rate * CFG.ROLL_MAX_DEG - roll) * follow;

    if (bounceT >= 0) {
      bounceT += dt;
      if (bounceT > BOUNCE_SEC) bounceT = -1;
    }
  }

  // 障害物に当たったとき。0.3秒で上に少し跳ねて戻る(DESIGN.md 7.3)。
  // 速度は落とさないし、止めもしない(DESIGN.md 9章、18章)
  function bounce() {
    bounceT = 0;
  }

  // carLine: その高さでの道の中心と幅(road.js が返す)
  function draw(ctx, W, H, carLine) {
    const w = width(W, H);
    const cx = carLine.x + x * carLine.w;
    const lift = bounceT >= 0
      ? Math.sin(Math.PI * (bounceT / BOUNCE_SEC)) * w * BOUNCE_RATIO
      : 0;
    const cy = H * CFG.CAR_SCREEN_Y_RATIO - w / 2 - lift;   // CAR_SCREEN_Y_RATIO は下端
    drawCar(ctx, cx, cy, w, roll);
  }

  return {
    update,
    draw,
    bounce,
    limitFor,
    get x() { return x; },
    get roll() { return roll; },
  };
}
