// 音(DESIGN.md 10章)。すべて Web Audio API で作る。音源ファイルは使わない。
// 音量は10章の表に合わせている。衝突・回避は段階6、BGMは段階7で足す。

const ENGINE = { freq: 55, cutoff: 300, gain: 0.05 };
const WIND = { center: 800, q: 0.8, maxGain: 0.05 };
// クラクション(DESIGN.md 10章の「2音の短い矩形波」)。
// 段階4: ローパスを下げすぎて笛のような純音になっていた。クラクションらしさは
// 倍音のざらつきと、2音のわずかなうなりにあるので、そちらを作り直した。
const HORN = {
  gain: 0.06,        // 波形をつぶしたあとの出力。耳に優しい音量に抑える
  dur: 0.32,
  minGapMs: 180,
  detuneCents: 9,    // 同じ音を少しずらして重ね、うなりを出す
  drive: 12,         // 波形をつぶして金属的なざらつきを出す
  formant: 1800,     // クラクション特有の鳴りの中心
  formantQ: 1.1,
  formantGainDb: 9,
  cutoff: 3200,      // これより上は耳に刺さるので落とす
  riseSec: 0.03,     // 鳴り始めに少しだけ音程が上がる(本物の立ち上がり)
};

// 本物のクラクションは2音を「同時に」鳴らす。順番に鳴らすと呼び鈴になる。
// 実際の車のクラクションは長3度に調律されているものが多い
const HORN_NOTES = [
  [277, 349],
  [311, 392],
  [262, 330],
];

// 衝突と回避(DESIGN.md 10章)。どちらもやわらかい音にする
const CRASH = { gain: 0.10, from: 600, to: 300, fall: 0.2, tail: 0.3 };
const DODGE = { gain: 0.055, notes: [523, 659, 784], step: 0.07, dur: 0.16 };

// tanh でやわらかくつぶす。角が立ちすぎないディストーション
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
  // つぶす → 鳴りを強調 → 高いところを落とす、の順に通す
  function buildHorn() {
    const shaper = ctx.createWaveShaper();
    shaper.curve = driveCurve(HORN.drive);
    shaper.oversample = '4x';

    const formant = ctx.createBiquadFilter();
    formant.type = 'peaking';
    formant.frequency.value = HORN.formant;
    formant.Q.value = HORN.formantQ;
    formant.gain.value = HORN.formantGainDb;

    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = HORN.cutoff;

    const out = ctx.createGain();
    out.gain.value = HORN.gain;

    shaper.connect(formant).connect(lp).connect(out).connect(master);
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

  // 1音ぶん。同じ音程を少しずらして2本重ね、うなりを作る
  function hornNote(freq, peak) {
    const t = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.008);   // 立ち上がりは速く
    gain.gain.setValueAtTime(peak, t + HORN.dur - 0.05);
    gain.gain.linearRampToValueAtTime(0, t + HORN.dur);
    gain.connect(hornBus);

    const oscs = [];
    for (const cents of [-HORN.detuneCents, HORN.detuneCents]) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
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
