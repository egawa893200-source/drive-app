#!/usr/bin/env python3
"""GPT素材生成ループ: プロンプト表示、取り込み(透過・切り出し・WebP化)、保存、進捗管理。"""
import argparse
import datetime
import json
import shutil
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

SKILL_DIR = Path(__file__).resolve().parent.parent
REPO_DEFAULT = SKILL_DIR.parent.parent.parent
MANIFEST = SKILL_DIR / "assets.json"
CONFIG = SKILL_DIR / "config.json"
STATUS = SKILL_DIR / "status.json"
IMG_EXT = {".png", ".jpg", ".jpeg", ".webp"}
ROAD_GRAY = (124, 128, 137)
ICON_BG = (126, 200, 240)
ICON_SIZES = (180, 192, 512)
MAGENTA = np.array([255.0, 0.0, 255.0])
ASPECT_TOLERANCE = 1.35   # 物の形の比が、アプリの比からこれ以上ずれたら知らせる


# ---------- 共通 ----------

def die(msg):
    print(f"ERROR: {msg}")
    sys.exit(1)


def read_json(p):
    return json.loads(p.read_text(encoding="utf-8"))


def write_json(p, data):
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def load_config():
    """config.json は任意。無ければリポジトリ内の inbox/ を使う初期設定で動く。"""
    c = read_json(CONFIG) if CONFIG.exists() else {}

    def resolve(v):
        p = Path(v).expanduser()
        return p if p.is_absolute() else (REPO_DEFAULT / p).resolve()

    c["repo_dir"] = resolve(c.get("repo_dir", "."))
    c["inbox_dir"] = resolve(c.get("inbox_dir", "inbox"))
    c["drive_dir"] = resolve(c["drive_dir"]) if c.get("drive_dir") else None
    c["src_dir"] = c["repo_dir"] / "assets-src"
    c["preview_dir"] = c["src_dir"] / "preview"
    c.setdefault("webp_quality", 88)
    c.setdefault("api_base", API_BASE_DEFAULT)
    c.setdefault("image_model", "gpt-image-1")
    c.setdefault("image_quality", "medium")
    c.setdefault("character", "丸い耳の小さな動物(特定の動物キャラに似せないオリジナル)")
    return c


def natural_key(p):
    import re
    return [int(x) if x.isdigit() else x.lower() for x in re.split(r"(\d+)", p.name)]


def load_manifest():
    return read_json(MANIFEST)


def load_status(m):
    s = read_json(STATUS) if STATUS.exists() else {}
    for sh in m["sheets"]:
        s.setdefault(sh["id"], {"state": "pending", "attempts": 0})
    return s


def find_sheet(m, sid):
    for sh in m["sheets"]:
        if sh["id"] == sid:
            return sh
    die(f"シート {sid} がありません。status で一覧を確認してください。")


def next_pending(m, s):
    """まだ取り込んでいない(未着手・作り直し)最初の素材。"""
    for sh in m["sheets"]:
        if s[sh["id"]]["state"] in ("pending", "retry"):
            return sh
    return None


def group_title(m, gid):
    for g in m.get("groups", []):
        if g["id"] == gid:
            return g["title"]
    return gid


# ---------- プロンプト ----------

# アプリは画像を、コードで決めた 縦/横 の比(assets.json の aspect)に引き伸ばして描く。
# 比が違うと絵がゆがむので、プロンプトで形を指定し、取り込みでも比をそろえる
def shape_words(aspect):
    """aspect(縦/横)から、ChatGPTに頼む画像の形と、物の形の言い方を返す。"""
    if aspect >= 1.6:
        frame, body = "縦長(1024x1536)", "とても縦長"
    elif aspect >= 1.15:
        frame, body = "縦長(1024x1536)", "やや縦長"
    elif aspect > 0.87:
        frame, body = "正方形(1024x1024)", "ほぼ正方形"
    elif aspect > 0.5:
        frame, body = "横長(1536x1024)", "やや横長"
    else:
        frame, body = "横長(1536x1024)", "とても横長"
    if aspect >= 1:
        ratio = f"横1に対して縦{aspect:g}"
    else:
        ratio = f"縦1に対して横{1 / aspect:.1f}".replace(".0", "")
    return frame, f"物の形は{body}({ratio}くらい)にする。"


# API で作るときは、会話の記憶が無いので、採用した赤い車の画像を毎回添付する。
# 添付した画像をそのまま描き直されないよう、「見本」であることをはっきり書く
API_ANCHOR = ("添付した赤い車の画像は絵柄の見本。塗り方・丸み・色の明るさ・やわらかさを見本にそろえる。"
              "見本の車そのものは描かず、下に書いた物だけを新しく1つ描く。")
API_ANCHOR_CAR = "添付した赤い車の画像を元に描く。"   # 車の色違いとアイコンは車そのものを使う
API_REFS_NOTE = "2枚目以降に添付した画像は、デザインをそろえる相手。"


