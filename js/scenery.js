// 風景(DESIGN.md 8章)。空、空の物、遠景、道ばたの物、4場面の切り替え。
import { CFG } from './config.js';

// DESIGN.md 8.1 の表
const SCENES = [
  {
    id: 'meadow',
    skyTop: '#7EC8F0', skyBottom: '#CDEBFA', grass: '#7BC96F',
    roadside: ['tree_round', 'tree_tall', 'bush', 'flowers', 'cow', 'windmill', 'barn',
      'bird', 'dog'],
    sky: ['cloud', 'balloon'],
    far: ['mountain_a', 'mountain_b'],
  },
  {
    id: 'sea',
    skyTop: '#4FA8E8', skyBottom: '#BFE4FA', grass: '#8FD17F',
    roadside: ['palm', 'lighthouse', 'tree_round', 'bush', 'bird'],
    sky: ['cloud', 'seagull'],
    far: ['island', 'yacht'],
  },
  {
    id: 'town',
    skyTop: '#F29E6B', skyBottom: '#FAD7A0', grass: '#9CC27A',
    roadside: ['building_a', 'building_b', 'signal', 'house', 'tree_round', 'dog', 'bird'],
    sky: ['cloud'],
    far: ['city_a', 'city_b'],
  },
  {
    id: 'night',
    skyTop: '#1E2A5A', skyBottom: '#3C4F8C', grass: '#3F6B4A',
    roadside: ['pine', 'streetlamp', 'owl'],
    sky: ['moon'],
    far: ['mountain_night_a', 'mountain_night_b'],
    stars: true,           // 星は画像を使わずコードで描く(DESIGN.md 13.1)
  },
];

// 道ばたの物の見た目。size は道幅の半分に対する比、aspect は 高さ/幅
const ITEM_SHAPE = {
  tree_round: { size: 0.55, aspect: 1.15 },
  tree_tall: { size: 0.40, aspect: 2.00 },
  bush: { size: 0.42, aspect: 0.70 },
  flowers: { size: 0.34, aspect: 0.60 },
  cow: { size: 0.50, aspect: 0.80 },
  windmill: { size: 0.55, aspect: 1.60 },
  barn: { size: 0.80, aspect: 0.75 },
  palm: { size: 0.45, aspect: 1.90 },
  lighthouse: { size: 0.40, aspect: 2.20 },
  building_a: { size: 0.75, aspect: 1.50 },
  building_b: { size: 0.70, aspect: 1.30 },
  signal: { size: 0.22, aspect: 2.60 },
  house: { size: 0.60, aspect: 0.90 },
  pine: { size: 0.45, aspect: 1.80 },
  streetlamp: { size: 0.18, aspect: 2.80 },
  owl: { size: 0.28, aspect: 1.10 },
  bird: { size: 0.16, aspect: 0.75 },
  dog: { size: 0.24, aspect: 0.85 },
};

// 空と遠景の帯の見た目。幅は画面幅に対する比
const BAND_SHAPE = {
  cloud: { width: 0.16, aspect: 0.42 },
  balloon: { width: 0.055, aspect: 1.40 },
  seagull: { width: 0.05, aspect: 0.40 },
  moon: { width: 0.09, aspect: 1.00 },
  mountain_a: { width: 0.42, aspect: 0.30 },
  mountain_b: { width: 0.34, aspect: 0.38 },
  island: { width: 0.26, aspect: 0.30 },
  yacht: { width: 0.09, aspect: 0.90 },
  city_a: { width: 0.40, aspect: 0.26 },
  city_b: { width: 0.32, aspect: 0.34 },
  mountain_night_a: { width: 0.44, aspect: 0.30 },
  mountain_night_b: { width: 0.36, aspect: 0.38 },
};

// おわりの演出の夕焼け(DESIGN.md 12章)。どの場面からでもこの色へ寄せていく
const SUNSET = { skyTop: '#E8603C', skyBottom: '#F8C070', grass: '#7A6A4E' };

