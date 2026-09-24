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

// 鳥の鳴き声(DESIGN.md 20章)。短く上がって下がるのを2回。
// 高い音なので、耳に刺さらないよう音量は小さめにする
// delay: クラクションの1回目とぶつからないよう、少し遅らせて鳴らす。
// 驚いた鳥があとから鳴く感じになり、音も聞き分けやすい
const CHIRP = { gain: 0.045, from: [2100, 2500], rise: 1.35, dur: 0.09, gap: 0.13, delay: 0.25 };

// 踏切のカンカン(DESIGN.md 21章)。鐘らしく、倍音を整数倍からずらして重ねる。
// 2つの高さを交互に鳴らす
const BELL = {
  gain: 0.05,
  freqs: [760, 700],
  partials: [[1, 1], [2.76, 0.35], [5.4, 0.12]],   // [倍率, 大きさ]
  decay: 0.32,
};

// ガタンゴトン(DESIGN.md 21章)。レールの継ぎ目の「タン」を雑音で作り、
// 下に小さく「ドン」を足す。200Hz前後はエンジンの音と重なって聞こえなくなるので、
// 「タン」はそれより上(900Hz / 620Hz)に置く
// 低いほうはBGMと音域が近く埋もれやすいので、少し大きくする(lowBoost)
const CLACK = { gain: 0.10, freqs: [900, 620], q: 2.5, decay: 0.08, thump: 0.35, thumpRatio: 0.18, lowBoost: 1.8 };

