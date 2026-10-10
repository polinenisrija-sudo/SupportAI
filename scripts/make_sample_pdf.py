"""Generates data/sample_kb/product_care_guide.pdf (a 2-page PDF so citations show real page numbers)."""
from pathlib import Path

import pymupdf

PAGES = [
    [
        ("Cleaning Your Tent", "Clean your tent with lukewarm water and a soft sponge. Never use detergent, bleach, or a washing machine because these strip the waterproof coating. Allow the tent to dry completely before storing it to prevent mildew."),
        ("Re-waterproofing", "Re-apply a seam sealer every 2 years or after heavy use. Spray-on waterproofing treatments should be applied outdoors in a ventilated area and allowed to cure for 24 hours."),
    ],
    [
        ("Caring for Sleeping Bags", "Wash down sleeping bags in a front-loading machine using a down-specific cleaner on a gentle cycle. Tumble dry on low heat with two clean tennis balls to restore loft. Store the bag loosely in the large cotton sack, never compressed."),
        ("Boot Maintenance", "Brush off dirt after every hike and condition leather boots with wax every 3 months. Remove insoles and let boots air dry away from direct heat, since heat can crack leather and weaken adhesives."),
    ],
]

doc = pymupdf.open()
for secs in PAGES:
    page = doc.new_page()
    y = 72
    page.insert_text((72, y), "Product Care Guide", fontsize=20, fontname="helv")
    y += 44
    for heading, body in secs:
        page.insert_text((72, y), heading, fontsize=14, fontname="helv")
        y += 24
        page.insert_textbox(pymupdf.Rect(72, y, 520, y + 110), body, fontsize=11, fontname="helv")
        y += 130
out = Path(__file__).resolve().parent.parent / "data" / "sample_kb" / "product_care_guide.pdf"
doc.save(out)
print("wrote", out)
