"""
Generates the synthetic sample offer lists in samples/files/ and the
hand-checked "correct answers" in samples/expected/.

Everything here is FABRICATED: company names, prices, quantities and stock
positions are invented. Brand names are only used as product names.

The correct answer for every line is defined first, then rendered into a
messy format, so the expected results always match the files exactly.

Run:  python3 samples/generate.py
"""
import csv, json, os, random
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet
from PIL import Image, ImageDraw, ImageFont

random.seed(42)
HERE = os.path.dirname(os.path.abspath(__file__))
FILES = os.path.join(HERE, "files")
EXPECTED = os.path.join(HERE, "expected")
os.makedirs(FILES, exist_ok=True)
os.makedirs(EXPECTED, exist_ok=True)

# ---------------------------------------------------------------------------
# Product catalogue: canonical answer + the ways traders write it
# (brand, product_name, category, age, edition, abv, eur_per_70cl_btl, sizes, variants)
# ---------------------------------------------------------------------------
P = [
    ("Jameson", "Irish Whiskey", "whisky", None, None, 40, 11.2, [35, 70, 100, 175], ["Jameson", "Jameson Irish Whiskey", "JAMESON IRISH", "Jamesons"]),
    ("Jameson", "Black Barrel", "whisky", None, "Black Barrel", 40, 19.5, [70, 100], ["Jameson Black Barrel", "Jameson Blk Barrel", "JAMESON BLACK BARREL"]),
    ("Johnnie Walker", "Red Label", "whisky", None, "Red Label", 40, 8.9, [20, 35, 70, 100], ["Johnnie Walker Red", "JW Red Label", "J.Walker Red", "JOHNNIE WALKER RED LABEL"]),
    ("Johnnie Walker", "Black Label", "whisky", "12YO", "Black Label", 40, 19.8, [20, 50, 70, 100, 150], ["Johnnie Walker Black 12y", "JW Black Label 12YO", "J.Walker Black 12 yrs", "JOHNNIE WALKER BLACK LABEL 12"]),
    ("Johnnie Walker", "Double Black", "whisky", None, "Double Black", 40, 27.0, [70, 100], ["JW Double Black", "Johnnie Walker Double Black"]),
    ("Johnnie Walker", "Gold Label Reserve", "whisky", None, "Gold Label Reserve", 40, 38.0, [70], ["JW Gold Label Reserve", "Johnnie Walker Gold Reserve"]),
    ("Johnnie Walker", "Blue Label", "whisky", None, "Blue Label", 40, 148.0, [70, 100], ["JW Blue Label", "Johnnie Walker Blue"]),
    ("Jack Daniel's", "Old No.7", "whisky", None, "Old No.7", 40, 15.6, [35, 50, 70, 100, 175], ["Jack Daniels", "Jack Daniel's Old No 7", "JD Old No.7", "JACK DANIELS NO.7"]),
    ("Jack Daniel's", "Honey", "whisky", None, "Honey", 35, 16.4, [70, 100], ["Jack Daniels Honey", "JD Honey", "Jack Daniel's Tennessee Honey"]),
    ("Chivas Regal", "12 Year Old", "whisky", "12YO", None, 40, 18.9, [20, 50, 70, 100, 150], ["Chivas Regal 12", "Chivas 12y", "CHIVAS REGAL 12 YO", "Chivas 12 yrs"]),
    ("Chivas Regal", "18 Year Old", "whisky", "18YO", None, 40, 45.0, [70, 100], ["Chivas Regal 18", "Chivas 18y", "CHIVAS 18 YO"]),
    ("Ballantine's", "Finest", "whisky", None, "Finest", 40, 8.1, [35, 50, 70, 100, 150], ["Ballantines Finest", "Ballantine's Finest", "BALLANTINES"]),
    ("Glenfiddich", "12 Year Old", "whisky", "12YO", None, 40, 26.5, [35, 70, 100], ["Glenfiddich 12", "Glenfiddich 12y", "GLENFIDDICH 12 YO"]),
    ("Glenfiddich", "15 Year Old", "whisky", "15YO", None, 40, 38.0, [70, 100], ["Glenfiddich 15", "Glenfiddich 15y Solera"]),
    ("Balvenie", "12 Year Old American Oak", "whisky", "12YO", "American Oak", 43, 30.8, [70], ["Balvenie 12y american oak", "BALVENIE 12YO AMERICAN OAK", "Balvenie 12 Yrs Am. Oak"]),
    ("Balvenie", "12 Year Old DoubleWood", "whisky", "12YO", "DoubleWood", 40, 36.5, [70, 100], ["Balvenie 12 Doublewood", "Balvenie 12y DW", "BALVENIE DOUBLEWOOD 12"]),
    ("Macallan", "12 Year Old Double Cask", "whisky", "12YO", "Double Cask", 40, 52.0, [70], ["Macallan 12 Double Cask", "Macallan 12y DC", "MACALLAN 12YO DOUBLE CASK"]),
    ("Glenlivet", "Founder's Reserve", "whisky", None, "Founder's Reserve", 40, 17.9, [70, 100], ["Glenlivet Founders Reserve", "The Glenlivet Founder's Res."]),
    ("Monkey Shoulder", "Blended Malt", "whisky", None, None, 40, 21.0, [70, 100], ["Monkey Shoulder", "MONKEY SHOULDER"]),
    ("Jim Beam", "White Label", "whisky", None, "White Label", 40, 9.4, [70, 100, 150], ["Jim Beam", "Jim Beam White", "JIM BEAM BOURBON"]),
    ("Absolut", "Vodka", "vodka", None, None, 40, 8.6, [20, 35, 50, 70, 100, 175], ["Absolut", "Absolut Blue", "ABSOLUT VODKA", "Absolut Original"]),
    ("Smirnoff", "Red", "vodka", None, "Red", 37.5, 7.4, [20, 35, 70, 100, 150], ["Smirnoff Red", "Smirnoff No.21", "SMIRNOFF RED LABEL"]),
    ("Grey Goose", "Vodka", "vodka", None, None, 40, 24.0, [35, 70, 100, 150], ["Grey Goose", "GREY GOOSE", "Grey Goose Original"]),
    ("Belvedere", "Vodka", "vodka", None, None, 40, 21.5, [70, 100], ["Belvedere", "Belvedere Pure", "BELVEDERE VODKA"]),
    ("Ketel One", "Vodka", "vodka", None, None, 40, 15.9, [70, 100], ["Ketel One", "Ketel 1", "KETEL ONE VODKA"]),
    ("Bacardi", "Carta Blanca", "rum", None, "Carta Blanca", 37.5, 9.1, [35, 70, 100, 150], ["Bacardi Carta Blanca", "Bacardi White", "BACARDI SUPERIOR", "Bacardi Blanca"]),
    ("Captain Morgan", "Spiced Gold", "rum", None, "Spiced Gold", 35, 10.2, [35, 70, 100], ["Captain Morgan Spiced", "Capt. Morgan Spiced Gold", "CAPTAIN MORGAN ORIGINAL SPICED"]),
    ("Havana Club", "Añejo 3 Años", "rum", "3YO", None, 40, 9.8, [70, 100], ["Havana Club 3", "Havana Club 3 Anos", "HAVANA 3YO"]),
    ("Havana Club", "Añejo 7 Años", "rum", "7YO", None, 40, 16.9, [70, 100], ["Havana Club 7", "Havana Club 7 Anos", "HAVANA 7YO"]),
    ("Diplomático", "Reserva Exclusiva", "rum", None, "Reserva Exclusiva", 40, 23.5, [70], ["Diplomatico Reserva Exclusiva", "Diplomatico RE", "DIPLOMATICO RESERVA"]),
    ("Gordon's", "London Dry Gin", "gin", None, None, 37.5, 8.3, [35, 70, 100, 150], ["Gordons", "Gordon's London Dry", "GORDONS GIN"]),
    ("Bombay Sapphire", "London Dry Gin", "gin", None, None, 40, 14.2, [35, 50, 70, 100, 175], ["Bombay Sapphire", "Bombay", "BOMBAY SAPPHIRE GIN"]),
    ("Tanqueray", "London Dry Gin", "gin", None, None, 43.1, 13.6, [70, 100], ["Tanqueray", "Tanqueray London Dry", "TANQUERAY GIN"]),
    ("Hendrick's", "Gin", "gin", None, None, 41.4, 22.5, [70, 100], ["Hendricks", "Hendrick's Gin", "HENDRICKS GIN"]),
    ("Beefeater", "London Dry Gin", "gin", None, None, 40, 9.9, [70, 100], ["Beefeater", "Beefeater London Dry", "BEEFEATER GIN"]),
    ("Hennessy", "VS", "cognac", None, "VS", 40, 24.8, [35, 70, 100, 150], ["Hennessy VS", "HENNESSY V.S", "Hennesy VS"]),
    ("Hennessy", "VSOP", "cognac", None, "VSOP", 40, 38.5, [70, 100], ["Hennessy VSOP", "HENNESSY V.S.O.P", "Hennessy VSOP Privilege"]),
    ("Hennessy", "XO", "cognac", None, "XO", 40, 132.0, [70, 100], ["Hennessy XO", "HENNESSY X.O"]),
    ("Martell", "VS", "cognac", None, "VS", 40, 21.0, [35, 70, 100], ["Martell VS", "MARTELL V.S", "Martell VS Single Distillery"]),
    ("Rémy Martin", "VSOP", "cognac", None, "VSOP", 40, 34.0, [70, 100], ["Remy Martin VSOP", "Rémy Martin V.S.O.P", "REMY VSOP"]),
    ("Courvoisier", "VS", "cognac", None, "VS", 40, 19.5, [70, 100], ["Courvoisier VS", "COURVOISIER V.S"]),
    ("Jose Cuervo", "Especial Gold", "tequila", None, "Especial Gold", 38, 11.9, [70, 100], ["Jose Cuervo Gold", "Cuervo Especial Reposado Gold", "JOSE CUERVO ESPECIAL"]),
    ("Patrón", "Silver", "tequila", None, "Silver", 40, 32.0, [70, 100], ["Patron Silver", "PATRON SILVER", "Patrón Silver"]),
    ("Don Julio", "Blanco", "tequila", None, "Blanco", 38, 33.5, [70], ["Don Julio Blanco", "DON JULIO BLANCO"]),
    ("Baileys", "Original Irish Cream", "liqueur", None, None, 17, 10.4, [35, 50, 70, 100], ["Baileys", "Baileys Original", "BAILEYS IRISH CREAM"]),
    ("Jägermeister", "Original", "liqueur", None, None, 35, 10.9, [35, 70, 100, 175], ["Jagermeister", "Jägermeister", "JAEGERMEISTER", "Jager"]),
    ("Aperol", "Aperitivo", "liqueur", None, None, 11, 8.7, [70, 100, 300], ["Aperol", "APEROL APERITIVO"]),
    ("Malibu", "Original", "liqueur", None, None, 21, 8.2, [70, 100], ["Malibu", "Malibu Coconut", "MALIBU ORIGINAL"]),
    ("Cointreau", "Triple Sec", "liqueur", None, None, 40, 15.2, [70, 100], ["Cointreau", "COINTREAU"]),
    ("Disaronno", "Originale", "liqueur", None, None, 28, 12.6, [70, 100], ["Disaronno", "Disaronno Amaretto", "DISARONNO ORIGINALE"]),
]
BPC = {20: 24, 35: 24, 50: 12, 70: 6, 75: 6, 100: 12, 150: 6, 175: 6, 300: 1}
USD = 1.08  # fabricated fixed rate used only to make USD prices plausible


