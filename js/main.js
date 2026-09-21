// 起動とメインループ(DESIGN.md 11章)。
// 段階6では START → PLAY まで。一時停止・復帰と wake lock は段階8。
import { CFG } from './config.js';
import { createRoad } from './road.js';
import { createPlayer, drawCar } from './player.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createAssets } from './assets.js';
import { createScenery } from './scenery.js';
import { createObstacles } from './obstacles.js';
import { createDebug } from './debug.js';

const START = 'start';
const PLAY = 'play';

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: false });
const startEl = document.getElementById('start');
const startButton = document.getElementById('startButton');

const road = createRoad();
const assets = createAssets();
const scenery = createScenery(assets, road);
const player = createPlayer();
const audio = createAudio();
// 「障害物なし」の設定は段階8。それまでは常にあり(DESIGN.md 9章の初期値)
const obstacles = createObstacles(assets, road, audio, () => player.bounce());
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

    const moved = CFG.SPEED.normal * dt;
    const lastPosition = position;
    position = (position + moved) % road.length;
    scenery.update(dt, position, lastPosition);
    obstacles.update(dt, moved, player.x, true);

    scenery.drawBackground(ctx, W, H);
    const carLine = road.render(ctx, W, H, position, assets.draw);
    obstacles.draw(ctx, W, H, position);
    player.draw(ctx, W, H, carLine);
  }

  if (debug.enabled) {
    const info = input.info();
    debug.update(dt, {
      ...info,
      steer,
      playerX: player.x,
      audio: audio.ready,
      scene: scenery.sceneId,
      assets: assets.stats(),
      obstacle: obstacles.info,
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
