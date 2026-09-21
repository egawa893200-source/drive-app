// 音(DESIGN.md 10章)。すべて Web Audio API で作る。音源ファイルは使わない。
// 音量は10章の表に合わせている。衝突・回避は段階6、BGMは段階7で足す。

const ENGINE = { freq: 55, cutoff: 300, gain: 0.05 };
const WIND = { center: 800, q: 0.8, maxGain: 0.05 };
const HORN = { gain: 0.09, cutoff: 1100, dur: 0.28, minGapMs: 180 };

// クラクションは3種類からランダム。2音の短い矩形波(DESIGN.md 10章)。
// 本物のクラクションは2音を「同時に」鳴らす。順番に鳴らすと呼び鈴になってしまう。
// 組み合わせは長3度にしてある
const HORN_NOTES = [
  [392, 494],
  [440, 554],
  [349, 440],
];

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

  // 矩形波のままだと耳に刺さるので、角を落としてから出す。
  // クラクションのたびに作らず、1本を使い回す
  function buildHorn() {
    hornBus = ctx.createBiquadFilter();
    hornBus.type = 'lowpass';
    hornBus.frequency.value = HORN.cutoff;
    hornBus.connect(master);
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

  function hornNote(freq, peak) {
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + 0.02);
    gain.gain.setValueAtTime(peak, t + HORN.dur - 0.06);
    gain.gain.linearRampToValueAtTime(0, t + HORN.dur);
    osc.connect(gain).connect(hornBus);
    osc.start(t);
    osc.stop(t + HORN.dur + 0.02);
    osc.onended = () => {
      osc.disconnect();
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
    hornNote(a, HORN.gain);
    hornNote(b, HORN.gain * 0.7);
  }

  return {
    start,
    setWind,
    horn,
    get ready() { return ctx !== null; },
  };
}
