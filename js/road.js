// 擬似3Dの道路(DESIGN.md 7章)。区間の生成、投影、路面の描画。
import { CFG } from './config.js';

const SEG = CFG.SEGMENT_LENGTH;
const DEG = Math.PI / 180;

// カメラの奥行き(DESIGN.md 7.2)
const CAMERA_DEPTH = 1 / Math.tan((CFG.FOV_DEG / 2) * DEG);

// 段階5で scenery.js の場面テーブルに移す。今は「朝の草原」の色だけ持つ
const COLORS = {
  SKY_TOP: '#7EC8F0',
  SKY_BOTTOM: '#CDEBFA',
  GRASS: '#7BC96F',
  ROAD_LIGHT: '#7C8089',
  ROAD_DARK: '#72767F',
  CENTER_LINE: '#F2F2EC',
};

// 道の形。curve は曲がり具合(+が右、DESIGN.md 7.1 により ±2 まで)、
// hill はその区間で持ち上げる高さ。丘は区間の始めと終わりで必ず 0 に戻すので、
// 道をループさせても高さの継ぎ目が出ない。
const SECTIONS = [
  { n: 80, curve: 0, hill: 0 },
  { n: 120, curve: 1.2, hill: 0 },
  { n: 60, curve: 0, hill: 700 },
  { n: 120, curve: -1.4, hill: 0 },
  { n: 80, curve: 0, hill: 0 },
  { n: 140, curve: 1.8, hill: 900 },
  { n: 60, curve: 0, hill: 0 },
  { n: 120, curve: -1.0, hill: 500 },
  { n: 100, curve: 0, hill: 0 },
  { n: 140, curve: 2.0, hill: 0 },
  { n: 80, curve: 0, hill: 800 },
  { n: 120, curve: -1.8, hill: 0 },
  { n: 100, curve: 0, hill: 0 },
  { n: 130, curve: 1.4, hill: 600 },
  { n: 90, curve: 0, hill: 0 },
  { n: 130, curve: -2.0, hill: 0 },
  { n: 70, curve: 0, hill: 900 },
  { n: 120, curve: 0.8, hill: 0 },
  { n: 100, curve: 0, hill: 0 },
  { n: 120, curve: -1.2, hill: 700 },
  { n: 60, curve: 0, hill: 0 },
];

// 区間内での曲がり具合の出入り。急に曲がり始めないよう、前後25%でなめらかに変える
const CURVE_EASE = 0.25;

function smoothstep(t) {
  return t * t * (3 - 2 * t);
}

function curveEnvelope(t) {
  if (t < CURVE_EASE) return smoothstep(t / CURVE_EASE);
  if (t > 1 - CURVE_EASE) return smoothstep((1 - t) / CURVE_EASE);
  return 1;
}

// 0 から始まり 0 で終わる、なめらかな丘
function hillAt(height, t) {
  return height * 0.5 * (1 - Math.cos(2 * Math.PI * t));
}

function buildSegments() {
  const segments = [];
  for (const sec of SECTIONS) {
    for (let i = 0; i < sec.n; i++) {
      const index = segments.length;
      const t1 = i / sec.n;
      const t2 = (i + 1) / sec.n;
      segments.push({
        index,
        curve: sec.curve * curveEnvelope(t1),
        p1: { world: { y: hillAt(sec.hill, t1), z: index * SEG }, camera: {}, screen: {} },
        p2: { world: { y: hillAt(sec.hill, t2), z: (index + 1) * SEG }, camera: {}, screen: {} },
      });
    }
  }
  return segments;
}

function project(p, cameraX, cameraY, cameraZ, W, H) {
  p.camera.x = -cameraX;              // 区間の中心はワールド上では常に 0
  p.camera.y = p.world.y - cameraY;
  p.camera.z = p.world.z - cameraZ;
  const scale = CAMERA_DEPTH / p.camera.z;
  p.screen.scale = scale;
  p.screen.x = Math.round(W / 2 + scale * p.camera.x * W / 2);
  p.screen.y = Math.round(H * CFG.HORIZON_RATIO - scale * p.camera.y * H / 2);
  p.screen.w = Math.round(scale * CFG.ROAD_HALF_WIDTH * W / 2);
}

function polygon(ctx, x1, y1, x2, y2, x3, y3, x4, y4) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.lineTo(x4, y4);
  ctx.closePath();
  ctx.fill();
}

