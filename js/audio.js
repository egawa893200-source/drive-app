// 音(DESIGN.md 10章)。すべて Web Audio API で作る。音源ファイルは使わない。
// 音量は10章の表に合わせている。衝突・回避は段階6、BGMは段階7で足す。

const ENGINE = { freq: 55, cutoff: 300, gain: 0.05 };
const WIND = { center: 800, q: 0.8, maxGain: 0.05 };
// クラクション。タップすると、遠くのホンクが自然な間隔で2〜3回鳴る。
// DESIGN.md 10章は「2音の短い矩形波」だが、同章の表は「作り方の目安」。
// 近くで鳴らすと耳に刺さるので、距離感のある音にしている。
// 中身は (1)柔らかい立ち上がり (2)空気で高音が減った遠さ
// (3)街の反射(残響) (4)広すぎないステレオ の4つ。
const HORN = {
  // 遠さのローパスで高音を落とすぶん、音の力が大きく減る。
  // ここを 0.05 にするとエンジン音に埋もれて聞こえなかった
  gain: 0.18,
  wet: 0.5,                   // 残響の混ぜ具合
  minGapMs: 300,
  honks: [2, 3],              // 1回のタップで鳴る数
  gapSec: [0.30, 0.75],       // ホンクどうしの間隔
  durSec: [0.28, 0.50],       // 1回の長さ
  attack: 0.05,               // 柔らかい立ち上がり(近い音ほど立ち上がりが速い)
  release: 0.14,
  detuneCents: 12,            // 2本重ねてうなりを出す
  drive: 3,
  distanceLowpass: 2200,      // 遠いと空気で高音が減る
  pan: 0.35,                  // 広すぎないステレオ
  level: [0.55, 1.0],         // 遠さのばらつき
  pitchJitter: 0.08,          // 車ごとの個体差
  // correlation を上げるほど左右が似て、ステレオが狭くなる
  reverb: { sec: 1.1, decay: 0.28, dark: 0.28, correlation: 0.75 },
};

// 実際の車のクラクションは長3度に調律されているものが多い
const HORN_NOTES = [
  [262, 330],
  [277, 349],
  [311, 392],
];

function between(a, b) {
  return a + Math.random() * (b - a);
}

// BGM(DESIGN.md 10章)。場面ごとに1つ、ペンタトニックの短いアルペジオを
// 90BPMでループ。場面が変わる間は2曲を混ぜる
const BGM = {
  gain: 0.04,
  bpm: 90,
  stepsPerBeat: 2,          // 8分音符
  lookahead: 0.3,           // 何秒先まで予約しておくか
  noteDur: 0.42,
  scale: [0, 2, 4, 7, 9],   // ペンタトニック
  pattern: [0, 2, 1, 4, 2, 3, 1, 2],
};

const BGM_SCENES = {
  meadow: { root: 392.00, type: 'triangle' },
  sea: { root: 349.23, type: 'sine' },
  town: { root: 329.63, type: 'triangle' },
  night: { root: 261.63, type: 'sine' },
};

// 衝突と回避(DESIGN.md 10章)。どちらもやわらかい音にする
const CRASH = { gain: 0.10, from: 600, to: 300, fall: 0.2, tail: 0.3 };
const DODGE = { gain: 0.055, notes: [523, 659, 784], step: 0.07, dur: 0.16 };

// tanh でつぶす。ノコギリ波に効かせると倍音が増えてざらつく
function driveCurve(drive) {
  const n = 1024;
  const curve = new Float32Array(n);
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * drive) / norm;
  }
  return curve;
}

