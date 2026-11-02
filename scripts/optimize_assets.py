"""Build the web-ready KITA artwork from the approved source images.

Reads the original PNGs in assets/source/ (never modified) and writes WebP copies at
480px and 960px wide into frontend/public/assets/kita/ (spec v1.2, section 16).

The brand heart gets extra treatment:
  * brand-heart-*.webp       cropped around the emblem, flat background made transparent
  * brand-heart-dark-*.webp  same, with the graphite ribbon lifted to ivory for dark mode
  * icons/*.png              home-screen app icons and the notification badge (PWA manifest)

Usage (from the repo root):
    pip install pillow
    python scripts/optimize_assets.py
"""
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "source")
OUT = os.path.join(ROOT, "frontend", "public", "assets", "kita")
ICONS = os.path.join(ROOT, "frontend", "public", "icons")
ICON_BG = (250, 249, 246)           # the app's light background, --bg
WIDTHS = (480, 960)

# Source filename -> output base name.
ARTWORK = {
    "Ivory Botanical Embossed Border.png": "botanical-border",
    "Intertwined Blush and Sage Ribbons.png": "journey-ribbons",
    "Minimal Ivory Stationery with Blossoms.png": "documents-stationery",
    "Elegant Botanical Envelope Stack.png": "guests-envelopes",
    "Elegant Cream Calendar Still Life.png": "calendar-editorial",
    "Ivory Heart Ceramic Money Jar.png": "budget-jar",
    "Minimalist Papers with Pencil and Eucalyptus.png": "checklist-papers",
    "Minimal Clay Calendar with Blossoms and Heart.png": "calendar-icon-illustration",
    "Elegant Ivory Wedding Invitation Still Life.png": "perkahwinan-cover",
    "Elegant Ivory Ring Box Still Life.png": "tunang-cover",
    "Elegant Ivory Cards with Gold Ring and Blossoms.png": "notes-cards",
}
HEART_SOURCE = "Interlocking Rose and Graphite Heartibbons.png"
HEART_BG = (248, 247, 245)          # flat background colour sampled from the source
HEART_CROP = (626, 638, 400)        # centre x, centre y, half size of the square crop
DARK_RIBBON = (236, 231, 225)       # ivory used for the graphite ribbon in dark mode


def save_variants(im, name, quality=82):
    """Write 480w and 960w WebP copies, never upscaling past the source width."""
    for w in WIDTHS:
        w2 = min(w, im.width)
        h2 = round(im.height * w2 / im.width)
        path = os.path.join(OUT, f"{name}-{w}.webp")
        im.resize((w2, h2), Image.LANCZOS).save(path, "WEBP", quality=quality, method=6)
        print(f"  {name}-{w}.webp  {w2}x{h2}  {os.path.getsize(path) // 1024} KB")


def transparent_heart(im):
    """Crop to the emblem and fade the flat background to transparent."""
    cx, cy, half = HEART_CROP
    im = im.convert("RGB").crop((cx - half, cy - half, cx + half, cy + half))
    out = Image.new("RGBA", im.size)
    src, dst = im.load(), out.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b = src[x, y]
            d = max(abs(r - HEART_BG[0]), abs(g - HEART_BG[1]), abs(b - HEART_BG[2]))
            dst[x, y] = (r, g, b, 0 if d <= 6 else min(255, (d - 6) * 255 // 24))
    return out


def dark_heart(im):
    """Lift low-chroma dark pixels (the graphite ribbon) to ivory; keep the rose ribbon."""
    im = im.copy()
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a and max(r, g, b) - min(r, g, b) < 22 and (r + g + b) / 3 < 200:
                px[x, y] = (*DARK_RIBBON, a)
    return im


def app_icons(heart):
    """Home-screen icons on ivory, a padded maskable one, and a white badge for Android's status bar."""
    os.makedirs(ICONS, exist_ok=True)

    def on_ivory(size, scale):
        canvas = Image.new("RGBA", (size, size), (*ICON_BG, 255))
        h = round(size * scale)
        mark = heart.resize((h, h), Image.LANCZOS)
        canvas.alpha_composite(mark, ((size - h) // 2, (size - h) // 2))
        return canvas.convert("RGB")

    outputs = {
        "icon-192.png": on_ivory(192, 0.86),
        "icon-512.png": on_ivory(512, 0.86),
        # Maskable icons may be cropped to a circle; keep the emblem inside the central safe zone.
        "icon-maskable-512.png": on_ivory(512, 0.62),
    }
    alpha = heart.getchannel("A").resize((96, 96), Image.LANCZOS)
    badge = Image.new("RGBA", (96, 96), (255, 255, 255, 0))
    badge.putalpha(alpha)
    outputs["badge-96.png"] = badge
    for name, im in outputs.items():
        path = os.path.join(ICONS, name)
        im.save(path, "PNG", optimize=True)
        print(f"  icons/{name}  {im.width}x{im.height}  {os.path.getsize(path) // 1024} KB")


def main():
    os.makedirs(OUT, exist_ok=True)
    missing = [f for f in [*ARTWORK, HEART_SOURCE] if not os.path.exists(os.path.join(SRC, f))]
    if missing:
        sys.exit("Missing source images in assets/source/:\n  " + "\n  ".join(missing))

    for src_name, name in ARTWORK.items():
        save_variants(Image.open(os.path.join(SRC, src_name)).convert("RGB"), name)

    heart = transparent_heart(Image.open(os.path.join(SRC, HEART_SOURCE)))
    save_variants(heart, "brand-heart", quality=90)
    save_variants(dark_heart(heart), "brand-heart-dark", quality=90)
    app_icons(heart)


if __name__ == "__main__":
    main()