def lot(p, size, *, price, price_unit, currency, bpc=None, packaging=None, **extra):
    brand, name, cat, age, ed, abv = p[:6]
    d = dict(brand=brand, product_name=name, category=cat, age_statement=age, edition=ed,
             bottle_size_cl=size, abv=abv, bottles_per_case=bpc or BPC[size],
             price=round(price, 2), price_unit=price_unit, currency=currency, packaging=packaging)
    d.update(extra)
    return {k: v for k, v in d.items() if v is not None}


def btl_price(p, size, cur="EUR"):
    base = p[6] * (size / 70) ** 0.92 * random.uniform(0.94, 1.06)
    return base * (USD if cur == "USD" else 1)


def size_str(size, style):
    if style == "cl": return f"{size}cl"
    if style == "CL": return f"{size}CL"
    if style == "L": return f"{size/100:g}L".replace("1L", "1L")
    if style == "Lcomma": return f"{size/100:.2f}".replace(".", ",") + "L"
    if style == "dec": return f"{size/100:g}"
    if style == "ml": return f"{size*10}ml"
    if style == "mixed": return random.choice([f"{size}cl", f"{size/100:g}L", f"{size*10}ml"])
    raise ValueError(style)


def table_rows(n, cur, unit, *, packaging=False, spec=False, dupes_ok=True):
    """Pick n (product, size, ...) combinations with prices."""
    combos = [(p, s) for p in P for s in p[7]]
    out = []
    while len(out) < n:
        p, s = random.choice(combos)
        pack = random.choice(["GBX", "NGBX"]) if packaging and s >= 50 else None
        bpc = BPC[s]
        if s == 70 and random.random() < 0.3: bpc = 12
        pb = btl_price(p, s, cur) * (1.04 if pack == "GBX" else 1)
        price = pb * bpc if unit == "case" else pb
        out.append((p, s, bpc, pack, price))
    return out


