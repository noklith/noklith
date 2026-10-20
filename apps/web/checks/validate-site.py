from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit,unquote
from collections import Counter
import json,re,hashlib
root=Path(__file__).resolve().parents[1]/'dist'
class Page(HTMLParser):
 def __init__(self):super().__init__();self.ids=[];self.refs=[];self.photos=[];self.tabphotos=[];self.videos=0
 def handle_starttag(self,t,a):
  d=dict(a)
  if 'id' in d:self.ids.append(d['id'])
  self.refs += [d[k] for k in ('src','href','poster') if k in d]
  if t=='img' and '/assets/' in d.get('src','') and d.get('src','').endswith(('.jpg','.webp')) and not any(x in d['src'] for x in ['emblem','stone-frame','limestone-texture','card-art','brands/']):self.photos.append(d['src'])
  if 'data-system-image' in d:self.tabphotos.append(d['data-system-image'])
  if t=='video':self.videos+=1
pages={}
for p in root.glob('*.html'):
 x=Page();x.feed(p.read_text());pages[p.name]=x
issues=[]
for filename in ['product.html','foundation.html','photography.html']:
 if '<body class="cinematic-page">' not in (root/filename).read_text():issues.append([filename,'incorrect route class'])
if 'href="/#mark"' in (root/'dashboard.html').read_text():issues.append(['dashboard.html','external logo fragment'])
routes=set(re.findall(r'<section[^>]*id="view-([^\"]+)"',(root/'dashboard.html').read_text()))
for name,x in pages.items():
 for k,v in Counter(x.ids).items():
  if v>1:issues.append([name,'duplicate ID',k])
 for ref in x.refs:
  u=urlsplit(ref)
  if u.scheme or u.netloc:continue
  f=root/unquote(u.path).lstrip('/') if u.path else root/name
  if f.is_dir():f=f/'index.html'
  if not f.exists():issues.append([name,'missing',ref]);continue
  if u.fragment and f.suffix=='.html' and f.name in pages and u.fragment not in pages[f.name].ids and not(f.name=='dashboard.html' and u.fragment in routes):issues.append([name,'missing anchor',ref])
for p in root.glob('*.css'):
 for a,b,c in re.findall(r'url\((?:"([^\"]*)"|\x27([^\x27]*)\x27|([^)]*))\)',p.read_text()):
  ref=(a or b or c).strip()
  if ref.startswith(('data:','#','https:')):continue
  if not (root/ref.lstrip('/')).exists():issues.append([p.name,'missing css asset',ref])
photos=[i for p in pages.values() for i in p.photos+list(set(p.tabphotos)-set(p.photos))]
for k,v in Counter(photos).items():
 if v>1:issues.append(['repeated photo',k,v])
for p in list(root.glob('*.html'))+list(root.glob('*.js'))+list(root.glob('*.css')):
 if '\u2014' in p.read_text() or '&mdash;' in p.read_text():issues.append([p.name,'em dash remains'])
 if p.suffix=='.html' and 'loading="lazy"' in p.read_text():issues.append([p.name,'lazy image remains'])
# The original placeholder mark must not remain in served markup or editable films.
for p in list(root.glob('*.html'))+[root/'favicon.svg']:
 if 'M7 6 15 5 26 25' in p.read_text() or 'M10 8 24 6 42 39' in p.read_text():issues.append([p.name,'placeholder N remains'])
report={'pages':len(pages),'dashboard_routes':sorted(routes),'unique_photos':len(set(photos)),'film_players':sum(x.videos for x in pages.values()),'issues':issues,'film_sha256':{name:hashlib.sha256((root/'media'/name).read_bytes()).hexdigest() for name in ['noklith-foundation.mp4','noklith-in-motion.mp4']}}
print(json.dumps(report,indent=2));assert not issues
