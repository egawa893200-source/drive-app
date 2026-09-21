// 音(DESIGN.md 10章)。すべて Web Audio API で作る。音源ファイルは使わない。
// 音量は10章の表に合わせている。衝突・回避は段階6、BGMは段階7で足す。

const ENGINE = { freq: 55, cutoff: 300, gain: 0.05 };
const WIND = { center: 800, q: 0.8, maxGain: 0.05 };
// クラクション。DESIGN.md 10章は「2音の短い矩形波」だが、10章の表は
// 「作り方の目安」なので、本物らしさを優先して次のように作り直した。
//
// 段階4の反省: 矩形波に WaveShaper(tanh)をかけてもほとんど何も起きない。
// 矩形波はもともと振幅が上下一定なので、つぶす余地がないため。結果として
// ざらつきが出ず、きれいな2音の和音のままだった。
// 本物のクラクションは (1)倍音が偶数次まで密に詰まっている (2)1〜3kHz に
// 金属の共鳴がある (3)振動板のバリバリした雑音が混ざる、の3つでできている。
const HORN = {
  gain: 0.045,
  dur: 0.36,
  minGapMs: 180,
  detuneCents: 12,     // 2本重ねてうなりを出す
  drive: 6,            // ノコギリ波なのでつぶすと倍音が増える
  lowpass: 5200,       // 本物は4kHz超まで出ている。落としすぎると笛になる
  riseSec: 0.035,      // 鳴り始めに音程がわずかに上がる
  // 金属の共鳴。この2つが「クラクションらしさ」の大半
  formants: [
    { freq: 1200, q: 1.0, gain: 8 },
    { freq: 2600, q: 1.2, gain: 10 },
  ],
  // 振動板のバリバリ。鳴り始めにだけ混ぜる
  noise: { gain: 0.35, center: 2600, q: 0.9, dur: 0.12 },
};

// 実際の車のクラクションは長3度に調律されているものが多い
const HORN_NOTES = [
  [262, 330],
  [277, 349],
  [311, 392],
];

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

  // 鳴らすたびに作らず、1本を使い回す。
  // つぶす → 金属の共鳴を持ち上げる → 高いところを落とす、の順に通す
  function buildHorn() {
    const shaper = ctx.createWaveShaper();
    shaper.curve = driveCurve(HORN.drive);
    shaper.oversample = '4x';

    let node = shaper;
    for (const f of HORN.formants) {
      const peak = ctx.createBiquadFilter();
      peak.type = 'peaking';
      peak.frequency.value = f.freq;
      peak.Q.value = f.q;
      peak.gain.value = f.gain;
      node = node.connect(peak);
    }

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = HORN.lowpass;

    const out = ctx.createGain();
    out.gain.value = HORN.gain;

    node.connect(lp).connect(out).connect(master);
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
    ctx.resume();
  }

  // level: 0〜1。風切りの音量を |steer| に比例させる
  function setWind(level) {
    if (!windGain) return;
    const v = Math.max(0, Math.min(1, level)) * WIND.maxGain;
    windGain.gain.setTargetAtTime(v, ctx.currentTime, 0.08);
  }

  // 1音ぶん。ノコギリ波を少しずらして2本重ね、うなりを作る。
  // 矩形波(奇数倍音だけ)より倍音が密になり、金属の鳴りに近づく
  function hornNote(freq, peak) {
    const t = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.006);   // 立ち上がりは速く
    gain.gain.setValueAtTime(peak, t + HORN.dur - 0.05);
    gain.gain.linearRampToValueAtTime(0, t + HORN.dur);
    gain.connect(hornBus);

    const oscs = [];
    for (const cents of [-HORN.detuneCents, HORN.detuneCents]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.detune.value = cents;
      osc.frequency.setValueAtTime(freq * 0.96, t);
      osc.frequency.linearRampToValueAtTime(freq, t + HORN.riseSec);
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + HORN.dur + 0.02);
      oscs.push(osc);
    }
    oscs[oscs.length - 1].onended = () => {
      for (const osc of oscs) osc.disconnect();
      gain.disconnect();
    };
  }

  // 振動板のバリバリした雑音。鳴り始めにだけ混ぜる
  function hornNoise() {
    const t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * HORN.noise.dur);
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = HORN.noise.center;
    bp.Q.value = HORN.noise.q;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(HORN.noise.gain, t);
    gain.gain.linearRampToValueAtTime(0, t + HORN.noise.dur);
    src.connect(bp).connect(gain).connect(hornBus);
    src.start(t);
    src.onended = () => { src.disconnect(); bp.disconnect(); gain.disconnect(); };
  }

  function horn() {
    if (!ctx) return;
    // 連打されても音が積み重ならないようにする。重なると割れて変な音になる
    const now = performance.now();
    if (now - lastHornAt < HORN.minGapMs) return;
    lastHornAt = now;
    const [a, b] = HORN_NOTES[Math.floor(Math.random() * HORN_NOTES.length)];
    // つぶす前の段階では振幅を大きめに入れる。ここでの差が音色のざらつきになる
    hornNote(a, 0.5);
    hornNote(b, 0.38);
    hornNoise();
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
    get ready() { return ctx !== null; },
  };
}
