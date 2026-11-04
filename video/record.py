"""Kvit demo video: records the real flow on kvit-cash.pages.dev (chipnet) with a real signing
WizardConnect test wallet, then lays edge-tts narration over it.

    python3 video/record.py            -> video/out/kvit-demo.mp4
"""
import json, os, re, subprocess, sys, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "out"
OUT.mkdir(exist_ok=True)
APP = ROOT.parent / "app"
EDGE = "/data/venvs/edge-tts/bin/edge-tts"
VOICE = "en-US-AndrewNeural"
SITE = "https://kvit-cash.pages.dev/"
PAYEE = "bchtest:qphttjspkwj8vucxcj07y5jvqlgrxxfx5sdh2hhdcm"  # our own chipnet test wallet, receive/3

LINES = {
    "s1": "This is Kvit: a payment link for Bitcoin Cash. A freelancer types a name, a BCH address and an amount in dollars.",
    "s2": "One click makes the ticket. Send it as a link or a QR code.",
    "s3": "The client opens the link. Any BCH wallet can pay it from the QR, or they can pay with WizardConnect.",
    "s4": "WizardConnect pairs the wallet with one scan. Here a chipnet test wallet connects.",
    "s5": "Kvit reads the balance from the wallet's public keys and builds the transaction right in the browser.",
    "s6": "The wallet signs, Kvit broadcasts, and the ticket punches itself paid.",
    "s7": "The receipt carries the transaction and the block. Anyone holding the link sees the same proof. No account, no server, no custody.",
    "s8": "Judges can try it on mainnet now with the tip jar ticket, at kvit cash dot pages dot dev.",
}


def tts(key, text):
    mp3 = OUT / f"{key}.mp3"
    for attempt in range(6):
        if mp3.exists() and mp3.stat().st_size > 1000:
            break
        r = subprocess.run([EDGE, "--voice", VOICE, "--rate=+4%", "--text", text, "--write-media", str(mp3)],
                           capture_output=True, text=True)
        if r.returncode != 0:
            print("edge-tts retry", key, r.stderr[-200:], file=sys.stderr)
            time.sleep(4 + attempt * 4)
    else:
        raise SystemExit("edge-tts failed for " + key)
    d = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(mp3)],
                             capture_output=True, text=True).stdout.strip())
    return mp3, d


CAPTION_JS = """(t) => {
  let el = document.getElementById('__cap');
  if (!el) { el = document.createElement('div'); el.id='__cap';
    el.style.cssText='position:fixed;left:50%;top:6px;transform:translateX(-50%);max-width:880px;z-index:99999;background:rgba(10,11,14,.86);color:#E4E7EB;font:500 20px/1.35 "Spline Sans",sans-serif;padding:12px 18px;border-radius:12px;border:1px solid #2A2F38;text-align:center;pointer-events:none;transition:opacity .25s';
    document.body.appendChild(el); }
  el.textContent = t; el.style.opacity = t ? 1 : 0;
}"""


