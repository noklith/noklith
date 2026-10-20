from pathlib import Path
import re,html,json
root=Path(__file__).parent
index=(root/'dist/index.html').read_text()
old=(root/'templates/landing-before-v6.html').read_text()
def between(a,b):return old.split(a,1)[1].split(b,1)[0]
# Retain established content and accessible controls, rebuilding the original layout.
process=between('  <div class="process-row">','\n </section>\n <section class="systems')
process='  <div class="process-row">'+process
# Each image is kept whole in an original-reference ratio frame.
process=process.replace('<figure class="artifact-photo">','<figure class="artifact-photo">')
tabs=between('<div class="feature-tabs" role="tablist" aria-label="Noklith features">','</div></div>\n  <div class="system-panel')
pledges='<section class="pledges'+between('<section class="pledges','\n <section class="notes')
notes='<section class="notes'+between('<section class="notes','\n <section class="faq')
faqlist='<div class="faq-list">'+between('<div class="faq-list">','\n  </div></div></section>')+'\n</div>'
faqlist=faqlist.replace('\n</div>','<details><summary>Is there an independent way out?<span></span></summary><p>The product design includes an independent exit page that can read public balances and sign a withdrawal without the Noklith API. Network gas may still be needed if sponsorship is unavailable.</p></details>\n</div>')
intro=[]
for i,name in enumerate(['rhino','ibex','mammoths','aurochs','horses','bison']):
 intro.append(f'<figure class="reference-tile" data-tile="{i}"><img src="/assets/{name}.webp" alt="" width="1280" height="720"></figure>')
for i in range(1,21):intro.append(f'<figure class="reference-tile" data-tile="{i+5}"><img src="'+('/assets/cave.webp' if i==3 else f'/assets/stock-v3/intro-{i:02}.webp')+'" alt="" width="800" height="600"></figure>')
about=''.join(f'<figure><img src="/assets/stock-v3/about-{i:02}.webp" alt="{alt}" width="2400" height="1600"></figure>' for i,alt in [(1,'Natural stone layers and surfaces'),(2,'Ancient worked stone, shaped by hand'),(3,'Enduring mineral forms and textures')])

principles=[
('OWNERSHIP','Your money stays in your keys until you send it to your card. You sign in with your own wallet, and Noklith never asks for a private key. The wider balance stays separate from the card program.','M16 40Q15 24 31 16Q44 18 48 31Q48 45 32 48Q20 48 21 34Q23 23 35 25Q44 28 39 36L31 40M31 40 27 34M16 40 10 46M16 40 15 50'),
('SLABS','Give your money a name and a place. Everyday, Rent, Travel, Reserve. Named balances organize money within the account you control, so one whole can make room for the different parts of life.','M8 22 31 13 55 22 31 32ZM8 32 31 42 55 32M8 42 31 52 55 42M8 22V42M55 22V42'),
('FLOAT','A little on the card. The rest in your keys. Choose a target, a refill threshold, and a daily cap. Float is designed to work within the permissions you sign, and you can revoke the policy.','M10 24Q8 51 32 53Q55 51 53 24M10 24Q32 33 53 24M13 36Q24 31 34 36T51 36M8 44H18M46 44H57M32 10V22M26 17 32 23 38 17'),
('CARD DESK','Every load has a path. Card Desk checks each refill on chain (token, sender, amount and confirmations) before the card is loaded, and loads it exactly once.','M8 32H25L37 16H55M25 32 37 48H55M8 26V38M19 27 26 32 19 37M48 10 55 16 48 22M48 42 55 48 48 54'),
('RECOVERY','Ownership includes a way back. Add an optional backup signer. The recovery design also includes guardians and an independent exit page, so your choices are clear when everyday access is interrupted.','M11 43Q11 28 20 28Q28 28 28 43M26 43Q26 28 35 28Q44 28 44 43M42 43Q42 28 51 28Q58 30 57 43M16 18A4 4 0 1 0 24 18A4 4 0 1 0 16 18M31 18A4 4 0 1 0 39 18A4 4 0 1 0 31 18M47 18A4 4 0 1 0 55 18A4 4 0 1 0 47 18M9 50Q32 59 57 50'),
('SHARED MONEY','A shared plan can keep individual boundaries. Shared Slabs are designed for two to five people, with limits and co-sign rules. Each person can withdraw their own net share while the purpose stays clear.','M9 25Q31 12 55 25L51 48Q31 58 13 48ZM17 34 25 31 30 38 22 43ZM36 31 45 34 43 43 34 39ZM28 18 33 12 39 19M22 51 19 58M43 51 47 58')]
slides=''.join('<article class="pledge-slide" aria-label="'+str(i+1)+' of 6" aria-hidden="'+str(i!=0).lower()+'"><div class="reference-quote-copy"><h3>“'+text+'”</h3><div class="pledge-source"><svg class="pledge-emblem" aria-hidden="true"><use href="#mark"/></svg><span>NOKLITH<small>'+title+'</small></span></div></div><div class="reference-quote-art" aria-hidden="true"><svg viewBox="0 0 64 64"><path d="'+path+'"/></svg></div></article>' for i,(title,text,path) in enumerate(principles))
pledges='<section class="pledges section-pad" id="principles"><div class="section-label micro"><span>NOKLITH©</span><span>[ SEC-06 ]</span><span><i></i> SET IN STONE</span></div><div class="pledges-layout"><div><span class="section-kicker">The things we come back to</span><h2>Clear principles.<br>Solid ground.</h2><div class="pledge-controls"><button id="pledge-prev" aria-label="Previous principle">←</button><span class="micro"><span id="pledge-count">01</span> / 06</span><button id="pledge-next" aria-label="Next principle">→</button></div></div><div class="pledge-window" id="pledge-window" aria-label="Noklith principles carousel" aria-roledescription="carousel"><div class="pledge-track">'+slides+'</div></div></div></section>'

