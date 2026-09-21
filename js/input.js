// 操作(DESIGN.md 5章)。段階2はタッチとキーボードだけ。
// ジャイロとキャリブレーションは段階3、タップのクラクションは音と一緒に段階3で足す。
import { CFG } from './config.js';

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function createInput(target) {
  const pointers = new Map();   // pointerId -> -1(左) / +1(右)
  const keys = { left: false, right: false };
  let steer = 0;                // なめらかにしたあとの値

  // 押された場所が画面の左半分か右半分か。
  // 段階8で canvas を回転させたら、orientation.js の変換を通してから判定する
  function sideOf(clientX) {
    return clientX < window.innerWidth / 2 ? -1 : 1;
  }

  // 左右を同時に押したら打ち消し合う
  function rawTarget() {
    let t = 0;
    for (const side of pointers.values()) t += side;
    if (keys.left) t -= 1;
    if (keys.right) t += 1;
    return clamp(t, -1, 1);
  }

  target.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, sideOf(e.clientX));
    if (target.setPointerCapture) target.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  // 押したまま左右をまたいだら向きを切り替える
  target.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, sideOf(e.clientX));
  });

  const release = (e) => pointers.delete(e.pointerId);
  target.addEventListener('pointerup', release);
  target.addEventListener('pointercancel', release);

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
    keys.left = false;
    keys.right = false;
  });

  function update(dt) {
    // 段階3でジャイロぶんをここに足してクランプする(DESIGN.md 5.4)
    const t = rawTarget();
    steer += (t - steer) * (1 - Math.exp(-dt / CFG.TOUCH_RAMP_TAU));
    return clamp(steer, -1, 1);
  }

  return { update, get steer() { return steer; } };
}
