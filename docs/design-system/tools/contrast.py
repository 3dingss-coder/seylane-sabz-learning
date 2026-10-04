#!/usr/bin/env python3
"""
WCAG 2.1 contrast checker for the Seylane × Duolingo token set.

    python3 docs/design-system/tools/contrast.py

Exit 0 = every pair the design system *relies on* clears the ratio it claims.
Every «X:1» number quoted in the phase docs is the output of this script.

v2 — palette re-derived from the OFFICIAL brand mascot (repo root «مسکات.png»,
mirrored at docs/design-system/assets/mascot-official.png). The mascot is a
purple bird with a red crest and green eyes; the corporate green (#177A50)
remains for brand/success/admin surfaces. Dominant mascot hexes measured with
ImageMagick: body #7048A3 / deep #472475 / glow #9455A9, crest #C55D41,
beak #DDB8AB, feet #E29B55, eye #798B25.
"""

from __future__ import annotations

import sys

# ---------------------------------------------------------------- tokens ----
TOKENS: dict[str, str] = {
    # corporate green (unchanged — brand / success / admin)
    "sl-green-600": "#177A50",
    "sl-green-100": "#DFF5E9",
    "sl-green-700": "#115E3D",
    "sl-green-800": "#0E4630",
    # MASCOT purple = energy / character layer (marketer learning app)
    "ms-energy": "#7048A3",   # body mid — CTA fill (white text 6.68:1)
    "ms-lip": "#472475",      # body deep — 3D lip / pressed / text on light
    "ms-glow": "#9455A9",     # highlight / hover (decorative)
    "ms-100": "#EFE7F9",      # light purple — chips, feedback bar bg
    "ms-950": "#2A1447",      # dark-mode hero bg
    # crest red = streak / celebration (fill & icon only)
    "ms-crest": "#C55D41",
    "ms-crest-100": "#FBEAE4",
    "ms-crest-deep": "#8A3423",
    # beak cream = soft warm surface
    "ms-beak": "#DDB8AB",
    "ms-beak-ink": "#3C1E59",
    # reward / neutrals / app semantic (verified before)
    "sl-bee": "#FFC800",
    "sl-bee-900": "#4A3600",
    "sl-ink": "#0F172A",
    "sl-ink-2": "#475569",
    "sl-ink-3": "#64748B",
    "sl-swan": "#E2E8F0",
    "sl-polar": "#F8FAFC",
    "sl-surface": "#FFFFFF",
    "app-accent-light": "#FEF3C7",
    "app-accent-fg": "#92400E",
    "app-danger-light": "#FEE2E2",
    "app-danger-fg": "#B91C1C",
    # Duolingo reference (measured as published)
    "duo-feather": "#58CC02",
}

PAIRS: list[tuple[str, str, str, float]] = [
    # corporate green as text
    ("برند green-600 روی سفید", "sl-green-600", "sl-surface", 4.5),
    ("green-700 روی green-100 (بازخورد درست)", "sl-green-700", "sl-green-100", 4.5),
    ("سفید روی green-800 (hero ادمین)", "sl-surface", "sl-green-800", 4.5),
    # neutrals
    ("متن اصلی روی سفید", "sl-ink", "sl-surface", 4.5),
    ("متن فرعی روی سفید", "sl-ink-2", "sl-surface", 4.5),
    ("متن خاموش روی سفید", "sl-ink-3", "sl-surface", 4.5),
    # MASCOT purple energy
    ("سفید روی CTA بنفش ms-energy", "sl-surface", "ms-energy", 4.5),
    ("سفید روی لبه ms-lip", "sl-surface", "ms-lip", 4.5),
    ("ms-lip روی ms-100 (بازخورد/چیپ)", "ms-lip", "ms-100", 4.5),
    ("سفید روی ms-950 (hero تاریک)", "sl-surface", "ms-950", 4.5),
    ("ms-energy روی سفید (متن/لینک بنفش)", "ms-energy", "sl-surface", 4.5),
    # crest red (text goes on the light tint, not the fill)
    ("ms-crest-deep روی ms-crest-100 (چیپ streak)", "ms-crest-deep", "ms-crest-100", 4.5),
    ("آیکون شعله ms-crest روی سفید (1.4.11)", "ms-crest", "sl-surface", 3.0),
    # beak cream surface
    ("ms-beak-ink روی ms-beak (متن روی کرم)", "ms-beak-ink", "ms-beak", 4.5),
    # reward
    ("sl-bee-900 روی sl-bee (چیپ امتیاز)", "sl-bee-900", "sl-bee", 4.5),
    ("app-accent-fg روی accent-light", "app-accent-fg", "app-accent-light", 4.5),
    ("app-danger-fg روی danger-light", "app-danger-fg", "app-danger-light", 4.5),
    # non-text
    ("حاشیه فیلد ink-3 روی سفید (1.4.11)", "sl-ink-3", "sl-surface", 3.0),
    ("نوار پیشرفت ms-energy روی swan (1.4.11)", "ms-energy", "sl-swan", 3.0),
]

REFS: list[tuple[str, str, str]] = [
    ("سفید روی Feather Green #58CC02 (CTA دولینگو)", "sl-surface", "duo-feather"),
]

INFO: list[tuple[str, str, str]] = [
    ("سفید روی ms-crest (فقط fill/آیکن — متن نیاید)", "sl-surface", "ms-crest"),
    ("ms-glow روی سفید (تزئینی)", "ms-glow", "sl-surface"),
]


def _channel(v: int) -> float:
    s = v / 255
    return s / 12.92 if s <= 0.04045 else ((s + 0.055) / 1.055) ** 2.4


def luminance(h: str) -> float:
    h = h.lstrip("#")
    r, g, b = (int(h[i : i + 2], 16) for i in (0, 2, 4))
    return 0.2126 * _channel(r) + 0.7152 * _channel(g) + 0.0722 * _channel(b)


def ratio(fg: str, bg: str) -> float:
    la, lb = luminance(fg), luminance(bg)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def main() -> int:
    failures = 0
    print("GATED — the design system depends on these")
    for label, fg, bg, need in PAIRS:
        r = ratio(TOKENS[fg], TOKENS[bg])
        ok = r >= need
        if not ok:
            failures += 1
        print(f"  {label:<46} {r:>6.2f}:1 {need:>4.1f}  {'ok' if ok else 'FAIL'}")
    print("INFORMATIONAL")
    for label, fg, bg in INFO:
        print(f"  {label:<46} {ratio(TOKENS[fg], TOKENS[bg]):>6.2f}:1")
    print("REFERENCE (Duolingo)")
    for label, fg, bg in REFS:
        print(f"  {label:<46} {ratio(TOKENS[fg], TOKENS[bg]):>6.2f}:1")
    print(f"\n{len(PAIRS)} gated pairs — {failures} failure(s)")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