def save_expected(name, side, source_type, lots_, **defaults):
    data = {"file": name, "side": side, "source_type": source_type,
            "list_defaults": {k: v for k, v in defaults.items() if v is not None},
            "match_by": "order" if source_type in ("xlsx", "csv", "pdf") else "best",
            "lots": lots_}
    stem = os.path.splitext(name)[0]
    with open(os.path.join(EXPECTED, stem + ".json"), "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)


def header_style(ws, row, ncols):
    for c in range(1, ncols + 1):
        cell = ws.cell(row=row, column=c)
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="1F3864")


# ---------------------------------------------------------------------------
# 01  Your exact format, USD per case, ~120 rows
# ---------------------------------------------------------------------------
def s01():
    name = "01_kestrel_bay_usd_basic.xlsx"
    wb = Workbook(); ws = wb.active; ws.title = "Offer"
    cols = ["Product name", "btl/cs", "Size", "ABV", "Price/cs", "Custom Status"]
    ws.append(cols); header_style(ws, 1, len(cols))
    exp = []
    for p, s, bpc, _, price in table_rows(120, "USD", "case"):
        cs = random.choice(["T1", "T2", "T2", "T2"])
        ws.append([random.choice(p[8]), bpc, size_str(s, "cl"), p[5], f"${price:,.2f}", cs])
        exp.append(lot(p, s, price=price, price_unit="case", currency="USD", bpc=bpc, customs_status=cs))
    wb.save(os.path.join(FILES, name)); save_expected(name, "offer", "xlsx", exp)


