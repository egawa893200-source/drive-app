// 画像素材(DESIGN.md 13章)。
// 素材が無くても動く。get() が null を返したら、13.2の表のプレースホルダー図形を描く。
// 素材は /gpt-asset-loop スキルで作って assets/img/ に置く。

const BASE = 'assets/img';

// DESIGN.md 13.2 の表。dir は保存先、shape はプレースホルダーの形。
// 場面が増えるとき(段階7)に、その都度ここに足していく。
const CATALOG = {
  // 障害物: 色つきの円
  puddle: { dir: 'obstacle', shape: 'circle', color: '#7FC4E8' },
  leaves: { dir: 'obstacle', shape: 'circle', color: '#E08A3C' },
  frog: { dir: 'obstacle', shape: 'circle', color: '#5FAE52' },
  ball: { dir: 'obstacle', shape: 'circle', color: '#E8584F' },
  ducks: { dir: 'obstacle', shape: 'circle', color: '#F0C63E' },
  turtle: { dir: 'obstacle', shape: 'circle', color: '#4E8A5A' },

  // 道ばた(全場面共通): 緑の円+茶色の棒
  tree_round: { dir: 'roadside', shape: 'tree', color: '#4E9A4A' },
  tree_tall: { dir: 'roadside', shape: 'tree', color: '#3F8A46' },
  bush: { dir: 'roadside', shape: 'tree', color: '#5FAE52' },
  flowers: { dir: 'roadside', shape: 'tree', color: '#E8617D' },

  // 朝の草原: 色つきの角丸四角
  cow: { dir: 'meadow', shape: 'block', color: '#F2F2EC' },
  windmill: { dir: 'meadow', shape: 'block', color: '#EDEDE4' },
  barn: { dir: 'meadow', shape: 'block', color: '#C4543F' },
  balloon: { dir: 'meadow', shape: 'block', color: '#F2A03D' },

  // 遠景: 半円
  mountain_a: { dir: 'far', shape: 'dome', color: '#6FA86A' },
  mountain_b: { dir: 'far', shape: 'dome', color: '#5E9A5E' },
  cloud: { dir: 'far', shape: 'dome', color: '#FFFFFF' },
};

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  ctx.fill();
}

const SHAPES = {
  tree(ctx, x, y, w, h, color) {
    ctx.fillStyle = '#8A5A3B';
    ctx.fillRect(x + w * 0.42, y + h * 0.45, w * 0.16, h * 0.55);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h * 0.32, w * 0.42, h * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  block(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    roundRect(ctx, x, y, w, h, Math.min(w, h) * 0.18);
  },
  circle(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  },
  dome(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h, w / 2, h, 0, Math.PI, 0);
    ctx.fill();
  },
};

export function createAssets() {
  const images = new Map();   // name -> HTMLImageElement | null(まだ無い)

  // 起動時に非同期で読み込む。読み込めた物から順に使われる(DESIGN.md 13.1)
  function preload(names) {
    for (const name of names) {
      if (images.has(name) || !CATALOG[name]) continue;
      images.set(name, null);
      const img = new Image();
      img.onload = () => images.set(name, img);
      img.onerror = () => {};   // まだ素材が無いだけ。プレースホルダーで描く
      img.src = `${BASE}/${CATALOG[name].dir}/${name}.webp`;
    }
  }

  function get(name) {
    return images.get(name) || null;
  }

  // (x, y) は左上、w/h は描く大きさ。接地点の扱いは呼ぶ側で決める
  function draw(ctx, name, x, y, w, h) {
    const img = get(name);
    if (img) {
      ctx.drawImage(img, x, y, w, h);
      return;
    }
    const meta = CATALOG[name];
    if (!meta) return;
    SHAPES[meta.shape](ctx, x, y, w, h, meta.color);
  }

  // デバッグ表示用(DESIGN.md 16章)
  function stats() {
    let loaded = 0;
    for (const img of images.values()) if (img) loaded++;
    return { loaded, requested: images.size };
  }

  return { preload, get, draw, stats };
}
