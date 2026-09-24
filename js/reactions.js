// クラクションへの反応(DESIGN.md 20章)。
// 鳴らすと、前方の道ばたの物が種類に応じて一度だけ動く。
// 「自分が押したから動いた」が分かるように、必ず何かが反応するようにする。
import { CFG } from './config.js';

// 物の名前 → 反応の種類。ここに無い物(建物・信号・灯台など)は動かさない
const KIND = {
  bird: 'fly',
  owl: 'fly',
  cow: 'look',
  dog: 'look',
  duck: 'look',
  tree_round: 'sway',
  tree_tall: 'sway',
  bush: 'sway',
  flowers: 'sway',
  palm: 'sway',
  pine: 'sway',
  windmill: 'sway',
};

const SEC = {
  fly: () => CFG.REACT_FLY_SEC,
  look: () => CFG.REACT_LOOK_SEC,
  sway: () => CFG.REACT_SWAY_SEC,
};

const FLY_RISE = 2.6;      // 飛び上がる高さ。自分の高さに対する比
const FLY_DRIFT = 0.8;     // 横に流れる量。自分の幅に対する比
const HOP_RATIO = 0.25;    // ぴょこんと跳ねる高さ。自分の高さに対する比
const HOP_PART = 0.35;     // 跳ねるのは反応時間のうち最初のこれだけ
const SWAY_CYCLES = 2.5;   // 左右にゆれる回数
const POP_SEC = 0.4;       // どうぶつボタンで出てくるときの、ぴょこっと(DESIGN.md 22章)
const POP_OVER = 1.15;     // いったん少し大きくなってから戻る

export function createReactions(road, audio) {
  const active = [];     // 反応している最中の物
  let lastChirpAt = -Infinity;

  // クラクションが鳴ったとき。position は自車の位置
  function honk(position) {
    let flew = false;
    road.forEachItemAhead(position, CFG.REACT_SEGMENTS, (item) => {
      const kind = KIND[item.name];
      if (!kind || item.react) return;      // 反応中の物は重ねがけしない
      item.react = { kind, t: 0, sec: SEC[kind]() };
      active.push(item);
      if (kind === 'fly') flew = true;
    });
    // 連打されても鳴き声は重ねない(DESIGN.md 20章)
    const now = performance.now();
    if (flew && now - lastChirpAt > CFG.REACT_CHIRP_GAP_SEC * 1000) {
      lastChirpAt = now;
      audio.chirp();
    }
  }

  // 地面からぴょこっと出てくる(どうぶつボタン)
  function pop(item) {
    item.react = { kind: 'pop', t: 0, sec: POP_SEC };
    active.push(item);
  }

  function update(dt) {
    for (let i = active.length - 1; i >= 0; i--) {
      const item = active[i];
      item.react.t += dt;
      if (item.react.t >= item.react.sec) {
        // 飛び立った鳥は戻ってこない(DESIGN.md 20章)
        item.react = item.react.kind === 'fly' ? { kind: 'gone', t: 0, sec: 0 } : null;
        active.splice(i, 1);
      }
    }
  }

  // 道ばたの物を描く。反応の途中なら、その動きを足してから描く。
  // (x, y) は左上、w/h は描く大きさ。下端中央が接地点(DESIGN.md 13.2)
  function drawItem(ctx, item, x, y, w, h, draw) {
    const r = item.react;
    if (!r) {
      draw(ctx, item.name, x, y, w, h);
      return;
    }
    if (r.kind === 'gone') return;

    const k = Math.min(1, r.t / r.sec);

    if (r.kind === 'pop') {
      // 下端を軸に 0 → 少し大きく → 元の大きさ
      const s = k < 0.6
        ? POP_OVER * Math.sin((k / 0.6) * Math.PI / 2)
        : POP_OVER - (POP_OVER - 1) * ((k - 0.6) / 0.4);
      ctx.save();
      ctx.translate(x + w / 2, y + h);
      ctx.scale(s, s);
      draw(ctx, item.name, -w / 2, -h, w, h);
      ctx.restore();
      return;
    }

    if (r.kind === 'fly') {
      ctx.save();
      ctx.globalAlpha = 1 - k;
      draw(ctx, item.name, x + k * w * FLY_DRIFT, y - k * h * FLY_RISE, w, h);
      ctx.restore();
      return;
    }

    if (r.kind === 'look') {
      // ぴょこんと跳ねて、左右を反転させる(こちらを向く)
      const hop = k < HOP_PART ? Math.sin(Math.PI * (k / HOP_PART)) * h * HOP_RATIO : 0;
      ctx.save();
      ctx.translate(x + w / 2, 0);
      ctx.scale(-1, 1);
      draw(ctx, item.name, -w / 2, y - hop, w, h);
      ctx.restore();
      return;
    }

    // sway: 下端を軸に左右へゆれて止まる
    const angle = Math.sin(k * Math.PI * 2 * SWAY_CYCLES) * (1 - k) * CFG.REACT_SWAY_DEG;
    ctx.save();
    ctx.translate(x + w / 2, y + h);
    ctx.rotate(angle * Math.PI / 180);
    draw(ctx, item.name, -w / 2, -h, w, h);
    ctx.restore();
  }

  return { honk, pop, update, drawItem, get count() { return active.length; } };
}
