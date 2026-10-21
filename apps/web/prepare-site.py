"""Prepare image loading hints and a same-origin static-asset cache. No image editing.

Only the page's priority image (fetchpriority="high", else the first image) and the two
fonts are preloaded. Every other <img> loads lazily with async decoding, so a cold visit on
a slow connection is not stuck behind megabytes of below-the-fold photographs. The
service worker still warms the full asset list in the background after the page enters.
"""
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit
import hashlib, json, re

root = Path(__file__).parent / 'dist'
class Assets(HTMLParser):
    def __init__(self):
        super().__init__(); self.images=[]; self.priority=[]
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        for key in (['src'] if tag == 'img' else ['poster'] if tag == 'video' else []):
            if a.get(key): self.images.append(a[key])
        if tag == 'img' and a.get('fetchpriority') == 'high' and a.get('src'): self.priority.append(a)
        if a.get('data-system-image'): self.images.append(a['data-system-image'])

def image_hints(match):
    tag=match.group(0)
    # The priority (hero) image stays eager; it is preloaded below.
    if 'fetchpriority="high"' in tag: return re.sub(r'\sloading="[^"]*"', '', tag)
    tag=re.sub(r'\sloading="[^"]*"', '', tag).replace('<img', '<img loading="lazy"', 1)
    return tag if 'decoding=' in tag else tag.replace('<img', '<img decoding="async"', 1)

def preload(a):
    extra=''
    if a.get('srcset'): extra+=' imagesrcset="'+a['srcset']+'"'
    if a.get('sizes'): extra+=' imagesizes="'+a['sizes']+'"'
    return '<link data-nk-preload rel="preload" as="image" href="'+a['src']+'"'+extra+' fetchpriority="high">'

pages={}
for p in root.glob('*.html'):
    text=re.sub(r'<img\b[^>]*>', image_hints, p.read_text())
    text=text.replace('\u2014','-').replace('&mdash;','-').replace('&#8212;','-').replace('&#x2014;','-')
    text=re.sub(r'<video\b', '<video controlslist="nodownload noplaybackrate"', text) if 'controlslist=' not in text else text
    def version_asset(match):
        file=root/match.group(2).lstrip('/')
        if not file.is_file(): return match.group(0)
        digest=hashlib.sha256(file.read_bytes()).hexdigest()[:12]
        return match.group(1)+'="'+match.group(2)+'?v='+digest+'"'
    text=re.sub(r'(src|href)="(/[^"?#]+\.(?:js|css))(?:\?[^"]*)?"',version_asset,text)
    text=re.sub(r'<link[^>]*data-nk-preload[^>]*>', '', text)
    parser=Assets();parser.feed(text)
    urls=list(dict.fromkeys(parser.images))
    if p.name=='dashboard.html': urls+=['/assets/card-art/'+name+'.webp' for name in ['sandstone-bison','basalt-mammoth','obsidian-ibex']]
    urls=list(dict.fromkeys(urls))
    pages['/' if p.name=='index.html' else '/'+p.name]=urls
    head=preload(parser.priority[0]) if parser.priority else preload({'src':urls[0]}) if urls else ''
    head+='<link data-nk-preload rel="preload" as="font" type="font/woff2" href="/assets/inter-display-medium.woff2" crossorigin><link data-nk-preload rel="preload" as="font" type="font/woff2" href="/assets/inter-display-bold.woff2" crossorigin>'
    text=text.replace('</head>',head+'</head>')
    p.write_text(text)
assets=sorted(set(u for values in pages.values() for u in values)|{'/assets/float-bowl-frame.webp','/assets/rock-icons-v5.svg','/assets/wood-frame.webp','/assets/limestone-texture.webp','/assets/stone-frame.webp','/assets/noklith-emblem.webp','/assets/inter-display-medium.woff2','/assets/inter-display-bold.woff2'})
fingerprint=hashlib.sha256()
for url in assets:
    file=root/urlsplit(url).path.lstrip('/')
    if not file.is_file(): raise FileNotFoundError(file)
    fingerprint.update(url.encode());fingerprint.update(file.read_bytes())
revision=fingerprint.hexdigest()[:12]
(root/'asset-manifest.json').write_text(json.dumps({'revision':revision,'pages':pages,'assets':assets},indent=2))
sw='''const CACHE='noklith-images-REVISION';
const ASSETS=ASSET_LIST;
self.addEventListener('install',event=>{event.waitUntil((async()=>{const cache=await caches.open(CACHE);const queue=ASSETS.slice();await Promise.allSettled(Array.from({length:2},async()=>{while(queue.length){const url=queue.shift();try{const response=await fetch(url,{credentials:'same-origin',priority:'low'});if(response.ok&&!response.redirected&&!(response.headers.get('content-type')||'').includes('text/html'))await cache.put(url,response)}catch{}}}));await self.skipWaiting()})())});
self.addEventListener('activate',event=>event.waitUntil((async()=>{for(const key of await caches.keys())if(key.startsWith('noklith-images-')&&key!==CACHE)await caches.delete(key);await self.clients.claim()})()));
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(event.request.method!=='GET'||u.origin!==location.origin||event.request.headers.has('range')||!/^\\/(?:assets|media)\\/.*\\.(?:webp|png|jpe?g|svg|woff2)$/.test(u.pathname))return;event.respondWith((async()=>{const cache=await caches.open(CACHE),saved=await cache.match(event.request,{ignoreSearch:true});if(saved)return saved;const response=await fetch(event.request);if(response.ok&&!response.redirected&&!(response.headers.get('content-type')||'').includes('text/html'))await cache.put(event.request,response.clone());return response})())});
'''.replace('REVISION',revision).replace('ASSET_LIST',json.dumps(assets,separators=(',',':')))
(root/'sw.js').write_text(sw)
print('Prepared image loading hints and cache:',len(assets),'assets;',revision)
