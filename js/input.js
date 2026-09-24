// 操作(DESIGN.md 5章)。ジャイロ、タッチ、キーボード、キャリブレーション。
import { CFG } from './config.js';

const DEG = Math.PI / 180;
const TAP_MS = 200;
// 設定を開くジェスチャー(DESIGN.md 14章)。
// 画面の左上と右下の角(それぞれ短辺の15%四方)を同時に2秒
const CORNER_RATIO = 0.15;
const CORNER_HOLD_SEC = 2;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// 重力ベクトルの、画面の横方向の成分から傾き角を求める(DESIGN.md 5.1)。
// 回転の補正はここで一度だけ行う。ほかの場所で重ねて補正しない。
function steerAngleDeg(g, rotationDeg) {
  const r = rotationDeg * DEG;
  // 画面の横方向の重力成分。
  // DESIGN.md 5.1 の式は g.y の符号が + になっているが、それだと横持ちで左右が
  // 逆になる(実機で確認)。画面の右方向を端末座標で表すと、角度90のとき -y、
  // 角度270のとき +y なので、ここは - が正しい。縦持ち(角度0)では変わらない。
  const sx = g.x * Math.cos(r) - g.y * Math.sin(r);
  const mag = Math.hypot(g.x, g.y, g.z) || 9.8;
  const s = clamp(sx / mag, -1, 1);
  return CFG.STEER_SIGN * Math.asin(s) * 180 / Math.PI;
}

