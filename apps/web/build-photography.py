from pathlib import Path
import html, json, re

root = Path(__file__).parent
index = (root / 'dist/index.html').read_text()
prefix = index.split('<main id="main">', 1)[0].replace('<body class="landing-page">','<body>')
prefix = re.sub(r'<title>.*?</title>', '<title>Photography & sources | Noklith</title>', prefix)
prefix = prefix.replace('<body>', '<body class="cinematic-page">')
prefix = prefix.replace('<a class="active" href="/">HOME</a>', '<a href="/">HOME</a>')
suffix = index.split('</main>\n', 1)[1]
for section in ['home', 'about', 'slabs', 'how-it-works', 'field-notes', 'faq', 'chapters']:
    prefix = prefix.replace(f'href="#{section}"', f'href="/#{section}"')
    suffix = suffix.replace(f'href="#{section}"', f'href="/#{section}"')
images = []
for directory in ['stock', 'stock-v2', 'stock-v3']:
    images += json.loads((root / 'dist/assets' / directory / 'credits.json').read_text())['images']
entries = []
for i in images:
    esc = html.escape
    entries.append(f'<article><h2>{esc(i["title"])}</h2><p>{esc((i.get("attribution") or i.get("author") or "Public domain").replace(chr(8212), "-"))}</p><p><a href="{esc(i["source_page"], quote=True)}">Source photograph</a> · <a href="{esc(i["license_url"], quote=True)}">{esc(i["license"])}</a></p><p class="modification">Presented with a warm Noklith colour treatment. Complete compositions are preserved. Web versions are compressed for delivery.</p></article>')
content = '<section class="page-hero"><span class="eyebrow">THE WORLD BENEATH THE BRAND</span><h1>Photography<br>& sources.</h1><div class="hero-rule"><p>Ancient materials and the natural world. Source credits for the photographs presented across Noklith.</p></div></section><section class="page-details photo-credit-grid" aria-label="Photography sources">' + ''.join(entries) + '<article><h2>Noklith card paintings</h2><p>Original digital cave paintings created for Noklith. Bison on sandstone, mammoth on basalt, and ibex on obsidian.</p></article></section>'
(root / 'dist/photography.html').write_text(prefix + '<main id="main" class="page-main">' + content + '</main>\n' + suffix)
print('Prepared photography.html')