# ---------------------------------------------------------------------------
# 02  Big 1000-row list, letterhead, merged header, category separator rows
# ---------------------------------------------------------------------------
def s02():
    name = "02_oostkade_drinks_1000_rows.xlsx"
    wb = Workbook(); ws = wb.active; ws.title = "STOCK LIST"
    ws["A1"] = "OOSTKADE DRINKS B.V. (fictional)"; ws["A1"].font = Font(bold=True, size=16)
    ws["A2"] = "Stocklist week 45 - all prices EUR per case, EXW Rotterdam bonded warehouse, T1 unless stated"
    ws["A3"] = "Offer valid 7 days, subject to prior sale"
    ws.merge_cells("A5:C5"); ws["A5"] = "PRODUCT"
    ws.merge_cells("D5:G5"); ws["D5"] = "SPECIFICATION"
    ws.merge_cells("H5:I5"); ws["H5"] = "COMMERCIAL"
    cols = ["Brand", "Description", "Category", "Size", "Btl/Cs", "% Vol", "GBX/NGBX", "EUR/cs", "Qty (cs)"]
    for i, c in enumerate(cols, 1): ws.cell(row=6, column=i, value=c)
    header_style(ws, 5, 9); header_style(ws, 6, 9)
    rows = table_rows(1000, "EUR", "case", packaging=True)
    rows.sort(key=lambda r: (r[0][2], r[0][0]))
    exp, cur_cat = [], None
    for p, s, bpc, pack, price in rows:
        if p[2] != cur_cat:
            cur_cat = p[2]; ws.append([cur_cat.upper()]); ws.cell(row=ws.max_row, column=1).font = Font(bold=True)
        qty = random.choice([28, 56, 84, 112, 150, 224, 300, 560])
        desc = random.choice(p[8]).replace(p[0], "").strip() or p[1]
        ws.append([p[0], desc, p[2].title(), size_str(s, "L"), bpc, p[5], pack or "", round(price, 2), qty])
        exp.append(lot(p, s, price=price, price_unit="case", currency="EUR", bpc=bpc, packaging=pack,
                       quantity=qty, quantity_unit="cases", customs_status="T1", incoterm="EXW",
                       warehouse_city="Rotterdam"))
    ws.append([]); ws.append(["Remarks: pallet = 84 cs for 70cl. Pick-up Mon-Fri. Errors & omissions excepted."])
    wb.save(os.path.join(FILES, name))
    save_expected(name, "offer", "xlsx", exp, currency="EUR", incoterm="EXW", customs_status="T1", warehouse_city="Rotterdam")


# ---------------------------------------------------------------------------
# 03  German headers, one sheet per category, EUR per bottle
# ---------------------------------------------------------------------------
def s03():
    name = "03_brennhaus_handel_multisheet_de.xlsx"
    wb = Workbook(); wb.remove(wb.active)
    rows = table_rows(200, "EUR", "bottle")
    cats = {}
    for r in rows: cats.setdefault(r[0][2], []).append(r)
    exp = []
    for cat in sorted(cats):
        ws = wb.create_sheet(cat.title())
        ws.append(["Brennhaus Handels GmbH (fiktiv) - Angebot, Preise pro Flasche netto, unverzollt T1, ab Lager Hamburg"])
        ws.append([])
        cols = ["Artikel", "Inhalt", "Vol.-%", "Fl./Kt.", "Preis/Fl. EUR", "Verfügbarkeit"]
        ws.append(cols); header_style(ws, 3, len(cols))
        for p, s, bpc, _, price in cats[cat]:
            avail = random.choice(["sofort", "sofort", "2 Wochen", "3-4 Wochen"])
            ws.append([random.choice(p[8]), size_str(s, "Lcomma"), str(p[5]).replace(".", ","), bpc,
                       f"{price:.2f}".replace(".", ","), avail])
            days = {"sofort": 0, "2 Wochen": 14, "3-4 Wochen": 21}[avail]
            exp.append(lot(p, s, price=price, price_unit="bottle", currency="EUR", bpc=bpc,
                           customs_status="T1", incoterm="EXW", warehouse_city="Hamburg", lead_time_days=days))
    wb.save(os.path.join(FILES, name))
    save_expected(name, "offer", "xlsx", exp, currency="EUR", incoterm="EXW", customs_status="T1", warehouse_city="Hamburg")


