// ヘッドライト(DESIGN.md 22章)。
// 点けると、自車の前の道を照らす。道の曲がりや坂に沿うよう、道の投影から形を作る。
// 点くときと消えるときは短くなめらかに変える(点滅はさせない、DESIGN.md 18章)。
import { CFG } from './config.js';

const FADE_TAU = 0.12;           // 点く・消えるのなめらかさ(秒)
const STEPS = 14;                // 光の形を作る点の数
const REACH = 11000;             // どこまで照らすか(ワールド単位)
// 手前の光の幅(道幅の半分に対する比)。自車の幅くらいにして、車の下から伸びて見えるようにする
const HALF_NEAR = 0.055;
const HALF_FAR = 0.5;            // 遠くの光の幅。先に行くほど広がる
const COLOR = '255, 244, 196';

export function createLights(road) {
  let on = false;
  let k = 0;

  function toggle() {
    on = !on;
    return on;
  }

  function update(dt) {
    k += ((on ? 1 : 0) - k) * (1 - Math.exp(-dt / FADE_TAU));
  }

  // road.render() のあとに呼ぶ(投影が更新されている必要がある)。
  // playerX: 自車の道路座標。光は自車の前から伸びる
  function draw(ctx, W, H, position, playerX) {
    if (k < 0.01) return;
    const carZ = position + road.carLineDistance();
    const left = [];
    const right = [];
    let lastY = Infinity;
    for (let i = 0; i <= STEPS; i++) {
      const f = i / STEPS;
      const s = road.sampleAt(carZ + f * REACH);
      if (!s.visible) break;
      if (s.y > lastY) break;          // 坂の向こうに回り込んだところで止める
      lastY = s.y;
      const half = HALF_NEAR + (HALF_FAR - HALF_NEAR) * f;
      left.push([s.x + (playerX - half) * s.w, s.y]);
      right.push([s.x + (playerX + half) * s.w, s.y]);
    }
    if (left.length < 2) return;

    const near = left[0][1];
    const far = left[left.length - 1][1];
    const g = ctx.createLinearGradient(0, near, 0, far);
    g.addColorStop(0, `rgba(${COLOR}, ${CFG.HEADLIGHT_ALPHA * k})`);
    g.addColorStop(1, `rgba(${COLOR}, 0)`);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';     // 下の色を明るくする
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(left[0][0], left[0][1]);
    for (const p of left) ctx.lineTo(p[0], p[1]);
    for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i][0], right[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  return {
    toggle,
    update,
    draw,
    get on() { return on; },
  };
}
