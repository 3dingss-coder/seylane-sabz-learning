#!/usr/bin/env python3
"""
export_catalog.py — برندها و محصولات هر برند را از روی مایگریشن‌های SQL
(worker/migrations/*.sql) استخراج می‌کند و یک فایل اکسل/CSV تمیز
برای import مستقیم در Google Sheets می‌سازد.

روش کار: تمام فایل‌های مایگریشن به ترتیب شماره روی یک دیتابیس SQLite
در حافظه اجرا می‌شوند (همان کاری که Cloudflare D1 در محیط واقعی می‌کند)،
بنابراین خروجی دقیقاً همان چیزی است که امروز در اپلیکیشن نمایش داده می‌شود
(حذف برندها، ادغام برندها، مخفی‌سازی محصولات بدون عکس و ... اعمال شده است).

 usage:  python3 tools/export_catalog.py
"""

from __future__ import annotations

import csv
import glob
import os
import re
import sqlite3
import statistics
from collections import OrderedDict

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "exports")

# ----------------------------------------------------------------------------
# 1) بازسازی دیتابیس از مایگریشن‌ها
# ----------------------------------------------------------------------------
def build_db() -> sqlite3.Connection:
    con = sqlite3.connect(":memory:")
    con.row_factory = sqlite3.Row
    for path in sorted(glob.glob(os.path.join(ROOT, "worker", "migrations", "*.sql"))):
        with open(path, encoding="utf-8") as fh:
            con.executescript(fh.read())
    con.commit()
    return con


# ----------------------------------------------------------------------------
# 2) ابزارهای تمیزکاری متن فارسی
# ----------------------------------------------------------------------------
_ZWNJ = "‌"

def clean(text):
    """نرمال‌سازی: حذف فاصله‌های اضافی و نیم‌فاصله‌های تکراری."""
    if text is None:
        return ""
    text = str(text).replace("\\u200c", _ZWNJ).replace("\u200c\u200c", _ZWNJ)
    return re.sub(r"\s+", " ", text).strip()


def key(text):
    """کلید یکتا برای مقایسه نام‌ها (ی/ك عربی، نیم‌فاصله و ... نادیده گرفته می‌شود)."""
    s = clean(text)
    s = s.replace("ي", "ی").replace("ى", "ی").replace("ك", "ک").replace("ة", "ه")
    s = s.replace(_ZWNJ, "").replace("‌", "").replace("\u200d", "")
    return s.strip()


# نام‌های قدیمی/دمو که در مایگریشن‌ها غیرفعال شده‌اند -> معادل امروزی
LEGACY_BRAND_ALIAS = {
    key("آمبرلا"): "آمبرال",
    key("پیکسلی"): "پیکسل",
    key("میسویک"): "میسویک",
    key("زنون"): "زِن",
    key("میس\u200cویک"): "میسویک",
}


# ----------------------------------------------------------------------------
# 3) استخراج داده
# ----------------------------------------------------------------------------
PRODUCT_FIELDS = """
    p.id, p.code, p.name, p.brand, p.category, p.image_url, p.barcode,
    p.carton_quantity, p.price, p.unit_price, p.in_stock, p.stock_count,
    p.special_offer, p.discount_percentage, p.is_new, p.description, p.active
"""


def fetch(con):
    cur = con.cursor()

    brands = []
    for r in cur.execute(
        "SELECT id, name, english_name, image_url, logo_color FROM brands "
        "WHERE active = 1 ORDER BY name"
    ):
        brands.append(
            {
                "id": r["id"],
                "name": clean(r["name"]),
                "en": clean(r["english_name"]),
                "logo": clean(r["image_url"]),
            }
        )

    rows = []
    for r in cur.execute(f"SELECT {PRODUCT_FIELDS} FROM products p ORDER BY p.brand, p.name"):
        rows.append(dict(r))

    brand_by_key = {key(b["name"]): b for b in brands}

    active_products, hidden_products = [], []
    for p in rows:
        bk = key(p["brand"])
        matched = brand_by_key.get(bk) or brand_by_key.get(LEGACY_BRAND_ALIAS.get(bk, ""))
        item = {
            "id": p["id"],
            "code": clean(p["code"]),
            "name": clean(p["name"]),
            "brand_raw": clean(p["brand"]),
            "brand": matched["name"] if matched else clean(p["brand"]),
            "brand_en": matched["en"] if matched else "",
            "category": clean(p["category"]),
            "barcode": clean(p["barcode"]),
            "carton": p["carton_quantity"] or 1,
            "price": p["price"] or 0,          # قیمت عمده هر عدد
            "consumer": p["unit_price"] or 0,  # قیمت مصوب مصرف‌کننده
            "image": clean(p["image_url"]),
            "description": clean(p["description"]),
            "in_stock": bool(p["in_stock"]),
            "in_brand_table": bool(matched),
        }
        if p["active"]:
            # فقط محصولاتی که برندشان در جدول برندهای فعال وجود دارد = کاتالوگ زنده
            if matched:
                active_products.append(item)
            else:
                item["hidden_reason"] = "برند آن در اپلیکیشن غیرفعال/حذف شده است"
                hidden_products.append(item)
        else:
            if p["id"].startswith("sb-"):
                reason = "بدون تصویر محصول (موقتاً مخفی)" if not item["image"] else "غیرفعال شده"
                if not matched:
                    reason = "برند آن در اپلیکیشن غیرفعال/حذف شده است"
            else:
                reason = "محصول دمو/قدیمی (با import کاتالوگ واقعی جایگزین شد)"
            item["hidden_reason"] = reason
            hidden_products.append(item)

    return brands, active_products, hidden_products


