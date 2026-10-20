(() => {
 'use strict';
 if(!document.documentElement.dataset.nkRouteDocument&&!(window!==window.parent&&new URL(location.href).searchParams.has('nk_frame'))&&!new URL(location.href).searchParams.has('nk_direct'))return;
 document.querySelectorAll('[data-social] svg').forEach(svg=>{const use=svg.querySelector('use');if(!use)return;const box=use.getBBox();if(!box.width||!box.height)return;const scale=20/Math.max(box.width,box.height);use.setAttribute('transform','translate(12 12) scale('+scale+') translate('+(-box.x-box.width/2)+' '+(-box.y-box.height/2)+')')});
 const hover=matchMedia('(hover: hover) and (pointer: fine)');
 const details={
  'Everyday':['THE DAILY PATH','Float starts here.','Everyday is the default source for Float. Set a target, a refill threshold, and a daily cap in My rules.'],
  'Rent':['PROTECT THE FOUNDATIONS','A purpose of its own.','A named Slab separates a planned expense from your day-to-day spending. Payday rules can give it a share when money arrives.'],
  'Travel':['ROOM TO EXPLORE','Let the next path grow.','Give a future trip its own place. A payday allocation can build the plan over time, while your other Slabs keep their own purpose.'],
  'Reserve':['A LITTLE BREATHING SPACE','Keep your footing.','Reserve is a named space within your account. Slabs organize your money; they do not change who controls the account.'],
  'Ownership, from the start.':['YOUR ACCOUNT / YOUR KEYS','One account. Clear control.','Slabs are spaces inside your account. Your passkey signs for it, with an optional backup signer for another route to access.'],
  'Only your pocket money.':['THE CARD BOUNDARY','Keep the line visible.','Only money moved to the card enters its program. Card regions, expiry, limits, and restrictions apply to that amount.'],
  'A clear path. Including an exit.':['A WAY BACK','Know your recovery path.','The design includes backup signing, optional guardians, and an independent recovery page. Your passkey remains tied to the Noklith domain.']
 };
 document.querySelectorAll('svg>use[href^="/assets/rock-icons-v5.svg"]').forEach(use=>{use.parentElement.setAttribute('viewBox','0 0 64 64');use.parentElement.setAttribute('aria-hidden','true')});
 let count=0;
 document.querySelectorAll('.slab-purpose-grid article,.foundation-grid article').forEach(article=>{
  const title=article.querySelector('h3')?.innerText.replace(/\s+/g,' ').trim(),copy=details[title];if(!copy)return;
  article.classList.add('artifact-flip');
  const rotor=document.createElement('div');rotor.className='artifact-rotor';
  const front=document.createElement('div');front.className='artifact-face artifact-front';while(article.firstChild)front.append(article.firstChild);
  const back=document.createElement('div');back.className='artifact-face artifact-back';back.id='artifact-back-'+(++count);back.setAttribute('aria-hidden','true');
  const label=document.createElement('span');label.className='micro';label.textContent=copy[0];const heading=document.createElement('h3');heading.textContent=copy[1];const p=document.createElement('p');p.textContent=copy[2];back.append(label,heading,p);
  const turn=document.createElement('button');turn.type='button';turn.className='card-turn';turn.setAttribute('aria-controls',back.id);turn.setAttribute('aria-expanded','false');
  rotor.append(front,back);article.append(rotor,turn);let pinned=false;
  function set(on){article.classList.toggle('is-turned',on);turn.setAttribute('aria-expanded',String(on));turn.setAttribute('aria-label',(on?'Return to ':'Explore ')+title);turn.innerHTML=(on?'Return':'Turn')+' <span aria-hidden="true">↻</span>';front.setAttribute('aria-hidden',String(on));back.setAttribute('aria-hidden',String(!on))}
  article.addEventListener('pointerenter',()=>{if(hover.matches)set(true)});article.addEventListener('pointerleave',()=>{if(!pinned)set(false)});
  turn.addEventListener('click',()=>{pinned=!pinned;set(pinned)});turn.addEventListener('keydown',e=>{if(e.key==='Escape'){pinned=false;set(false)}});set(false);
 });
 const icon={play:'<path d="M9 5L21 12L9 20Z" fill="currentColor"/>',pause:'<path d="M8 5L10 5L10 20L7 20ZM16 5L19 6L18 20L16 19Z" fill="currentColor"/>',full:'<path d="M9 5L5 5L5 10M15 5L20 5L19 10M5 15L5 20L10 19M15 20L20 20L20 15" fill="none" stroke="currentColor" stroke-width="1.7"/>'};
 const svg=key=>'<svg viewBox="0 0 26 26" aria-hidden="true">'+icon[key]+'</svg>';
 const clock=seconds=>{seconds=Math.max(0,Math.floor(seconds||0));return Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')};
 document.querySelectorAll('video').forEach(video=>{video.setAttribute('controlslist','nodownload noplaybackrate');video.addEventListener('contextmenu',e=>e.preventDefault())});
 document.querySelectorAll('video.motion-film').forEach(video=>{
  const frame=video.closest('.film-frame');if(!frame)return;video.controls=false;video.disablePictureInPicture=true;
  const controls=document.createElement('div');controls.className='film-controls';controls.setAttribute('role','group');controls.setAttribute('aria-label','Film playback');
  controls.innerHTML='<button type="button" class="film-play" aria-label="Play film">'+svg('play')+'</button><span class="film-time">0:00 / 0:00</span><input class="film-seek" type="range" min="0" max="100" step="0.1" value="0" aria-label="Film position"><button type="button" class="film-sound" aria-label="Unmute film">Sound off</button><button type="button" class="film-full" aria-label="Full screen">'+svg('full')+'</button>';
  frame.append(controls);const play=controls.querySelector('.film-play'),seek=controls.querySelector('.film-seek'),sound=controls.querySelector('.film-sound'),time=controls.querySelector('.film-time');
  const update=()=>{const duration=Number.isFinite(video.duration)?video.duration:0;seek.value=duration?String(video.currentTime/duration*100):'0';seek.setAttribute('aria-valuetext',clock(video.currentTime)+' of '+clock(duration));time.textContent=clock(video.currentTime)+' / '+clock(duration);play.setAttribute('aria-label',video.paused?'Play film':'Pause film');play.innerHTML=svg(video.paused?'play':'pause');sound.textContent=video.muted?'Sound off':'Sound on';sound.setAttribute('aria-label',video.muted?'Unmute film':'Mute film')};
  play.addEventListener('click',()=>{if(video.paused)video.play().catch(()=>{});else video.pause()});sound.addEventListener('click',()=>{video.muted=!video.muted});
  seek.addEventListener('input',()=>{if(Number.isFinite(video.duration))video.currentTime=Number(seek.value)/100*video.duration});
  controls.querySelector('.film-full').addEventListener('click',()=>{if(document.fullscreenElement)document.exitFullscreen?.();else if(frame.requestFullscreen)frame.requestFullscreen().catch(()=>{});else video.webkitEnterFullscreen?.()});
  ['play','pause','timeupdate','loadedmetadata','volumechange','durationchange','ended'].forEach(event=>video.addEventListener(event,update));update();
 });
})();
