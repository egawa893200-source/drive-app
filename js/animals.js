// どうぶつボタンで出てくる動物(DESIGN.md 22章)。
// 道の少し先の道ばたに、ぴょこっと出てきて鳴く。押すたびに替わる。
import { CFG } from './config.js';

// size は道幅の半分に対する比、aspect は 高さ/幅。
// 出てきたときに気づけるよう、道ばたの物より大きめにする
const ANIMALS = [
  { name: 'dog', size: 0.7, aspect: 0.85 },     // ワンワン
  { name: 'cow', size: 1.0, aspect: 0.80 },     // モー
  { name: 'duck', size: 0.6, aspect: 0.90 },    // ガーガー
];
const ROAD_EDGE = 1.15;   // 道の端からの位置。内側の端がここに来るように置く

export function createAnimals(road, audio, reactions, assets) {
  assets.preload(ANIMALS.map((a) => a.name));

  let next = 0;
  let side = 1;
  let lastAt = -Infinity;

  // 出したら true。前に出してから間もないときは出さない
  function call(position, speed) {
    const now = performance.now();
    if (now - lastAt < CFG.ANIMAL_GAP_SEC * 1000) return false;
    lastAt = now;

    const a = ANIMALS[next];
    next = (next + 1) % ANIMALS.length;
    side = -side;                      // 左右交互に出す

    const ahead = Math.round((speed * CFG.ANIMAL_AHEAD_SEC) / CFG.SEGMENT_LENGTH);
    const index = road.carSegmentIndex(position) + ahead;
    const item = { name: a.name, x: side * (ROAD_EDGE + a.size / 2), size: a.size, aspect: a.aspect };
    road.addItem(index, item);
    reactions.pop(item);               // ぴょこっと出てくる
    audio.animal(a.name);
    return true;
  }

  return { call };
}