# ----------------------------------------------------------------------------
# 4) استایل خروجی اکسل
# ----------------------------------------------------------------------------
HEADER_FILL = PatternFill("solid", fgColor="0F6B4F")   # سبز برند
HEADER_FONT = Font(bold=True, color="FFFFFF", size=11, name="Calibri")
BODY_FONT = Font(size=11)
THIN = Side(style="thin", color="D9E2DC")
BORDER = Border(left=THIN, right=THIN, top=THIN, bottom=THIN)
BAND = PatternFill("solid", fgColor="F4F8F5")
NUM_FMT = "#,##0"

COLUMNS = OrderedDict(
    [
        ("ردیف", ("row", 6)),
        ("برند", ("brand", 16)),
        ("برند (لاتین)", ("brand_en", 14)),
        ("کد محصول", ("code", 14)),
        ("بارکد", ("barcode", 16)),
        ("نام محصول", ("name", 52)),
        ("دسته‌بندی", ("category", 26)),
        ("تعداد در کارتن", ("carton", 14)),
        ("قیمت عمده هر عدد (تومان)", ("price", 22)),
        ("قیمت هر کارتن (تومان)", ("carton_price", 22)),
        ("قیمت مصوب مصرف‌کننده (تومان)", ("consumer", 26)),
        ("سود فروشگاه (٪)", ("margin", 16)),
        ("لینک تصویر", ("image", 60)),
        ("توضیحات", ("description", 80)),
        ("شناسه محصول", ("id", 16)),
    ]
)


def style_sheet(ws, widths, freeze="A2", money_cols=(), pct_cols=()):
    ws.freeze_panes = freeze
    ws.sheet_view.rightToLeft = True  # نمایش راست‌به‌چپ برای متن فارسی
    for idx, width in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(idx)].width = width
    ws.auto_filter.ref = ws.dimensions

    for cell in ws[1]:
        cell.fill = HEADER_FILL
        cell.font = HEADER_FONT
        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        cell.border = BORDER
    ws.row_dimensions[1].height = 30

    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.font = BODY_FONT
            cell.border = BORDER
            if cell.column in money_cols:
                cell.number_format = NUM_FMT
                cell.alignment = Alignment(horizontal="right")
            elif cell.column in pct_cols:
                cell.number_format = "0.0"
                cell.alignment = Alignment(horizontal="right")
            else:
                cell.alignment = Alignment(horizontal="right", vertical="top", wrap_text=False)
        if row[0].row % 2 == 1:
            for cell in row:
                if cell.fill.fgColor.rgb in (None, "00000000"):
                    cell.fill = BAND


def write_csv(path, header, rows):
    with open(path, "w", encoding="utf-8-sig", newline="") as fh:
        w = csv.writer(fh)
        w.writerow(header)
        w.writerows(rows)