def build_prompt(m, sh, c, api=False):
    def fill(t):
        return t.replace("{character}", c["character"])

    parts = []
    if sh["type"] != "reference":
        if not api:
            parts.append(m["anchor"])
        elif sh["group"] in ("cars", "icon"):
            parts.append(API_ANCHOR_CAR)
        else:
            parts.append(API_ANCHOR)
        if api and sh.get("refs"):
            parts.append(API_REFS_NOTE)
    parts.append(fill(sh["prompt"]))
    n = len(sh["items"])
    aspect = sh["items"][0].get("aspect", 1.0)
    frame, body = shape_words(aspect)
    if n == 1:
        if sh["type"] != "icon":
            parts.append("物体をひとつだけ画像の中央に大きく配置し、周囲に十分な余白をとる。")
            parts.append(body)
    else:
        rows = "、".join(f"{i + 1}行目に{k}個" for i, k in enumerate(sh["layout"]))
        parts.append(
            f"次の{n}個を、{rows}並べる。物体どうし、画像の端とは十分な間隔をあけ、"
            "重ねたり接したりしない。左上から右へ、次の行へ、の順に:"
        )
        parts += [f"{i + 1}. {fill(it['desc'])}" for i, it in enumerate(sh["items"])]
    parts.append(f"画像の形は{'正方形(1024x1024)' if sh['type'] == 'icon' else frame}。")
    parts.append(m["style"])
    parts.append(m["palette"])
    if sh["type"] != "icon":
        parts.append(m["background"])
    return "\n".join(parts)


# ---------- 画像処理 ----------

def cutout(img):
    """背景を透明にしたRGBA配列と処理方法を返す。失敗時は (None, 理由)。"""
    rgba = np.array(img.convert("RGBA"))
    h, w = rgba.shape[:2]
    k = max(4, min(h, w) // 64)
    corners = np.concatenate(
        [rgba[:k, :k], rgba[:k, -k:], rgba[-k:, :k], rgba[-k:, -k:]]
    ).reshape(-1, 4)
    if (corners[:, 3] < 20).mean() > 0.9:
        return rgba, "transparent"
    rgb = corners[:, :3].astype(int)
    is_mag = (rgb[:, 0] > 180) & (rgb[:, 1] < 90) & (rgb[:, 2] > 180)
    if is_mag.mean() > 0.8:
        return key_magenta(rgba), "magenta"
    try:
        from rembg import remove  # 任意
        out = np.array(remove(Image.fromarray(rgba)).convert("RGBA"))
        return out, "rembg"
    except ImportError:
        return None, "opaque"


def key_magenta(rgba):
    """マゼンタ背景を抜き、ふちの色をマゼンタから分離する。"""
    a = rgba.astype(np.float32)
    rgb = a[..., :3]
    # マゼンタらしさ(rとbが高くgが低いほど大きい)
    m = np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1]
    # 確実に物体の内側の画素
    core = ndimage.binary_erosion(m < 20, iterations=2)
    if not core.any():
        core = m < 20
    # 境界の画素ごとに、いちばん近い内側の色を物体の色とみなす
    dist, (iy, ix) = ndimage.distance_transform_edt(~core, return_indices=True)
    fg = rgb[iy, ix]
    diff = fg - MAGENTA
    denom = np.maximum((diff * diff).sum(-1), 1.0)
    # 画素 = α*物体色 + (1-α)*マゼンタ を α について解く
    alpha = np.clip(((rgb - MAGENTA) * diff).sum(-1) / denom, 0.0, 1.0)
    alpha[core] = 1.0
    alpha[dist > 6] = 0.0
    out = np.empty_like(a)
    out[..., :3] = np.where(core[..., None], rgb, fg)
    out[..., 3] = alpha * a[..., 3]
    return out.astype(np.uint8)


def bbox_gap(p, q):
    dx = max(0, max(p["x0"], q["x0"]) - min(p["x1"], q["x1"]))
    dy = max(0, max(p["y0"], q["y0"]) - min(p["y1"], q["y1"]))
    return (dx * dx + dy * dy) ** 0.5


def merge(p, q):
    return {
        "labs": p["labs"] + q["labs"],
        "x0": min(p["x0"], q["x0"]), "x1": max(p["x1"], q["x1"]),
        "y0": min(p["y0"], q["y0"]), "y1": max(p["y1"], q["y1"]),
    }