export function createInput(target, orientation, onTap, onCorners) {
  const pointers = new Map();        // pointerId -> -1(左) / +1(右)
  const pressedAt = new Map();       // pointerId -> 押した時刻
  const spots = new Map();           // pointerId -> 論理座標
  let cornerHeld = 0;                // 角を押し続けている秒数
  let cornerFired = false;
  const keys = { left: false, right: false };
  let touchSteer = 0;                // なめらかにしたあとのタッチ操作量

  // ジャイロ
  const raw = { x: 0, y: 0, z: -9.8 };
  const gravity = { x: 0, y: 0, z: -9.8 };
  let hasMotion = false;
  let firstSample = true;
  let gyroOn = false;
  let baseline = 0;
  let needCalibration = false;
  let sensitivity = CFG.STEER_SENSITIVITY.mid;

  function rotationDeg() {
    const screenAngle = (window.screen && window.screen.orientation
      && typeof window.screen.orientation.angle === 'number')
      ? window.screen.orientation.angle
      : (typeof window.orientation === 'number' ? window.orientation : 0);
    return screenAngle + orientation.rotation;
  }

  function onMotion(e) {
    const a = e.accelerationIncludingGravity;
    if (!a || a.x === null || a.x === undefined) return;
    raw.x = a.x;
    raw.y = a.y;
    raw.z = a.z;
    if (firstSample) {
      // 1つ目の値は平滑化せずそのまま入れる。基準取りが遅れないように
      gravity.x = a.x;
      gravity.y = a.y;
      gravity.z = a.z;
      firstSample = false;
    }
    hasMotion = true;
  }

  // 起動画面のタップの中から呼ぶ(iOSはユーザー操作の中でしか許可を出せない)。
  // 許可が無い環境や断られた場合は、タッチ操作だけで遊べる状態のまま進む
  function enableGyro() {
    const DME = window.DeviceMotionEvent;
    if (!DME) return;
    const listen = () => {
      window.addEventListener('devicemotion', onMotion);
      gyroOn = true;
    };
    if (typeof DME.requestPermission === 'function') {
      DME.requestPermission()
        .then((res) => { if (res === 'granted') listen(); })
        .catch(() => {});
    } else {
      listen();
    }
  }

  // 傾きの基準を取り直す。呼べるのは「はじめる」と設定の「傾きをリセット」だけ
  // (DESIGN.md 5.3)。遊んでいる最中に基準を変えるジェスチャーは作らない
  function calibrate() {
    if (hasMotion) {
      baseline = steerAngleDeg(gravity, rotationDeg());
      needCalibration = false;
    } else {
      // まだセンサーの値が来ていないので、最初の値が来たときに取る
      needCalibration = true;
    }
  }

  function gyroSteer() {
    if (!gyroOn || !hasMotion) return 0;
    const angle = steerAngleDeg(gravity, rotationDeg()) - baseline;
    if (Math.abs(angle) < CFG.STEER_DEADZONE_DEG) return 0;
    const over = angle > 0
      ? angle - CFG.STEER_DEADZONE_DEG
      : angle + CFG.STEER_DEADZONE_DEG;
    return clamp(over / CFG.STEER_RANGE_DEG * sensitivity, -1, 1);
  }

  // 押された場所が画面の左半分か右半分か。
  // 箱を回しているので、論理座標に直してから判定する(DESIGN.md 5.4)
  function sideOf(clientX, clientY) {
    return orientation.toLogical(clientX, clientY).x < orientation.width / 2 ? -1 : 1;
  }

  // 左上と右下の角を同時に押し続けているか(DESIGN.md 14章)。
  // 手のひらを置いただけでは両方に届かない
  function cornersHeld() {
    const size = orientation.height * CORNER_RATIO;
    let topLeft = false;
    let bottomRight = false;
    for (const p of spots.values()) {
      if (p.x < size && p.y < size) topLeft = true;
      if (p.x > orientation.width - size && p.y > orientation.height - size) bottomRight = true;
    }
    return topLeft && bottomRight;
  }

  // 左右を同時に押したら打ち消し合う
  function touchTarget() {
    let t = 0;
    for (const side of pointers.values()) t += side;
    if (keys.left) t -= 1;
    if (keys.right) t += 1;
    return clamp(t, -1, 1);
  }

  target.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, sideOf(e.clientX, e.clientY));
    pressedAt.set(e.pointerId, performance.now());
    spots.set(e.pointerId, orientation.toLogical(e.clientX, e.clientY));
    // 取れないことがあるので、失敗しても操作は続けられるようにする
    try {
      if (target.setPointerCapture) target.setPointerCapture(e.pointerId);
    } catch (err) {
      // 無視してよい
    }
    e.preventDefault();
  });

  // 押したまま左右をまたいだら向きを切り替える
  target.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, sideOf(e.clientX, e.clientY));
    spots.set(e.pointerId, orientation.toLogical(e.clientX, e.clientY));
  });

  target.addEventListener('pointerup', (e) => {
    const at = pressedAt.get(e.pointerId);
    const wasCorner = cornerHeld > 0;
    pointers.delete(e.pointerId);
    pressedAt.delete(e.pointerId);
    spots.delete(e.pointerId);
    // 押してすぐ離したらクラクション(DESIGN.md 5.4)。
    // ただし設定を開くジェスチャーの途中なら鳴らさない
    if (!wasCorner && at !== undefined && performance.now() - at < TAP_MS && onTap) onTap();
  });

  target.addEventListener('pointercancel', (e) => {
    pointers.delete(e.pointerId);
    pressedAt.delete(e.pointerId);
    spots.delete(e.pointerId);
  });

  // PCでの開発用
  window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') keys.left = true;
    if (e.key === 'ArrowRight') keys.right = true;
  });
  window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft') keys.left = false;
    if (e.key === 'ArrowRight') keys.right = false;
  });

  // 画面から離れたときに押しっぱなし扱いが残らないようにする
  window.addEventListener('blur', () => {
    pointers.clear();
    pressedAt.clear();
    spots.clear();
    keys.left = false;
    keys.right = false;
  });

  function update(dt) {
    // 角の長押しで設定を開く
    if (cornersHeld()) {
      cornerHeld += dt;
      if (!cornerFired && cornerHeld >= CORNER_HOLD_SEC) {
        cornerFired = true;
        if (onCorners) onCorners();
      }
    } else {
      cornerHeld = 0;
      cornerFired = false;
    }

    if (hasMotion) {
      const k = 1 - Math.exp(-dt / CFG.GRAVITY_LPF_TAU);
      gravity.x += (raw.x - gravity.x) * k;
      gravity.y += (raw.y - gravity.y) * k;
      gravity.z += (raw.z - gravity.z) * k;
      if (needCalibration) calibrate();
    }

    // 角を押しているあいだは操縦しない。離したときに跳ねないよう 0 に戻していく
    const target = cornerHeld > 0 ? 0 : touchTarget();
    touchSteer += (target - touchSteer) * (1 - Math.exp(-dt / CFG.TOUCH_RAMP_TAU));
    if (cornerHeld > 0) return 0;

    // タッチとジャイロは併用できる。両方あれば足してクランプ(DESIGN.md 5.4)
    return clamp(touchSteer + gyroSteer(), -1, 1);
  }

  // デバッグ表示用(DESIGN.md 16章)
  function info() {
    return {
      gyro: gyroOn,
      angle: hasMotion ? steerAngleDeg(gravity, rotationDeg()) : null,
      baseline,
      rotation: rotationDeg(),
      gx: hasMotion ? gravity.x : null,
      gy: hasMotion ? gravity.y : null,
    };
  }

  return {
    update,
    enableGyro,
    calibrate,
    info,
    setSensitivity(v) { sensitivity = v; },
  };
}
