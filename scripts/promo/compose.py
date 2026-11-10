#!/usr/bin/env python3
"""Монтаж промо-ролика README из снимков capture.mjs.

    python scripts/promo/compose.py ПАПКА [--out docs/assets/web-prototype-pool-demo.webp] [--keys]

Холст 1600 × 940 на фоне GitHub Dark, окно прототипа 1520 × 855 в центре.
Камера плавно подъезжает к кнопке перед кликом, клик показан кольцом в центре
измеренной кнопки, состояния сменяются коротким наплывом. Курсора нет.
Последний кадр совпадает с первым — петля бесшовная. Нужны Pillow и imageio-ffmpeg.
"""
import argparse
import json
import math
import multiprocessing
import os
import subprocess
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

FPS = 60
OUT_W, OUT_H = 1600, 940
VW, VH = 1920, 1080                 # окно прототипа в css px
WIDE = (VW / 2, VH / 2, 1520 / VW)  # общий план: центр и масштаб (px холста на css px)
K = 1.25                            # pt → px, как у Agent Pulse (1280 pt → 1600 px)
FADE = .22                          # наплыв между состояниями
DURATION = 31.0

# Время клика по каждому шагу capture.mjs (шаг home — исходное состояние).
CLICKS = {
    'workers': 2.4, 'fin-open': 6.4, 'income': 7.2, 'home-back': 10.6, 'fin-close': 11.4,
    'panel': 14.0, 'critical': 15.6, 'empty': 17.2, 'style': 18.8, 'accent': 20.4,
    'radius': 21.8, 'reset-style': 23.6, 'reset': 25.4, 'closed': 27.0,
}

# Камера: (время начала хода, центр x, центр y, масштаб). Ход длится CAM_MOVE.
CAM_MOVE = .9
CAMERA = [
    (0.0, *WIDE),
    (1.3, 520, 330, 1.12),         # к сайдбару
    (3.2, *WIDE),                  # таблица воркеров целиком
    (5.3, 520, 330, 1.12),         # снова сайдбар: Финансы → Доход
    (8.0, *WIDE),                  # Доход целиком
    (9.6, 520, 330, 1.12),         # Главная, свернуть Финансы
    (12.0, *WIDE),
    (13.0, 1500, 800, 1.25),       # кнопка «Сценарии»
    (14.4, 1300, 540, 1.0),        # панель и Главная за ней
    (19.3, 1650, 640, 1.35),       # акцент и скругления
    (22.6, 1650, 260, 1.35),       # «Вернуть» под шапкой
    (24.4, 1650, 830, 1.35),       # «Сбросить» в подвале
    (26.1, 1650, 330, 1.35),       # закрыть панель
    (27.8, *WIDE),
]

# ---------- кривые (как у Agent Pulse) ----------

def cubic_in_out(t):
    t = min(max(t, 0.0), 1.0)
    return 4 * t * t * t if t < .5 else 1 - (-2 * t + 2) ** 3 / 2


def cubic_out(t):
    t = min(max(t, 0.0), 1.0)
    return 1 - (1 - t) ** 3


def camera_progress(elapsed, duration=CAM_MOVE):
    """Камера V4: основной ход, лёгкий перелёт, покой к концу хода."""
    if elapsed <= 0:
        return 0.0
    if elapsed >= duration:
        return 1.0
    t = elapsed / duration * .75
    value = 1 - math.exp(-11 * t) * (math.cos(8 * t) + (11 / 8) * math.sin(8 * t))
    blend = cubic_in_out((t - .60) / .15)
    return value * (1 - blend) + blend


def tap_state(rel):
    """Кольцо касания V4: радиус / максимум, прозрачность, отверстие / радиус."""
    hole = .58
    if rel < -.37 or rel > .28:
        return 0.0, 0.0, hole
    if rel < -.17:
        p = (rel + .37) / .20
        return .45 + .55 * cubic_out(p), cubic_in_out(p / .6), hole
    if rel < 0:
        p = (rel + .17) / .17
        return 1 - .5 * cubic_in_out(p), 1.0, hole
    p = rel / .28
    return .5 + .24 * cubic_out(p), 1 - cubic_in_out(p), hole + .2 * cubic_in_out(p)

# ---------- камера ----------

def clamp_view(cx, cy, s):
    """При приближении кадр не выходит за окно прототипа."""
    if s > WIDE[2]:
        hw, hh = OUT_W / 2 / s, OUT_H / 2 / s
        cx = min(max(cx, hw), VW - hw) if hw < VW / 2 else VW / 2
        cy = min(max(cy, hh), VH - hh) if hh < VH / 2 else VH / 2
    return cx, cy, s


def camera_at(t):
    cur = clamp_view(*CAMERA[0][1:])
    for start, *view in CAMERA[1:]:
        if t < start:
            break
        p = camera_progress(t - start)
        nxt = clamp_view(*view)
        # Масштаб интерполируем в логарифме — подъезд выглядит равномерным.
        s = math.exp(math.log(cur[2]) + (math.log(nxt[2]) - math.log(cur[2])) * p)
        cur = (cur[0] + (nxt[0] - cur[0]) * p, cur[1] + (nxt[1] - cur[1]) * p, s)
    return cur