# ----------------------------------------------------------------------------
# 5) ساخت خروجی
# ----------------------------------------------------------------------------
def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    con = build_db()
    brands, products, hidden = fetch(con)

    # --- مرتب‌سازی: برندها بر اساس تعداد محصول (بیشترین اول)، محصولات بر اساس برند و نام
    counts = {b["name"]: 0 for b in brands}
    for p in products:
        counts[p["brand"]] = counts.get(p["brand"], 0) + 1
    brands.sort(key=lambda b: (-counts.get(b["name"], 0), b["name"]))
    products.sort(key=lambda p: (-counts.get(p["brand"], 0), p["name"]))

    wb = Workbook()

    # ============================ شیت ۱: برندها ============================
    ws1 = wb.active
    ws1.title = "برندها"
    h1 = [
        "ردیف", "نام برند", "نام لاتین", "شناسه برند", "تعداد محصولات فعال",
        "دسته‌بندی‌ها", "کمترین قیمت عمده", "بیشترین قیمت عمده",
        "میانگین قیمت عمده", "لوگو",
    ]
    ws1.append(h1)
    for i, b in enumerate(brands, start=1):
        items = [p for p in products if p["brand"] == b["name"]]
        prices = [p["price"] for p in items] or [0]
        cats = " / ".join(sorted({p["category"] for p in items if p["category"]}))
        ws1.append(
            [
                i, b["name"], b["en"] or "—", b["id"], len(items), cats or "—",
                min(prices), max(prices), round(statistics.mean(prices)),
                b["logo"] or "—",
            ]
        )
    style_sheet(ws1, [6, 18, 14, 14, 18, 46, 18, 18, 18, 26], money_cols=(7, 8, 9))

    # =========================== شیت ۲: محصولات ============================
    ws2 = wb.create_sheet("محصولات")
    ws2.append(list(COLUMNS.keys()))
    for i, p in enumerate(products, start=1):
        margin = round((p["consumer"] - p["price"]) / p["consumer"] * 100, 1) if p["consumer"] else ""
        ws2.append(
            [
                i, p["brand"], p["brand_en"] or "—", p["code"], p["barcode"] or "—",
                p["name"], p["category"], p["carton"], p["price"],
                p["price"] * p["carton"], p["consumer"], margin,
                p["image"] or "—", p["description"] or "—", p["id"],
            ]
        )
    style_sheet(
        ws2,
        list(w for _, w in COLUMNS.values()),
        money_cols=(9, 10, 11),
        pct_cols=(12,),
    )

    # ====================== شیت ۳: برند × دسته‌بندی ========================
    ws3 = wb.create_sheet("برند × دسته‌بندی")
    categories = sorted({p["category"] for p in products if p["category"]})
    h3 = ["نام برند"] + categories + ["جمع کل"]
    ws3.append(h3)
    for b in brands:
        items = [p for p in products if p["brand"] == b["name"]]
        row = [b["name"]]
        for cat in categories:
            row.append(sum(1 for p in items if p["category"] == cat))
        row.append(len(items))
        ws3.append(row)
    total_row = ["جمع کل"]
    for cat in categories:
        total_row.append(sum(1 for p in products if p["category"] == cat))
    total_row.append(len(products))
    ws3.append(total_row)
    style_sheet(ws3, [20] + [24] * len(categories) + [12])
    for cell in ws3[ws3.max_row]:
        cell.font = Font(bold=True, size=11)
        cell.fill = PatternFill("solid", fgColor="E3F0E8")

    # ========================= شیت ۴: غیرفعال‌ها ==========================
    ws4 = wb.create_sheet("محصولات غیرفعال")
    h4 = ["ردیف", "برند", "کد محصول", "نام محصول", "دلیل عدم نمایش", "شناسه محصول"]
    ws4.append(h4)
    hidden.sort(key=lambda p: (p["brand"], p["name"]))
    for i, p in enumerate(hidden, start=1):
        ws4.append([i, p["brand"], p["code"], p["name"], p["hidden_reason"], p["id"]])
    style_sheet(ws4, [6, 16, 14, 52, 46, 16])

    xlsx_path = os.path.join(OUT_DIR, "silaneh-sabz-plus-brands-products.xlsx")
    wb.save(xlsx_path)

    # ------------------------------- CSVها --------------------------------
    write_csv(
        os.path.join(OUT_DIR, "brands.csv"),
        h1,
        [[c.value for c in row] for row in ws1.iter_rows(min_row=2)],
    )
    write_csv(
        os.path.join(OUT_DIR, "products.csv"),
        list(COLUMNS.keys()),
        [[c.value for c in row] for row in ws2.iter_rows(min_row=2)],
    )
    write_csv(
        os.path.join(OUT_DIR, "brand-category-matrix.csv"),
        h3,
        [[c.value for c in row] for row in ws3.iter_rows(min_row=2)],
    )
    write_csv(
        os.path.join(OUT_DIR, "hidden-products.csv"),
        h4,
        [[c.value for c in row] for row in ws4.iter_rows(min_row=2)],
    )

    print(f"برندهای فعال            : {len(brands)}")
    print(f"محصولات فعال (کاتالوگ)  : {len(products)}")
    print(f"محصولات غیرفعال/حذف‌شده : {len(hidden)}")
    print(f"خروجی‌ها در             : {OUT_DIR}")
    for b in brands:
        print(f"  {b['name']:<12} {counts.get(b['name'], 0):>3} محصول")


if __name__ == "__main__":
    main()