# ---------------------------------------------------------------------------
# 04  European CSV: semicolons, comma decimals, size as "0,7"
# ---------------------------------------------------------------------------
def s04():
    name = "04_tallow_finch_semicolon.csv"
    exp = []
    with open(os.path.join(FILES, name), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(["Omschrijving", "Inhoud", "Alc", "Fles/doos", "Prijs per doos", "Status", "Levertijd"])
        for p, s, bpc, _, price in table_rows(300, "EUR", "case"):
            cs = random.choice(["T1", "T2"])
            lt = random.choice(["prompt", "prompt", "1 week", "2-3 wks"])
            w.writerow([random.choice(p[8]), size_str(s, "dec").replace(".", ","), f"{p[5]:g}".replace(".", ","),
                        bpc, f"{price:.2f}".replace(".", ","), cs, lt])
            exp.append(lot(p, s, price=price, price_unit="case", currency="EUR", bpc=bpc, customs_status=cs,
                           lead_time_days={"prompt": 0, "1 week": 7, "2-3 wks": 14}[lt]))
    save_expected(name, "offer", "csv", exp)


# ---------------------------------------------------------------------------
# 05  Comma CSV, USD per bottle with $ sign, size "70CL", FOB Singapore
# ---------------------------------------------------------------------------
def s05():
    name = "05_marigold_supply_usd_btl.csv"
    exp = []
    with open(os.path.join(FILES, name), "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["SKU", "ITEM", "SIZE", "ALC%", "PACK", "USD/BTL", "TERMS"])
        for i, (p, s, bpc, pack, price) in enumerate(table_rows(150, "USD", "bottle", packaging=True), 1):
            w.writerow([f"MG-{1000+i}", random.choice(p[8]).upper(), size_str(s, "CL"), f"{p[5]:g}%",
                        f"{bpc}x{s}cl {pack or ''}".strip(), f"${price:.2f}", "FOB SIN"])
            exp.append(lot(p, s, price=price, price_unit="bottle", currency="USD", bpc=bpc, packaging=pack,
                           incoterm="FOB", warehouse_city="Singapore"))
    save_expected(name, "offer", "csv", exp, currency="USD", incoterm="FOB", warehouse_city="Singapore")


# ---------------------------------------------------------------------------
# 06  PDF price list (table)
# ---------------------------------------------------------------------------
def s06():
    name = "06_heron_lane_pricelist.pdf"
    doc = SimpleDocTemplate(os.path.join(FILES, name), pagesize=landscape(A4))
    st = getSampleStyleSheet()
    story = [Paragraph("HERON LANE SPIRITS LTD (fictional) - PRICE LIST", st["Title"]),
             Paragraph("All prices in EUR per case. Delivered DAP Antwerp. T2 goods. Validity: 14 days.", st["Normal"]),
             Spacer(1, 12)]
    data = [["Product", "Size", "ABV", "Btl/Cs", "Pack", "EUR / Case"]]
    exp = []
    for p, s, bpc, pack, price in table_rows(60, "EUR", "case", packaging=True):
        data.append([random.choice(p[8]), size_str(s, "cl"), f"{p[5]:g}%", str(bpc), pack or "-", f"{price:,.2f}"])
        exp.append(lot(p, s, price=price, price_unit="case", currency="EUR", bpc=bpc, packaging=pack,
                       customs_status="T2", incoterm="DAP", warehouse_city="Antwerp"))
    t = Table(data, repeatRows=1)
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1F3864")),
                           ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                           ("GRID", (0, 0), (-1, -1), 0.25, colors.grey), ("FONTSIZE", (0, 0), (-1, -1), 8)]))
    story.append(t)
    doc.build(story)
    save_expected(name, "offer", "pdf", exp, currency="EUR", incoterm="DAP", customs_status="T2", warehouse_city="Antwerp")


# ---------------------------------------------------------------------------
# 07  Size inside the product name (the exception), messy price formats
# ---------------------------------------------------------------------------
def s07():
    name = "07_lindqvist_size_in_name.xlsx"
    wb = Workbook(); ws = wb.active
    ws.append(["Item", "Bottles", "Alc", "Price", "Customs"]); header_style(ws, 1, 5)
    exp = []
    for p, s, bpc, pack, price in table_rows(100, "EUR", "case", packaging=True):
        item = f"{random.choice(p[8])} {size_str(s, 'mixed')}" + (f" {pack}" if pack else "")
        ws.append([item, f"{bpc}x", f"{p[5]:g}", f"€ {price:.2f}".replace(".", ",") + " /cs", "T1"])
        exp.append(lot(p, s, price=price, price_unit="case", currency="EUR", bpc=bpc, packaging=pack, customs_status="T1"))
    wb.save(os.path.join(FILES, name)); save_expected(name, "offer", "xlsx", exp, customs_status="T1")