# ---------- отрисовка ----------

def rounded_mask(size, radius, sup=3):
    mask = Image.new("L", (size[0] * sup, size[1] * sup), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0] * sup - 1, size[1] * sup - 1), radius=radius * sup, fill=255)
    return mask.resize(size, Image.LANCZOS)


class Shots:
    def __init__(self, folder):
        meta = json.loads((folder / "steps.json").read_text())
        self.scale = meta["scale"]
        self.steps = meta["steps"]
        self.images = [Image.open(folder / s["file"]).convert("RGB") for s in self.steps]
        # Финал должен совпасть с началом: допускаем только сглаживание графика.
        diff = ImageChops.difference(self.images[0], self.images[-1]).convert("L")
        changed = sum(1 for v in diff.getdata() if v > 8)
        if changed > 2000:  # сглаживание текста и графика, не смена состояния
            raise RuntimeError(f"Последнее состояние не совпадает с первым: {changed} px")
        self.images[-1] = self.images[0]
        self.clicks = []
        for i, s in enumerate(self.steps[1:], 1):
            if s["name"] not in CLICKS:
                raise RuntimeError(f"Нет времени клика для шага {s['name']}")
            self.clicks.append((CLICKS[s["name"]], i, s["target"]))
        self.clicks.sort()
        self.cache = {}

    def state_at(self, t):
        """(индекс прежнего состояния, индекс нового, доля наплыва)."""
        prev, cur, mix = 0, 0, 1.0
        for tc, i, _ in self.clicks:
            start = tc + .08
            if t < start:
                break
            prev, cur = cur, i
            mix = cubic_in_out((t - start) / FADE)
        return prev, cur, mix

    def view(self, index, cam):
        key = (index, cam)
        if key in self.cache:
            return self.cache[key]
        cx, cy, s = cam
        x0, y0 = OUT_W / 2 - cx * s, OUT_H / 2 - cy * s          # левый верх окна на холсте
        x1, y1 = x0 + VW * s, y0 + VH * s
        bx0, by0 = max(0, math.floor(x0)), max(0, math.floor(y0))
        bx1, by1 = min(OUT_W, math.ceil(x1)), min(OUT_H, math.ceil(y1))
        k = self.scale / s
        sw, sh = self.images[index].size
        box = (max(0, (bx0 - x0) * k), max(0, (by0 - y0) * k), min(sw, (bx1 - x0) * k), min(sh, (by1 - y0) * k))
        img = self.images[index].resize((bx1 - bx0, by1 - by0), Image.LANCZOS, box=box, reducing_gap=2.0)
        if len(self.cache) > 12:
            self.cache.clear()
        self.cache[key] = (img, (bx0, by0), (x0, y0, x1, y1))
        return self.cache[key]


def draw_ring(img, x, y, rel, radius):
    radius_share, alpha, hole = tap_state(rel)
    if alpha <= 0.01:
        return
    r = radius * radius_share
    pad = int(r + 12)
    box = (int(x - pad), int(y - pad), int(x + pad), int(y + pad))
    sample = img.crop(box).filter(ImageFilter.GaussianBlur(max(2, r * .16)))
    light = sample.convert("L").resize((1, 1), Image.BOX).getpixel((0, 0)) > 170
    tint = Image.new("RGBA", sample.size, (120, 126, 140, 255) if light else (234, 241, 250, 255))
    glass = Image.blend(sample, tint, .45 if light else .28)
    sup = 4
    mask = Image.new("L", (sample.size[0] * sup, sample.size[1] * sup), 0)
    d = ImageDraw.Draw(mask)
    ox, oy = (x - box[0]) * sup, (y - box[1]) * sup
    d.ellipse((ox - r * sup, oy - r * sup, ox + r * sup, oy + r * sup), fill=int(235 * alpha))
    ri = r * hole
    d.ellipse((ox - ri * sup, oy - ri * sup, ox + ri * sup, oy + ri * sup), fill=0)
    mask = mask.resize(sample.size, Image.LANCZOS)
    shadow = Image.new("RGBA", sample.size, (0, 0, 0, 0))
    shadow.putalpha(mask.filter(ImageFilter.GaussianBlur(r * .12 + 2)).point(lambda v: int(v * .3)))
    img.alpha_composite(shadow, (box[0], box[1] + max(1, int(r * .05))))
    glass.putalpha(mask)
    img.alpha_composite(glass, (box[0], box[1]))


def window_layer(rect, s):
    """Маска скруглённого окна и его тонкая обводка в координатах холста."""
    x0, y0, x1, y1 = rect
    sup = 2
    radius = 12 * s * sup
    mask = Image.new("L", (OUT_W * sup, OUT_H * sup), 0)
    edge = Image.new("L", (OUT_W * sup, OUT_H * sup), 0)
    r = (x0 * sup, y0 * sup, x1 * sup - 1, y1 * sup - 1)
    ImageDraw.Draw(mask).rounded_rectangle(r, radius=radius, fill=255)
    ImageDraw.Draw(edge).rounded_rectangle(r, radius=radius, outline=255, width=2)
    return mask.reduce(sup), edge.reduce(sup)


