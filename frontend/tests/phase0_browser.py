"""UI smoke check. Requires an independently installed Playwright; no production fixtures."""
import argparse
from io import BytesIO
import json
from pathlib import Path
from urllib.request import urlopen

from PIL import Image
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
IMAGE = ROOT / "data/ladder/0.3/loveda_Train_Rural_images_png_0_gsd0.3.png"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:3001")
    parser.add_argument("--api", default="http://127.0.0.1:8000")
    args = parser.parse_args()

    def history():
        return json.load(urlopen(args.api + "/api/traces"))

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        page.set_default_timeout(15000)
        page.goto(args.url + "/workspace")
        expect(page.get_by_role("button", name="Run analysis", exact=True)).to_be_disabled()
        before = history()
        page.get_by_label("Upload PNG/JPEG").set_input_files(str(IMAGE))
        expect(page.get_by_text("Scene uploaded. Enter a question and plan it.", exact=True)).to_be_visible()
        expect(page.locator("img[alt^='Scene scene_']")).to_be_visible()
        assert page.locator("img[alt^='Scene scene_']").evaluate("(image) => image.complete && image.naturalWidth > 0")
        page.get_by_label("Question", exact=True).fill("Is there a building in this image?")
        page.get_by_role("button", name="Plan", exact=True).click()
        expect(page.get_by_text("Plan ready. Analysis has not run.", exact=True)).to_be_visible()
        assert history() == before
        page.get_by_role("button", name="Run analysis", exact=True).click()
        expect(page.locator("[role=alert]:not(#__next-route-announcer__)")).to_contain_text("Live model inference is unavailable.", timeout=150000)
        assert history() == before
        expect(page.get_by_text("Answer", exact=True)).to_have_count(0)

        page.get_by_role("button", name="Use exact golden demo", exact=True).click()
        page.get_by_role("button", name="Plan", exact=True).click()
        expect(page.get_by_text("Plan ready. Analysis has not run.", exact=True)).to_be_visible()
        page.get_by_role("button", name="Run analysis", exact=True).click()
        expect(page.get_by_text("execution_mode: cached_result", exact=True)).to_be_visible(timeout=150000)
        expect(page.get_by_text("Live inference unavailable", exact=False)).to_be_visible()
        after = history()
        assert after["count"] == before["count"] + 1
        assert after["records"][1:] == before["records"]
        page.get_by_role("button", name="Verify trace chain", exact=True).click()
        expect(page.get_by_text(f"VERIFIED: Chain verified ({after['count']} records)", exact=True)).to_be_visible()
        page.screenshot(path="/tmp/satquery-phase0-workspace.png", full_page=True)
        page.get_by_label("Question", exact=True).fill("Locate the buildings in this image.")
        expect(page.get_by_text("Answer", exact=True)).to_have_count(0)
        expect(page.get_by_role("button", name="Run analysis", exact=True)).to_be_disabled()
        page.get_by_role("button", name="Plan", exact=True).click()
        expect(page.get_by_text("Plan: UNAVAILABLE.", exact=False)).to_be_visible()
        page.get_by_label("Question", exact=True).fill("What changed between these images?")
        page.get_by_role("button", name="Plan", exact=True).click()
        expect(page.get_by_text("Plan: MISSING INPUT.", exact=False)).to_be_visible()
        page.get_by_label("Question", exact=True).fill("... !!!")
        page.get_by_role("button", name="Plan", exact=True).click()
        expect(page.locator("[role=alert]:not(#__next-route-announcer__)")).to_contain_text("INVALID INPUT")

        jpeg = BytesIO()
        with Image.open(IMAGE) as image:
            image.convert("RGB").save(jpeg, format="JPEG")
        page.get_by_label("Upload PNG/JPEG").set_input_files({"name": "scene.jpg", "mimeType": "image/jpeg", "buffer": jpeg.getvalue()})
        expect(page.get_by_text("Scene uploaded. Enter a question and plan it.", exact=True)).to_be_visible()
        page.get_by_label("Upload PNG/JPEG").set_input_files({"name": "bad.txt", "mimeType": "text/plain", "buffer": b"bad"})
        expect(page.locator("[role=alert]:not(#__next-route-announcer__)")).to_contain_text("Only PNG and JPEG")
        assert history() == after
        print("PASS real browser: PNG/JPEG, plan, 503, golden cache, trace, edits, missing input, 422")

        # Synthetic responses below test rendering only; never installed in the application.
        page.get_by_role("button", name="Use exact golden demo", exact=True).click()
        page.get_by_role("button", name="Plan", exact=True).click()
        expect(page.get_by_text("Plan ready. Analysis has not run.", exact=True)).to_be_visible()
        for status, detail, label in [(502, "internal secret exception", "EXECUTION ERROR"), (422, [{"loc": ["body", "question"], "msg": "Field required"}], "INVALID INPUT"), (503, "Live model inference is unavailable.", "UNAVAILABLE")]:
            page.route("**/api/analyze", lambda route, request, status=status, detail=detail: route.fulfill(status=status, json={"detail": detail}))
            page.get_by_role("button", name="Run analysis", exact=True).click()
            expect(page.locator("[role=alert]:not(#__next-route-announcer__)")).to_contain_text(label)
            expect(page.get_by_text("Answer", exact=True)).to_have_count(0)
            assert "internal secret" not in page.locator("body").inner_text()
            page.unroute("**/api/analyze")

        trace = after["records"][0]
        live = {"answer": "TEST LIVE ANSWER", "execution_mode": "live", "results_artifact": None, "model": {"name": trace["model_name"], "version": trace["model_version"]}, "notice": "Test-only live response", "trace": {**trace, "params": {**trace["params"], "execution_mode": "live"}}}
        page.route("**/api/analyze", lambda route: route.fulfill(json=live))
        page.get_by_role("button", name="Run analysis", exact=True).click()
        expect(page.get_by_text("execution_mode: live", exact=True)).to_be_visible()
        page.route("**/api/traces/verify", lambda route: route.fulfill(json={"verified": False, "message": "Test-only invalid chain"}))
        page.get_by_role("button", name="Verify trace chain", exact=True).click()
        expect(page.get_by_text("FAILED: Test-only invalid chain", exact=True)).to_have_class("text-error")
        page.unroute("**/api/traces/verify")
        page.unroute("**/api/analyze")
        assert history() == after
        print("PASS isolated rendering: 502 sanitization, 422 validation arrays, 503, live mode, false verification")

        page.goto(args.url + "/executions")
        page.get_by_role("button", name="Verify chain", exact=True).click()
        expect(page.get_by_text(f"VERIFIED: Chain verified ({after['count']} records)", exact=True)).to_be_visible()
        page.route("**/api/traces/verify", lambda route: route.fulfill(json={"verified": False, "message": "Test-only invalid chain"}))
        page.get_by_role("button", name="Verify chain", exact=True).click()
        expect(page.get_by_text("FAILED: Test-only invalid chain", exact=True)).to_have_class("text-error")
        page.unroute("**/api/traces/verify")
        page.goto(args.url + "/resolution")
        expect(page.get_by_text("MEASURED · Committed evaluation artifact", exact=True)).to_be_visible()
        page.goto(args.url + "/sar")
        expect(page.get_by_text("HUMAN SAR VALIDATION", exact=False)).to_be_visible()
        expect(page.get_by_text("Water", exact=True)).to_be_visible()
        page.goto(args.url + "/system")
        expect(page.get_by_text("grounding ·", exact=False)).to_contain_text("UNAVAILABLE")
        page.set_viewport_size({"width": 390, "height": 844})
        page.goto(args.url + "/workspace")
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        page.route("**/api/scenes", lambda route: route.abort())
        page.get_by_label("Upload PNG/JPEG").set_input_files(str(IMAGE))
        expect(page.locator("[role=alert]:not(#__next-route-announcer__)")).to_contain_text("The API could not be reached")
        page.unroute("**/api/scenes")
        browser.close()
        print("PASS history, resolution, SAR, capability status, mobile layout, network failure")


if __name__ == "__main__":
    main()