const SKY_TOP_RATIO = 0.35;      // 空の帯の下端(DESIGN.md 6章)
const SKY_DRIFT = 0.006;         // 画面幅/秒。空の物がゆっくり漂う
const FAR_DRIFT = 0.004;         // 画面幅/秒。遠景がごくゆっくり流れる
// カーブ量に対する横ずれ(DESIGN.md 8.2)。1区間進むごとの帯の中でのずれ
const FAR_CURVE_FACTOR = 0.02;
const ITEM_GAP = [3, 5];         // 何区間ごとに道ばたの物を置くか
const ITEM_X = [1.3, 2.5];       // 道路座標での左右の位置
const ITEM_AHEAD = 40;           // 描く距離より先まで置いておく区間数
const STAR_COUNT = 40;

// 帯は画面幅の3倍。はみ出たら反対側に戻す(DESIGN.md 8.2)
const BAND_SPAN = 3;

// 種を決めた擬似乱数。毎回同じ景色になるようにする
function makeRandom(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// 2つの色を k(0〜1)で混ぜる。場面の切り替えと夕焼けに使う
function mixRgb(a, b, k) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * k),
    Math.round(a[1] + (b[1] - a[1]) * k),
    Math.round(a[2] + (b[2] - a[2]) * k),
  ];
}

function buildBand(names, count, rand, yFrom, yTo) {
  const items = [];
  for (let i = 0; i < count; i++) {
    items.push({
      name: names[Math.floor(rand() * names.length)],
      x: rand() * BAND_SPAN,              // 画面幅に対する比(0〜3)
      y: yFrom + rand() * (yTo - yFrom),  // 画面高さに対する比
      scale: 0.8 + rand() * 0.4,
    });
  }
  return items;
}

