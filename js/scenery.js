// 風景(DESIGN.md 8章)。空、空の物、遠景、道ばたの物。
// 段階5では「朝の草原」の1場面だけ。4場面の切り替えは段階7。
import { CFG } from './config.js';

// DESIGN.md 8.1 の表から、朝の草原の行
const SCENE = {
  id: 'meadow',
  skyTop: '#7EC8F0',
  skyBottom: '#CDEBFA',
  grass: '#7BC96F',
  roadside: ['tree_round', 'tree_tall', 'bush', 'flowers', 'cow', 'windmill', 'barn'],
  skyObjects: ['cloud', 'balloon'],
  far: ['mountain_a', 'mountain_b'],
};

// 道ばたの物の見た目。size は道幅の半分に対する比、aspect は 高さ/幅
const ITEM_SHAPE = {
  tree_round: { size: 0.55, aspect: 1.15 },
  tree_tall: { size: 0.40, aspect: 2.00 },
  bush: { size: 0.42, aspect: 0.70 },
  flowers: { size: 0.34, aspect: 0.60 },
  cow: { size: 0.50, aspect: 0.80 },
  windmill: { size: 0.55, aspect: 1.60 },
  barn: { size: 0.80, aspect: 0.75 },
};

// 空と遠景の帯の見た目。幅は画面幅に対する比
const BAND_SHAPE = {
  cloud: { width: 0.16, aspect: 0.42, band: 'sky' },
  balloon: { width: 0.055, aspect: 1.40, band: 'sky' },
  mountain_a: { width: 0.42, aspect: 0.30, band: 'far' },
  mountain_b: { width: 0.34, aspect: 0.38, band: 'far' },
};

const SKY_TOP_RATIO = 0.35;      // 空の帯の下端(DESIGN.md 6章)
const SKY_DRIFT = 0.006;         // 画面幅/秒。空の物がゆっくり漂う
const FAR_DRIFT = 0.004;         // 画面幅/秒。遠景がごくゆっくり流れる
// カーブ量に対する横ずれ(DESIGN.md 8.2)。1区間進むごとの帯の中でのずれ
const FAR_CURVE_FACTOR = 0.02;
const ITEM_GAP = [3, 5];         // 何区間ごとに道ばたの物を置くか
const ITEM_X = [1.3, 2.5];       // 道路座標での左右の位置

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

function buildBand(names, count, rand, yFrom, yTo) {
  const items = [];
  for (let i = 0; i < count; i++) {
    const name = names[Math.floor(rand() * names.length)];
    items.push({
      name,
      x: rand() * BAND_SPAN,              // 画面幅に対する比(0〜3)
      y: yFrom + rand() * (yTo - yFrom),  // 画面高さに対する比
      scale: 0.8 + rand() * 0.4,
    });
  }
  return items;
}

export function createScenery(assets, road) {
  const rand = makeRandom(20260921);

  // 空の物は空の帯(0〜35%)の中を漂う
  const skyItems = buildBand(SCENE.skyObjects, 7, rand, 0.05, SKY_TOP_RATIO - 0.06);
  // 遠景は地平線に接地させるので y は使わない
  const farItems = buildBand(SCENE.far, 9, rand, 0, 0);

  let skyX = 0;
  let farX = 0;
  let gradient = null;
  let gradientH = -1;

  assets.preload([...SCENE.roadside, ...SCENE.skyObjects, ...SCENE.far]);

  // 道ばたの物を区間に置く(DESIGN.md 8.2)
  const placeRand = makeRandom(76543);
  let next = ITEM_GAP[0];
  road.placeItems((index) => {
    if (index < next) return null;
    next = index + ITEM_GAP[0] + Math.floor(placeRand() * (ITEM_GAP[1] - ITEM_GAP[0] + 1));
    const name = SCENE.roadside[Math.floor(placeRand() * SCENE.roadside.length)];
    const shape = ITEM_SHAPE[name];
    const side = placeRand() < 0.5 ? -1 : 1;
    const scale = 0.85 + placeRand() * 0.3;
    const size = shape.size * scale;
    // 幅のある物は、内側の端が路面(±1)にかからない位置まで外へ出す
    const inner = Math.max(ITEM_X[0], 1.1 + size / 2);
    const x = side * (inner + placeRand() * Math.max(0, ITEM_X[1] - inner));
    return [{ name, x, size, aspect: shape.aspect }];
  });

  function update(dt, position, lastPosition) {
    skyX += SKY_DRIFT * dt;
    // 進んだ区間数ぶんだけ、カーブに応じて遠景を横にずらす
    const dz = position - lastPosition;
    const moved = dz >= 0 ? dz : dz + road.length;
    farX += FAR_DRIFT * dt
      - road.curveAt(position) * FAR_CURVE_FACTOR * (moved / CFG.SEGMENT_LENGTH) / BAND_SPAN;
    skyX = ((skyX % BAND_SPAN) + BAND_SPAN) % BAND_SPAN;
    farX = ((farX % BAND_SPAN) + BAND_SPAN) % BAND_SPAN;
  }

  function drawBand(ctx, W, H, items, offset, baseY, anchorBottom) {
    for (const item of items) {
      const shape = BAND_SHAPE[item.name];
      const w = shape.width * item.scale * W;
      const h = w * shape.aspect;
      // 帯は -W 〜 2W を覆う。はみ出た物は反対側から出てくる
      let bx = ((item.x + offset) % BAND_SPAN + BAND_SPAN) % BAND_SPAN;
      const x = (bx - 1) * W - w / 2;
      // 空の物は 0〜35% の帯の中、遠景は地平線に接地させる(DESIGN.md 6章)
      const y = anchorBottom ? baseY - h : item.y * H;
      if (x > W || x + w < 0) continue;
      assets.draw(ctx, item.name, x, y, w, h);
    }
  }

  // 空 → 空の物 → 遠景 → 地面の下地、の順に描く(DESIGN.md 6章の画面構成)
  function drawBackground(ctx, W, H) {
    const horizon = H * CFG.HORIZON_RATIO;
    if (gradientH !== H) {
      gradient = ctx.createLinearGradient(0, 0, 0, horizon);
      gradient.addColorStop(0, SCENE.skyTop);
      gradient.addColorStop(1, SCENE.skyBottom);
      gradientH = H;
    }
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, W, Math.ceil(horizon));

    drawBand(ctx, W, H, skyItems, skyX, 0, false);
    drawBand(ctx, W, H, farItems, farX, horizon, true);

    ctx.fillStyle = SCENE.grass;
    ctx.fillRect(0, Math.ceil(horizon), W, H);
  }

  return { drawBackground, update, sceneId: SCENE.id };
}
