// 起動とメインループ(DESIGN.md 11章)。
// 段階3では START → PLAY まで。一時停止・復帰と wake lock は段階8。
import { CFG } from './config.js';
import { createRoad } from './road.js';
import { createPlayer, drawCar } from './player.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createDebug } from './debug.js';

const START = 'start';
const PLAY = 'play';

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: false });
const startEl = document.getElementById('start');
const startButton = document.getElementById('startButton');

const road = createRoad();
const player = createPlayer();
const audio = createAudio();
const input = createInput(canvas, () => {
  if (state === PLAY) audio.horn();
});
const debug = createDebug(new URLSearchParams(location.search).has('debug'));

let state = START;

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

// 起動画面: 画面いっぱいの車の絵(DESIGN.md 11章)
function drawStartScreen() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#7EC8F0');
  g.addColorStop(1, '#CDEBFA');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const size = Math.min(W, H) * 0.55;
  drawCar(ctx, W / 2, H * 0.42, size);
}

// 「はじめる」は大人が押す。この中で許可要求・音の有効化・キャリブレーションを行う
function begin() {
  audio.start();        // iOSはユーザー操作の中でしか音を出せない
  input.enableGyro();   // 許可ダイアログもユーザー操作の中で出す
  input.calibrate();
  startEl.hidden = true;
  state = PLAY;
}

let position = 0;
let lastTime = 0;
let steer = 0;

function frame(now) {
  // dt は秒。タブから戻ったときに一気に進まないよう MAX_DT で頭を押さえる
  const dt = lastTime ? Math.min(CFG.MAX_DT, (now - lastTime) / 1000) : 0;
  lastTime = now;

  if (state === START) {
    drawStartScreen();
  } else {
    steer = input.update(dt);
    player.update(dt, steer, xLimit);
    audio.setWind(Math.abs(steer));

    position = (position + CFG.SPEED.normal * dt) % road.length;
    const carLine = road.render(ctx, W, H, position);
    player.draw(ctx, W, H, carLine);
  }

  if (debug.enabled) {
    const info = input.info();
    debug.update(dt, {
      ...info,
      steer,
      playerX: player.x,
      audio: audio.ready,
    });
    debug.draw(ctx, W, H);
  }

  requestAnimationFrame(frame);
}

startButton.addEventListener('click', begin);
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

resize();
requestAnimationFrame(frame);