def main():
    clips = {k: tts(k, v) for k, v in LINES.items()}
    marks = []
    wallet = None
    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 760}, device_scale_factor=1,
                                  record_video_dir=str(OUT / "raw"), record_video_size={"width": 1280, "height": 760})
        page = ctx.new_page()
        t0 = time.time()

        def scene(key):
            marks.append((key, time.time() - t0))
            page.evaluate(CAPTION_JS, LINES[key])
            return clips[key][1]

        def hold(start, dur, extra=0.4):
            left = dur + extra - (time.time() - start)
            if left > 0:
                page.wait_for_timeout(int(left * 1000))

        page.goto(SITE + "#/", wait_until="networkidle")
        page.evaluate("localStorage.clear()")
        page.reload(wait_until="networkidle")
        page.wait_for_timeout(1200)

        st = time.time(); d = scene("s1")
        page.get_by_role("radio", name=re.compile("Chipnet")).click()
        page.get_by_label("Your name or shop").press_sequentially("Olena Studio", delay=35)
        page.locator("#payto").fill(PAYEE)
        page.get_by_label("Amount").press_sequentially("0.50", delay=80)
        page.get_by_label("What it is for").press_sequentially("Sticker sheet, 12 designs", delay=25)
        hold(st, d)

        st = time.time(); d = scene("s2")
        page.get_by_role("button", name="Create payment link").click()
        page.wait_for_timeout(600)
        page.locator(".ticket").scroll_into_view_if_needed()
        hold(st, d, 1.0)
        href = page.get_by_role("link", name="Open as payer").get_attribute("href")

        st = time.time(); d = scene("s3")
        page.goto(SITE + href, wait_until="networkidle")
        hold(st, d, 0.8)

        st = time.time(); d = scene("s4")
        page.get_by_role("button", name="Pay with WizardConnect").click()
        page.wait_for_timeout(1800)
        uri = page.evaluate("(document.body.innerText.match(/wiz:\\/\\/\\S+/i)||[])[0]")
        wallet = subprocess.Popen(["node", "node_modules/.bin/tsx", "scripts/test-wallet.ts", uri], cwd=APP,
                                  stdout=open(OUT / "wallet.log", "w"), stderr=subprocess.STDOUT)
        page.get_by_role("button", name="Send to wallet for approval").wait_for(timeout=60000)
        hold(st, d)

        st = time.time(); d = scene("s5")
        page.locator(".confirm dl").scroll_into_view_if_needed()
        hold(st, d, 0.6)

        st = time.time(); d = scene("s6")
        page.get_by_role("button", name="Send to wallet for approval").click()
        page.locator(".is-paid").wait_for(timeout=90000)
        hold(st, d, 1.2)

        st = time.time(); d = scene("s7")
        page.locator(".ticket").scroll_into_view_if_needed()
        hold(st, d, 1.0)
        page.screenshot(path=str(OUT / "paid.png"))

        st = time.time(); d = scene("s8")
        page.goto(SITE + "#/", wait_until="networkidle")
        page.get_by_role("button", name=re.compile("tip-jar")).scroll_into_view_if_needed()
        page.wait_for_timeout(800)
        page.get_by_role("button", name=re.compile("tip-jar")).click()
        hold(st, d, 1.5)
        page.evaluate(CAPTION_JS, "")
        page.wait_for_timeout(600)
        raw = page.video.path()
        ctx.close()
        browser.close()
    if wallet and wallet.poll() is None:
        wallet.terminate()
    json.dump(marks, open(OUT / "marks.json", "w"))
    build(raw, marks, clips)


def build(raw, marks, clips):
    total = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", raw],
                                 capture_output=True, text=True).stdout.strip())
    bounds = [m[1] for m in marks] + [total]
    parts, audio, t = [], [], 0.0
    vf = []
    # 0.8 s lead-in from just before the first scene
    lead0 = max(0.0, bounds[0] - 0.8)
    vf.append(f"[0:v]trim={lead0:.3f}:{bounds[0]:.3f},setpts=PTS-STARTPTS[v0]")
    t += bounds[0] - lead0
    for i, (key, at) in enumerate(marks):
        seg = bounds[i + 1] - bounds[i]
        want = clips[key][1] + 0.9
        speed = max(1.0, seg / want) if seg > want else 1.0
        speed = min(speed, 6.0)
        out_len = seg / speed
        vf.append(f"[0:v]trim={bounds[i]:.3f}:{bounds[i+1]:.3f},setpts=(PTS-STARTPTS)/{speed:.4f}[v{i+1}]")
        audio.append((key, t))
        t += out_len
    n = len(marks) + 1
    vf.append("".join(f"[v{i}]" for i in range(n)) + f"concat=n={n}:v=1:a=0[vout]")
    inputs = ["-i", raw]
    for i, (key, at) in enumerate(audio):
        inputs += ["-i", str(clips[key][0])]
        ms = int(at * 1000) + 120
        vf.append(f"[{i+1}:a]adelay={ms}|{ms}[a{i}]")
    vf.append("".join(f"[a{i}]" for i in range(len(audio))) + f"amix=inputs={len(audio)}:normalize=0[aout]")
    final = OUT / "kvit-demo.mp4"
    subprocess.run(["ffmpeg", "-y", *inputs, "-filter_complex", ";".join(vf), "-map", "[vout]", "-map", "[aout]",
                    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", "-preset", "medium", "-r", "30",
                    "-c:a", "aac", "-b:a", "160k", str(final)], check=True, capture_output=True)
    print(final)


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "build":
        clips = {k: tts(k, v) for k, v in LINES.items()}
        build(sys.argv[2], json.load(open(OUT / "marks.json")), clips)
    else:
        main()
