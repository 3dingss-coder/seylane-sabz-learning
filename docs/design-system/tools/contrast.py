#!/usr/bin/env python3
"""
WCAG 2.1 contrast gate — v3 (green/white house + purple mascot accent).

    python3 docs/design-system/tools/contrast.py

Direction (PHASE-0.5 consensus D-101..D-107):
  • House & action = corporate green + white + light-green (professional, on-brand).
  • Purple = ONLY the official mascot and its aura (celebration / mastery), never a CTA.
Every «X:1» number quoted in the phase docs is the output of this script.
"""

from __future__ import annotations

import sys

TOKENS: dict[str, str] = {
    # house / action — corporate green
    "g-600": "#177A50",   # CTA / text / link / progress (white 5.34:1)
    "g-700": "#115E3D",   # 3D lip for green button / feedback text on 100
    "g-100": "#DFF5E9",   # light-green chip / feedback bg
    "g-mint": "#E7F5EE",  # soft mint surface
    "g-800": "#0E4630",   # dark hero (admin)
    "g-leaf": "#21A55F",  # bright green — fills / icons / glow (decorative)
    # mascot accent — purple (mascot + aura only)
    "p-500": "#7048A3",   # mascot body; white celebration text 6.68:1
    "p-700": "#472475",   # purple text on light/white 6.68:1
    "p-100": "#EFE7F9",   # mascot halo (very light purple)
    "p-950": "#2A1447",
    "p-mastery": "#6D28D9",  # rare mastery moment (7.10:1)
    # crest red (streak / celebration, fill & icon only)
    "crest": "#C55D41",
    "crest-100": "#FBEAE4",
    "crest-deep": "#8A3423",
    # warm
    "beak": "#DDB8AB",
    "beak-ink": "#3C1E59",
    # reward
    "reward": "#FFC800",
    "reward-fg": "#4A3600",
    # neutrals + app semantic
    "ink": "#0F172A",
    "ink-2": "#475569",
    "ink-3": "#64748B",
    "swan": "#E2E8F0",
    "surface": "#FFFFFF",
    "accent-light": "#FEF3C7",
    "accent-fg": "#92400E",
    "danger-light": "#FEE2E2",
    "danger-fg": "#B91C1C",
    "duo-feather": "#58CC02",
}

PAIRS: list[tuple[str, str, str, float]] = [
    # house green
    ("سفید روی CTA سبز g-600", "surface", "g-600", 4.5),
    ("g-600 روی سفید (متن/لینک)", "g-600", "surface", 4.5),
    ("g-700 روی g-100 (بازخورد)", "g-700", "g-100", 4.5),
    ("سفید روی g-800 (hero ادمین)", "surface", "g-800", 4.5),
    ("نوار پیشرفت g-600 روی swan (1.4.11)", "g-600", "swan", 3.0),
    # neutrals
    ("متن اصلی روی سفید", "ink", "surface", 4.5),
    ("متن فرعی روی سفید", "ink-2", "surface", 4.5),
    ("متن خاموش روی سفید", "ink-3", "surface", 4.5),
    ("حاشیه فیلد ink-3 روی سفید (1.4.11)", "ink-3", "surface", 3.0),
    # purple = mascot accent (celebration / mastery), not CTA
    ("سفید روی p-500 (تیتر جشن/هالهٔ مسکات)", "surface", "p-500", 4.5),
    ("p-700 روی سفید (متن استادی)", "p-700", "surface", 4.5),
    ("p-700 روی p-100 (حباب مسکات)", "p-700", "p-100", 4.5),
    # crest / warm / reward
    ("crest-deep روی crest-100 (چیپ streak)", "crest-deep", "crest-100", 4.5),
    ("آیکون شعله crest روی سفید (1.4.11)", "crest", "surface", 3.0),
    ("beak-ink روی beak", "beak-ink", "beak", 4.5),
    ("reward-fg روی reward (چیپ امتیاز)", "reward-fg", "reward", 4.5),
    ("accent-fg روی accent-light", "accent-fg", "accent-light", 4.5),
    ("danger-fg روی danger-light", "danger-fg", "danger-light", 4.5),
]

INFO: list[tuple[str, str, str]] = [
    ("g-leaf روی swan (چرا پرِ نوار نیست — تزئینی)", "g-leaf", "swan"),
    ("سفید روی crest (فقط fill/آیکن)", "surface", "crest"),
    ("p-500 روی g-mint (مسکات روی مغ سبز — پل هماهنگی)", "p-500", "g-mint"),
]

REFS: list[tuple[str, str, str]] = [
    ("سفید روی Feather Green دولینگو", "surface", "duo-feather"),
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
    print("GATED")
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
