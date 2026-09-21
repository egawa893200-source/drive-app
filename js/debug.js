// デバッグ表示(DESIGN.md 16章)。画面の左上に小さく半透明で出す。
// 段階3では設定画面がまだ無いので、URLに ?debug を付けると出る。
// 段階8で設定の「デバッグ表示」からも切り替えられるようにする。

const UPDATE_SEC = 0.2;   // 数字がチラチラしないよう、表示は1秒に5回だけ更新する
const FONT_RATIO = 0.032;
const PAD = 8;

function num(v, digits = 1) {
  return v === null || v === undefined ? '-' : v.toFixed(digits);
}

export function createDebug(enabled) {
  let fps = 0;
  let since = 0;
  let lines = [];

  function update(dt, info) {
    if (!enabled) return;
    if (dt > 0) fps += (1 / dt - fps) * 0.1;
    since += dt;
    if (since < UPDATE_SEC && lines.length) return;
    since = 0;
    lines = [
      `fps ${num(fps, 0)}`,
      `angle ${num(info.angle)}  base ${num(info.baseline)}`,
      `diff ${info.angle === null ? '-' : num(info.angle - info.baseline)}`,
      `steer ${num(info.steer, 2)}  x ${num(info.playerX, 2)}`,
      `gyro ${info.gyro ? 'on' : 'off'}  rot ${num(info.rotation, 0)}`,
      `gx ${num(info.gx, 2)}  gy ${num(info.gy, 2)}`,
      `audio ${info.audio ? 'on' : 'off'}  scene ${info.scene || '-'}`,
      `assets ${info.assets ? `${info.assets.loaded}/${info.assets.requested}` : '-'}`,
      `obs ${info.obstacle ? `${info.obstacle.name} x${num(info.obstacle.x, 2)} ${info.obstacle.state}` : '-'}`,
      // safe area は段階8で足す
    ];
  }

  function draw(ctx, W, H) {
    if (!enabled || !lines.length) return;
    const size = Math.round(Math.min(W, H) * FONT_RATIO);
    const lh = Math.round(size * 1.35);
    ctx.save();
    ctx.font = `${size}px ui-monospace, monospace`;
    ctx.textBaseline = 'top';
    const width = Math.max(...lines.map((l) => ctx.measureText(l).width));
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(PAD, PAD, width + PAD * 2, lh * lines.length + PAD * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    lines.forEach((line, i) => ctx.fillText(line, PAD * 2, PAD * 2 + lh * i));
    ctx.restore();
  }

  return { update, draw, enabled };
}
