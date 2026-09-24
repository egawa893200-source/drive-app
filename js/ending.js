// おわりの演出(DESIGN.md 12章)。
// 夕焼け → 道の先の車庫 → 暗くなる → おやすみの絵 → SLEEP。
// この間もジャイロ操作は効いたままにする(DESIGN.md 12章)。
// 文字・点滅・カメラの揺れは出さない(DESIGN.md 18章)。
import { CFG } from './config.js';

// 車庫。size は道幅の半分に対する比なので、2.0 で道幅ちょうど。
// それより広くして、どこを走っていても必ず入れるようにする(DESIGN.md 12章)
const GARAGE = { size: 2.8, aspect: 0.55 };

const GOODNIGHT_RATIO = 0.42;     // おやすみの絵の大きさ(画面の短辺比)
const GOODNIGHT_FADE_SEC = 1.2;   // ゆっくり浮かび上がらせる
const SLEEP_COLOR = '#0E1430';    // 眠ったあとの画面の色
const SUNSET_VEIL = '255, 150, 80';
const SUNSET_VEIL_ALPHA = 0.18;   // 夕焼けのあいだ、画面全体にかける暖色の薄い膜
// 車庫に入ってから止まるまで。暗くなりきるより前に止める
const STOP_RATIO = 0.5;

export function createEnding(assets, road) {
  assets.preload(['garage', 'goodnight']);

  let phase = 'off';    // off → sunset → enter → sleep
  let t = 0;            // いまの段階に入ってからの秒数
  let garage = null;    // { dist } 自車の見かけの位置までの残り距離
  let sunsetK = 0;

  function reset() {
    phase = 'off';
    t = 0;
    garage = null;
    sunsetK = 0;
  }

  function begin() {
    reset();
    phase = 'sunset';
  }

  // moved: このフレームで進んだ距離。speed: いまの前進速度(ワールド単位/秒)
  function update(dt, moved, speed) {
    if (phase === 'off' || phase === 'sleep') {
      if (phase === 'sleep') t += dt;
      return;
    }
    t += dt;

    if (phase === 'sunset') {
      sunsetK = Math.min(1, t / CFG.END_SUNSET_SEC);
      // 夕焼けが終わるころに車庫へ着くように、終わりの手前で置く。
      // 描画距離の内側に入ってから置く。外だと道の投影が前の周のままで、
      // 車庫が変な場所に出てしまう
      if (!garage && t >= CFG.END_SUNSET_SEC - CFG.END_GARAGE_LEAD_SEC) {
        garage = { dist: speed * CFG.END_GARAGE_LEAD_SEC };
      }
      if (garage) {
        garage.dist -= moved;
        if (garage.dist <= 0) {
          garage.dist = 0;         // 入り口で止める
          phase = 'enter';
          t = 0;
        }
      }
      return;
    }

    if (phase === 'enter' && t >= CFG.END_FADE_SEC) {
      phase = 'sleep';
      t = 0;
    }
  }

  // 車庫に入ったら、ゆっくり止まる。衝突で止めるのとは別(DESIGN.md 18章)
  function speedScale() {
    if (phase === 'off' || phase === 'sunset') return 1;
    if (phase === 'sleep') return 0;
    return Math.max(0, 1 - t / (CFG.END_FADE_SEC * STOP_RATIO));
  }

  // 道路を描いたあと、自車より先に呼ぶ(投影が更新されている必要がある)
  function drawGarage(ctx, W, H, position) {
    if (!garage) return;
    const s = road.sampleAt(position + road.carLineDistance() + garage.dist);
    if (!s.visible) return;
    const w = GARAGE.size * s.w;
    if (w < 1) return;
    const h = w * GARAGE.aspect;
    ctx.save();
    if (s.clip < H) {          // 丘の向こうはまだ見えない
      ctx.beginPath();
      ctx.rect(0, 0, W, s.clip);
      ctx.clip();
    }
    assets.draw(ctx, 'garage', s.x - w / 2, s.y - h, w, h);
    ctx.restore();
  }

  // いちばん最後に、画面全体にかける
  function drawOverlay(ctx, W, H) {
    if (phase === 'off') return;

    if (phase !== 'sleep') {
      ctx.fillStyle = `rgba(${SUNSET_VEIL}, ${SUNSET_VEIL_ALPHA * sunsetK})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (phase === 'off' || phase === 'sunset') return;

    // 車庫に入ってから、おやすみの色へゆっくり変わる
    const dark = phase === 'sleep' ? 1 : Math.min(1, t / CFG.END_FADE_SEC);
    ctx.save();
    ctx.globalAlpha = dark;
    ctx.fillStyle = SLEEP_COLOR;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    if (phase !== 'sleep') return;

    const size = Math.min(W, H) * GOODNIGHT_RATIO;
    ctx.save();
    ctx.globalAlpha = Math.min(1, t / GOODNIGHT_FADE_SEC);
    assets.draw(ctx, 'goodnight', (W - size) / 2, (H - size) / 2, size, size);
    ctx.restore();
  }

  return {
    begin,
    reset,
    update,
    drawGarage,
    drawOverlay,
    get phase() { return phase; },
    get sunset() { return sunsetK; },
    get speedScale() { return speedScale(); },
    get active() { return phase !== 'off'; },
  };
}