export function createScenery(assets, road) {
  const rand = makeRandom(20260921);

  // 場面ごとの帯をあらかじめ作っておく
  for (const scene of SCENES) {
    scene.skyItems = buildBand(scene.sky, 7, rand, 0.05, SKY_TOP_RATIO - 0.06);
    scene.farItems = buildBand(scene.far, 9, rand, 0, 0);
    assets.preload([...scene.roadside, ...scene.sky, ...scene.far]);
  }

  // 星。またたかせない(DESIGN.md 8.1、18章)
  const stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({ x: rand(), y: 0.03 + rand() * (SKY_TOP_RATIO - 0.06), r: 0.6 + rand() * 1.2 });
  }

  let elapsed = 0;
  let sunset = 0;        // おわりの演出の進み具合(0〜1)。ending.js が入れる
  let skyX = 0;
  let farX = 0;
  let gradient = null;
  let gradientKey = '';

  // 道ばたの物は、走りながら手前から順に置いていく。
  // 場面が変わっても、すでに出ている物はそのまま流れていく(DESIGN.md 8.1)
  const placeRand = makeRandom(76543);
  let frontier = 0;
  let nextItemAt = 0;
  // 走った距離の累計。position は一周で0に戻ってしまうので、置く位置の基準には
  // 使えない(使うと一周したところで物を置くのが止まってしまう)
  let travelled = 0;

  // 場面の色に、夕焼けを重ねたもの
  function toneOf(key) {
    const { from, to, k } = sceneState();
    let c = mixRgb(hexToRgb(from[key]), hexToRgb(to[key]), k);
    if (sunset > 0) c = mixRgb(c, hexToRgb(SUNSET[key]), sunset);
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  function setSunset(k) {
    sunset = Math.max(0, Math.min(1, k));
  }

  function sceneState() {
    const period = CFG.SCENE_DURATION * SCENES.length;
    const t = elapsed % period;
    const index = Math.floor(t / CFG.SCENE_DURATION);
    const inScene = t - index * CFG.SCENE_DURATION;
    const blendStart = CFG.SCENE_DURATION - CFG.SCENE_BLEND;
    const k = inScene <= blendStart
      ? 0
      : Math.min(1, (inScene - blendStart) / CFG.SCENE_BLEND);
    return { from: SCENES[index], to: SCENES[(index + 1) % SCENES.length], k };
  }

  // 出現候補は切り替えの中間点で新しい場面のものに替える(DESIGN.md 8.1)
  function candidateScene() {
    const { from, to, k } = sceneState();
    return k < 0.5 ? from : to;
  }

  function placeAhead() {
    const base = Math.floor(travelled / road.segmentLength);
    const target = base + CFG.DRAW_DISTANCE + ITEM_AHEAD;
    if (frontier < base) frontier = base;          // 大きく飛んだときは追いつかせる
    while (frontier < target) {
      if (frontier >= nextItemAt) {
        nextItemAt = frontier + ITEM_GAP[0]
          + Math.floor(placeRand() * (ITEM_GAP[1] - ITEM_GAP[0] + 1));
        const list = candidateScene().roadside;
        const name = list[Math.floor(placeRand() * list.length)];
        const shape = ITEM_SHAPE[name];
        const side = placeRand() < 0.5 ? -1 : 1;
        const size = shape.size * (0.85 + placeRand() * 0.3);
        // 幅のある物は、内側の端が路面(±1)にかからない位置まで外へ出す
        const inner = Math.max(ITEM_X[0], 1.1 + size / 2);
        const x = side * (inner + placeRand() * Math.max(0, ITEM_X[1] - inner));
        road.setItems(frontier, [{ name, x, size, aspect: shape.aspect }]);
      } else {
        road.setItems(frontier, null);
      }
      frontier++;
    }
  }

  function update(dt, position, lastPosition) {
    elapsed += dt;
    skyX += SKY_DRIFT * dt;
    const dz = position - lastPosition;
    const moved = dz >= 0 ? dz : dz + road.length;
    travelled += moved;
    farX += FAR_DRIFT * dt
      - road.curveAt(position) * FAR_CURVE_FACTOR * (moved / CFG.SEGMENT_LENGTH) / BAND_SPAN;
    skyX = ((skyX % BAND_SPAN) + BAND_SPAN) % BAND_SPAN;
    farX = ((farX % BAND_SPAN) + BAND_SPAN) % BAND_SPAN;
    placeAhead();
  }

  function drawBand(ctx, W, H, items, offset, baseY, anchorBottom) {
    for (const item of items) {
      const shape = BAND_SHAPE[item.name];
      const w = shape.width * item.scale * W;
      const h = w * shape.aspect;
      const bx = ((item.x + offset) % BAND_SPAN + BAND_SPAN) % BAND_SPAN;
      const x = (bx - 1) * W - w / 2;
      // 空の物は空の帯の中、遠景は地平線に接地させる(DESIGN.md 6章)
      const y = anchorBottom ? baseY - h : item.y * H;
      if (x > W || x + w < 0) continue;
      assets.draw(ctx, item.name, x, y, w, h);
    }
  }

  function drawStars(ctx, W, H, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#F5F2D8';
    for (const s of stars) {
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawSceneLayers(ctx, W, H, scene, horizon, alpha) {
    if (alpha <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (scene.stars) drawStars(ctx, W, H, 1);
    drawBand(ctx, W, H, scene.skyItems, skyX, 0, false);
    drawBand(ctx, W, H, scene.farItems, farX, horizon, true);
    ctx.restore();
  }

  // 空 → 星 → 空の物 → 遠景 → 地面の下地、の順に描く(DESIGN.md 6章)
  function drawBackground(ctx, W, H) {
    const { from, to, k } = sceneState();
    const horizon = H * CFG.HORIZON_RATIO;
    const top = toneOf('skyTop');
    const bottom = toneOf('skyBottom');

    const key = `${top}|${bottom}|${H}`;
    if (gradientKey !== key) {
      gradient = ctx.createLinearGradient(0, 0, 0, horizon);
      gradient.addColorStop(0, top);
      gradient.addColorStop(1, bottom);
      gradientKey = key;
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, Math.ceil(horizon));

    // 場面が変わる間は、古い層と新しい層を重ねて溶かす
    drawSceneLayers(ctx, W, H, from, horizon, 1 - k);
    if (k > 0) drawSceneLayers(ctx, W, H, to, horizon, k);

    ctx.fillStyle = toneOf('grass');
    ctx.fillRect(0, Math.ceil(horizon), W, H);
  }

  function grassColor() {
    return toneOf('grass');
  }

  return {
    drawBackground,
    update,
    grassColor,
    setSunset,
    get scene() {
      const { from, to, k } = sceneState();
      return { from: from.id, to: to.id, k };
    },
  };
}
