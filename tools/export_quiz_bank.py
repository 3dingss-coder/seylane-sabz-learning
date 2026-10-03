#!/usr/bin/env python3
"""Regenerate data/skincare-products-quiz.json from skincare_products_quiz.xlsx.

The xlsx (sheet «SkinCare Products Quiz») is the single source of truth together with the
printable copy skincare_products_quiz.docx. Columns:
  A شناسه | B نام محصول (فارسی) | C نام محصول (انگلیسی) | D متن سوال |
  E..H گزینه الف..د | I گزینه صحیح (A-D) | J توضیحات و استدلال علمی

Usage: python3 tools/export_quiz_bank.py
"""
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
XLSX = os.path.join(REPO, "skincare_products_quiz.xlsx")
OUT = os.path.join(REPO, "data", "skincare-products-quiz.json")
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"


def col_letter(ref: str) -> str:
    return re.match(r"([A-Z]+)", ref).group(1)


def load_rows() -> list[list[str]]:
    with zipfile.ZipFile(XLSX) as z:
        with z.open("xl/worksheets/sheet1.xml") as f:
            tree = ET.parse(f)
    rows: dict[int, dict[str, str]] = {}
    for row in tree.getroot().iter(f"{NS}row"):
        r = int(row.get("r"))
        rows[r] = {}
        for c in row.findall(f"{NS}c"):
            if c.get("t") == "inlineStr":
                is_el = c.find(f"{NS}is")
                text = "".join(t.text or "" for t in is_el.iter(f"{NS}t"))
            else:
                v = c.find(f"{NS}v")
                text = v.text if v is not None else ""
            rows[r][col_letter(c.get("r"))] = text
    return [[rows[r].get(col, "") for col in "ABCDEFGHIJ"] for r in sorted(rows)]


def main() -> int:
    table = load_rows()
    header, body = table[0], table[1:]
    assert header[0] == "شناسه", f"unexpected header: {header}"

    products: dict[str, dict] = {}
    for row in body:
        num, name_fa, name_en, stem, a, b, c, d, answer, explanation = (x.strip() for x in row)
        if not num or not stem:
            raise SystemExit(f"malformed row: {row}")
        if answer.upper() not in ("A", "B", "C", "D"):
            raise SystemExit(f"bad answer key {answer!r} in question {num}")
        key = name_en.upper()
        products.setdefault(
            key, {"key": key, "nameFa": name_fa, "nameEn": name_en, "questions": []}
        )
        products[key]["questions"].append(
            {
                "stem": stem,
                "options": [a, b, c, d],
                "answer": answer.upper(),
                "explanation": explanation,
            }
        )

    bank = {
        "$comment": (
            "Product quiz bank — 60 client-authored four-option questions for 6 skincare "
            "products, exported verbatim from skincare_products_quiz.xlsx / .docx (sheet "
            "«SkinCare Products Quiz»). options[0..3] map to گزینه الف..د; `answer` is the "
            "correct option letter. Consumed by functions/src/seed/seed.ts; regenerate with "
            "tools/export_quiz_bank.py."
        ),
        "sourceFiles": ["skincare_products_quiz.docx", "skincare_products_quiz.xlsx"],
        "products": list(products.values()),
    }
    total = sum(len(p["questions"]) for p in bank["products"])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(bank, f, ensure_ascii=False, indent=2)
        f.write("\n")
    print(f"wrote {OUT}: {len(bank['products'])} products, {total} questions")
    for p in bank["products"]:
        print(f"  {len(p['questions']):>3}  {p['key']}  ({p['nameFa']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
