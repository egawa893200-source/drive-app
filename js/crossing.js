// 踏切(DESIGN.md 21章)。
// 道の先に踏切を置き、カンカンが鳴ったあとで電車が奥を横切る。
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
const TRAIN_START_X = 16;       // 電車は画面の外から外へ動かす(道幅の半分に対する比)
const CLEAR_AROUND = [3, 5];    // 踏切の手前と奥で、道ばたの物をどけておく区間数
const SEEK_AHEAD_MAX = 190;     // これより先には置かない。描画距離(200区間)の内側
const ARRIVE_MARGIN = 1;        // 電車は着く1秒前までには必ず通り過ぎる
// ガタンゴトン。1両ぶんの周期の中で、どの時刻に高い音/低い音を鳴らすか
const CLACK_PERIOD = 0.9;
const CLACKS = [[0, false], [0.13, false], [0.45, true], [0.58, true]];

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
    const from = Math.ceil((speed * (CFG.CROSSING_BELL_AT + 1)) / CFG.SEGMENT_LENGTH);
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
      trainT: 0,
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

  function startTrain() {
    cur.cars = [];
    for (let i = 0; i < TRAIN.cars; i++) {
      cur.cars.push({ name: 'train', x: 0, size: TRAIN.size, aspect: TRAIN.aspect });
    }
    road.setItems(cur.k + 1, cur.cars);
    cur.trainT = 0;
    cur.clackClock = 0;
    cur.clackPeriod = -1;
    cur.phase = 'train';
    layoutTrain(0);
  }

  // 電車の各車両の位置を決める。p は 0〜1(0で画面の外、1で反対側の外)
  function layoutTrain(p) {
    const pitch = TRAIN.size + TRAIN.gap;
    const length = TRAIN.cars * pitch - TRAIN.gap;
    const head = -TRAIN_START_X + p * (2 * TRAIN_START_X + length);
    cur.cars.forEach((car, i) => {
      car.x = cur.dir * (head - TRAIN.size / 2 - i * pitch);
    });
  }

  function ringBell(dt, rem) {
    cur.bellClock += dt;
    if (cur.bellClock < CFG.CROSSING_BELL_INTERVAL) return;
    cur.bellClock -= CFG.CROSSING_BELL_INTERVAL;
    // 近づくほど大きく聞こえる
    const level = Math.max(0.35, Math.min(1, 1.15 - rem / CFG.CROSSING_BELL_AT));
    audio.bell(level, cur.bellAlt);
    cur.bellAlt = !cur.bellAlt;
  }

  // ガタンゴトン。電車が画面に入って出ていくのに合わせて大きくして小さくする
  function rumble(dt, p) {
    cur.clackClock += dt;
    const period = Math.floor(cur.clackClock / CLACK_PERIOD);
    if (period !== cur.clackPeriod) {
      cur.clackPeriod = period;
      cur.clackNext = 0;
    }
    const inPeriod = cur.clackClock - period * CLACK_PERIOD;
    while (cur.clackNext < CLACKS.length && inPeriod >= CLACKS[cur.clackNext][0]) {
      audio.clack(Math.sin(Math.PI * p), CLACKS[cur.clackNext][1]);
      cur.clackNext++;
    }
  }

  // allowNew: 新しい踏切を置いてよいか(おわりの演出の間は置かない)
  function update(dt, position, speed, allowNew) {
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
    if (cur.phase === 'bell' && rem <= CFG.CROSSING_TRAIN_AT) startTrain();

    if (cur.phase === 'train') {
      // 速度の設定を途中で変えても、着く前には必ず通り過ぎるようにする
      const left = CFG.CROSSING_TRAIN_SEC - cur.trainT;
      const room = rem - ARRIVE_MARGIN;
      const rate = room <= 0 ? Infinity : Math.max(1, left / room);
      cur.trainT = Math.min(CFG.CROSSING_TRAIN_SEC, cur.trainT + dt * rate);
      const p = cur.trainT / CFG.CROSSING_TRAIN_SEC;
      layoutTrain(p);
      rumble(dt, p);
      if (p >= 1) {
        road.setItems(cur.k + 1, null);
        cur.cars = null;
        cur.phase = 'after';     // 電車が行ったら音も止む
      }
    }

    if (cur.phase === 'bell' || cur.phase === 'train') ringBell(dt, rem);

    // カメラの後ろまで通り過ぎたら片づける
    if (d < -road.carLineDistance() - 4 * CFG.SEGMENT_LENGTH) clear();
  }

  return {
    update,
    get active() { return cur !== null; },
    get info() {
      return cur ? { phase: cur.phase, dir: cur.dir, train: cur.trainT } : { phase: 'idle', timer };
    },
  };
}
