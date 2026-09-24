// 画像素材(DESIGN.md 13章)。
// 素材が無くても動く。get() が null を返したら、13.2の表のプレースホルダー図形を描く。
// 素材は /gpt-asset-loop スキルで作って assets/img/ に置く。

const BASE = 'assets/img';

// DESIGN.md 13.2 の表。dir は保存先、shape はプレースホルダーの形。
// 場面が増えるとき(段階7)に、その都度ここに足していく。
const CATALOG = {
  // 自車。素材が無いときは player.js が図形で描く
  car_red: { dir: 'car', shape: 'block', color: '#F24E4E' },
  car_blue: { dir: 'car', shape: 'block', color: '#4A90E2' },
  car_yellow: { dir: 'car', shape: 'block', color: '#F5C542' },
  car_white: { dir: 'car', shape: 'block', color: '#F7F7F2' },

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

  // 昼の海沿い
  palm: { dir: 'sea', shape: 'tree', color: '#4FA05A' },
  lighthouse: { dir: 'sea', shape: 'block', color: '#E8584F' },
  yacht: { dir: 'sea', shape: 'block', color: '#F2F2EC' },
  seagull: { dir: 'sea', shape: 'block', color: '#F7F7F2' },

  // 夕方の街
  building_a: { dir: 'town', shape: 'block', color: '#8FC3DE' },
  building_b: { dir: 'town', shape: 'block', color: '#EFE3C8' },
  signal: { dir: 'town', shape: 'block', color: '#5A6070' },
  house: { dir: 'town', shape: 'block', color: '#E0A868' },

  // 夜の山道。黒くしすぎず形が分かる程度に落とす
  pine: { dir: 'night', shape: 'tree', color: '#2F5E44' },
  owl: { dir: 'night', shape: 'block', color: '#8A7A5E' },
  streetlamp: { dir: 'night', shape: 'block', color: '#F0D68A' },
  moon: { dir: 'night', shape: 'block', color: '#F5E9A8' },

  // おわりの演出(DESIGN.md 12章、13.2): 四角 / 三日月
  garage: { dir: 'ending', shape: 'block', color: '#C99A6A' },
  goodnight: { dir: 'ending', shape: 'crescent', color: '#F5E9A8' },

  // 遠景: 半円
  mountain_a: { dir: 'far', shape: 'dome', color: '#6FA86A' },
  mountain_b: { dir: 'far', shape: 'dome', color: '#5E9A5E' },
  island: { dir: 'far', shape: 'dome', color: '#6BA870' },
  cloud: { dir: 'far', shape: 'dome', color: '#FFFFFF' },
  city_a: { dir: 'far', shape: 'dome', color: '#9A8FA8' },
  city_b: { dir: 'far', shape: 'dome', color: '#8A8098' },
  mountain_night_a: { dir: 'far', shape: 'dome', color: '#2A3768' },
  mountain_night_b: { dir: 'far', shape: 'dome', color: '#222E59' },
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
  // 三日月。大きい丸から、右に0.45ずらした半径0.9の丸をえぐる。
  // 2つの丸は ±64.1度(1.119ラジアン)で交わるので、そこを継ぎ目にする
  crescent(ctx, x, y, w, h, color) {
    const r = Math.min(w, h) / 2;
    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 1.119, 2 * Math.PI - 1.119, false);
    ctx.arc(cx + r * 0.45, cy, r * 0.9, -1.586, 1.586, true);
    ctx.closePath();
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
