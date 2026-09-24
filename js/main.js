// 起動とメインループ(DESIGN.md 11章)。
// 段階8の3: おわりの演出(12章)とPWA(15章)。
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
import { createEnding } from './ending.js';
import { createReactions } from './reactions.js';
import { createCrossing } from './crossing.js';
import { createDebug } from './debug.js';

const START = 'start';
const PLAY = 'play';
const PAUSED = 'paused';
const ENDING = 'ending';
const SLEEP = 'sleep';

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
const ending = createEnding(assets, road);
const reactions = createReactions(road, audio);
const crossing = createCrossing(road, audio, assets);
const debug = createDebug(new URLSearchParams(location.search).has('debug'));

let state = START;
let stateBeforePause = PLAY;
let W = 0;
let H = 0;
let xLimit = CFG.CAR_X_LIMIT;
let speed = CFG.SPEED.normal;
let obstaclesOn = true;
let endMinutes = 5;
let playedSec = 0;         // PLAY で遊んだ累計秒(DESIGN.md 12章)
let lastPhase = 'off';

// 設定の反映先(DESIGN.md 14章)
const APPLY = {
  sound: (v) => audio.setMuted(v === 'off'),
  speed: (v) => { speed = CFG.SPEED[v]; },
  obstacles: (v) => { obstaclesOn = v === 'on'; },
  sensitivity: (v) => input.setSensitivity(CFG.STEER_SENSITIVITY[v]),
  carColor: (v) => player.setColor(v),
  endMinutes: (v) => { endMinutes = Number(v); },
  debug: (v) => debug.setEnabled(v === 'on'),
};

const settings = createSettings(settingsEl, {
  onChange: (key, value) => APPLY[key](value),
  onCalibrate: () => input.calibrate(),
  onRestart: () => restart(),
});

// 設定を開けるのは遊んでいる間だけ。起動画面では開かない
const input = createInput(canvas, orientation, () => {
  // 眠っているときはタップしても何も起きない(DESIGN.md 11章)
  if (state !== PLAY && state !== ENDING) return;
  // 鳴ったときだけ、道ばたの物を反応させる(DESIGN.md 20章)
  if (audio.horn()) reactions.honk(position);
}, () => {
  if (state !== START && state !== PAUSED) settings.open();
});

// 道ばたの物の描き方。反応の途中なら、その動きを足して描く(DESIGN.md 20章)
function drawRoadItem(c, item, x, y, w, h) {
  reactions.drawItem(c, item, x, y, w, h, assets.draw);
}

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

// 眠ったあとの再開。設定の「もう一度あそぶ」から呼ばれる(DESIGN.md 11章)
function restart() {
  ending.reset();
  scenery.setSunset(0);
  lastPhase = 'off';
  playedSec = 0;
  audio.setVolume(1, 0.5);
  audio.resume();
  keepScreenOn();        // 眠っている間に wake lock が外れていることがある
  settings.showRestart(false);
  settings.close();
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
  } else if (state === SLEEP) {
    // おやすみの絵だけ。走らせないので、ここでは世界を進めない。
    // 角の長押しは input.update の中で数えているので、ここでも呼ぶ。
    // 呼ばないと、眠ったあとに設定を開けなくなる(DESIGN.md 11章)
    input.update(dt);
    ending.update(dt, 0, speed);
    ending.drawOverlay(ctx, W, H);
  } else {
    // ENDING の間もジャイロ操作は効いたまま(DESIGN.md 12章)
    steer = input.update(dt);
    player.update(dt, steer, xLimit);
    audio.setWind(Math.abs(steer));

    if (state === PLAY) {
      playedSec += dt;
      // おわりの時間(0 = なし)に達したら、おわりの演出に入る(DESIGN.md 12章)
      if (endMinutes > 0 && playedSec >= endMinutes * 60) {
        ending.begin();
        state = ENDING;
      }
    }

    const moved = speed * dt * ending.speedScale;
    const lastPosition = position;
    position = (position + moved) % road.length;
    scenery.update(dt, position, lastPosition);
    reactions.update(dt);
    // 踏切。おわりの演出の間は新しく置かない(DESIGN.md 21章)
    crossing.update(dt, position, speed, state === PLAY);
    // おわりの演出の間と、踏切を通るあいだは新しい障害物を出さない。
    // すでに出ている物は流れていく
    obstacles.update(dt, moved, player.x, obstaclesOn && state === PLAY && !crossing.active);
    ending.update(dt, moved, speed);
    scenery.setSunset(ending.sunset);

    if (ending.phase !== lastPhase) {
      lastPhase = ending.phase;
      // 車庫に入ったら、暗くなるのに合わせて音も落としていく
      if (lastPhase === 'enter') audio.setVolume(0, CFG.END_FADE_SEC);
      if (lastPhase === 'sleep') {
        state = SLEEP;
        settings.showRestart(true);
      }
    }

    const scene = scenery.scene;
    audio.setScene(scene.from, scene.to, scene.k);
    audio.updateMusic();

    scenery.drawBackground(ctx, W, H);
    const carLine = road.render(ctx, W, H, position, drawRoadItem, scenery.grassColor());
    obstacles.draw(ctx, W, H, position);
    ending.drawGarage(ctx, W, H, position);      // 車庫は自車より奥にある
    player.draw(ctx, W, H, carLine);
    ending.drawOverlay(ctx, W, H);               // 夕焼けと暗転は画面全体にかける
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
      reacting: reactions.count,
      crossing: crossing.info,
      inset: orientation.inset,
      limit: xLimit,
      played: playedSec,
      ending: ending.phase,
    });
    debug.draw(ctx, W, H);
  }
}

// アプリが隠れたら止め、戻ったら続きから(DESIGN.md 11章)。
// 傾きの基準は変えない
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (state === PLAY || state === ENDING || state === SLEEP) {
      stateBeforePause = state;
      state = PAUSED;
      audio.suspend();
    }
    return;
  }
  if (state === PAUSED) {
    lastTime = 0;       // 止まっていた時間ぶん進めない
    audio.resume();
    keepScreenOn();     // wake lock は隠れると外れるので取り直す
    state = stateBeforePause;
  }
});

startButton.addEventListener('click', begin);
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', resize);

// PWA(DESIGN.md 15章)。オフラインでも遊べるようにする。
// 使えない環境(file:// で開いたときなど)では何もしない
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

resize();
requestAnimationFrame(frame);
