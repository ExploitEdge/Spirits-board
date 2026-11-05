// Trade knowledge shared by every prompt. Edit this when you notice the AI
// misreading a piece of jargon; it's the cheapest way to improve accuracy.

export const GLOSSARY = `
Parallel / grey-market spirits trade notation (B2B, all goods duty-suspended):
- Case configuration: "6x70cl" = 6 bottles of 70cl per case. "12/100/40" = 12 bottles x 100cl x 40% ABV.
  "6x70" without unit = 6 x 70cl. "12x1L" = 12 x 100cl. "24x35" = 24 x 35cl. "6x" alone = 6 bottles per case.
- Bottle sizes are normalised to centilitres: 0.2L=20, 0.35L=35, 0.5L=50, 0.7L=70, 0.75L=75, 1L=100, 1.5L=150, 1.75L=175, 3L=300.
  European decimals use commas: "0,7" = 0.7L = 70cl. "700ml" = 70cl.
- Packaging: GBX / GB / "gift box" / German "mit GP" (Geschenkpackung) = GBX. NGBX / "no gift box" / "ohne GP" = NGBX. TIN = tin.
- Coded / uncoded: whether the batch codes are intact. "Uncoded" or "decoded" = codes removed.
- Refill / ref = refillable bottle; non-ref / non-refill = non-refillable.
- Market spec / labels: EU, UK, US, TR (travel retail / duty free), ASIA.
- Customs status: T1 (non-EU goods under transit) or T2 (EU goods under duty suspension). German "unverzollt" = duty-suspended.
- Incoterms: EXW (also "ex works", "ex warehouse", German "ab Lager"), FCA, FOB, CNF (also written C&F or CFR), CIF, DAP, DDP.
- Quantity: cs = cases, btl = bottles, plt/pallets, FTL = full truck load.
- Lead time: "prompt", "ex stock", "spot", German "sofort" = available now (0 days). "2-3 wks" = 2 to 3 weeks.
- Prices: "8.95e" or "8,95 €" = 8.95 EUR. "/cs", "p/cs", "per case", "pro Karton" = per case. "/btl", "pro Fl." = per bottle.
- Common abbreviations: JW = Johnnie Walker, JD = Jack Daniel's, JWB = Johnnie Walker Black Label, ABS = Absolut,
  HENN = Hennessy, CB = Carta Blanca, GG = Grey Goose, DW = DoubleWood, YO / y / yrs / J. (German Jahre) = years old.
`.trim();

export const PRODUCT_CONVENTIONS = `
Product naming conventions (so the same product always gets the same name):
- brand: the official brand name with its real spelling, accents and apostrophes, e.g. "Jack Daniel's", "Jägermeister",
  "Rémy Martin", "Patrón", "Ballantine's", "Gordon's", "Hendrick's", "Diplomático", "Johnnie Walker".
- product_name: the expression's name without the brand, in Title Case, e.g. "Red Label", "Black Label", "Old No.7",
  "12 Year Old", "Carta Blanca", "VSOP", "Spiced Gold". For a brand's core product use its generic name, e.g. Jameson ->
  "Irish Whiskey", Absolut -> "Vodka", Gordon's -> "London Dry Gin", Baileys -> "Original Irish Cream".
- age_statement: "12YO", "18YO", or null if there is no age statement.
- edition: a named edition or label colour if the product has one (e.g. "Black Label", "Double Cask", "VS"), else null.
- category: one of whisky, vodka, rum, gin, cognac, brandy, tequila, mezcal, liqueur, champagne, wine, other.
- Fix typos ("Jamsen" -> Jameson, "Hennesy" -> Hennessy). Do not include size, ABV, packaging or case configuration in names.
`.trim();
