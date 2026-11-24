import os
import re
import subprocess
from PIL import Image

def autocrop(im, bg_color=(5, 6, 13), padding=20):
    # Convert to RGB
    rgb_im = im.convert('RGB')
    bg = Image.new('RGB', rgb_im.size, bg_color)
    from PIL import ImageChops
    diff = ImageChops.difference(rgb_im, bg)
    bbox = diff.getbbox()
    if bbox:
        left = max(0, bbox[0] - padding)
        top = max(0, bbox[1] - padding)
        right = min(im.width, bbox[2] + padding)
        bottom = min(im.height, bbox[3] + padding)
        return im.crop((left, top, right, bottom))
    return im

def main():
    with open('docs/mockup.html', 'r', encoding='utf-8') as f:
        content = f.read()

    # Split header
    wrap_idx = content.find('<div class="wrap">')
    header = content[:wrap_idx]
    
    parts = re.split(r'<!--\s*([0-9]+)\.\s*(.*?)\s*-->', content)
    
    screens = []
    for i in range(1, len(parts), 3):
        num = parts[i]
        title = parts[i+1]
        body = parts[i+2]
        # remove closing tags of wrap or extra html if in last block
        if '</div>\n\n</div>\n</body>' in body or '</div>\n</body>' in body:
            body = body.split('</div>\n\n</div>')[0]
            if not body.strip().endswith('</div>'):
                body = body + '</div>'
        screens.append((num, title, body))

    print(f"Loaded {len(screens)} screens")

    os.makedirs('docs/screenshots', exist_ok=True)
    os.makedirs('/tmp/shots', exist_ok=True)

    filenames = [
        "01-home",
        "02-account-details",
        "03-transactions",
        "04-quick-add",
        "05-sms-review",
        "06-more"
    ]

    chrome_bin = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

    # 1. Render individual screens
    for i, (num, title, body) in enumerate(screens):
        name = filenames[i]
        html = f"""<!doctype html>
<html lang="fa" dir="rtl">
{header[header.find('<head>'):header.find('</head>') + 7]}
<body style="background:#05060D; margin:0; padding:24px; display:flex; justify-content:center; align-items:center; min-height:800px;">
{header[header.find('<svg style="display:none">'):]}
<div style="display:flex; flex-direction:column; align-items:center;">
{body}
</div>
</body>
</html>
"""
        temp_html = f"/tmp/shots/{name}.html"
        with open(temp_html, 'w', encoding='utf-8') as f:
            f.write(html)

        temp_png = f"/tmp/shots/{name}.png"
        cmd = [
            chrome_bin,
            "--headless",
            "--disable-gpu",
            "--window-size=440,880",
            "--force-device-scale-factor=2",
            f"--screenshot={temp_png}",
            f"file://{temp_html}"
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        
        if os.path.exists(temp_png):
            img = Image.open(temp_png)
            cropped = autocrop(img, padding=16)
            out_webp = f"docs/screenshots/{name}.webp"
            cropped.save(out_webp, "WEBP", quality=90)
            print(f"Saved {out_webp} ({cropped.size})")

    # 2. Render Overview banner with first 5 screens (Home, Account, Txns, QuickAdd, SMS)
    overview_body = ""
    for num, title, body in screens[:5]:
        overview_body += f"<div style='flex:0 0 auto;'>{body}</div>\n"

    overview_html = f"""<!doctype html>
<html lang="fa" dir="rtl">
{header[header.find('<head>'):header.find('</head>') + 7]}
<style>
body {{
  background: #05060D;
  margin: 0;
  padding: 30px 24px;
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 840px;
}}
.banner-row {{
  display: flex;
  gap: 20px;
  justify-content: center;
  align-items: flex-start;
}}
.cap {{
  color: #fff;
  opacity: 0.85;
  font-size: 13px;
  margin-top: 12px;
  font-weight: 600;
  text-align: center;
}}
</style>
<body>
{header[header.find('<svg style="display:none">'):]}
<div class="banner-row">
{overview_body}
</div>
</body>
</html>
"""
    with open('/tmp/shots/overview.html', 'w', encoding='utf-8') as f:
        f.write(overview_html)

    overview_png = "/tmp/shots/overview.png"
    cmd = [
        chrome_bin,
        "--headless",
        "--disable-gpu",
        "--window-size=1900,880",
        "--force-device-scale-factor=1.5",
        f"--screenshot={overview_png}",
        "file:///tmp/shots/overview.html"
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    if os.path.exists(overview_png):
        img = Image.open(overview_png)
        cropped = autocrop(img, padding=20)
        out_webp = "docs/screenshots/overview.webp"
        cropped.save(out_webp, "WEBP", quality=88)
        print(f"Saved {out_webp} ({cropped.size})")

if __name__ == '__main__':
    main()
