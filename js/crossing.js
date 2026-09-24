// 踏切(DESIGN.md 21章)。
// 道の先に踏切を置き、カンカンが鳴ったあとで、電車が自車の目の前を横切る。
// 自車は止めないし遅くもしない。遮断機は下ろさない(DESIGN.md 18章)。
// 本物の警報灯は赤く点滅するが、点滅と赤い警告表示は使わない(DESIGN.md 18章)。
import { CFG } from './config.js';

const RAIL_COLOR = '#5E5650';   // レール
const BED_COLOR = '#BCAE98';    // 枕木と砂利

// 手前から [警報機] [レール] [線路] [線路] [レール] の順に並べる。
// 警報機を線路より手前の区間に置くので、電車より前に描かれる
const POSTS = [
  { name: 'bell', x: -1.3, size: 0.22, aspect: 3.2 },
  { name: 'bell', x: 1.3, size: 0.22, aspect: 3.2 },
  { name: 'gate', x: -1.62, size: 0.10, aspect: 5.0 },   // 上がったままの遮断機
  { name: 'gate', x: 1.62, size: 0.10, aspect: 5.0 },
];
const TRAIN = { cars: 3, size: 2.6, aspect: 0.42, gap: 0.12 };
const TRAIN_OFFSCREEN = 0.5;    // 動きだすとき、画面の端からさらにこれだけ外に置く(道幅の半分に対する比)
const ROAD_EDGE = 1.4;          // 最後尾がここを越えたら「道から出た」
const CLEAR_AROUND = [3, 5];    // 踏切の手前と奥で、道ばたの物をどけておく区間数
const SEEK_AHEAD_MAX = 190;     // これより先には置かない。描画距離(200区間)の内側
const RUMBLE_FADE_SEC = 0.8;    // 電車が道を出てから、ガタンゴトンが消えるまで
// ガタンゴトン。1両ぶんの周期の中で、どの時刻に高い音/低い音を鳴らすか
const CLACK_PERIOD = 0.9;
const CLACKS = [[0, false], [0.13, false], [0.45, true], [0.58, true]];

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function createCrossing(road, audio, assets) {
  assets.preload(['train', 'gate', 'bell']);

  let timer = CFG.CROSSING_FIRST_SEC;
  let cur = null;

  // 自車の見かけの位置から、その区間までの距離(ワールド単位)。後ろなら負
  function distanceTo(index, position) {
    const carZ = position + road.carLineDistance();
    let d = (((index * CFG.SEGMENT_LENGTH - carZ) % road.length) + road.length) % road.length;
    if (d > road.length / 2) d -= road.length;
    return d;
  }

  // カーブも坂もない場所を探す。見つからなければ次のフレームでまた探す
  function seek(position, speed) {
    const base = road.carSegmentIndex(position);
    // カンカンが鳴りはじめるより少し前に着くくらいの距離から探す
    const from = Math.ceil((speed * (CFG.CROSSING_BELL_AT + 0.5)) / CFG.SEGMENT_LENGTH);
    for (let n = from; n + 4 < SEEK_AHEAD_MAX; n++) {
      const k = base + n;
      let ok = true;
      for (let j = -CLEAR_AROUND[0]; j <= CLEAR_AROUND[1] && ok; j++) {
        if (!road.isStraightFlat(k + j)) ok = false;
      }
      if (ok) return k;
    }
    return null;
  }

  function place(k) {
    for (let j = -CLEAR_AROUND[0]; j <= CLEAR_AROUND[1]; j++) road.setItems(k + j, null);
    road.setItems(k - 1, POSTS.map((p) => ({ ...p })));
    road.setMark(k, RAIL_COLOR);
    road.setMark(k + 1, BED_COLOR);
    road.setMark(k + 2, BED_COLOR);
    road.setMark(k + 3, RAIL_COLOR);
    cur = {
      k,
      phase: 'wait',          // wait → bell → train → after
      dir: Math.random() < 0.5 ? -1 : 1,
      cars: null,
      start: 0,               // 先頭の出発位置(進む向きを + とした道路座標)
      speed: 0,               // 横に進む速さ(道幅の半分/秒)
      bellClock: CFG.CROSSING_BELL_INTERVAL,   // 鳴りはじめをすぐ鳴らす
      bellAlt: false,
      clackClock: 0,
      clackPeriod: -1,
      clackNext: 0,
    };
  }

  function clear() {
    const k = cur.k;
    for (let j = -1; j <= 3; j++) {
      road.setMark(k + j, null);
      road.setItems(k + j, null);
    }
    cur = null;
    timer = CFG.CROSSING_INTERVAL;
  }

  function trainLength() {
    return TRAIN.cars * (TRAIN.size + TRAIN.gap) - TRAIN.gap;
  }

  // 電車を画面の外に出す。前のフレームの投影から、画面の端が道路座標で
  // どこにあるかを求める(手前にカーブがあると、踏切は画面の真ん中に来ない)
  function startTrain(position, W) {
    const s = road.sampleAt(cur.k * CFG.SEGMENT_LENGTH + CFG.SEGMENT_LENGTH);
    const w = Math.max(1, s.w);
    // 進む向きの反対側の画面の端
    const edge = cur.dir > 0 ? -s.x / w : (W - s.x) / w;
    cur.start = cur.dir * edge - TRAIN_OFFSCREEN;
    // 着く CLEAR_AT 秒前に、最後尾が道から出るように速さを決める
    const end = ROAD_EDGE + trainLength();
    cur.speed = (end - cur.start) / (CFG.CROSSING_TRAIN_AT - CFG.CROSSING_CLEAR_AT);
    cur.cars = [];
    for (let i = 0; i < TRAIN.cars; i++) {
      // far: 道ばたの物を描く距離より先でも描く(DESIGN.md 21章)
      cur.cars.push({ name: 'train', x: 0, size: TRAIN.size, aspect: TRAIN.aspect, far: true });
    }
    road.setItems(cur.k + 1, cur.cars);
    cur.phase = 'train';
  }

  // 電車の位置は「着くまでの残り秒数」だけで決める。
  // 速度の設定を途中で変えても、着く前には必ず道から出る
  function layoutTrain(rem) {
    const head = cur.start + cur.speed * (CFG.CROSSING_TRAIN_AT - rem);
    const pitch = TRAIN.size + TRAIN.gap;
    cur.cars.forEach((car, i) => {
      car.x = cur.dir * (head - TRAIN.size / 2 - i * pitch);
    });
    return head - trainLength();     // 最後尾
  }

  function ringBell(dt, rem) {
    cur.bellClock += dt;
    if (cur.bellClock < CFG.CROSSING_BELL_INTERVAL) return;
    cur.bellClock -= CFG.CROSSING_BELL_INTERVAL;
    // 近づくほど大きく聞こえる
    const level = clamp(1.15 - rem / CFG.CROSSING_BELL_AT, 0.35, 1);
    audio.bell(level, cur.bellAlt);
    cur.bellAlt = !cur.bellAlt;
  }

  // ガタンゴトン。近づくほど大きく、道を出たあとは消えていく
  function rumble(dt, rem) {
    const near = clamp(1.1 - rem / CFG.CROSSING_TRAIN_AT, 0.15, 1);
    const fade = clamp((rem - (CFG.CROSSING_CLEAR_AT - RUMBLE_FADE_SEC)) / RUMBLE_FADE_SEC, 0, 1);
    const level = near * fade;
    cur.clackClock += dt;
    const period = Math.floor(cur.clackClock / CLACK_PERIOD);
    if (period !== cur.clackPeriod) {
      cur.clackPeriod = period;
      cur.clackNext = 0;
    }
    const inPeriod = cur.clackClock - period * CLACK_PERIOD;
    while (cur.clackNext < CLACKS.length && inPeriod >= CLACKS[cur.clackNext][0]) {
      audio.clack(level, CLACKS[cur.clackNext][1]);
      cur.clackNext++;
    }
  }

  // allowNew: 新しい踏切を置いてよいか(おわりの演出の間は置かない)。
  // W: 論理画面の幅。電車を画面の外から出すのに使う
  function update(dt, position, speed, allowNew, W) {
    if (!cur) {
      if (!allowNew) return;
      timer -= dt;
      if (timer > 0) return;
      const k = seek(position, speed);
      if (k !== null) place(k);
      return;
    }

    const d = distanceTo(cur.k + 1, position);
    const rem = speed > 0 ? d / speed : Infinity;

    if (cur.phase === 'wait' && rem <= CFG.CROSSING_BELL_AT) cur.phase = 'bell';
    if (cur.phase === 'bell' && rem <= CFG.CROSSING_TRAIN_AT) startTrain(position, W);

    if (cur.phase === 'train' || cur.phase === 'after') {
      const tail = layoutTrain(rem);
      rumble(dt, rem);
      // 最後尾が道から出たらカンカンを止める。電車はそのまま走り去る
      if (cur.phase === 'train' && tail >= ROAD_EDGE) cur.phase = 'after';
    }

    if (cur.phase === 'bell' || cur.phase === 'train') ringBell(dt, rem);

    // カメラの後ろまで通り過ぎたら片づける
    if (d < -road.carLineDistance() - 4 * CFG.SEGMENT_LENGTH) clear();
  }

  return {
    update,
    get active() { return cur !== null; },
    get info() {
      return cur ? { phase: cur.phase, dir: cur.dir } : { phase: 'idle', timer };
    },
  };
}
