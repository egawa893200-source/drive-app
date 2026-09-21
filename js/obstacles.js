// 障害物(DESIGN.md 9章)。生成、当たり判定、当たったとき・避けたときの演出。
// 速度は落とさない。暗転・赤い点滅・振動はしない。記録もしない(DESIGN.md 18章)。
import { CFG } from './config.js';

// DESIGN.md 9章の種類。size は道幅の半分に対する比、aspect は 高さ/幅。
// 自車は同じ単位で 0.12 ほどなので、それを基準に大きさを決めている。
// 当たり判定(CFG)は見た目とは別に決まっているので、ここを変えても
// 「中央にいると当たる / 傾ければ避けられる」は変わらない
const KINDS = [
  { name: 'puddle', size: 0.22, aspect: 0.40 },
  { name: 'leaves', size: 0.20, aspect: 0.55 },
  { name: 'frog', size: 0.10, aspect: 0.95 },
  { name: 'ball', size: 0.12, aspect: 1.00 },
  { name: 'ducks', size: 0.18, aspect: 0.65 },
  { name: 'turtle', size: 0.12, aspect: 0.70 },
];

const HIT_SEC = 0.6;        // 跳ねて消えるまで(DESIGN.md 9章)
const HIT_RISE = 0.9;       // 放物線の高さ。自分の高さに対する比。
                            // 大きくすると画面の上に飛び出して見えなくなる
const SPARKLE_SEC = 0.5;    // きらきらの長さ
const SPARKLE_MIN = 5;
const SPARKLE_MAX = 8;
const SPARKLE_COLOR = '#FFF6C2';

function rand(a, b) {
  return a + Math.random() * (b - a);
}

// 小さな星。きらきらは画像を使わずコードで描く(DESIGN.md 13.1)
function star(ctx, cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (Math.PI / 5) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();
}

export function createObstacles(assets, road, audio, onHit) {
  assets.preload(KINDS.map((k) => k.name));

  let current = null;     // { kind, x, dist, age, state, effect }
  let sparkles = null;    // { dist, x, t, points }
  let timer = rand(CFG.OBSTACLE_INTERVAL[0], CFG.OBSTACLE_INTERVAL[1]);
  let lastSide = 0;
  let sameSide = 0;

  // 前回と同じ側が2回続いたら反対側にする(DESIGN.md 9章)
  function pickSide() {
    let side = Math.random() < 0.5 ? -1 : 1;
    if (sameSide >= 2 && side === lastSide) side = -side;
    sameSide = side === lastSide ? sameSide + 1 : 1;
    lastSide = side;
    return side;
  }

  function spawn() {
    current = {
      kind: KINDS[Math.floor(Math.random() * KINDS.length)],
      x: pickSide() * CFG.OBSTACLE_X,
      // 自車の SPEED * OBSTACLE_LEAD_TIME 先に出す(DESIGN.md 9章)
      dist: CFG.SPEED.normal * CFG.OBSTACLE_LEAD_TIME,
      age: 0,
      state: 'live',
      effect: 0,
    };
  }

  function makeSparkles(obs) {
    const n = SPARKLE_MIN + Math.floor(Math.random() * (SPARKLE_MAX - SPARKLE_MIN + 1));
    const points = [];
    for (let i = 0; i < n; i++) {
      points.push({ dx: rand(-0.6, 0.6), dy: rand(-1.1, 0.1), r: rand(0.10, 0.20) });
    }
    sparkles = { dist: obs.dist, x: obs.x, t: 0, points };
  }

  // moved: このフレームで進んだ距離。playerX: 自車の道路座標
  function update(dt, moved, playerX, enabled) {
    if (sparkles) {
      sparkles.t += dt;
      sparkles.dist -= moved;
      if (sparkles.t > SPARKLE_SEC) sparkles = null;
    }

    if (!current) {
      if (!enabled) return;
      timer -= dt;
      if (timer <= 0) {
        timer = rand(CFG.OBSTACLE_INTERVAL[0], CFG.OBSTACLE_INTERVAL[1]);
        spawn();
      }
      return;
    }

    current.age += dt;
    // 当たったあとは奥行きを止める。進め続けるとカメラに迫って画面いっぱいに
    // ふくらんでしまう。仕様は「上に跳ねて消える」(DESIGN.md 9章)
    if (current.state !== 'hit') current.dist -= moved;

    if (current.state === 'live' && current.dist <= 0) {
      // 自車の見かけの位置に届いた。左右の重なりだけで判定する(DESIGN.md 9章)
      const reach = CFG.CAR_HITBOX_HALF + CFG.OBSTACLE_HITBOX_HALF;
      if (Math.abs(current.x - playerX) < reach) {
        current.state = 'hit';
        audio.crash();
        if (onHit) onHit();
      } else {
        current.state = 'passed';
        makeSparkles(current);
        audio.dodge();
      }
      current.effect = 0;
    }

    if (current.state === 'hit') {
      current.effect += dt;
      if (current.effect > HIT_SEC) current = null;
    } else if (current.state === 'passed') {
      current.effect += dt;
      // 通り過ぎてカメラの後ろに行ったら消す
      if (current.dist < -road.carLineDistance()) current = null;
    }
  }

  // road.render() のあとに呼ぶこと(投影が更新されている必要がある)
  function draw(ctx, W, H, position) {
    const carZ = road.carLineDistance();

    if (current) {
      const s = road.sampleAt(position + carZ + current.dist);
      if (s.visible) {
        const w = current.kind.size * s.w;
        if (w >= 1) {
          const h = w * current.kind.aspect;
          let y = s.y - h;
          let alpha = Math.min(1, current.age / CFG.OBSTACLE_FADE_IN);

          if (current.state === 'hit') {
            // 放物線を描いて上に跳ねながら消える(DESIGN.md 9章)
            const t = current.effect / HIT_SEC;
            y -= Math.sin(Math.PI * t) * h * HIT_RISE;
            alpha *= 1 - t;
          }

          ctx.save();
          if (s.clip < H) {
            ctx.beginPath();
            ctx.rect(0, 0, W, s.clip);
            ctx.clip();
          }
          ctx.globalAlpha = alpha;
          assets.draw(ctx, current.kind.name, s.x + current.x * s.w - w / 2, y, w, h);
          ctx.restore();
        }
      }
    }

    if (sparkles) {
      const s = road.sampleAt(position + carZ + sparkles.dist);
      if (!s.visible) return;
      const t = sparkles.t / SPARKLE_SEC;
      ctx.save();
      ctx.globalAlpha = 1 - t;
      ctx.fillStyle = SPARKLE_COLOR;
      for (const p of sparkles.points) {
        const r = p.r * s.w * 0.5;
        if (r < 0.5) continue;
        star(ctx,
          s.x + (sparkles.x + p.dx * 0.5) * s.w,
          s.y + (p.dy - t * 0.5) * s.w * 0.5,
          r);
      }
      ctx.restore();
    }
  }

  return {
    update,
    draw,
    get info() {
      return current ? { name: current.kind.name, x: current.x, state: current.state } : null;
    },
  };
}