def render(shots, t, layers):
    cam = tuple(round(v, 4) for v in camera_at(t))
    prev, cur, mix = shots.state_at(t)
    img, pos, rect = shots.view(cur, cam)
    if mix < 1:
        old, _, _ = shots.view(prev, cam)
        img = Image.blend(old, img, mix)
    frame = Image.new("RGBA", (OUT_W, OUT_H), "#0d1117")
    if cam not in layers:
        if len(layers) > 8:
            layers.clear()
        layers[cam] = window_layer(rect, cam[2])
    mask, edge = layers[cam]
    content = Image.new("RGBA", (OUT_W, OUT_H), (0, 0, 0, 0))
    content.paste(img, pos)
    content.putalpha(ImageChops.multiply(content.getchannel("A"), mask))
    frame.alpha_composite(content)
    border = Image.new("RGBA", (OUT_W, OUT_H), "#3d444d")
    border.putalpha(edge)
    frame.alpha_composite(border)
    cx, cy, s = cam
    for tc, _, target in shots.clicks:
        if -.4 < t - tc < .3:
            x, y = OUT_W / 2 + (target["x"] - cx) * s, OUT_H / 2 + (target["y"] - cy) * s
            draw_ring(frame, x, y, t - tc, 22 * s)
    return frame


WORK = None
_LAYERS = {}


def frame_file(i):
    """Рисует кадр i в ПАПКА/frames/NNNNN.png; уже готовые кадры пропускает."""
    shots, outer, outer_mask, frames_dir, keys, frames = WORK
    path = frames_dir / f"{i:05d}.png"
    if path.exists() and not keys:
        return i
    t = i / FPS
    frame = render(shots, t, _LAYERS)
    frame.putalpha(ImageChops.multiply(frame.getchannel("A"), outer_mask))
    frame.alpha_composite(outer)
    frame.save(path, compress_level=1)
    if keys and (i % (FPS // 2) == 0 or i == frames - 1):
        frame.save(keys / f"key-{t:05.2f}.png")
    return i


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--out", default=str(Path(__file__).resolve().parents[2] / "docs/assets/web-prototype-pool-demo.webp"))
    ap.add_argument("--quality", type=int, default=80)
    ap.add_argument("--keys", action="store_true", help="сохранить контрольные кадры каждые 0,5 с")
    ap.add_argument("--jobs", type=int, default=max(1, (os.cpu_count() or 2) // 2))
    args = ap.parse_args()
    folder = Path(args.folder)
    shots = Shots(folder)
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    # Внешняя рамка как у Agent Pulse: радиус 20 pt, обводка #3d444d, прозрачные углы.
    sup = 3
    outer = Image.new("RGBA", (OUT_W * sup, OUT_H * sup))
    ImageDraw.Draw(outer).rounded_rectangle((sup / 2, sup / 2, OUT_W * sup - sup / 2, OUT_H * sup - sup / 2),
        radius=20 * K * sup, outline="#3d444d", width=round(K * sup))
    outer = outer.resize((OUT_W, OUT_H), Image.LANCZOS)
    outer_mask = rounded_mask((OUT_W, OUT_H), 20 * K)
    keys = folder / "keys"
    if args.keys:
        keys.mkdir(exist_ok=True)
    frames_dir = folder / "frames"
    frames_dir.mkdir(exist_ok=True)
    frames = int(round(DURATION * FPS))
    # Кадры независимы: рисуем их параллельно на диск, кодируем отдельным шагом.
    global WORK
    WORK = (shots, outer, outer_mask, frames_dir, keys if args.keys else None, frames)
    with multiprocessing.get_context("fork").Pool(args.jobs) as pool:
        for n, _ in enumerate(pool.imap_unordered(frame_file, range(frames), chunksize=8), 1):
            if n % (FPS * 5) == 0:
                print(f"Монтаж: {n}/{frames} кадров", flush=True)
    import imageio_ffmpeg
    subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-y", "-v", "error", "-framerate", str(FPS),
        "-i", str(frames_dir / "%05d.png"), "-c:v", "libwebp_anim", "-quality", str(args.quality),
        "-compression_level", "6", "-loop", "0", str(out)], check=True)
    same = Image.open(frames_dir / "00000.png").tobytes() == Image.open(frames_dir / f"{frames - 1:05d}.png").tobytes()
    print(f"Стык петли: {'первый и последний кадры совпадают' if same else 'кадры РАЗЛИЧАЮТСЯ'}")
    print(f"{out}: {out.stat().st_size / 1e6:.1f} МБ, {DURATION:.1f} с, {FPS} кадров/с")


if __name__ == "__main__":
    main()
