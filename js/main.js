// 起動とメインループ(DESIGN.md 11章)。
// 段階2では状態遷移はまだ作らず、道が流れて自車を左右に動かせるところまで。
import { CFG } from './config.js';
import { createRoad } from './road.js';
import { createPlayer } from './player.js';
import { createInput } from './input.js';

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: false });

const road = createRoad();
const player = createPlayer();
const input = createInput(canvas);

// 論理画面サイズ。画面の回転と safe area は段階8(orientation.js)で入れる
let W = 0;
let H = 0;
let xLimit = CFG.CAR_X_LIMIT;

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, CFG.MAX_DPR);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  xLimit = player.limitFor(W, H, road.carLineHalfWidth(W));
}

let position = 0;
let lastTime = 0;

function frame(now) {
  // dt は秒。タブから戻ったときに一気に進まないよう MAX_DT で頭を押さえる
  const dt = lastTime ? Math.min(CFG.MAX_DT, (now - lastTime) / 1000) : 0;
  lastTime = now;

  const steer = input.update(dt);
  player.update(dt, steer, xLimit);

  position = (position + CFG.SPEED.normal * dt) % road.length;
  const carLine = road.render(ctx, W, H, position);
  player.draw(ctx, W, H, carLine);

  requestAnimationFrame(frame);
}

window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

resize();
requestAnimationFrame(frame);
