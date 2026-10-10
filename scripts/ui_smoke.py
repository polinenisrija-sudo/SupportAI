"""Drive the real UI end-to-end and capture screenshots (used for verification + README images)."""
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8000"
OUT = Path(__file__).resolve().parent.parent / "docs" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)
email = f"demo{int(time.time())}@example.com"
errors = []

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 900})
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and errors.append(m.text))

    pg.goto(BASE + "/signup")
    pg.screenshot(path=OUT / "01_signup.png")
    pg.fill('input[placeholder="Northwind Outfitters"]', "Northwind Outfitters")
    pg.fill('input[type="email"]', email)
    pg.fill('input[type="password"]', "secret12")
    pg.click("button:has-text('Create account')")
    pg.wait_for_url(BASE + "/")
    pg.wait_for_selector("text=Add your first knowledge source")
    pg.screenshot(path=OUT / "02_empty_overview.png")

    pg.goto(BASE + "/knowledge")
    pg.click("text=Load sample data")
    pg.wait_for_selector("text=shipping_policy.md", timeout=90000)
    pg.screenshot(path=OUT / "03_knowledge.png")

    pg.goto(BASE + "/playground")
    for q in ["How much is standard shipping?", "How do I wash a down sleeping bag?", "Do you sell gift wrapping paper?", "Can you gift wrap my order?", "Is gift wrap available?"]:
        pg.fill('input[placeholder^="Ask a customer"]', q)
        pg.keyboard.press("Enter")
        time.sleep(0.5)
        pg.wait_for_selector(".dotty", state="detached", timeout=60000)
        time.sleep(0.8)
    pg.screenshot(path=OUT / "04_playground.png")

    pg.goto(BASE + "/gaps")
    pg.wait_for_selector("text=Recommended FAQ", timeout=30000)
    pg.screenshot(path=OUT / "05_gaps.png")
    pg.fill("textarea", "Yes! Gift wrapping is available at checkout for $4 per item.")
    pg.click("text=Publish to knowledge base")
    pg.wait_for_selector("text=No gaps detected", timeout=60000)

    pg.goto(BASE + "/evaluation")
    pg.click("button:has-text('Run evaluation')")
    pg.wait_for_selector("text=Retrieval hit@3", timeout=120000)
    time.sleep(0.5)
    pg.screenshot(path=OUT / "06_evaluation.png", full_page=True)

    pg.goto(BASE + "/")
    pg.wait_for_selector("text=Questions per day")
    pg.screenshot(path=OUT / "07_overview.png", full_page=True)

    pg.goto(BASE + "/conversations")
    pg.wait_for_selector("text=turns")
    pg.click("text=turns >> nth=0")
    time.sleep(0.6)
    pg.screenshot(path=OUT / "08_conversations.png")

    pg.goto(BASE + "/deploy")
    pg.wait_for_selector("text=widget.js")
    pg.screenshot(path=OUT / "09_deploy.png", full_page=True)
    bot = pg.evaluate("document.querySelector('pre').innerText").split('data-bot-id="')[1].split('"')[0]

    # Embedded widget on the demo storefront
    w = b.new_page(viewport={"width": 1280, "height": 800})
    w.on("pageerror", lambda e: errors.append("widget: " + str(e)))
    w.goto(f"{BASE}/demo-site?bot={bot}")
    w.wait_for_selector("#supportai-root", state="attached")
    w.locator("#supportai-root >> .launcher").click()
    w.locator("#supportai-root >> .bar input").fill("What is the refund timeline?")
    w.keyboard.press("Enter")
    w.locator("#supportai-root >> .chip").first.wait_for(timeout=30000)
    w.locator("#supportai-root >> .chip").first.click()
    w.locator("#supportai-root >> .bar input").fill("Who is the CEO?")
    w.keyboard.press("Enter")
    w.locator("#supportai-root >> text=Talk to a human").wait_for(timeout=30000)
    w.locator("#supportai-root >> text=Talk to a human").click()
    w.locator("#supportai-root >> .e").fill("customer@example.com")
    time.sleep(0.4)
    w.screenshot(path=OUT / "10_widget.png")
    w.locator("#supportai-root >> text=Send to support").click()
    w.wait_for_selector("text=Thanks!", timeout=10000) if False else time.sleep(1)

    pg.goto(BASE + "/handoffs")
    pg.wait_for_selector("text=customer@example.com", timeout=15000)
    pg.screenshot(path=OUT / "11_handoffs.png")
    b.close()

print("console/page errors:", errors or "none")
print("screenshots in", OUT)
