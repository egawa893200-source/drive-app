// 音(DESIGN.md 10章)。すべて Web Audio API で作る。音源ファイルは使わない。
// 音量は10章の表に合わせている。衝突・回避は段階6、BGMは段階7で足す。

const ENGINE = { freq: 55, cutoff: 300, gain: 0.05 };
const WIND = { center: 800, q: 0.8, maxGain: 0.05 };
const HORN = { gain: 0.10, cutoff: 1400 };

// クラクションは3種類からランダム。2音の短い矩形波(DESIGN.md 10章)
const HORN_NOTES = [
  [523, 659],
  [587, 440],
  [659, 784],
];

export function createAudio() {
  let ctx = null;
  let master = null;
  let windGain = null;

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
    ctx.resume();
  }

  // level: 0〜1。風切りの音量を |steer| に比例させる
  function setWind(level) {
    if (!windGain) return;
    const v = Math.max(0, Math.min(1, level)) * WIND.maxGain;
    windGain.gain.setTargetAtTime(v, ctx.currentTime, 0.08);
  }

  function beep(freq, at, dur, out) {
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(HORN.gain, t + 0.012);
    gain.gain.setValueAtTime(HORN.gain, t + dur - 0.04);
    gain.gain.linearRampToValueAtTime(0, t + dur);
    osc.connect(gain).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function horn() {
    if (!ctx) return;
    // 矩形波のままだと耳に刺さるので、角を落としてから出す
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = HORN.cutoff;
    lp.connect(master);
    const [a, b] = HORN_NOTES[Math.floor(Math.random() * HORN_NOTES.length)];
    beep(a, 0, 0.14, lp);
    beep(b, 0.13, 0.20, lp);
  }

  return {
    start,
    setWind,
    horn,
    get ready() { return ctx !== null; },
  };
}
