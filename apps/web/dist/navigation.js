(() => {
 'use strict';
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches,root=document.documentElement;
 const route=p=>p.replace(/\.html$/,'').replace(/\/$/,'')||'/';
 const allowed=['/','/index','/product','/foundation','/architecture','/slabs','/ownership','/dashboard','/photography'];
 const nextFrame=()=>new Promise(r=>requestAnimationFrame(r));
 // One interpolated clip keeps the six original blinds on the compositor,
 // instead of repainting a changing gradient mask from JavaScript each frame.
 const blindClip=p=>'polygon('+Array.from({length:6},(_,i)=>{const left=i*100/6,right=(i+p)*100/6;return left+'% 100%,'+left+'% 0%,'+right+'% 0%,'+right+'% 100%'}).join(',')+')';
 function cleanURL(value){const url=new URL(value,location.href);url.searchParams.delete('nk_frame');url.searchParams.delete('nk_direct');return url}
 const isRouteDocument=window!==window.parent&&new URL(location.href).searchParams.has('nk_frame');
 const direct=!isRouteDocument&&new URL(location.href).searchParams.has('nk_direct');
 if(!isRouteDocument&&!direct){
  // The persistent header and isolated route documents reproduce overlapping Framer page transitions.
  const template=document.querySelector('#nk-marketing-chrome')?.content;
  const header=document.querySelector('.site-header')||template?.querySelector('.site-header')?.cloneNode(true),menu=document.querySelector('#site-menu')||template?.querySelector('#site-menu')?.cloneNode(true),icons=document.querySelector('.icon-library');
  const firstURL=cleanURL(location.href);if(header&&['/','/index'].includes(route(firstURL.pathname))&&!reduce)header.style.opacity='0';document.body.replaceChildren(...[icons,header,menu].filter(Boolean));document.body.className='nk-shell';root.classList.remove('nk-boot','nk-shell-boot');if(['/', '/index'].includes(route(firstURL.pathname)))document.body.style.background='#0c0a08';
  // Loading indicator for the first page. The route frame reports how much of its first screen (the page itself,
  // fonts and the images in view) has arrived; the line and the number follow that and fade once the page shows.
  const dark=['/','/index'].includes(route(firstURL.pathname));
  const loader=document.createElement('div');loader.setAttribute('role','progressbar');loader.setAttribute('aria-label','Loading');loader.setAttribute('aria-valuemin','0');loader.setAttribute('aria-valuemax','100');
  loader.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:20;padding:0 28px 26px;pointer-events:none;color:'+(dark?'#f2e5ce':'#32261c')+';font:500 10px/1 var(--font,sans-serif);letter-spacing:.14em;text-transform:uppercase;opacity:0;transition:opacity .4s';
  loader.innerHTML='<div style="display:flex;justify-content:space-between;margin-bottom:12px;opacity:.72"><span>Loading</span><span data-load-value style="font-variant-numeric:tabular-nums">0%</span></div><div style="position:relative;height:1px"><div style="position:absolute;inset:0;background:currentColor;opacity:.2"></div><div data-load-bar style="position:absolute;left:0;top:0;height:1px;width:0;background:currentColor;transition:width .3s"></div></div>';
  document.body.append(loader);setTimeout(()=>{if(loader.isConnected)loader.style.opacity='1'},150);
  let loaded=0;
  const progress=value=>{loaded=Math.max(loaded,Math.min(100,Math.round(value*100)));loader.setAttribute('aria-valuenow',String(loaded));loader.querySelector('[data-load-value]').textContent=loaded+'%';loader.querySelector('[data-load-bar]').style.width=loaded+'%'};
  const finishLoader=()=>{if(!loader.isConnected)return;progress(1);loader.style.opacity='0';setTimeout(()=>loader.remove(),450)};
  let current,pending,busy=false,first=true;
  const modal=document.createElement('dialog');modal.className='brand-dialog';modal.setAttribute('aria-labelledby','nk-shell-dialog-title');modal.innerHTML='<div class=dialog-stone><button class=dialog-close aria-label="Close dialog">×</button><span class=eyebrow>THE NEXT CHAPTER</span><h2 id=nk-shell-dialog-title></h2><p>We’re carving out our place. Noklith’s official channel will appear here when it is ready.</p><button class="button dark" data-shell-close>BACK TO NOKLITH ↗</button></div>';document.body.append(modal);let socialFocus;document.querySelectorAll('[data-social] svg').forEach(svg=>{const use=svg.querySelector('use'),b=use?.getBBox();if(b?.width&&b.height)use.setAttribute('transform','translate(12 12) scale('+(20/Math.max(b.width,b.height))+') translate('+(-b.x-b.width/2)+' '+(-b.y-b.height/2)+')')});modal.querySelectorAll('button').forEach(b=>b.onclick=()=>modal.close());modal.addEventListener('close',()=>socialFocus?.focus());
  function menuState(open){document.body.classList.toggle('menu-open',open);if(menu)menu.inert=!open;const toggle=header?.querySelector('.menu-toggle');toggle?.setAttribute('aria-expanded',String(open));toggle?.setAttribute('aria-label',open?'Close menu':'Open menu');if(open)menu?.querySelector('a')?.focus()}
  header?.querySelector('.menu-toggle')?.addEventListener('click',()=>menuState(!document.body.classList.contains('menu-open')));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')menuState(false);if(e.key==='Tab'&&document.body.classList.contains('menu-open')){const n=[header.querySelector('.menu-toggle'),...menu.querySelectorAll('a,button')],a=n[0],b=n.at(-1);if(e.shiftKey&&document.activeElement===a){e.preventDefault();b.focus()}else if(!e.shiftKey&&document.activeElement===b){e.preventDefault();a.focus()}}});
  function frameFor(url){const f=document.createElement('iframe');f.className='nk-route-frame';f.title='Noklith';f.setAttribute('allow','autoplay; fullscreen');f.style.opacity='0';const u=new URL(url);u.searchParams.set('nk_frame','1');f.src=u.href;
   const fallback=()=>{if(pending===f&&busy){const d=new URL(url);d.searchParams.set('nk_direct','1');location.replace(d.href)}};
   const live=()=>{try{return new URL(f.contentWindow.location.href).searchParams.has('nk_frame')}catch{return false}};
   // A frame refused by X-Frame-Options/CSP still fires load but never reports nk-ready. Go direct at once
   // instead of waiting; a live route that loaded but stays silent gets a short grace period.
   let armed=false;f.addEventListener('load',()=>{if(!armed||pending!==f||!busy)return;if(live())setTimeout(fallback,1500);else fallback()});
   document.body.append(f);armed=true;setTimeout(()=>{if(!live())fallback()},15000);return f}
  function navigate(value,push=true){const url=cleanURL(value);if(url.origin!==location.origin||!allowed.includes(route(url.pathname)))return false;if(busy)return true;menuState(false);if(current&&route(url.pathname)===route(cleanURL(current.src).pathname)){current.contentWindow.postMessage({type:'nk-hash',hash:url.hash},location.origin);history.replaceState(null,'',url.href);return true}busy=true;pending=frameFor(url);pending.dataset.push=String(push);return true}
  window.addEventListener('message',async e=>{
   if(e.origin!==location.origin)return;const data=e.data||{};
   if(data.type==='nk-nav'&&e.source===current?.contentWindow){navigate(data.href);return}
   if(data.type==='nk-overlay'&&e.source===current?.contentWindow){if(header){header.inert=data.open===true;header.style.visibility=data.open?'hidden':''}return}
   if(data.type==='nk-drawer'&&e.source===current?.contentWindow){if(header)header.inert=data.open===true;return}
   if(data.type==='nk-scroll'&&e.source===current?.contentWindow){if(header)header.style.top=(-Math.min(Math.max(0,data.y),160))+'px';return}
   if(data.type==='nk-hash-sync'&&e.source===current?.contentWindow){const u=cleanURL(location.href);u.hash=data.hash;history.replaceState(null,'',u.href);document.title=data.title||document.title;return}
   if(data.type==='nk-progress'&&e.source===pending?.contentWindow){if(first)progress(Number(data.value)||0);return}
   if(data.type!=='nk-ready'||e.source!==pending?.contentWindow)return;
   if(first)finishLoader();
   const incoming=pending,old=current,url=cleanURL(data.href);incoming.title=data.title||'Noklith';
   const bodyClasses=String(data.bodyClass||'').split(/\s+/).filter(c=>c&&!['nk-shell','is-route-frame','page-preparing'].includes(c));document.body.className='nk-shell '+bodyClasses.join(' ');
   if(first&&header&&['/','/index'].includes(route(url.pathname))&&!reduce){header.style.opacity='';header.animate([{opacity:.001,transform:'translateY(-12px)'},{opacity:1,transform:'none'}],{duration:900,delay:matchMedia('(min-width: 1440px)').matches?2550:1750,easing:'cubic-bezier(.22,1,.36,1)',fill:'backwards'})}
   const dashboard=bodyClasses.includes('dashboard-body');if(header){header.hidden=dashboard;header.inert=false;header.style.visibility='';header.style.top='0px';header.querySelectorAll('.desktop-nav a').forEach(a=>a.classList.toggle('active',route(new URL(a.href).pathname)===route(url.pathname)&&!new URL(a.href).hash))}if(menu)menu.inert=true;document.title=data.title||'Noklith';
   if(!first&&incoming.dataset.push==='true')history.pushState(null,'',url.href);else history.replaceState(null,'',url.href);
   const duration=reduce||first?0:1200;
   if(duration)incoming.style.clipPath=blindClip(0);
   incoming.style.opacity='1';document.body.style.removeProperty('background');incoming.style.zIndex='2';incoming.classList.add('nk-incoming');
   if(old){old.inert=true;old.setAttribute('aria-hidden','true');old.contentWindow.postMessage({type:'nk-suspend'},location.origin)}
   await nextFrame();await nextFrame();
   const start=performance.now(),timing={duration,easing:'cubic-bezier(.19,1,.22,1)',fill:'both'};
   const reveal=duration?incoming.animate([{clipPath:blindClip(0)},{clipPath:blindClip(1)}],timing):null;
   const fade=old&&duration?old.animate([{opacity:1},{opacity:.4}],timing):null;
   incoming.contentWindow.postMessage({type:'nk-enter'},location.origin);
   if(reveal)await reveal.finished;
   old?.remove();current=incoming;current.className='nk-route-frame is-current';current.style.cssText='opacity:1;z-index:1';reveal?.cancel();fade?.cancel();current.id='nk-current';pending=null;busy=false;first=false;root.dataset.routeTransitionMs=String(Math.round(performance.now()-start));
  });
  document.addEventListener('click',e=>{const social=e.target.closest('[data-social]');if(social){socialFocus=social;modal.querySelector('h2').textContent=social.dataset.social+' is coming soon.';modal.showModal();return}const a=e.target.closest('a[href]');if(!a||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||a.target==='_blank'||a.download)return;if(navigate(a.href))e.preventDefault()});
  addEventListener('popstate',()=>navigate(location.href,false));navigate(firstURL.href,false);return;
 }
 // Each route lives in its own document, so leaving a page destroys all of its animation loops.
 root.dataset.nkRouteDocument=direct?'direct':'frame';
 if(!direct)document.body.classList.add('is-route-frame');else{const clean=cleanURL(location.href);clean.searchParams.delete('nk_direct');history.replaceState(null,'',clean.href)}root.classList.remove('nk-boot');
 const home=['/','/index'].includes(route(location.pathname))&&(!location.hash||location.hash==='#home');let activated=false;
 // Only on-screen artwork is promoted to eager; the rest keeps its lazy hint so a cold visit is not bandwidth-starved.
 const visibleImages=[...document.images].filter(i=>{const r=i.getBoundingClientRect();return r.top<innerHeight&&r.bottom>0});visibleImages.forEach(i=>{i.loading='eager'});
 // Fonts are preloaded and normally arrive first; the cap keeps a stalled font from holding the reveal.
 const ready=Promise.all([Promise.race([document.fonts.ready,new Promise(r=>setTimeout(r,3000))]),Promise.race([Promise.allSettled(visibleImages.map(i=>i.decode())),new Promise(r=>setTimeout(r,600))])]);
 // Tells the shell's loading indicator how much of the first screen has arrived.
 if(isRouteDocument){const parts=[document.fonts.ready,...visibleImages.map(i=>i.decode())];let done=0;const report=()=>parent.postMessage({type:'nk-progress',value:(1+done)/(parts.length+1)},location.origin);report();parts.forEach(part=>Promise.resolve(part).catch(()=>{}).finally(()=>{done++;report()}))}
 let cover,word,hero=document.querySelector('.hero-word'),slices=[],relocation,visuals=[],prepared;
 if(home&&hero&&!reduce){
  cover=document.createElement('div');cover.className='reference-loader';cover.setAttribute('aria-hidden','true');cover.innerHTML='<div class="reference-loader-ground"></div><div class="reference-loader-word"></div>';document.body.append(cover);word=cover.querySelector('.reference-loader-word');hero.style.opacity='0';
 }
 function prepareLoader(){
  if(cover&&!prepared){
   const svg=hero.querySelector('svg'),text=svg?.querySelector('text'),bounds=hero.getBoundingClientRect();
   if(svg&&text){
    word.style.cssText='visibility:hidden;left:'+bounds.left+'px;top:'+bounds.top+'px;width:'+bounds.width+'px;height:'+bounds.height+'px;transform-origin:0% 100%';
    const chars=[...text.textContent],unit=bounds.width/1400,textStyle=getComputedStyle(text);
    const font='font-family:'+textStyle.fontFamily+';font-size:'+textStyle.fontSize+';font-weight:'+textStyle.fontWeight+';letter-spacing:'+textStyle.letterSpacing+';fill:currentColor';
    const measure=svg.cloneNode(true);measure.setAttribute('aria-hidden','true');measure.style.cssText='position:fixed;left:-99999px;top:0;width:1400px;height:305px;visibility:hidden';const measureText=measure.querySelector('text');measureText.removeAttribute('textLength');measureText.removeAttribute('lengthAdjust');measureText.style.cssText=font;
    // Batch all font measurements before constructing the 42 reveal bands.
    const charTexts=chars.map(char=>{const node=measureText.cloneNode(true);node.textContent=char;node.style.letterSpacing='0px';node.setAttribute('x','0');measure.append(node);return node});document.body.append(measure);const stretch=1405/measureText.getComputedTextLength(),widths=charTexts.map(node=>node.getComputedTextLength()),positions=chars.map((_,i)=>text.getStartPositionOfChar(i).x);charTexts.forEach(node=>node.remove());
    const fragment=document.createDocumentFragment();
    chars.forEach((char,i)=>{const x=positions[i],glyphWidth=widths[i];measureText.textContent=char;measureText.style.letterSpacing='0px';measureText.setAttribute('x','0');
     for(let band=0;band<6;band++){const holder=document.createElement('span');holder.className='reference-glyph-band';holder.dataset.char=String(i);holder.dataset.band=String(band);holder.style.cssText='left:'+(x*unit)+'px;width:'+(glyphWidth*stretch*unit)+'px;clip-path:inset('+(-25+band*25-.4)+'% -20% '+(100-(-25+(band+1)*25)-.4)+'% -20%);';const clone=measure.cloneNode(true);clone.style.cssText='';clone.setAttribute('viewBox','0 0 '+glyphWidth+' 305');clone.setAttribute('preserveAspectRatio','none');clone.removeAttribute('role');clone.removeAttribute('aria-label');holder.append(clone);fragment.append(holder)}
    });measure.remove();
    word.append(fragment);prepared={svg,font,bounds};
   }
  }
 }
 async function enter(){
  if(activated)return;activated=true;const start=performance.now();
  document.dispatchEvent(new Event('noklith:enter'));
  if(cover){
   prepareLoader();
   if(prepared){
    const {svg,font,bounds}=prepared;
    slices=[...word.children].map(holder=>{const i=Number(holder.dataset.char),band=Number(holder.dataset.band);return holder.animate([{transform:'translateX('+((band+i)%2?45:-45)+'%)',opacity:0},{transform:'translateX(0%)',opacity:1}],{duration:700,delay:100+i*50+band*25,easing:'cubic-bezier(.19,1,.22,1)',fill:'backwards'})});word.style.visibility='visible';
    Promise.allSettled(slices.map(a=>a.finished)).then(()=>{const clean=svg.cloneNode(true);clean.removeAttribute('role');clean.removeAttribute('aria-label');clean.style.cssText='display:block;width:100%;height:100%;overflow:visible';clean.querySelector('text').style.cssText=font;word.replaceChildren(clean)});

    const heroColor=getComputedStyle(hero).color;const scale=(innerWidth*.93023)/bounds.width,initialCenter=bounds.bottom-bounds.height*scale/2,shift=innerHeight/2-initialCenter;
    relocation=word.animate([{transform:'translateY('+shift+'px) scale('+scale+')',color:'#f4ead9'},{transform:'translateY(0) scale(1)',color:heroColor}],{duration:1100,delay:1300,easing:'cubic-bezier(.19,1,.22,1)',fill:'backwards'});
    visuals.push(cover.querySelector('.reference-loader-ground').animate([{opacity:1},{opacity:0}],{duration:400,delay:1300,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'}));
    [['.hero-intro',2150],['.hero-meta',2300],['.hero-values',2450]].forEach(([selector,delay])=>{document.querySelector(selector)?.animate([{opacity:0,transform:'translateY(15px)'},{opacity:1,transform:'none'}],{duration:1000,delay,easing:'cubic-bezier(.22,1,.36,1)',fill:'backwards'})});
    const art=document.querySelector('.hero-art');if(art){visuals.push(art.animate([{transform:'scale(1.35)'},{transform:'scale(1)'}],{duration:1200,delay:1300,easing:'cubic-bezier(.19,1,.22,1)',fill:'backwards'}))}
    await Promise.allSettled([...slices,relocation,...visuals].map(a=>a.finished));hero.style.removeProperty('opacity');cover.remove();visuals.forEach(a=>a.cancel());
   }else{hero.style.removeProperty('opacity');cover.remove()}
  }
  root.dataset.transitionMs=String(Math.round(performance.now()-start));document.dispatchEvent(new Event('noklith:ready'));
  if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js?v=era-6').catch(()=>{});
 }
 window.addEventListener('message',e=>{if(e.origin!==location.origin||e.source!==parent)return;if(e.data?.type==='nk-enter')enter();if(e.data?.type==='nk-suspend'){document.documentElement.dataset.nkSuspended='true';document.querySelectorAll('video').forEach(v=>v.pause());document.getAnimations().forEach(a=>a.pause());document.dispatchEvent(new Event('noklith:suspend'))}if(e.data?.type==='nk-hash'){const hash=e.data.hash;if(hash){history.replaceState(null,'',hash);const target=document.getElementById(hash.slice(1));target?.scrollIntoView({behavior:reduce?'instant':'smooth'});window.dispatchEvent(new HashChangeEvent('hashchange'))}}});
 document.addEventListener('click',e=>{const a=e.target.closest('a[href]');if(!a||e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey||a.download||a.target==='_blank')return;const url=cleanURL(a.href);if(url.origin!==location.origin||!allowed.includes(route(url.pathname)))return;if(route(url.pathname)===route(location.pathname)){if(url.hash){e.preventDefault();history.replaceState(null,'',url.hash);document.getElementById(url.hash.slice(1))?.scrollIntoView({behavior:reduce?'instant':'smooth'});parent.postMessage({type:'nk-hash-sync',hash:url.hash,title:document.title},location.origin)}return}e.preventDefault();if(direct){url.searchParams.set('nk_direct','1');location.assign(url.href)}else parent.postMessage({type:'nk-nav',href:url.href},location.origin)});
 let scrollFrame=0;addEventListener('scroll',()=>{if(!scrollFrame)scrollFrame=requestAnimationFrame(()=>{scrollFrame=0;parent.postMessage({type:'nk-scroll',y:scrollY},location.origin)})},{passive:true});
 document.addEventListener('noklith:viewchange',()=>parent.postMessage({type:'nk-hash-sync',hash:location.hash,title:document.title},location.origin));
 Promise.all([ready,document.readyState==='loading'?new Promise(r=>document.addEventListener('DOMContentLoaded',r,{once:true})):Promise.resolve()]).then(()=>{prepareLoader();if(direct)enter();else parent.postMessage({type:'nk-ready',href:cleanURL(location.href).href,title:document.title,bodyClass:document.body.className},location.origin)});
})();