# ---------------------------------------------------------------------------
# 08  Messy table: empty columns, notes, quantities in FTL/pallets, lead times
# ---------------------------------------------------------------------------
def s08():
    name = "08_vesper_quay_messy_table.xlsx"
    wb = Workbook(); ws = wb.active
    ws.append(["VESPER QUAY TRADING (fictional)", None, None, None, "Tel +00 000 000"])
    ws.append(["Updated:", "05/11"])
    ws.append([])
    ws.append(["Description", None, "cfg", "abv", None, "price", "avail", "qty", "remarks"])
    exp = []
    for p, s, bpc, pack, price in table_rows(80, "EUR", "case", packaging=True):
        qty, unit = random.choice([(1, "FTL"), (2, "FTL"), (5, "pallets"), (10, "pallets"), (300, "cs")])
        av = random.choice(["prompt", "ex stock", "2 wks", "4-5 wks"])
        rem = random.choice(["", "", "coded", "uncoded", "refill", "UK spec", "EU labels", "TR"])
        ws.append([random.choice(p[8]), None, f"{bpc}/{s}/{p[5]:g}", None, None, f"{price:.2f}€",
                   av, f"{qty} {unit}", (pack + " " if pack else "") + rem])
        extra = dict(lead_time_days={"prompt": 0, "ex stock": 0, "2 wks": 14, "4-5 wks": 28}[av],
                     quantity=qty, quantity_unit={"FTL": "ftl", "pallets": "pallets", "cs": "cases"}[unit])
        if rem == "coded": extra["is_coded"] = True
        if rem == "uncoded": extra["is_coded"] = False
        if rem == "refill": extra["is_refillable"] = True
        if rem == "UK spec": extra["market_spec"] = "UK"
        if rem == "EU labels": extra["market_spec"] = "EU"
        if rem == "TR": extra["market_spec"] = "TR"
        exp.append(lot(p, s, price=price, price_unit="case", currency="EUR", bpc=bpc, packaging=pack, **extra))
    wb.save(os.path.join(FILES, name)); save_expected(name, "offer", "xlsx", exp)


# ---------------------------------------------------------------------------
# Messy text samples (emails, WhatsApp). Written by hand line by line.
# ---------------------------------------------------------------------------
def g(brand, name_):
    return next(p for p in P if p[0] == brand and p[1] == name_)


def text_sample(name, side, source_type, text, lots_, **defaults):
    with open(os.path.join(FILES, name), "w", encoding="utf-8") as f: f.write(text)
    save_expected(name, side, source_type, lots_, **defaults)