export function createRoad() {
  const segments = buildSegments();
  const length = segments.length * SEG;

  let skyGradient = null;
  let skyHeight = -1;

  function segmentAt(z) {
    return segments[Math.floor(z / SEG) % segments.length];
  }

  // カメラ位置の路面の高さ。区間の中を線形に補間する
  function roadYAt(z) {
    const seg = segmentAt(z);
    const t = (z % SEG) / SEG;
    return seg.p1.world.y + (seg.p2.world.y - seg.p1.world.y) * t;
  }

  function drawSky(ctx, W, H) {
    if (skyHeight !== H) {
      skyGradient = ctx.createLinearGradient(0, 0, 0, H * CFG.HORIZON_RATIO);
      skyGradient.addColorStop(0, COLORS.SKY_TOP);
      skyGradient.addColorStop(1, COLORS.SKY_BOTTOM);
      skyHeight = H;
    }
    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, W, Math.ceil(H * CFG.HORIZON_RATIO));
    ctx.fillStyle = COLORS.GRASS;
    ctx.fillRect(0, Math.ceil(H * CFG.HORIZON_RATIO), W, H);
  }

  function drawSegment(ctx, W, seg, dark) {
    const p1 = seg.p1.screen;
    const p2 = seg.p2.screen;

    // 草地。手前から奥へ描くので、区間ごとに帯で塗りつぶしてよい
    ctx.fillStyle = COLORS.GRASS;
    ctx.fillRect(0, p2.y, W, p1.y - p2.y);

    // 路面。RUMBLE_SEGMENTS ごとに濃淡2色の縞になる
    ctx.fillStyle = dark ? COLORS.ROAD_DARK : COLORS.ROAD_LIGHT;
    polygon(ctx,
      p1.x - p1.w, p1.y,
      p1.x + p1.w, p1.y,
      p2.x + p2.w, p2.y,
      p2.x - p2.w, p2.y);

    // センターライン。縞と同じ周期で片側だけ描くので破線に見える
    if (dark) {
      const w1 = p1.w * CFG.CENTER_LINE_RATIO;
      const w2 = p2.w * CFG.CENTER_LINE_RATIO;
      ctx.fillStyle = COLORS.CENTER_LINE;
      polygon(ctx,
        p1.x - w1, p1.y,
        p1.x + w1, p1.y,
        p2.x + w2, p2.y,
        p2.x - w2, p2.y);
    }
  }

  // 平坦な直線での、自車の高さにおける道幅の半分(画素)。
  // カーブや丘で毎フレーム変わらない値なので、自車の可動範囲を決めるのに使う
  function carLineHalfWidth(W) {
    const scale = (CFG.CAR_SCREEN_Y_RATIO - CFG.HORIZON_RATIO) * 2 / CFG.CAMERA_HEIGHT;
    return scale * CFG.ROAD_HALF_WIDTH * W / 2;
  }

  // 自車の高さでの道の中心と幅。描画のたびに更新する(DESIGN.md 7.3)
  const carLine = { x: 0, w: 0 };

  function render(ctx, W, H, position) {
    drawSky(ctx, W, H);

    const base = segmentAt(position);
    const basePercent = (position % SEG) / SEG;
    const cameraY = CFG.CAMERA_HEIGHT + roadYAt(position);
    const carY = H * CFG.CAR_SCREEN_Y_RATIO;

    carLine.x = W / 2;
    carLine.w = carLineHalfWidth(W);
    let carLineFound = false;

    // 手前から奥へカーブ量を足していくことで、道が曲がって見える
    let x = 0;
    let dx = -(base.curve * basePercent);
    let maxY = H;

    for (let n = 0; n < CFG.DRAW_DISTANCE; n++) {
      const i = base.index + n;
      const seg = segments[i % segments.length];
      // 一周を越えた区間は、奥行きを一周ぶん手前に戻して投影する
      const cameraZ = position - (i >= segments.length ? length : 0);

      project(seg.p1, -x, cameraY, cameraZ, W, H);
      project(seg.p2, -x - dx, cameraY, cameraZ, W, H);

      x += dx;
      dx += seg.curve;

      // 自車の高さをまたぐ、いちばん手前の区間から道の中心と幅を取る
      if (!carLineFound && seg.p1.screen.y >= carY && seg.p2.screen.y <= carY) {
        const span = seg.p1.screen.y - seg.p2.screen.y;
        const t = span > 0 ? (seg.p1.screen.y - carY) / span : 0;
        carLine.x = seg.p1.screen.x + (seg.p2.screen.x - seg.p1.screen.x) * t;
        carLine.w = seg.p1.screen.w + (seg.p2.screen.w - seg.p1.screen.w) * t;
        carLineFound = true;
      }

      if (seg.p1.camera.z <= CAMERA_DEPTH) continue;        // カメラの後ろ
      if (seg.p2.screen.y >= seg.p1.screen.y) continue;     // 裏を向いている
      if (seg.p2.screen.y >= maxY) continue;                // すでに描いた丘の陰

      drawSegment(ctx, W, seg, Math.floor(seg.index / CFG.RUMBLE_SEGMENTS) % 2 === 0);
      maxY = seg.p2.screen.y;
    }

    return carLine;
  }

  return { length, render, carLineHalfWidth };
}
