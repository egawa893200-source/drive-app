// 運転席のボタン(DESIGN.md 22章)。
// 画面の下に丸いボタンを4つ並べる。文字は出さず、色と絵だけ。絵はコードで描く。
// 押した瞬間に少し沈む。点滅はさせない(DESIGN.md 18章)。
import { CFG } from './config.js';

// slot は端から数えた位置(0 がいちばん外側)
const BUTTONS = [
  { id: 'horn', side: -1, slot: 0, color: '#E8584F', ring: '#B8413A' },
  { id: 'wiper', side: -1, slot: 1, color: '#4A90E2', ring: '#3570B5' },
  { id: 'animal', side: 1, slot: 1, color: '#5FAE52', ring: '#468A3C' },
  { id: 'light', side: 1, slot: 0, color: '#F2C037', ring: '#C99A22' },
];

const CORNER_RATIO = 0.15;   // 設定を開く角の大きさ(DESIGN.md 14章。input.js と同じ値)
const PAD_RATIO = 0.03;      // 画面の端とのすき間(短辺比)
const GAP_RATIO = 0.35;      // ボタンどうしのすき間(半径比)
const HIT_RATIO = 1.12;      // 小さな指でも当たるよう、見た目より少し広く取る
const PRESS_SEC = 0.18;      // 沈んで戻るまで
const ICON = '#FFFFFF';

export function createButtons() {
  const press = {};           // id -> 押してからの秒数
  let lit = false;            // ライトが点いているか(ボタンの見た目に出す)
  let layout = [];

  // 論理画面の大きさと safe area から、ボタンの位置を決める
  function place(W, H, inset) {
    const r = H * CFG.BUTTON_RADIUS_RATIO;
    const pad = H * PAD_RATIO;
    // 設定を開く角(左上・右下)には重ねない。当たり判定の広がりぶんも空ける
    const corner = H * CORNER_RATIO + r * (HIT_RATIO - 1) + 4;
    const left = Math.max(inset.left + pad, corner);
    const right = Math.max(inset.right + pad, corner);
    const y = H - inset.bottom - pad - r;
    layout = BUTTONS.map((b) => {
      const offset = r + b.slot * (2 * r + r * GAP_RATIO);
      const x = b.side < 0 ? left + offset : W - right - offset;
      return { ...b, x, y, r };
    });
  }

  // 押された場所にあるボタンの id。無ければ null
  function hit(x, y) {
    for (const b of layout) {
      if (Math.hypot(x - b.x, y - b.y) <= b.r * HIT_RATIO) return b.id;
    }
    return null;
  }

  function pressed(id) {
    press[id] = 0;
  }

  function update(dt) {
    for (const id of Object.keys(press)) {
      press[id] += dt;
      if (press[id] > PRESS_SEC) delete press[id];
    }
  }

  function draw(ctx) {
    for (const b of layout) {
      // 沈み込み: 押した瞬間に小さくなって、なめらかに戻る
      const t = press[b.id];
      const sink = t === undefined ? 0 : Math.sin(Math.PI * Math.min(1, t / PRESS_SEC));
      const r = b.r * (1 - 0.1 * sink);
      const cy = b.y + b.r * 0.06 * sink;

      ctx.save();
      // 影
      ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
      ctx.beginPath();
      ctx.arc(b.x, b.y + b.r * 0.08, b.r, 0, Math.PI * 2);
      ctx.fill();
      // ライトが点いているときは、まわりをやわらかく光らせる(点滅はしない)
      if (b.id === 'light' && lit) {
        ctx.fillStyle = 'rgba(255, 238, 150, 0.45)';
        ctx.beginPath();
        ctx.arc(b.x, cy, b.r * 1.22, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = b.id === 'light' && lit ? '#FFD95A' : b.color;
      ctx.beginPath();
      ctx.arc(b.x, cy, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = b.r * 0.08;
      ctx.strokeStyle = b.ring;
      ctx.stroke();

      ctx.translate(b.x, cy);
      ICONS[b.id](ctx, r);
      ctx.restore();
    }
  }

  return {
    place,
    hit,
    pressed,
    update,
    draw,
    setLit(v) { lit = v; },
    get layout() { return layout; },
  };
}

// ボタンの絵。原点がボタンの中心、r が半径
const ICONS = {
  // ハンドル。クラクションは本物の車でもハンドルの真ん中にある
  horn(ctx, r) {
    ctx.strokeStyle = ICON;
    ctx.fillStyle = ICON;
    ctx.lineWidth = r * 0.12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    for (const a of [Math.PI / 2, Math.PI * 7 / 6, -Math.PI / 6]) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.2, 0, Math.PI * 2);
    ctx.fill();
  },

  // ワイパー。根元から斜めに伸びる腕と、太いゴム
  wiper(ctx, r) {
    ctx.strokeStyle = ICON;
    ctx.fillStyle = ICON;
    ctx.lineCap = 'round';
    ctx.lineWidth = r * 0.09;
    ctx.beginPath();
    ctx.arc(0, r * 0.45, r * 0.62, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
    ctx.lineWidth = r * 0.1;
    ctx.beginPath();
    ctx.moveTo(-r * 0.05, r * 0.42);
    ctx.lineTo(r * 0.3, -r * 0.35);
    ctx.stroke();
    ctx.lineWidth = r * 0.17;
    ctx.beginPath();
    ctx.moveTo(r * 0.15, -r * 0.02);
    ctx.lineTo(r * 0.34, -r * 0.44);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-r * 0.05, r * 0.42, r * 0.11, 0, Math.PI * 2);
    ctx.fill();
  },

  // 足あと
  animal(ctx, r) {
    ctx.fillStyle = ICON;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.2, r * 0.3, r * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    for (const [x, y] of [[-0.36, -0.1], [-0.14, -0.34], [0.14, -0.34], [0.36, -0.1]]) {
      ctx.beginPath();
      ctx.ellipse(x * r, y * r, r * 0.12, r * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  // ライト。左に丸いランプ、右に光の線
  light(ctx, r) {
    ctx.fillStyle = ICON;
    ctx.strokeStyle = ICON;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-r * 0.02, -r * 0.34);
    ctx.bezierCurveTo(-r * 0.62, -r * 0.34, -r * 0.62, r * 0.34, -r * 0.02, r * 0.34);
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = r * 0.1;
    for (const y of [-0.24, 0, 0.24]) {
      ctx.beginPath();
      ctx.moveTo(r * 0.14, y * r);
      ctx.lineTo(r * 0.5, y * r);
      ctx.stroke();
    }
  },
};
