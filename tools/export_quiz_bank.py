#!/usr/bin/env python3
"""Regenerate data/skincare-products-quiz.json from skincare_products_quiz_v3.csv.

CSV columns: id, product_fa, product_en, difficulty, question, option_A..option_D,
correct_answer (A-D), explanation. Text is copied verbatim.

Usage: python3 tools/export_quiz_bank.py
"""
import csv
import json
import os
from collections import OrderedDict

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(REPO, "skincare_products_quiz_v3.csv")
OUT = os.path.join(REPO, "data", "skincare-products-quiz.json")


def main() -> int:
    products: "OrderedDict[str, dict]" = OrderedDict()
    with open(SRC, encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            answer = row["correct_answer"].strip().upper()
            if answer not in ("A", "B", "C", "D"):
                raise SystemExit(f"bad answer key {answer!r} in question {row['id']}")
            key = row["product_en"].strip().upper()
            p = products.setdefault(
                key,
                {"key": key, "nameFa": row["product_fa"].strip(), "nameEn": row["product_en"].strip(), "questions": []},
            )
            p["questions"].append(
                {
                    "stem": row["question"].strip(),
                    "options": [row[f"option_{c}"].strip() for c in "ABCD"],
                    "answer": answer,
                    "explanation": row["explanation"].strip(),
                }
            )
    total = sum(len(p["questions"]) for p in products.values())
    out = {
        "$comment": f"Product quiz bank — {total} client-authored four-option questions for {len(products)} skincare products, exported verbatim from skincare_products_quiz_v3.csv. options[0..3] map to option_A..option_D; `answer` is the correct option letter. Consumed by functions/src/seed/seed.ts; regenerate with tools/export_quiz_bank.py.",
        "sourceFiles": ["skincare_products_quiz_v3.csv"],
        "products": list(products.values()),
    }
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"wrote {OUT}: {len(products)} products, {total} questions")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