body=(root/'templates/landing.html').read_text()
credits={i['id']:i for i in json.loads((root/'dist/assets/stock-v3/credits.json').read_text())['images']}
about=''.join('<figure><img src="/assets/stock-v3/'+key+'.webp" alt="'+html.escape(credits[key]['short_title'],quote=True)+'" width="'+str(credits[key]['web_dimensions'][0])+'" height="'+str(credits[key]['web_dimensions'][1])+'"></figure>' for key in ['about-01','about-02','about-03'])
for key,value in {'INTRO_IMAGES':''.join(intro),'ABOUT_IMAGES':about,'PROCESS_ROWS':process,'FEATURE_TABS':tabs,'PLEDGES':pledges,'NOTES':notes,'FAQ_LIST':faqlist}.items():body=body.replace('{{'+key+'}}',value)
head=index.split('<main id="main">',1)[0]
head=re.sub(r'<body[^>]*>','<body class="landing-page">',head,1)
head=re.sub(r'<link rel="stylesheet" href="/reference\.css[^"]*">','',head)
head=re.sub(r'<script src="/reference\.js[^"]*" defer></script>','',head)
head=re.sub(r'<(?:script|link)[^>]*(?:src|href)="/vendor/lenis[^"]*"[^>]*>(?:</script>)?', '', head)
head=head.replace('</head>','<link rel="stylesheet" href="/vendor/lenis-1.3.27.css"><link rel="stylesheet" href="/reference.css"><script src="/vendor/lenis-1.3.27.min.js" defer></script><script src="/reference.js" defer></script></head>')
head=head.replace('href="#chapters">EXPLORE</a>','href="/#field-notes">FIELD NOTES</a>')
head=head.replace('BASE · YOUR KEYS','<b>NOKLITH</b> YOUR KEYS')
tail=index.split('</main>\n',1)[1]
if 'reference-footer-visual' not in tail:
 tail=tail.replace('</footer>','<div class="reference-footer-visual"><div class="reference-footer-image"></div><img src="/assets/noklith-emblem.webp" alt="Noklith emblem" width="160" height="160"></div></footer>')
(root/'dist/index.html').write_text(head+'<main id="main">'+body+'</main>\n'+tail)
# A dashboard opened directly can still navigate to the same marketing chrome.
dash=root/'dist/dashboard.html';s=dash.read_text();chrome=head.split('<header class="site-header"',1)[1]
chrome='<header class="site-header"'+chrome
chrome=re.sub(r'(<a\b[^>]*\bhref=")#',r'\1/#',chrome)
chrome=chrome.split('<link rel="stylesheet" href="/reference.css">',1)[0] if False else chrome
# Chrome ends at the existing menu closing div; head has no trailing scripts after body.
s=re.sub(r'<template id="nk-marketing-chrome">.*?</template>','<template id="nk-marketing-chrome">'+chrome+'</template>',s,flags=re.S)
dash.write_text(s)
print('Prepared the Cerno-reference Noklith landing page')
