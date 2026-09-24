// 画面の向きと safe area(DESIGN.md 6章)。
// iOS Safari は画面の向きを固定できないので、縦向きのときは描画する箱ごと
// CSS で回して横画面として描く。論理画面サイズは常に横長(W > H)。
import { CFG } from './config.js';

export function createOrientation(stage, canvas, probe) {
  let W = 0;
  let H = 0;
  let rot = 0;                                      // canvas の回転角(0 / ±90)
  const inset = { left: 0, right: 0, top: 0, bottom: 0 };

  // 画面の余白を px で読む。padding に入れてあるので px に解決されている
  function viewportInsets() {
    const s = getComputedStyle(probe);
    return {
      top: parseFloat(s.paddingTop) || 0,
      right: parseFloat(s.paddingRight) || 0,
      bottom: parseFloat(s.paddingBottom) || 0,
      left: parseFloat(s.paddingLeft) || 0,
    };
  }

  // 箱を回すと、画面の余白がどの辺に来るかも入れ替わる
  function mapInsets(v) {
    if (rot === 90) {
      // 論理左 → 画面上、論理右 → 画面下
      inset.left = v.top;
      inset.right = v.bottom;
      inset.top = v.right;
      inset.bottom = v.left;
    } else if (rot === -90) {
      inset.left = v.bottom;
      inset.right = v.top;
      inset.top = v.left;
      inset.bottom = v.right;
    } else {
      inset.left = v.left;
      inset.right = v.right;
      inset.top = v.top;
      inset.bottom = v.bottom;
    }
  }

  function resize(ctx) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const portrait = vh > vw;

    rot = portrait ? CFG.CANVAS_ROTATION : 0;
    W = portrait ? vh : vw;      // 論理画面は常に横長
    H = portrait ? vw : vh;

    stage.style.width = `${W}px`;
    stage.style.height = `${H}px`;
    stage.style.transform = rot
      ? `translate(-50%, -50%) rotate(${rot}deg)`
      : 'translate(-50%, -50%)';

    const dpr = Math.min(window.devicePixelRatio || 1, CFG.MAX_DPR);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    mapInsets(viewportInsets());

    // 論理座標での余白をCSSからも使えるようにする。
    // 箱を回すと env() の向きと合わなくなるため(DESIGN.md 6章)
    stage.style.setProperty('--inset-left', `${inset.left}px`);
    stage.style.setProperty('--inset-right', `${inset.right}px`);
    stage.style.setProperty('--inset-top', `${inset.top}px`);
    stage.style.setProperty('--inset-bottom', `${inset.bottom}px`);
  }

  // 画面上の点を、回転を戻して論理座標にする(DESIGN.md 5.4、6章)
  function toLogical(clientX, clientY) {
    const vx = clientX - window.innerWidth / 2;
    const vy = clientY - window.innerHeight / 2;
    let x;
    let y;
    if (rot === 90) {
      x = vy;
      y = -vx;
    } else if (rot === -90) {
      x = -vy;
      y = vx;
    } else {
      x = vx;
      y = vy;
    }
    return { x: W / 2 + x, y: H / 2 + y };
  }

  return {
    resize,
    toLogical,
    get width() { return W; },
    get height() { return H; },
    get rotation() { return rot; },
    get inset() { return inset; },
  };
}