def messy():
    JWR, JWB = g("Johnnie Walker", "Red Label"), g("Johnnie Walker", "Black Label")
    JD, JAM = g("Jack Daniel's", "Old No.7"), g("Jameson", "Irish Whiskey")
    ABS, SMI = g("Absolut", "Vodka"), g("Smirnoff", "Red")
    BAC, HVS = g("Bacardi", "Carta Blanca"), g("Hennessy", "VS")
    BAI, JAG = g("Baileys", "Original Irish Cream"), g("Jägermeister", "Original")
    CH12, BOM = g("Chivas Regal", "12 Year Old"), g("Bombay Sapphire", "London Dry Gin")
    GG, MAR = g("Grey Goose", "Vodka"), g("Martell", "VS")
    BAL12, MAC = g("Balvenie", "12 Year Old American Oak"), g("Macallan", "12 Year Old Double Cask")
    CAP, APE = g("Captain Morgan", "Spiced Gold"), g("Aperol", "Aperitivo")

    # 09 plain English email
    text_sample("09_email_plain_en.txt", "offer", "email", """From: Daniel <sales@kestrel-bay.example>
Subject: Offer - prompt goods Riga

Hi all,

Please find below our offer, all goods T2, EXW Riga, prices per case in EUR.

JW Red 12x1L 40% NGBX - 101.50 / cs - 3 pallets
Jameson 6x70cl 40% GBX - 72.00 / cs - 1 FTL
Absolut Blue 12/100/40 - 98.40 / cs
Bacardi Carta Blanca 6x70 37.5% - 51.90 / cs - prompt
Hennessy VS 12x70cl 40 GBX - 316.00/cs, 2-3 weeks

Offer valid until Friday. Subject to prior sale.

Best regards,
Daniel
Kestrel Bay Spirits (fictional)
""", [
        lot(JWR, 100, price=101.50, price_unit="case", currency="EUR", bpc=12, packaging="NGBX", quantity=3, quantity_unit="pallets"),
        lot(JAM, 70, price=72.00, price_unit="case", currency="EUR", bpc=6, packaging="GBX", quantity=1, quantity_unit="ftl"),
        lot(ABS, 100, price=98.40, price_unit="case", currency="EUR", bpc=12),
        lot(BAC, 70, price=51.90, price_unit="case", currency="EUR", bpc=6, lead_time_days=0),
        lot(HVS, 70, price=316.00, price_unit="case", currency="EUR", bpc=12, packaging="GBX", lead_time_days=14),
    ], currency="EUR", incoterm="EXW", customs_status="T2", warehouse_city="Riga")

    # 10 German email
    text_sample("10_email_de.txt", "offer", "email", """Betreff: Angebot KW45

Hallo zusammen,

anbei unser aktuelles Angebot. Preise pro Flasche, netto, unverzollt (T1), ab Lager Hamburg.

- Jägermeister 0,7L 35% 6er Karton - 10,85 EUR/Fl.
- Baileys Original 1,0L 17% 12er - 13,40 EUR/Fl.
- Chivas Regal 12 J. 0,7L 40% mit GP - 19,20 EUR/Fl., 2 Paletten
- Smirnoff Red 1L 37,5% 12er Kt. - 9,05 EUR/Fl.
- Bombay Sapphire 1,75L 40% 6er - 27,60 EUR/Fl., Lieferzeit ca. 3 Wochen

Gültig 7 Tage.

Mit freundlichen Grüßen
Brennhaus Handels GmbH (fiktiv)
""", [
        lot(JAG, 70, price=10.85, price_unit="bottle", currency="EUR", bpc=6),
        lot(BAI, 100, price=13.40, price_unit="bottle", currency="EUR", bpc=12),
        lot(CH12, 70, price=19.20, price_unit="bottle", currency="EUR", bpc=6, packaging="GBX", quantity=2, quantity_unit="pallets"),
        lot(SMI, 100, price=9.05, price_unit="bottle", currency="EUR", bpc=12),
        lot(BOM, 175, price=27.60, price_unit="bottle", currency="EUR", bpc=6, lead_time_days=21),
    ], currency="EUR", incoterm="EXW", customs_status="T1", warehouse_city="Hamburg")

    # 11 WhatsApp with a correction
    text_sample("11_whatsapp_correction.txt", "offer", "whatsapp", """[05/11/2026, 09:12] Mark VQ: morning! fresh stock in Antwerp T1
[05/11/2026, 09:12] Mark VQ: jw red 12x1L 40 ngbx 8.95e
[05/11/2026, 09:13] Mark VQ: jd 6x70 gbx 13.80e/btl 🔥
[05/11/2026, 09:13] Mark VQ: grey goose 6x70 40% 23.10
[05/11/2026, 09:15] Mark VQ: sorry gg is 23.40 not 23.10
[05/11/2026, 09:16] Mark VQ: all exw antwerp, prices per bottle euro
[05/11/2026, 09:20] Buyer: ok thx, how many jd?
[05/11/2026, 09:21] Mark VQ: 2 pallets jd
""", [
        lot(JWR, 100, price=8.95, price_unit="bottle", currency="EUR", bpc=12, packaging="NGBX"),
        lot(JD, 70, price=13.80, price_unit="bottle", currency="EUR", bpc=6, packaging="GBX", quantity=2, quantity_unit="pallets", abv=None),
        lot(GG, 70, price=23.40, price_unit="bottle", currency="EUR", bpc=6),
    ], currency="EUR", incoterm="EXW", customs_status="T1", warehouse_city="Antwerp")

    # 12 Forwarded email chain
    text_sample("12_email_forwarded.txt", "offer", "email", """---------- Forwarded message ---------
From: Ana <ana@heron-lane.example>
Date: Wed, 4 Nov 2026
Subject: RE: RE: availability

Dear partner, as discussed on the phone:

> Do you still have the Martell?

Yes, Martell VS 12x70cl 40% GBX at USD 262 per case, CIF Singapore, T2.
Also Macallan 12 Double Cask 6x70 40% GBX USD 335/cs, same terms, 4-5 weeks.
And Balvenie 12y american oak 6x70 43% USD 192/cs.

Kind regards, Ana
Heron Lane Spirits (fictional)
""", [
        lot(MAR, 70, price=262, price_unit="case", currency="USD", bpc=12, packaging="GBX"),
        lot(MAC, 70, price=335, price_unit="case", currency="USD", bpc=6, packaging="GBX", lead_time_days=28),
        lot(BAL12, 70, price=192, price_unit="case", currency="USD", bpc=6),
    ], currency="USD", incoterm="CIF", customs_status="T2", warehouse_city="Singapore")

    # 13 Pasted from Excel with tabs and typos
    text_sample("13_pasted_tabs_typos.txt", "offer", "text", "\t".join(["Product", "Cfg", "ABV", "EUR/cs"]) + "\n" + "\n".join([
        "Jamsen\t12x100\t40\t131.20",
        "Jonnie Walker Black 12y\t12x70cl\t40\t228.00",
        "Absolut\t24x35cl\t40\t110.40",
        "Captian Morgan Spiced\t6x70\t35\t60.10",
        "Aperol\t6x100\t11\t66.90",
        "Hennesy VS\t12x70\t40\t298.50",
    ]) + "\n", [
        lot(JAM, 100, price=131.20, price_unit="case", currency="EUR", bpc=12),
        lot(JWB, 70, price=228.00, price_unit="case", currency="EUR", bpc=12),
        lot(ABS, 35, price=110.40, price_unit="case", currency="EUR", bpc=24),
        lot(CAP, 70, price=60.10, price_unit="case", currency="EUR", bpc=6),
        lot(APE, 100, price=66.90, price_unit="case", currency="EUR", bpc=6),
        lot(HVS, 70, price=298.50, price_unit="case", currency="EUR", bpc=12),
    ], currency="EUR")

    # 14 Heavy abbreviations, mixed currencies
    text_sample("14_abbreviations_mixed_currency.txt", "offer", "text", """JD OLD7 70/40 6x NGBX ref EU T1 exw Antwerp 11.40e/btl 3 FTL prompt
JWB 12YO 12/100/40 GBX non-ref UK spec T2 FCA Rotterdam USD 26.90/btl
ABS 6/175/40 NGBX T1 DAP Riga 205.20 EUR/cs ex-stock
BACARDI CB 12/100/37.5 T2 exw Hamburg $11.15/btl 2-3wks
HENN VS 24/35/40 GBX T1 exw Antwerp EUR 14.20 p/btl uncoded
""", [
        lot(JD, 70, price=11.40, price_unit="bottle", currency="EUR", bpc=6, packaging="NGBX", is_refillable=True, market_spec="EU",
            customs_status="T1", incoterm="EXW", warehouse_city="Antwerp", quantity=3, quantity_unit="ftl", lead_time_days=0),
        lot(JWB, 100, price=26.90, price_unit="bottle", currency="USD", bpc=12, packaging="GBX", is_refillable=False, market_spec="UK",
            customs_status="T2", incoterm="FCA", warehouse_city="Rotterdam"),
        lot(ABS, 175, price=205.20, price_unit="case", currency="EUR", bpc=6, packaging="NGBX", customs_status="T1", incoterm="DAP",
            warehouse_city="Riga", lead_time_days=0),
        lot(BAC, 100, price=11.15, price_unit="bottle", currency="USD", bpc=12, customs_status="T2", incoterm="EXW",
            warehouse_city="Hamburg", lead_time_days=14),
        lot(HVS, 35, price=14.20, price_unit="bottle", currency="EUR", bpc=24, packaging="GBX", is_coded=False, customs_status="T1",
            incoterm="EXW", warehouse_city="Antwerp"),
    ])

    # 16 Buyer wanted list (request side)
    text_sample("16_wanted_list_request.txt", "request", "email", """Subject: WTB - urgent

Hi, we are looking for the following, T2, CIF Singapore, max 3 weeks lead time:

- JW Black 12y 12x1L, up to 2 FTL, target 24.50 USD/btl
- Hennessy VSOP 12x70cl GBX, 500 cs, best price
- Chivas 12 6x70, 3 pallets, max USD 19.00/btl
- Grey Goose 6x1L 40%, 1 FTL

Please send your best offers.
Marigold Duty Free Supply (fictional)
""", [
        lot(JWB, 100, price=24.50, price_unit="bottle", currency="USD", bpc=12, quantity=2, quantity_unit="ftl", abv=None),
        lot(g("Hennessy", "VSOP"), 70, price=None, price_unit=None, currency=None, bpc=12, packaging="GBX", quantity=500, quantity_unit="cases", abv=None),
        lot(CH12, 70, price=19.00, price_unit="bottle", currency="USD", bpc=6, quantity=3, quantity_unit="pallets", abv=None),
        lot(GG, 100, price=None, price_unit=None, currency=None, bpc=6, quantity=1, quantity_unit="ftl"),
    ], customs_status="T2", incoterm="CIF", warehouse_city="Singapore", lead_time_days=21)


