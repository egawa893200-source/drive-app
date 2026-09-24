// ワイパー(DESIGN.md 22章)。
// 画面の手前を2本のワイパーが大きく1往復する。画面そのものがフロントガラスのつもり。
// 止まっているときは画面の下に隠れていて、見えない。
import { CFG } from './config.js';

const PIVOTS = [0.28, 0.66];    // 根元の位置(画面の幅に対する比)
const PIVOT_Y = 1.04;           // 根元は画面の下のすぐ外(高さに対する比)
const LENGTH = 0.95;            // 腕の長さ(高さに対する比)
const REST_DEG = 178;           // 止まっているとき。左を向いて寝ている(画面の外)
const TOP_DEG = 30;             // いちばん上がったとき
const BLADE_FROM = 0.38;        // 腕のどこからゴムが付いているか
const ARM_COLOR = '#41454D';
const BLADE_COLOR = '#23262C';

export function createWiper(audio) {
  let t = -1;          // 動きはじめてからの秒数。-1 は止まっている
  let queued = false;  // 動いている間に押されたら、もう1往復

  function start() {
    t = 0;
    audio.wiper(CFG.WIPER_SEC);
  }

  function press() {
    if (t < 0) start();
    else queued = true;          // それ以上はためない(DESIGN.md 22章)
  }

  function update(dt) {
    if (t < 0) return;
    t += dt;
    if (t < CFG.WIPER_SEC) return;
    if (queued) {
      queued = false;
      start();
    } else {
      t = -1;
    }
  }

  function draw(ctx, W, H) {
    if (t < 0) return;
    // 0 → 1 → 0。行きも帰りも、はじめと終わりはゆっくり
    const k = 0.5 - 0.5 * Math.cos(2 * Math.PI * (t / CFG.WIPER_SEC));
    const deg = REST_DEG + (TOP_DEG - REST_DEG) * k;
    const a = deg * Math.PI / 180;
    const dx = Math.cos(a);
    const dy = -Math.sin(a);           // 画面の y は下向き
    const len = H * LENGTH;

    ctx.save();
    ctx.lineCap = 'round';
    for (const px of PIVOTS) {
      const x0 = W * px;
      const y0 = H * PIVOT_Y;
      ctx.strokeStyle = ARM_COLOR;
      ctx.lineWidth = H * 0.018;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x0 + dx * len, y0 + dy * len);
      ctx.stroke();
      ctx.strokeStyle = BLADE_COLOR;
      ctx.lineWidth = H * 0.03;
      ctx.beginPath();
      ctx.moveTo(x0 + dx * len * BLADE_FROM, y0 + dy * len * BLADE_FROM);
      ctx.lineTo(x0 + dx * len, y0 + dy * len);
      ctx.stroke();
    }
    ctx.restore();
  }

  return {
    press,
    update,
    draw,
    get active() { return t >= 0; },
  };
}
