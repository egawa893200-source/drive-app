// 起動とメインループ(DESIGN.md 11章)。
// 段階8の2: 大人向け設定。おわりの演出とPWAは段階8の3で入れる。
import { CFG } from './config.js';
import { createOrientation } from './orientation.js';
import { createRoad } from './road.js';
import { createPlayer, drawCar } from './player.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';
import { createAssets } from './assets.js';
import { createScenery } from './scenery.js';
import { createObstacles } from './obstacles.js';
import { createSettings } from './settings.js';
import { createDebug } from './debug.js';

const START = 'start';
const PLAY = 'play';
const PAUSED = 'paused';

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { alpha: false });
const stageEl = document.getElementById('stage');
const safeEl = document.getElementById('safearea');
const startEl = document.getElementById('start');
const startButton = document.getElementById('startButton');
const settingsEl = document.getElementById('settings');

const orientation = createOrientation(stageEl, canvas, safeEl);
const road = createRoad();
const assets = createAssets();
const scenery = createScenery(assets, road);
const player = createPlayer(assets);
const audio = createAudio();
const obstacles = createObstacles(assets, road, audio, () => player.bounce());
const debug = createDebug(new URLSearchParams(location.search).has('debug'));

let state = START;
let W = 0;
let H = 0;
let xLimit = CFG.CAR_X_LIMIT;
let speed = CFG.SPEED.normal;
let obstaclesOn = true;

// 設定の反映先(DESIGN.md 14章)
const APPLY = {
  sound: (v) => audio.setMuted(v === 'off'),
  speed: (v) => { speed = CFG.SPEED[v]; },
  obstacles: (v) => { obstaclesOn = v === 'on'; },
  sensitivity: (v) => input.setSensitivity(CFG.STEER_SENSITIVITY[v]),
  carColor: (v) => player.setColor(v),
  endMinutes: () => {},          // おわりの演出は段階8の3で入れる
  debug: (v) => debug.setEnabled(v === 'on'),
};

const settings = createSettings(settingsEl, {
  onChange: (key, value) => APPLY[key](value),
  onCalibrate: () => input.calibrate(),
});

// 設定を開けるのは PLAY のときだけ。起動画面では開かない
const input = createInput(canvas, orientation, () => {
  if (state === PLAY) audio.horn();
}, () => {
  if (state === PLAY) settings.open();
});

function resize() {
  orientation.resize(ctx);
  W = orientation.width;
  H = orientation.height;
  xLimit = player.limitFor(W, H, road.carLineHalfWidth(W), orientation.inset);
}

// 画面を消さないようにする(DESIGN.md 15章)。未対応なら何もしない
let wakeLock = null;
function keepScreenOn() {
  if (!navigator.wakeLock) return;
  navigator.wakeLock.request('screen')
    .then((lock) => { wakeLock = lock; })
    .catch(() => {});
}

// 起動画面: 画面いっぱいの車の絵(DESIGN.md 11章)
function drawStartScreen() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#7EC8F0');
  g.addColorStop(1, '#CDEBFA');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  drawCar(ctx, W / 2, H * 0.42, Math.min(W, H) * 0.55);
}

// 「はじめる」は大人が押す。この中で許可要求・音の有効化・
// キャリブレーション・wake lock取得を行う(DESIGN.md 11章)
function begin() {
  audio.start();        // iOSはユーザー操作の中でしか音を出せない
  input.enableGyro();   // 許可ダイアログもユーザー操作の中で出す
  input.calibrate();
  keepScreenOn();
  settings.applyAll();   // 保存されている設定をここで効かせる
  startEl.hidden = true;
  state = PLAY;
}

let position = 0;
let lastTime = 0;
let steer = 0;

function frame(now) {
  requestAnimationFrame(frame);

  // dt は秒。復帰したときに一気に進まないよう MAX_DT で頭を押さえる
  const dt = lastTime ? Math.min(CFG.MAX_DT, (now - lastTime) / 1000) : 0;
  lastTime = now;

  if (state === PAUSED) return;

  if (state === START) {
    drawStartScreen();
  } else {
    steer = input.update(dt);
    player.update(dt, steer, xLimit);
    audio.setWind(Math.abs(steer));

    const moved = speed * dt;
    const lastPosition = position;
    position = (position + moved) % road.length;
    scenery.update(dt, position, lastPosition);
    obstacles.update(dt, moved, player.x, obstaclesOn);

    const scene = scenery.scene;
    audio.setScene(scene.from, scene.to, scene.k);
    audio.updateMusic();

    scenery.drawBackground(ctx, W, H);
    const carLine = road.render(ctx, W, H, position, assets.draw, scenery.grassColor());
    obstacles.draw(ctx, W, H, position);
    player.draw(ctx, W, H, carLine);
  }

  if (debug.enabled) {
    debug.update(dt, {
      ...input.info(),
      steer,
      playerX: player.x,
      audio: audio.ready,
      scene: scenery.scene,
      assets: assets.stats(),
      obstacle: obstacles.info,
      inset: orientation.inset,
      limit: xLimit,
    });
    debug.draw(ctx, W, H);
  }
}

// アプリが隠れたら止め、戻ったら続きから(DESIGN.md 11章)。
// 傾きの基準は変えない
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (state === PLAY) {
      state = PAUSED;
      audio.suspend();
    }
    return;
  }
  if (state === PAUSED) {
    lastTime = 0;       // 止まっていた時間ぶん進めない
    audio.resume();
    keepScreenOn();     // wake lock は隠れると外れるので取り直す
    state = PLAY;
  }
});

startButton.addEventListener('click', begin);
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

resize();
requestAnimationFrame(frame);