// 運転席のボタンの音(DESIGN.md 22章)
// ワイパーのキュッキュッ。ゴムがガラスをこする高い音を、行きと帰りに1回ずつ
const WIPER = { gain: 0.045, from: 950, to: 1350, dur: 0.15, wobble: 30, depth: 70, band: 1500, q: 2.5, at: [0.25, 0.75] };
// ライトのカチッ。点けるときは高く、消すときは低く
const CLICK = { gain: 0.035, on: 1800, off: 1400, dur: 0.03 };
// 動物の鳴き声。ノコギリ波の高さを動かし、口の形をフィルターで作る
const DOG = { gain: 0.12, at: [0, 0.22], pitch: [420, 560, 330], band: 1000, q: 1.1, dur: 0.15 };
const COW = { gain: 0.14, pitch: [118, 132, 100], mouth: [300, 1000, 450], q: 3, dur: 1.2, vibrato: 5, depth: 2 };
const DUCK = { gain: 0.12, at: [0, 0.24], pitch: [290, 250], bands: [[1100, 4], [2300, 5]], dur: 0.17 };

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
    master.gain.value = muted ? 0 : volume;
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

  // 鳴らしたら true を返す。連打で間引いたときは false(DESIGN.md 20章)。
  // 絵の反応は、音が本当に鳴ったときだけ返すため
  function horn() {
    // 連打されても音が積み重なりすぎないようにする
    const now = performance.now();
    if (now - lastHornAt < HORN.minGapMs) return false;
    lastHornAt = now;
    if (!ctx) return true;      // 音が出せない環境でも、絵は反応させる

    const n = HORN.honks[0]
      + Math.floor(Math.random() * (HORN.honks[1] - HORN.honks[0] + 1));
    let at = 0;
    for (let i = 0; i < n; i++) {
      honk(at);
      at += between(HORN.gapSec[0], HORN.gapSec[1]);
    }
    return true;
  }

  // 踏切のカンカンを1回。level は 0〜1(遠いと小さい)、alt で高さを替える
  function bell(level, alt) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = BELL.freqs[alt ? 1 : 0];
    const out = ctx.createGain();
    out.gain.value = BELL.gain * level;
    out.connect(master);
    BELL.partials.forEach(([ratio, amp], i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = f * ratio;
      const g = ctx.createGain();
      // 高い倍音ほど早く消える
      const end = t + BELL.decay / Math.sqrt(ratio);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(amp, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(g).connect(out);
      osc.start(t);
      osc.stop(end + 0.02);
      // 基音がいちばん長く鳴るので、それが止まったらまとめ役も外す
      osc.onended = () => {
        osc.disconnect();
        g.disconnect();
        if (i === 0) out.disconnect();
      };
    });
  }

  // ガタンゴトンの1打。low で低いほう(ゴトン)
  let noise = null;
  function clack(level, low) {
    if (!ctx || level <= 0.01) return;
    if (!noise) {
      const len = Math.floor(ctx.sampleRate * 0.3);
      noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const t = ctx.currentTime;
    const f = CLACK.freqs[low ? 1 : 0];
    const peak = CLACK.gain * level * (low ? CLACK.lowBoost : 1);

    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = f;
    bp.Q.value = CLACK.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + CLACK.decay);
    src.connect(bp).connect(g).connect(master);
    src.start(t);
    src.stop(t + CLACK.decay + 0.02);
    src.onended = () => { src.disconnect(); bp.disconnect(); g.disconnect(); };

    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f * CLACK.thumpRatio, t);
    osc.frequency.exponentialRampToValueAtTime(f * CLACK.thumpRatio * 0.7, t + CLACK.decay);
    const og = ctx.createGain();
    og.gain.setValueAtTime(peak * CLACK.thump, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + CLACK.decay);
    osc.connect(og).connect(master);
    osc.start(t);
    osc.stop(t + CLACK.decay + 0.02);
    osc.onended = () => { osc.disconnect(); og.disconnect(); };
  }

  // 鳴らし終わったら外す
  function release(nodes, osc) {
    osc.onended = () => { for (const n of nodes) n.disconnect(); };
  }

  // ワイパーが1往復するあいだに、キュッキュッと2回鳴らす(DESIGN.md 22章)
  function wiper(sec) {
    if (!ctx) return;
    for (const f of WIPER.at) {
      const t = ctx.currentTime + sec * f;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(WIPER.from, t);
      osc.frequency.linearRampToValueAtTime(WIPER.to, t + WIPER.dur);
      // こすれる感じを出すため、音の高さを細かく揺らす
      const lfo = ctx.createOscillator();
      lfo.frequency.value = WIPER.wobble;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = WIPER.depth;
      lfo.connect(lfoGain).connect(osc.frequency);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = WIPER.band;
      bp.Q.value = WIPER.q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(WIPER.gain, t + 0.02);
      g.gain.linearRampToValueAtTime(0, t + WIPER.dur);
      osc.connect(bp).connect(g).connect(master);
      osc.start(t);
      lfo.start(t);
      osc.stop(t + WIPER.dur + 0.02);
      lfo.stop(t + WIPER.dur + 0.02);
      release([osc, lfo, lfoGain, bp, g], osc);
    }
  }

  // ライトを点けた・消した(DESIGN.md 22章)
  function click(on) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = on ? CLICK.on : CLICK.off;
    const g = ctx.createGain();
    g.gain.setValueAtTime(CLICK.gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + CLICK.dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + CLICK.dur + 0.01);
    release([osc, g], osc);
  }

  // ワンワン: 短く上がって下がる声を2回
  function dog(t0) {
    for (const at of DOG.at) {
      const t = t0 + at;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(DOG.pitch[0], t);
      osc.frequency.linearRampToValueAtTime(DOG.pitch[1], t + 0.03);
      osc.frequency.exponentialRampToValueAtTime(DOG.pitch[2], t + DOG.dur * 0.85);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = DOG.band;
      bp.Q.value = DOG.q;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(DOG.gain, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + DOG.dur);
      osc.connect(bp).connect(g).connect(master);
      osc.start(t);
      osc.stop(t + DOG.dur + 0.02);
      release([osc, bp, g], osc);
    }
  }

  // モー: 低い声で、口を閉じた「ン」から開いた「オー」へ、また少し閉じる
  function cow(t) {
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(COW.pitch[0], t);
    osc.frequency.linearRampToValueAtTime(COW.pitch[1], t + COW.dur * 0.2);
    osc.frequency.linearRampToValueAtTime(COW.pitch[2], t + COW.dur * 0.9);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = COW.vibrato;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = COW.depth;
    lfo.connect(lfoGain).connect(osc.frequency);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = COW.q;
    lp.frequency.setValueAtTime(COW.mouth[0], t);
    lp.frequency.linearRampToValueAtTime(COW.mouth[1], t + COW.dur * 0.3);
    lp.frequency.linearRampToValueAtTime(COW.mouth[2], t + COW.dur * 0.9);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(COW.gain, t + 0.18);
    g.gain.setValueAtTime(COW.gain, t + COW.dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t + COW.dur);
    osc.connect(lp).connect(g).connect(master);
    osc.start(t);
    lfo.start(t);
    osc.stop(t + COW.dur + 0.02);
    lfo.stop(t + COW.dur + 0.02);
    release([osc, lfo, lfoGain, lp, g], osc);
  }

  // ガーガー: 鼻にかかった短い声を2回。2つの帯域を強めて鼻声にする
  function duck(t0) {
    for (const at of DUCK.at) {
      const t = t0 + at;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(DUCK.pitch[0], t);
      osc.frequency.linearRampToValueAtTime(DUCK.pitch[1], t + DUCK.dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(DUCK.gain, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.001, t + DUCK.dur);
      const nodes = [osc, g];
      for (const [f, q] of DUCK.bands) {
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = f;
        bp.Q.value = q;
        osc.connect(bp).connect(g);
        nodes.push(bp);
      }
      g.connect(master);
      osc.start(t);
      osc.stop(t + DUCK.dur + 0.02);
      release(nodes, osc);
    }
  }

  // どうぶつボタンで出てきた動物の鳴き声(DESIGN.md 22章)
  function animal(name) {
    if (!ctx) return;
    const t = ctx.currentTime;
    if (name === 'dog') dog(t);
    else if (name === 'cow') cow(t);
    else if (name === 'duck') duck(t);
  }

  // 鳥の鳴き声(DESIGN.md 20章)
  function chirp() {
    if (!ctx) return;
    const t0 = ctx.currentTime + CHIRP.delay;
    CHIRP.from.forEach((freq, i) => {
      const t = t0 + i * CHIRP.gap;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq * CHIRP.rise, t + CHIRP.dur * 0.45);
      osc.frequency.exponentialRampToValueAtTime(freq * 0.92, t + CHIRP.dur);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(CHIRP.gain, t + 0.012);
      gain.gain.linearRampToValueAtTime(0, t + CHIRP.dur);
      osc.connect(gain).connect(master);
      osc.start(t);
      osc.stop(t + CHIRP.dur + 0.02);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    });
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

  // 設定の「音」。iOSは消音スイッチが効かない場合があるので必須(DESIGN.md 10章)
  let muted = false;
  let volume = 1;      // おわりの演出で下げる(DESIGN.md 12章)

  function applyGain(tau) {
    if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, tau);
  }

  function setMuted(v) {
    muted = v;
    applyGain(0.05);
  }

  // sec かけて音量を変える。setTargetAtTime は時定数なので sec/3 でほぼ届く
  function setVolume(v, sec = 0.5) {
    volume = Math.max(0, Math.min(1, v));
    applyGain(Math.max(0.01, sec / 3));
  }

  // アプリが隠れている間は音を止める(DESIGN.md 11章)
  function suspend() {
    if (ctx) ctx.suspend();
  }

  function resume() {
    if (!ctx) return;
    ctx.resume();
    bgmNextTime = 0;   // 止まっていた間のぶんをまとめて鳴らさない
  }

  return {
    start,
    setMuted,
    setVolume,
    suspend,
    resume,
    setWind,
    horn,
    chirp,
    bell,
    clack,
    wiper,
    click,
    animal,
    crash,
    dodge,
    setScene,
    updateMusic,
    get ready() { return ctx !== null; },
  };
}
