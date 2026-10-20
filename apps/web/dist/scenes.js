(() => {
 'use strict';
 if(!document.documentElement.dataset.nkRouteDocument&&!(window!==window.parent&&new URL(location.href).searchParams.has('nk_frame'))&&!new URL(location.href).searchParams.has('nk_direct'))return;
 const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)];
 const reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
 const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('motion-visible');io.unobserve(e.target)}}),{threshold:.12});$$('.scene-followup').forEach(e=>io.observe(e));
 let scene;
 const canvas=$('#aurum-canvas'),sceneButton=$('#scene-pause');
 if(canvas){import('/visuals/aurum-scene.js').then(module=>{scene=module.mountAurumScene(canvas,{pointerTarget:canvas.closest('.aurum-bento'),maxDpr:2,fps:30});if(reduce){scene.pause();sceneButton.setAttribute('aria-pressed','true');sceneButton.textContent='PLAY SCENE ▷'}}).catch(error=>{console.error('Aurum scene could not initialize:',error);sceneButton.disabled=true;sceneButton.textContent='SCENE UNAVAILABLE'});sceneButton.addEventListener('click',()=>{if(!scene)return;const paused=sceneButton.getAttribute('aria-pressed')==='true';if(paused)scene.resume();else scene.pause();sceneButton.setAttribute('aria-pressed',String(!paused));sceneButton.textContent=paused?'PAUSE SCENE Ⅱ':'PLAY SCENE ▷'})}
 document.addEventListener('noklith:suspend',()=>scene?.pause(),{once:true});
 const videos=$$('video.scene-video');let manuallyPaused=reduce;
 const pauseButtons=$$('[data-video-pause]');function paintPause(){pauseButtons.forEach(b=>{b.setAttribute('aria-pressed',String(manuallyPaused));b.textContent=manuallyPaused?'PLAY MOTION ▷':'PAUSE MOTION Ⅱ'})}
 const videoObserver=new IntersectionObserver(entries=>entries.forEach(e=>{const v=e.target;if(e.isIntersecting&&!manuallyPaused&&!document.hidden&&!document.documentElement.dataset.nkSuspended)v.play().catch(()=>{});else v.pause()}),{threshold:.15});videos.forEach(v=>{v.muted=true;videoObserver.observe(v)});
 pauseButtons.forEach(b=>b.addEventListener('click',()=>{manuallyPaused=!manuallyPaused;videos.forEach(v=>{if(manuallyPaused)v.pause();else{const r=v.getBoundingClientRect();if(r.top<innerHeight&&r.bottom>0)v.play().catch(()=>{})}});paintPause()}));paintPause();document.addEventListener('visibilitychange',()=>{videos.forEach(v=>{if(document.hidden)v.pause();else if(!manuallyPaused){const r=v.getBoundingClientRect();if(r.top<innerHeight&&r.bottom>0)v.play().catch(()=>{})}})});
})();