def trim(crop):
    ys, xs = np.nonzero(crop[..., 3] > 8)
    if len(xs) == 0:
        return crop
    return crop[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def split_items(rgba, layout):
    """物のかたまりを layout(各行の個数)の順に切り出す。"""
    h, w = rgba.shape[:2]
    mask = rgba[..., 3] > 40
    total = int(mask.sum())
    if total == 0:
        return None, "物体が見つかりません", []
    grow = max(2, int(min(h, w) * 0.015))
    labels, n = ndimage.label(ndimage.binary_dilation(mask, iterations=grow))
    sizes = ndimage.sum(mask, labels, range(1, n + 1))
    comps = []
    for i, sz in enumerate(sizes):
        if sz < total * 0.01:
            continue
        ys, xs = np.nonzero(labels == i + 1)
        comps.append({"labs": [i + 1], "x0": xs.min(), "x1": xs.max(), "y0": ys.min(), "y1": ys.max()})

    expected = sum(layout)
    warns = []
    merged = 0
    while len(comps) > expected:
        best = None
        for i in range(len(comps)):
            for j in range(i + 1, len(comps)):
                d = bbox_gap(comps[i], comps[j])
                if best is None or d < best[0]:
                    best = (d, i, j)
        _, i, j = best
        comps[i] = merge(comps[i], comps[j])
        del comps[j]
        merged += 1
    if merged:
        warns.append(f"離れた部品を{merged}回まとめました。プレビューで組み合わせが正しいか確認してください")
    if len(comps) < expected:
        return None, f"物体が{len(comps)}個しか見つかりません(期待 {expected}個)。くっついている可能性があります", warns

    comps.sort(key=lambda c: (c["y0"] + c["y1"]) / 2)
    ordered, idx = [], 0
    for k in layout:
        row = sorted(comps[idx:idx + k], key=lambda c: (c["x0"] + c["x1"]) / 2)
        ordered += row
        idx += k

    crops = []
    for c in ordered:
        sl = (slice(c["y0"], c["y1"] + 1), slice(c["x0"], c["x1"] + 1))
        crop = rgba[sl].copy()
        sel = np.isin(labels[sl], c["labs"])
        crop[..., 3] = np.where(sel, crop[..., 3], 0)
        crops.append(trim(crop))
    return crops, None, warns


def finalize(crop, target, aspect=None, anchor="center"):
    """余白を足して 縦/横 を aspect にそろえ、長辺を target にする。
    アプリは画像をコードで決めた比に引き伸ばして描くので、比を合わせておかないと絵がゆがむ。
    anchor="bottom" の物(地面に立つ物)は下に余白を入れない。アプリが画像の下端を地面に置くため。
    戻り値: (画像, 拡大したか, 物そのものの 縦/横)"""
    h, w = crop.shape[:2]
    own = h / w
    pad = int(max(w, h) * 0.04)
    top, bottom = pad, (0 if anchor == "bottom" else pad)
    cw, ch = w + 2 * pad, h + top + bottom
    if aspect:
        if ch / cw > aspect:
            cw = ch / aspect          # 物のほうが縦長 → 左右に余白を足す
        else:
            ch = cw * aspect          # 物のほうが横長 → 上(と下)に余白を足す
    cw, ch = max(1, round(cw)), max(1, round(ch))
    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    x = (cw - w) // 2
    y = ch - bottom - h if anchor == "bottom" else (ch - h) // 2
    canvas.paste(Image.fromarray(crop, "RGBA"), (x, y))
    s = target / max(cw, ch)
    size = (max(1, round(cw * s)), max(1, round(ch * s)))
    out = canvas.convert("RGBa").resize(size, Image.LANCZOS).convert("RGBA")
    return out, s > 1.6, own


def has_halo(img):
    a = np.array(img)
    edge = (a[..., 3] > 10) & (a[..., 3] < 245)
    if edge.sum() < 50:
        return False
    px = a[edge][:, :3].astype(int)
    pink = (px[:, 0] > 170) & (px[:, 2] > 170) & (px[:, 1] < 110)
    return pink.mean() > 0.05


def save_both(img, rel, c, fmt, **kw):
    bases = [c["repo_dir"]] + ([c["drive_dir"]] if c["drive_dir"] else [])
    for base in bases:
        p = base / rel
        p.parent.mkdir(parents=True, exist_ok=True)
        img.save(p, fmt, **kw)


# ---------- プレビュー ----------

def checker(w, h, sz=16):
    yy, xx = np.mgrid[0:h, 0:w]
    arr = np.full((h, w, 3), 235, np.uint8)
    arr[((yy // sz + xx // sz) % 2) == 0] = 200
    return Image.fromarray(arr, "RGB").convert("RGBA")


def make_preview(pairs, out, per_row=3):
    cell, gap, label = 220, 8, 18
    unit_w, unit_h = cell * 2 + gap, cell + label
    cols = min(per_row, len(pairs))
    rows = (len(pairs) + per_row - 1) // per_row
    W = gap + cols * (unit_w + gap * 2)
    H = gap + rows * (unit_h + gap * 2)
    sheet = Image.new("RGBA", (W, H), (255, 255, 255, 255))
    d = ImageDraw.Draw(sheet)
    for i, (name, img) in enumerate(pairs):
        r, ci = divmod(i, per_row)
        x = gap + ci * (unit_w + gap * 2)
        y = gap + r * (unit_h + gap * 2)
        d.text((x, y), name, fill=(0, 0, 0, 255))
        th = img.copy()
        th.thumbnail((cell - 8, cell - 8), Image.LANCZOS)
        backs = (checker(cell, cell), Image.new("RGBA", (cell, cell), ROAD_GRAY + (255,)))
        for j, bg in enumerate(backs):
            tile = bg.copy()
            tile.alpha_composite(th, ((cell - th.width) // 2, (cell - th.height) // 2))
            sheet.alpha_composite(tile, (x + j * (cell + gap), y + label))
    out.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(out)
    return out


# ---------- コマンド ----------

def cmd_status(_):
    m = load_manifest()
    s = load_status(m)
    done = sum(1 for sh in m["sheets"] if s[sh["id"]]["state"] == "done")
    print(f"進捗: {done} / {len(m['sheets'])} 点完了\n")
    labels = {"pending": "未着手", "review": "確認待ち", "retry": "作り直し", "done": "完了"}
    current = None
    for sh in m["sheets"]:
        if sh["group"] != current:
            current = sh["group"]
            print(f"■ {group_title(m, current)}(グループ {current})")
        st = s[sh["id"]]
        print(f"    [{labels.get(st['state'], st['state'])}] {sh['id']:<18}(取り込み{st['attempts']}回)")
    nxt = next_pending(m, s)
    print("\n次: " + (f"{nxt['id']}({nxt['title']})" if nxt else "なし(全素材を取り込み済み)"))


def cmd_prompt(args):
    c = load_config()
    m = load_manifest()
    sh = find_sheet(m, args.sheet)
    print(f"===== {sh['id']}: {sh['title']} =====")
    print(build_prompt(m, sh, c))
    print("=====")


def inbox_files(c):
    """inbox の画像をファイル名の順(IMG_0012 < IMG_0103 のような自然順)に返す。
    git で取得したファイルは更新日時が当てにならないため、名前で並べる。"""
    inbox = c["inbox_dir"]
    if not inbox.exists():
        die(f"inbox フォルダがありません: {inbox}(git pull を忘れていないか確認)")
    files = [p for p in inbox.iterdir() if p.is_file() and p.suffix.lower() in IMG_EXT]
    if not files:
        die("inbox に画像がありません。GitHubにアップロードしたら git pull してから実行してください。")
    return sorted(files, key=natural_key)


def sheet_for_file(src, m, s):
    """ファイル名が素材ID(例: frog.png)ならその素材。違えば未着手の最初の素材。"""
    ids = {sh["id"]: sh for sh in m["sheets"]}
    return ids.get(src.stem.lower()) or next_pending(m, s)


def archive(src, c, sh):
    """元画像を残す場所を決めて inbox から取り除く。
    基準の車だけはリポジトリに残す(別チャットで添付し直すため)。
    ほかはリポジトリを重くしないよう、ドライブ設定があるときだけ残す。"""
    ts = datetime.datetime.now().strftime("%Y%m%d-%H%M%S")
    raw = None
    if sh["type"] == "reference":
        d = c["src_dir"] / "raw"
        d.mkdir(parents=True, exist_ok=True)
        raw = d / f"{sh['id']}{src.suffix.lower()}"
        shutil.copy2(src, raw)
    elif c["drive_dir"]:
        d = c["drive_dir"] / "raw"
        d.mkdir(parents=True, exist_ok=True)
        raw = d / f"{sh['id']}_{ts}{src.suffix.lower()}"
        shutil.copy2(src, raw)
    src.unlink()
    return raw


def cmd_ingest(args):
    c = load_config()
    m = load_manifest()
    s = load_status(m)
    files = inbox_files(c)
    if args.all:
        for src in files:
            sh = sheet_for_file(src, m, s)
            if sh is None:
                print(f"WARN: 未着手の素材がもうありません。{src.name} は取り込みませんでした")
                break
            process_one(src, sh, c, m, s)
            print()
        return
    if len(files) > 1:
        die(f"inbox に画像が{len(files)}枚あります。1枚にするか、保存順に続けて取り込むなら --all を付けてください。")
    sh = find_sheet(m, args.sheet) if args.sheet else sheet_for_file(files[0], m, s)
    if sh is None:
        print("全素材の取り込みが済んでいます。")
        return
    process_one(files[0], sh, c, m, s)


def process_one(src, sh, c, m, s):
    img = Image.open(src)
    img.load()
    st = s[sh["id"]]
    st["attempts"] += 1
    name = src.name
    raw = archive(src, c, sh)
    st["raw"] = str(raw) if raw else None
    print(f"素材: {sh['id']}({sh['title']}) 取り込み{st['attempts']}回目")
    print(f"元画像: {name} ({img.width}x{img.height})")

    if sh["type"] == "icon":
        rgba = img.convert("RGBA")
        if np.array(rgba)[..., 3].min() < 250:
            print("WARN: アイコンに透明な部分がありました。水色で塗りつぶしています")
        bg = Image.new("RGBA", rgba.size, ICON_BG + (255,))
        flat = Image.alpha_composite(bg, rgba).convert("RGB")
        side = min(flat.size)
        left, top = (flat.width - side) // 2, (flat.height - side) // 2
        flat = flat.crop((left, top, left + side, top + side))
        for size in ICON_SIZES:
            rel = Path("assets/icons") / f"icon-{size}.png"
            save_both(flat.resize((size, size), Image.LANCZOS), rel, c, "PNG")
            print(f"  OK {rel.as_posix()}")
        prev = make_preview([("icon", flat.convert("RGBA"))], c["preview_dir"] / f"{sh['id']}.png")
        st["state"] = "review"
        write_json(STATUS, s)
        print(f"プレビュー: {prev.relative_to(c['repo_dir'])}")
        return

    rgba, method = cutout(img)
    if rgba is None:
        st["state"] = "retry"
        write_json(STATUS, s)
        print("NG: 背景が透明でもマゼンタでもありません。追記「背景が透明でない」で作り直してください。")
        print("    (pip install rembg を入れると、自動の背景除去も試せます)")
        return
    print(f"背景処理: {method}")

    crops, err, warns = split_items(rgba, [len(sh["items"])])
    if err:
        st["state"] = "retry"
        write_json(STATUS, s)
        print(f"NG: {err}")
        print("    追記「余計な物が描かれた」で作り直してください。")
        return

    pairs = []
    for item, crop in zip(sh["items"], crops):
        aspect = item.get("aspect")
        out, upscaled, own = finalize(crop, item["target"], aspect, item.get("anchor", "center"))
        rel = Path("assets/img") / item["dir"] / f"{item['name']}.webp"
        save_both(out, rel, c, "WEBP", quality=c["webp_quality"], method=6)
        pairs.append((item["name"], out))
        print(f"  OK {item['name']:<18} -> {rel.as_posix()} ({out.width}x{out.height})")
        if upscaled:
            warns.append(f"{item['name']} は元が小さく、拡大しています(ぼやける可能性)")
        if aspect and not (1 / ASPECT_TOLERANCE <= own / aspect <= ASPECT_TOLERANCE):
            warns.append(
                f"{item['name']} の形(縦/横 {own:.2f})がアプリの比({aspect:g})と大きく違います。"
                "余白で合わせたので、アプリでは小さめに見えます。気になれば追記「形の比が違う」で作り直し")
        if has_halo(out):
            warns.append(f"{item['name']} のふちにピンクのにじみがあります")
    for w in warns:
        print(f"WARN: {w}")
    prev = make_preview(pairs, c["preview_dir"] / f"{sh['id']}.png")
    st["state"] = "review"
    write_json(STATUS, s)
    print(f"プレビュー: {prev.relative_to(c['repo_dir'])}")


def cmd_approve(args):
    """素材ID、またはグループID(そのグループの確認待ちをまとめて)を完了にする。"""
    c = load_config()
    m = load_manifest()
    s = load_status(m)
    targets = [sh for sh in m["sheets"] if sh["group"] == args.sheet and s[sh["id"]]["state"] == "review"]
    if not targets:
        sh = find_sheet(m, args.sheet)
        if s[sh["id"]]["state"] != "review":
            die(f"{sh['id']} は確認待ちではありません(現在: {s[sh['id']]['state']})。先に ingest してください。")
        targets = [sh]
    for sh in targets:
        st = s[sh["id"]]
        st["state"] = "done"
        if sh["type"] == "reference" and st.get("raw"):
            dirs = [c["src_dir"] / "reference"] + ([c["drive_dir"] / "reference"] if c["drive_dir"] else [])
            for d in dirs:
                d.mkdir(parents=True, exist_ok=True)
                Image.open(st["raw"]).save(d / "style_reference.png")
            print(f"基準画像を保存しました: {(c['src_dir'] / 'reference' / 'style_reference.png').relative_to(c['repo_dir'])}")
        print(f"{sh['id']} を完了にしました。")
    write_json(STATUS, s)
    nxt = next_pending(m, s)
    print("次: " + (f"{nxt['id']}({nxt['title']})" if nxt else "なし(全素材を取り込み済み)"))


def cmd_reset(args):
    m = load_manifest()
    s = load_status(m)
    sh = find_sheet(m, args.sheet)
    s[sh["id"]]["state"] = "pending"
    write_json(STATUS, s)
    print(f"{sh['id']} を未着手に戻しました。")


def expected_files(m):
    for sh in m["sheets"]:
        if sh["type"] == "icon":
            for size in ICON_SIZES:
                yield sh["id"], Path("assets/icons") / f"icon-{size}.png"
        else:
            for it in sh["items"]:
                yield sh["id"], Path("assets/img") / it["dir"] / f"{it['name']}.webp"


def cmd_check(_):
    c = load_config()
    m = load_manifest()
    missing = [(sid, rel) for sid, rel in expected_files(m) if not (c["repo_dir"] / rel).exists()]
    total = sum(1 for _ in expected_files(m))
    print(f"素材: {total - len(missing)} / {total}")
    for sid, rel in missing:
        print(f"  不足: {rel.as_posix()}(シート {sid})")
    if not missing:
        print("すべて揃っています。")


def cmd_preview_all(args):
    c = load_config()
    m = load_manifest()
    keep = {sh["id"] for sh in m["sheets"] if not args.group or sh["group"] == args.group}
    pairs = []
    for sid, rel in expected_files(m):
        if sid not in keep:
            continue
        p = c["repo_dir"] / rel
        if p.exists() and p.suffix == ".webp":
            pairs.append((p.stem, Image.open(p).convert("RGBA")))
    if not pairs:
        die("まだ素材がありません。")
    name = f"group_{args.group}.png" if args.group else "all.png"
    out = make_preview(pairs, c["preview_dir"] / name, per_row=4)
    print(f"一覧: {out.relative_to(c['repo_dir'])}({len(pairs)}点)")


# ---------- 自動生成(OpenAI の画像API) ----------
# APIキーは環境変数 OPENAI_API_KEY からだけ読む。ファイルにもログにも書かない。
# リポジトリは公開なので、キーをリポジトリやチャットに置かないこと(SKILL.md)

API_BASE_DEFAULT = "https://api.openai.com/v1"
API_RETRY = 3                  # 混雑(429)やサーバーの不調(5xx)のときに試し直す回数
API_TIMEOUT = 300              # 1枚の生成を待つ秒数


def api_size(aspect, icon=False):
    """shape_words と同じしきい値で、APIに頼む画像の大きさを決める。"""
    if icon:
        return "1024x1024"
    if aspect >= 1.15:
        return "1024x1536"
    if aspect > 0.87:
        return "1024x1024"
    return "1536x1024"


def multipart(fields, files):
    """multipart/form-data を組み立てる(標準ライブラリだけで送るため)。"""
    import uuid
    boundary = uuid.uuid4().hex
    out = []
    for k, v in fields.items():
        out.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode())
    for k, (fname, data) in files:
        out.append(
            f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"; filename="{fname}"\r\n'
            "Content-Type: image/png\r\n\r\n".encode() + data + b"\r\n")
    out.append(f"--{boundary}--\r\n".encode())
    return b"".join(out), f"multipart/form-data; boundary={boundary}"


def png_bytes(path):
    """見本画像をPNGのバイト列にする(WebPの素材もPNGにして送る)。"""
    import io
    buf = io.BytesIO()
    Image.open(path).convert("RGBA").save(buf, "PNG")
    return buf.getvalue()


def api_request(c, path, body, ctype):
    """APIに送り、JSONを返す。失敗したら (None, 理由)。キーは表示しない。"""
    import os
    import ssl
    import time
    import urllib.error
    import urllib.request
    key = os.environ.get("OPENAI_API_KEY")
    if not key:
        return None, "環境変数 OPENAI_API_KEY がありません(クラウド環境の設定で登録し、新しいセッションで開き直す)"
    url = c["api_base"].rstrip("/") + path
    cafile = os.environ.get("SSL_CERT_FILE") or os.environ.get("REQUESTS_CA_BUNDLE")
    ctx = ssl.create_default_context(cafile=cafile) if url.startswith("https") else None
    for attempt in range(API_RETRY + 1):
        req = urllib.request.Request(url, data=body, method="POST", headers={
            "Authorization": f"Bearer {key}", "Content-Type": ctype})
        try:
            with urllib.request.urlopen(req, timeout=API_TIMEOUT, context=ctx) as res:
                return json.loads(res.read()), None
        except urllib.error.HTTPError as e:
            try:
                msg = json.loads(e.read()).get("error", {}).get("message", "")
            except Exception:
                msg = ""
            if (e.code == 429 or e.code >= 500) and attempt < API_RETRY:
                wait = 5 * (2 ** attempt)
                print(f"  API {e.code}。{wait}秒待って試し直します")
                time.sleep(wait)
                continue
            return None, f"API {e.code}: {msg}"
        except urllib.error.URLError as e:
            return None, (f"APIにつながりません({e.reason})。"
                          "クラウド環境のネットワーク設定で api.openai.com を許可してください")
    return None, "試し直しても失敗しました"


def generate_one(sh, c, m, s, note=None, dry=False):
    """1点をAPIで作り、inbox に置いてから、手作業のときと同じ取り込みにかける。"""
    import base64
    import time
    aspect = sh["items"][0].get("aspect", 1.0)
    prompt = build_prompt(m, sh, c, api=True)
    if note:
        prompt += "\n" + note
    fields = {
        "model": c["image_model"],
        "prompt": prompt,
        "size": api_size(aspect, sh["type"] == "icon"),
        "quality": c["image_quality"],
        "background": "opaque" if sh["type"] == "icon" else "transparent",
    }
    refs = []
    if sh["type"] != "reference":
        ref = c["src_dir"] / "reference" / "style_reference.png"
        if not ref.exists():
            return "基準の車(ref_car)がまだ採用されていません。先に ref_car を作って approve してください"
        refs.append(("style_reference.png", ref))
        for name in sh.get("refs", []):
            it = next(i for x in m["sheets"] for i in x["items"] if i["name"] == name)
            p = c["repo_dir"] / "assets" / "img" / it["dir"] / f"{name}.webp"
            if not p.exists():
                return f"デザインをそろえる相手 {name} がまだありません。先に作ってください"
            refs.append((f"{name}.png", p))

    print(f"生成: {sh['id']}({sh['title']}) {fields['size']} 品質={fields['quality']}"
          + (f" 見本={', '.join(n for n, _ in refs)}" if refs else ""))
    if dry:
        print(prompt)
        return None
    t0 = time.time()
    if refs:
        body, ctype = multipart(fields, [("image[]", (n, png_bytes(p))) for n, p in refs])
        res, err = api_request(c, "/images/edits", body, ctype)
    else:
        res, err = api_request(c, "/images/generations", json.dumps(fields).encode(), "application/json")
    if err:
        return err
    try:
        data = base64.b64decode(res["data"][0]["b64_json"])
    except (KeyError, IndexError, TypeError):
        return "APIの返事に画像が入っていませんでした"
    c["inbox_dir"].mkdir(parents=True, exist_ok=True)
    src = c["inbox_dir"] / f"{sh['id']}.png"
    src.write_bytes(data)
    print(f"  {time.time() - t0:.0f}秒でできました")
    process_one(src, sh, c, m, s)
    return None


def cmd_generate(args):
    """APIで素材を作って取り込む。1点、グループ、または未着手の全部。"""
    c = load_config()
    m = load_manifest()
    s = load_status(m)
    if args.sheet:
        targets = [find_sheet(m, args.sheet)]
        st = s[targets[0]["id"]]["state"]
        if st in ("review", "done") and not args.force:
            die(f"{args.sheet} はもう取り込み済みです(状態: {st})。作り直すなら --force を付けてください")
    else:
        if not args.group and not args.all:
            die("素材ID、--group <グループID>、--all のどれかを指定してください")
        if s["ref_car"]["state"] != "done" and not args.dry_run:
            die("先に基準の車(ref_car)を作り、ユーザーに確かめてもらってから approve してください")
        targets = [sh for sh in m["sheets"]
                   if s[sh["id"]]["state"] in ("pending", "retry")
                   and (args.all or sh["group"] == args.group)]
        if args.limit:
            targets = targets[:args.limit]
    if not targets:
        print("作る素材がありません。")
        return
    print(f"{len(targets)} 点を作ります(モデル {c['image_model']})\n")
    failed = []
    for sh in targets:
        err = generate_one(sh, c, m, s, note=args.note, dry=args.dry_run)
        if err:
            print(f"NG: {sh['id']}: {err}")
            failed.append(sh["id"])
            # キーやネットワークの問題なら、残りを続けても同じなので止める
            if "OPENAI_API_KEY" in err or "つながりません" in err or "API 401" in err or "API 403" in err:
                break
        print()
    done = len(targets) - len(failed)
    print(f"できた: {done} 点 / うまくいかなかった: {len(failed)} 点"
          + (f"({', '.join(failed)})" if failed else ""))


# ---------- アプリのコードとの照合 ----------

# コードが正方形(幅=高さ)で描く素材。比の書き方がほかと違うので、ここに書いておく
#   自車: player.js drawCar が size×size で描く / おやすみ: ending.js が size×size で描く
CODE_SQUARE = {"car_red", "car_blue", "car_yellow", "car_white", "goodnight"}


def code_catalog(repo):
    """js/assets.js の CATALOG から 素材名 -> 保存先フォルダ を読む。"""
    import re
    src = (repo / "js" / "assets.js").read_text(encoding="utf-8")
    return dict(re.findall(r"^\s*(\w+): \{ dir: '(\w+)'", src, re.M))


def code_aspects(repo):
    """js/ の中から、素材ごとの 縦/横 の比を集める。同じ素材に違う比があれば全部返す。"""
    import re
    found = {}

    def add(name, val, where):
        found.setdefault(name, set()).add((round(float(val), 4), where))

    for js in sorted((repo / "js").glob("*.js")):
        src = js.read_text(encoding="utf-8")
        # scenery.js: tree_round: { size: 0.55, aspect: 1.15 } / cloud: { width: 0.16, aspect: 0.42 }
        for name, val in re.findall(r"^\s*(\w+): \{ (?:size|width): [\d.]+, aspect: ([\d.]+) \}", src, re.M):
            add(name, val, js.name)
        # obstacles.js / crossing.js / animals.js: { name: 'frog', size: 0.10, aspect: 0.95 }
        for name, val in re.findall(r"\{ name: '(\w+)'[^}]*?aspect: ([\d.]+)", src):
            add(name, val, js.name)
        # crossing.js: const TRAIN = { ..., aspect: 0.42 } / ending.js: const GARAGE = { ..., aspect: 0.55 }
        for const, name in (("TRAIN", "train"), ("GARAGE", "garage")):
            mm = re.search(rf"const {const} = \{{[^}}]*aspect: ([\d.]+)", src)
            if mm:
                add(name, mm.group(1), js.name)
    for name in CODE_SQUARE:
        add(name, 1.0, "正方形で描く")
    return found


def cmd_sync_check(_):
    """assets.json とアプリのコード(js/)が合っているか確かめる。
    素材の名前・保存先・縦横の比がずれていたら知らせる。コードを変えたあとに必ず実行する。"""
    c = load_config()
    m = load_manifest()
    repo = c["repo_dir"]
    catalog = code_catalog(repo)
    aspects = code_aspects(repo)
    items = {it["name"]: it for sh in m["sheets"] if sh["type"] != "icon" for it in sh["items"]}
    problems = []

    for name, d in sorted(catalog.items()):
        if name not in items:
            problems.append(f"コードにあるのに assets.json に無い: {name}(assets/img/{d}/)")
        elif items[name]["dir"] != d:
            problems.append(f"保存先が違う: {name} コード={d} / assets.json={items[name]['dir']}")
    for name in sorted(items):
        if name not in catalog:
            problems.append(f"assets.json にあるのにコード(assets.js の CATALOG)に無い: {name}")

    for name, it in sorted(items.items()):
        vals = aspects.get(name)
        if not vals:
            problems.append(f"コードの中に {name} の縦横比が見つからない")
            continue
        nums = {v for v, _ in vals}
        if len(nums) > 1:
            where = "、".join(f"{w}={v:g}" for v, w in sorted(vals, key=lambda x: x[1]))
            problems.append(f"コードの中で {name} の縦横比が場所によって違う: {where}")
        code = next(iter(nums)) if len(nums) == 1 else None
        if code is not None and abs(code - it.get("aspect", 0)) > 1e-3:
            problems.append(f"縦横比が違う: {name} コード={code:g} / assets.json={it.get('aspect')}")

    print(f"コードの素材 {len(catalog)} 点 / assets.json の素材 {len(items)} 点(アイコン除く)")
    if problems:
        for p in problems:
            print(f"  NG {p}")
        print("assets.json を直してから素材づくりを進めてください。")
        sys.exit(1)
    print("すべて合っています。")


def refuse_key_in_files():
    """リポジトリは公開なので、キーをファイルに書かせない。環境変数 OPENAI_API_KEY だけを使う。
    どのコマンドでも最初に確かめる。"""
    if CONFIG.exists() and "sk-" in CONFIG.read_text(encoding="utf-8"):
        die("config.json にAPIキーのような値があります。すぐ消してください(コミットしないこと)。"
            "キーはクラウド環境の設定の環境変数 OPENAI_API_KEY にだけ置きます。")


def main():
    ap = argparse.ArgumentParser(description="GPT素材生成ループ")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("status").set_defaults(fn=cmd_status)
    p = sub.add_parser("prompt"); p.add_argument("sheet"); p.set_defaults(fn=cmd_prompt)
    p = sub.add_parser("ingest"); p.add_argument("--sheet"); p.add_argument("--all", action="store_true")
    p.set_defaults(fn=cmd_ingest)
    p = sub.add_parser("approve"); p.add_argument("sheet"); p.set_defaults(fn=cmd_approve)
    p = sub.add_parser("reset"); p.add_argument("sheet"); p.set_defaults(fn=cmd_reset)
    sub.add_parser("check").set_defaults(fn=cmd_check)
    p = sub.add_parser("preview-all"); p.add_argument("--group"); p.set_defaults(fn=cmd_preview_all)
    sub.add_parser("sync-check").set_defaults(fn=cmd_sync_check)
    p = sub.add_parser("generate")
    p.add_argument("sheet", nargs="?")
    p.add_argument("--group")
    p.add_argument("--all", action="store_true")
    p.add_argument("--limit", type=int)
    p.add_argument("--note", help="プロンプトの最後に足す文(作り直し用の追記)")
    p.add_argument("--force", action="store_true", help="取り込み済みの素材を作り直す")
    p.add_argument("--dry-run", action="store_true", help="送らずに、送る内容だけ表示する")
    p.set_defaults(fn=cmd_generate)
    args = ap.parse_args()
    refuse_key_in_files()
    args.fn(args)


if __name__ == "__main__":
    main()