export function createAudio() {
  let ctx = null;
  let master = null;
  let windGain = null;
  let hornBus = null;
  let lastHornAt = -Infinity;   // 0 にすると、開いた直後の1回目が連打扱いで消える
  let bgmA = null;              // 今の場面の曲
  let bgmB = null;              // 次の場面の曲(切り替え中だけ鳴る)
  let bgmStep = 0;
  let bgmNextTime = 0;
  let bgmFrom = 'meadow';
  let bgmTo = 'meadow';

  function buildEngine() {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = ENGINE.freq;      // 車速は一定なので音程は変えない
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = ENGINE.cutoff;
    const gain = ctx.createGain();
    gain.gain.value = ENGINE.gain;
    osc.connect(lp).connect(gain).connect(master);
    osc.start();
  }

  function buildWind() {
    const len = Math.floor(ctx.sampleRate * 2);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = WIND.center;
    bp.Q.value = WIND.q;
    windGain = ctx.createGain();
    windGain.gain.value = 0;
    src.connect(bp).connect(windGain).connect(master);
    src.start();
  }

  // 街の反射。減衰する雑音を畳み込んで残響にする
  function buildReverb() {
    const len = Math.floor(ctx.sampleRate * HORN.reverb.sec);
    const buffer = ctx.createBuffer(2, len, ctx.sampleRate);
    const c = HORN.reverb.correlation;
    // 左右で完全に別の雑音にするとステレオが広がりすぎる。
    // 共通のぶんを多めにして、広すぎないようにする
    let shared = 0;
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    let sl = 0;
    let sr = 0;
    for (let i = 0; i < len; i++) {
      shared += ((Math.random() * 2 - 1) - shared) * HORN.reverb.dark;
      sl += ((Math.random() * 2 - 1) - sl) * HORN.reverb.dark;
      sr += ((Math.random() * 2 - 1) - sr) * HORN.reverb.dark;
      const decay = Math.exp(-(i / ctx.sampleRate) / HORN.reverb.decay);
      left[i] = (shared * c + sl * (1 - c)) * decay;
      right[i] = (shared * c + sr * (1 - c)) * decay;
    }
    const conv = ctx.createConvolver();
    conv.buffer = buffer;
    return conv;
  }

  // 鳴らすたびに作らず、1本を使い回す。
  // つぶす → 遠さのローパス → 素の音と残響を混ぜる
  function buildHorn() {
    const shaper = ctx.createWaveShaper();
    shaper.curve = driveCurve(HORN.drive);
    shaper.oversample = '4x';

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = HORN.distanceLowpass;

    const dry = ctx.createGain();
    dry.gain.value = 1 - HORN.wet;
    const wet = ctx.createGain();
    wet.gain.value = HORN.wet;

    const out = ctx.createGain();
    out.gain.value = HORN.gain;

    shaper.connect(lp);
    lp.connect(dry).connect(out);
    lp.connect(buildReverb()).connect(wet).connect(out);
    out.connect(master);
    hornBus = shaper;
  }

  // 起動画面のタップの中から呼ぶ(iOSはユーザー操作の中でしか音を出せない)
  function start() {
    if (ctx) {
      ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
    buildEngine();
    buildWind();
    buildHorn();
    bgmA = ctx.createGain();
    bgmA.gain.value = BGM.gain;
    bgmA.connect(master);
    bgmB = ctx.createGain();
    bgmB.gain.value = 0;
    bgmB.connect(master);
    ctx.resume();
  }

  // level: 0〜1。風切りの音量を |steer| に比例させる
  function setWind(level) {
    if (!windGain) return;
    const v = Math.max(0, Math.min(1, level)) * WIND.maxGain;
    windGain.gain.setTargetAtTime(v, ctx.currentTime, 0.08);
  }

  // 1音ぶん。ノコギリ波を少しずらして2本重ね、うなりを作る
  function hornVoice(freq, peak, t, dur, out) {
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + HORN.attack);
    gain.gain.setValueAtTime(peak, t + dur - HORN.release);
    gain.gain.linearRampToValueAtTime(0, t + dur);
    gain.connect(out);

    const oscs = [];
    for (const cents of [-HORN.detuneCents, HORN.detuneCents]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.detune.value = cents;
      osc.frequency.value = freq;
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + dur + 0.02);
      oscs.push(osc);
    }
    return { oscs, gain };
  }

  // ホンク1回ぶん。車ごとに音程・遠さ・左右が少しずつ違う
  function honk(at) {
    const t = ctx.currentTime + at;
    const [a, b] = HORN_NOTES[Math.floor(Math.random() * HORN_NOTES.length)];
    const jitter = 1 + (Math.random() * 2 - 1) * HORN.pitchJitter;
    const level = between(HORN.level[0], HORN.level[1]);
    const dur = between(HORN.durSec[0], HORN.durSec[1]);

    let out;
    if (ctx.createStereoPanner) {
      out = ctx.createStereoPanner();
      out.pan.value = (Math.random() * 2 - 1) * HORN.pan;
    } else {
      out = ctx.createGain();
    }
    out.connect(hornBus);

    const voices = [
      hornVoice(a * jitter, 0.5 * level, t, dur, out),
      hornVoice(b * jitter, 0.38 * level, t, dur, out),
    ];
    const last = voices[1].oscs[voices[1].oscs.length - 1];
    last.onended = () => {
      for (const v of voices) {
        for (const osc of v.oscs) osc.disconnect();
        v.gain.disconnect();
      }
      out.disconnect();
    };
  }

  function horn() {
    if (!ctx) return;
    // 連打されても音が積み重なりすぎないようにする
    const now = performance.now();
    if (now - lastHornAt < HORN.minGapMs) return;
    lastHornAt = now;

    const n = HORN.honks[0]
      + Math.floor(Math.random() * (HORN.honks[1] - HORN.honks[0] + 1));
    let at = 0;
    for (let i = 0; i < n; i++) {
      honk(at);
      at += between(HORN.gapSec[0], HORN.gapSec[1]);
    }
  }

  // BGMの1音
  function bgmNote(sceneId, degree, at, out) {
    const scene = BGM_SCENES[sceneId];
    if (!scene) return;
    const osc = ctx.createOscillator();
    osc.type = scene.type;
    osc.frequency.value = scene.root * Math.pow(2, BGM.scale[degree] / 12);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(1, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, at + BGM.noteDur);
    osc.connect(gain).connect(out);
    osc.start(at);
    osc.stop(at + BGM.noteDur + 0.02);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }

  // 場面(と切り替えの進み具合)を伝える。曲を混ぜる比を変える
  function setScene(from, to, k) {
    if (!ctx) return;
    bgmFrom = from;
    bgmTo = to;
    const t = ctx.currentTime;
    bgmA.gain.setTargetAtTime((1 - k) * BGM.gain, t, 0.3);
    bgmB.gain.setTargetAtTime((from === to ? 0 : k) * BGM.gain, t, 0.3);
  }

  // 毎フレーム呼ぶ。少し先の音を予約しておく
  function updateMusic() {
    if (!ctx) return;
    const step = 60 / BGM.bpm / BGM.stepsPerBeat;
    if (bgmNextTime === 0) bgmNextTime = ctx.currentTime + 0.1;
    while (bgmNextTime < ctx.currentTime + BGM.lookahead) {
      const degree = BGM.pattern[bgmStep % BGM.pattern.length];
      bgmNote(bgmFrom, degree, bgmNextTime, bgmA);
      if (bgmTo !== bgmFrom) bgmNote(bgmTo, degree, bgmNextTime, bgmB);
      bgmNextTime += step;
      bgmStep++;
    }
  }

  // 衝突: サイン波が 600Hz -> 300Hz に下がる(DESIGN.md 10章)
  function crash() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(CRASH.from, t);
    osc.frequency.linearRampToValueAtTime(CRASH.to, t + CRASH.fall);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(CRASH.gain, t + 0.02);
    gain.gain.linearRampToValueAtTime(0, t + CRASH.tail);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + CRASH.tail + 0.02);
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
  }

  // 回避: 三角波で上昇する3音のアルペジオ(DESIGN.md 10章)
  function dodge() {
    if (!ctx) return;
    const t0 = ctx.currentTime;
    DODGE.notes.forEach((freq, i) => {
      const t = t0 + i * DODGE.step;
      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(DODGE.gain, t + 0.012);
      gain.gain.linearRampToValueAtTime(0, t + DODGE.dur);
      osc.connect(gain).connect(master);
      osc.start(t);
      osc.stop(t + DODGE.dur + 0.02);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    });
  }

  return {
    start,
    setWind,
    horn,
    crash,
    dodge,
    setScene,
    updateMusic,
    get ready() { return ctx !== null; },
  };
}