def lot_none_safe():
    # allow price=None in lot() for requests
    global lot
    orig = lot
    def wrapped(p, size, *, price, price_unit, currency, bpc=None, packaging=None, **extra):
        d = orig(p, size, price=price or 0, price_unit=price_unit, currency=currency, bpc=bpc, packaging=packaging, **extra)
        if price is None: d.pop("price", None)
        return d
    lot = wrapped


# ---------------------------------------------------------------------------
# 15  Screenshot image of a small table (tests reading pictures)
# ---------------------------------------------------------------------------
def s15():
    name = "15_screenshot_table.png"
    rows = table_rows(15, "EUR", "case")
    font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 15)
    bold = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 15)
    img = Image.new("RGB", (900, 60 + 26 * (len(rows) + 2)), "white")
    d = ImageDraw.Draw(img)
    d.text((20, 15), "Stock offer - EUR per case - EXW Rotterdam - T1", font=bold, fill="black")
    xs = [20, 420, 520, 600, 700]
    for x, h in zip(xs, ["Product", "Size", "ABV", "Btl/cs", "EUR/cs"]):
        d.text((x, 50), h, font=bold, fill="black")
    exp = []
    for i, (p, s, bpc, _, price) in enumerate(rows):
        y = 78 + i * 26
        for x, v in zip(xs, [random.choice(p[8]), size_str(s, "cl"), f"{p[5]:g}%", str(bpc), f"{price:.2f}"]):
            d.text((x, y), v, font=font, fill="black")
        exp.append(lot(p, s, price=price, price_unit="case", currency="EUR", bpc=bpc,
                       customs_status="T1", incoterm="EXW", warehouse_city="Rotterdam"))
    img.save(os.path.join(FILES, name))
    save_expected(name, "offer", "image", exp, currency="EUR", incoterm="EXW", customs_status="T1", warehouse_city="Rotterdam")


if __name__ == "__main__":
    for f in os.listdir(FILES): os.remove(os.path.join(FILES, f))
    for f in os.listdir(EXPECTED): os.remove(os.path.join(EXPECTED, f))
    s01(); s02(); s03(); s04(); s05(); s06(); s07(); s08()
    lot_none_safe(); messy(); s15()
    for f in sorted(os.listdir(EXPECTED)):
        n = len(json.load(open(os.path.join(EXPECTED, f)))["lots"])
        print(f"{f:45s} {n:5d} lots")
