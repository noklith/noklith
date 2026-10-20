// Account connection for the dashboard: wallet sign-in (SIWE through an injected EIP-1193 wallet),
// card, activity and card refills against the Noklith API on the same origin (/v1/...).
// Money stays in integer strings (cents, token base units); no floating-point amounts.
(() => {
 'use strict';
 if(!document.documentElement.dataset.nkRouteDocument&&!(window!==window.parent&&new URL(location.href).searchParams.has('nk_frame'))&&!new URL(location.href).searchParams.has('nk_direct'))return;
 const ui=window.nkDashboard;if(!ui)return;
 const {open,close,toast,escape,glyph}=ui;
 const $=(s,r=document)=>r.querySelector(s),$$=(s,r=document)=>[...r.querySelectorAll(s)];
 const tokenKey='noklith-session';
 const state={token:null,me:null,config:null,card:null,history:[],wallet:null,busy:false,watch:null};
 try{state.token=sessionStorage.getItem(tokenKey)}catch{}

 // Integer-string money formatting.
 const cents=v=>{const n=BigInt(v||'0'),neg=n<0n,a=neg?-n:n;return(neg?'−':'')+'$'+(a/100n).toLocaleString('en-US')+'.'+String(a%100n).padStart(2,'0')};
 const units=(v,decimals,shown=2)=>{const n=BigInt(v||'0'),base=10n**BigInt(decimals);const whole=n/base,frac=String(n%base).padStart(decimals,'0').slice(0,shown);return whole.toLocaleString('en-US')+(shown?'.'+frac:'')};
 const toCents=text=>{const m=/^\s*\$?\s*(\d{1,6})(?:[.,](\d{1,2}))?\s*$/.exec(text||'');return m?String(BigInt(m[1])*100n+BigInt((m[2]||'').padEnd(2,'0'))):null};
 const short=a=>a?a.slice(0,6)+'…'+a.slice(-4):'';
 const key=()=>crypto.randomUUID();

 class APIError extends Error{constructor(status,code,message){super(message);this.status=status;this.code=code}}
 async function api(path,{method='GET',body,idempotent=false}={}){
  const headers={accept:'application/json'};
  if(state.token)headers.authorization='Bearer '+state.token;
  if(body!==undefined)headers['content-type']='application/json';
  if(idempotent)headers['idempotency-key']=key();
  let response;
  try{response=await fetch('/v1'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body),credentials:'omit'})}
  catch{throw new APIError(0,'network','The Noklith service could not be reached. Check your connection and try again.')}
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
   if(response.status===401&&state.token){signOut(false);throw new APIError(401,'session_expired','Your session ended. Connect your account again.')}
   throw new APIError(response.status,data.error?.code||'error',data.error?.message||'Something went wrong. Try again in a moment.');
  }
  return data;
 }
 const message=(error,fallback)=>error instanceof APIError?error.message:(error?.code===4001?'You declined the request in your wallet.':fallback);

 // Wallet (EIP-1193).
 const wallet=()=>window.ethereum;
 async function ensureChain(chainId){
  const eth=wallet(),hex='0x'+chainId.toString(16);
  if(await eth.request({method:'eth_chainId'})===hex)return;
  try{await eth.request({method:'wallet_switchEthereumChain',params:[{chainId:hex}]})}
  catch(error){
   // Networks a wallet may not know yet: public RPC and explorer, used only to add the network to the wallet.
   const known={84532:['Base Sepolia','ETH','https://sepolia.base.org','https://sepolia.basescan.org'],137:['Polygon','POL','https://polygon-rpc.com','https://polygonscan.com'],56:['BNB Smart Chain','BNB','https://bsc-dataseed.bnbchain.org','https://bscscan.com']}[chainId];
   if(error?.code!==4902||!known)throw error;
   const [name,symbol,rpc,explorer]=known;
   await eth.request({method:'wallet_addEthereumChain',params:[{chainId:hex,chainName:name,nativeCurrency:{name:symbol,symbol,decimals:18},rpcUrls:[rpc],blockExplorerUrls:[explorer]}]});
  }
 }

 async function connect(){
  if(state.busy)return;
  if(!wallet()){
   // No injected wallet (typical on phones): open this page inside a wallet app's own browser.
   const page=location.origin+'/dashboard.html',bare=page.replace(/^https?:\/\//,''),enc=encodeURIComponent(page);
   const links=[['MetaMask','https://metamask.app.link/dapp/'+bare],['Trust Wallet','https://link.trustwallet.com/open_url?coin_id=60&url='+enc],['Coinbase Wallet','https://go.cb-w.com/dapp?cb_url='+enc]];
   open('YOUR KEYS. YOUR ACCOUNT.','Connect a wallet.','<div class="connection-rune" aria-hidden="true">'+glyph('passkey')+'</div><p>Noklith signs you in with your own wallet. On a computer, use a browser with a wallet extension such as MetaMask. On a phone, open this page in your wallet app:</p><div class="nk-wallet-links">'+links.map(([name,href])=>'<a class="button dark" href="'+escape(href)+'" target="_top" rel="noopener">OPEN IN '+escape(name.toUpperCase())+' ↗</a>').join('')+'</div><p class="fine-print">Noklith never asks for your seed phrase or private key.</p>');
   return;
  }
  state.busy=true;
  open('YOUR KEYS. YOUR ACCOUNT.','Connecting…','<div class="connection-rune" aria-hidden="true">'+glyph('passkey')+'</div><p class="connection-status" id="nk-connect-status">Approve the connection in your wallet.</p>');
  const status=t=>{const e=$('#nk-connect-status');if(e)e.textContent=t};
  try{
   state.config=state.config||await api('/config');
   if(!state.config.wallet_auth_enabled||!state.config.wallet_auth)throw new APIError(503,'unavailable','Account sign-in is not available right now.');
   const [address]=await wallet().request({method:'eth_requestAccounts'});
   const chainId=state.config.wallet_auth.chain_ids[0];
   status('Switching your wallet to the right network.');
   await ensureChain(chainId);
   const challenge=await api('/auth/challenge',{method:'POST',body:{address,chain_id:chainId}});
   status('Sign the message in your wallet. Signing is free and moves no money.');
   const hexMessage='0x'+[...new TextEncoder().encode(challenge.message)].map(b=>b.toString(16).padStart(2,'0')).join('');
   const signature=await wallet().request({method:'personal_sign',params:[hexMessage,address]});
   const session=await api('/auth/verify',{method:'POST',body:{challenge_id:challenge.id,message:challenge.message,signature}});
   state.token=session.access_token;try{sessionStorage.setItem(tokenKey,state.token)}catch{}
   state.me=session.user;
   await refresh();
   close();toast('Your account is connected.');
  }catch(error){
   open('YOUR KEYS. YOUR ACCOUNT.','Not connected.','<p>'+escape(message(error,'The wallet did not complete the sign-in.'))+'</p><button class="button dark" data-nk="connect">TRY AGAIN ↗</button>');
  }finally{state.busy=false}
 }

 async function signOut(remote=true){
  if(remote&&state.token)await api('/auth/logout',{method:'POST',body:{}}).catch(()=>{});
  state.token=null;state.me=null;state.card=null;state.history=[];state.wallet=null;
  try{sessionStorage.removeItem(tokenKey)}catch{}
  location.reload(); // Restores every static not-connected label.
 }

 async function refresh(){
  if(!state.token)return;
  state.config=state.config||await api('/config');
  const [me,card,history]=await Promise.all([api('/me'),api('/card'),api('/history?limit=50')]);
  state.me=me.user||me;state.card=card.card;state.history=history.items;
  if(state.config.top_up_enabled)state.wallet=await api('/wallet/balances').catch(()=>null);
  ui.render();
 }

 // Card.
 const statusText={provisioning:'Being issued',active:'Active',frozen_by_user:'Paused',frozen_by_risk_rule:'Paused for review',blocked_by_risk:'Blocked',closed:'Closed',replaced:'Replaced'};
 function needCard(){
  if(!state.token){connect();return true}
  if(!state.card){open('YOUR POCKET STONE','Get your card.','<p>A virtual Visa card for online payments. Only the money you put on it sits on the card. The rest stays in your keys.</p><button class="button dark" data-nk="issue">GET MY CARD ↗</button>');return true}
  return false;
 }
 async function issue(){
  open('YOUR POCKET STONE','Issuing your card…','<p class="connection-status">This usually takes a few seconds.</p>');
  try{
   const result=await api('/cards',{method:'POST',body:{},idempotent:true});state.card=result.card;ui.render();
   if(state.card?.status==='provisioning'){watchCard();open('YOUR POCKET STONE','Your card is on its way.','<p>The card is being issued. This page updates when it is ready.</p><button class="button dark" data-close-dialog>BACK TO MY ACCOUNT ↗</button>')}
   else{close();toast('Your card is ready.')}
  }catch(error){open('YOUR POCKET STONE','The card was not issued.','<p>'+escape(message(error,'Try again in a moment.'))+'</p><button class="button dark" data-nk="issue">TRY AGAIN ↗</button>')}
 }
 function watchCard(){clearInterval(state.watch);state.watch=setInterval(async()=>{try{const r=await api('/card');state.card=r.card;ui.render();if(r.card?.status!=='provisioning'){clearInterval(state.watch);if(r.card?.status==='active')toast('Your card is ready.')}}catch{clearInterval(state.watch)}},5000)}
 async function freeze(){
  if(needCard())return;
  const card=state.card,on=card.status==='active';
  if(!on&&card.status!=='frozen_by_user'){toast('This card can’t be changed here: '+(statusText[card.status]||card.status)+'.');return}
  try{const r=await api('/cards/'+card.id+'/'+(on?'freeze':'unfreeze'),{method:'POST',body:{},idempotent:true});state.card=r.card;ui.render();toast(on?'Your card is paused.':'Your card is active again.')}
  catch(error){toast(message(error,'The card did not change.'))}
 }
 let hideTimer;
 async function details(){
  if(needCard())return;
  try{
   const d=await api('/cards/'+state.card.id+'/credentials',{method:'POST',body:{}});
   const pan=d.pan.replace(/(\d{4})(?=\d)/g,'$1 ');
   open('YOUR POCKET STONE','Card details.','<dl class="nk-details"><dt>Number</dt><dd>'+escape(pan)+'</dd><dt>Expires</dt><dd>'+String(d.expiry_month).padStart(2,'0')+'/'+String(d.expiry_year).slice(-2)+'</dd><dt>CVV</dt><dd>'+escape(d.cvv)+'</dd></dl><p class="fine-print">'+(d.demonstration?'Test details. They can’t be used for payments.':'Never share these details with anyone.')+' Hidden automatically after 30 seconds.</p><button class="button dark" data-close-dialog>HIDE ↗</button>');
   clearTimeout(hideTimer);hideTimer=setTimeout(()=>{if($('.nk-details'))close()},30000);
  }catch(error){toast(message(error,'Card details are not available right now.'))}
 }

 // Refill: quote → accept → wallet transfer → hash → server verification and card credit.
 function refill(){
  if(needCard())return;
  // Every network and stablecoin the server accepts; the user picks one when there is a choice.
  const options=(state.config?.networks||[]).flatMap(n=>n.assets.map(a=>({network:n,asset:a})));
  if(!state.config?.top_up_enabled||!options.length){toast('Card refills are not available right now.');return}
  if(state.card.status!=='active'){toast('Refills need an active card.');return}
  const choice=options.length>1?'<label>Pay with<select id="nk-refill-asset">'+options.map((o,i)=>'<option value="'+i+'">'+escape(o.asset.symbol+' on '+o.network.name)+'</option>').join('')+'</select></label>':'';
  open('REFILL YOUR CARD','How much?','<form id="nk-refill-form" class="nk-form"><label>Amount in USD<input id="nk-refill-amount" inputmode="decimal" autocomplete="off" placeholder="50.00" required></label>'+choice+'<p class="fine-print">Paid from your wallet'+(options.length>1?'':' in '+escape(options[0].asset.symbol)+' on '+escape(options[0].network.name))+'. You see the exact amount for your card before anything is sent.</p><p class="nk-error" id="nk-refill-error" role="alert"></p><button class="button dark" type="submit">SEE THE TERMS ↗</button></form>');
  $('#nk-refill-amount').focus();
  $('#nk-refill-form').onsubmit=async e=>{
   e.preventDefault();const amount=toCents($('#nk-refill-amount').value);
   if(!amount||amount==='0'){$('#nk-refill-error').textContent='Enter an amount like 50 or 50.00.';return}
   const {network,asset}=options[Number($('#nk-refill-asset')?.value||0)];
   try{const r=await api('/top-ups',{method:'POST',body:{chain_id:network.chain_id,asset:asset.symbol,amount_cents:amount},idempotent:true});terms(r.top_up)}
   catch(error){$('#nk-refill-error').textContent=message(error,'This refill is not available right now.')}
  };
 }
 function terms(t){
  open('REFILL YOUR CARD','Check and confirm.','<dl class="nk-details"><dt>You send</dt><dd>'+units(t.token_units,t.token_decimals)+' '+escape(t.asset)+'</dd>'+(t.service_fee_cents!=='0'?'<dt>Noklith fee</dt><dd>'+cents(t.service_fee_cents)+'</dd>':'')+'<dt>To your card</dt><dd>about '+cents(t.card_amount_cents)+'</dd><dt>Network</dt><dd>'+escape(t.network_name)+'</dd></dl><p class="fine-print">The card program’s own fee is taken from the refill; your card receives what arrives after it. The network fee is paid in your wallet and shown there before you approve.</p><p class="nk-error" id="nk-refill-error" role="alert"></p><button class="button dark" data-nk="send-refill" data-id="'+escape(t.id)+'">CONFIRM IN MY WALLET ↗</button>');
 }
 async function sendRefill(id){
  const error=t=>{const e=$('#nk-refill-error');if(e)e.textContent=t};
  try{
   const {top_up:t,transaction:tx}=await api('/top-ups/'+id+'/accept',{method:'POST',body:{}});
   await ensureChain(tx.chain_id);
   error('Approve the transfer in your wallet.');
   const hash=await wallet().request({method:'eth_sendTransaction',params:[{from:tx.from,to:tx.to,value:tx.value,data:tx.data}]});
   await api('/top-ups/'+t.id+'/transaction',{method:'POST',body:{transaction_hash:hash}});
   follow(t.id);
  }catch(e){error(message(e,'The transfer was not sent.'))}
 }
 const refillText={submitted:'Waiting for the network.',confirming:'Confirming on the network.',funding_pending:'Received. Putting it on your card.',credited:'Done. The money is on your card.',failed:'This refill failed.',expired:'This refill expired.',cancelled:'This refill was cancelled.'};
 function follow(id){
  open('REFILL YOUR CARD','On its way.','<p class="connection-status" id="nk-refill-status">Waiting for the network.</p><p class="fine-print">You can close this window. The refill continues and appears in your activity.</p><button class="button dark" data-close-dialog>BACK TO MY ACCOUNT ↗</button>');
  const tick=async()=>{
   try{
    const {top_up:t}=await api('/top-ups/'+id+'/check',{method:'POST',body:{}});
    const e=$('#nk-refill-status');
    if(e)e.textContent=(refillText[t.status]||t.status)+(t.status==='confirming'?' ('+t.confirmations+' of '+t.required_confirmations+')':'')+(t.status==='credited'?' '+cents(t.card_amount_cents)+' added.':'');
    if(['credited','failed','expired','cancelled'].includes(t.status)){await refresh();if(t.status==='credited')toast('Your card was refilled.');return}
   }catch{}
   setTimeout(tick,5000);
  };
  setTimeout(tick,3000);
 }

 // Rendering on top of the static dashboard.
 function activityHTML(items){
  if(!items.length)return'<div class="empty-trail"><span aria-hidden="true">'+glyph('footprints')+'</span><h3>Your trail begins here.</h3><p>Card refills and payments appear here.</p></div>';
  return'<ul class="nk-activity">'+items.map(i=>{const out=['authorization','capture'].includes(i.kind),amount=i.amount_cents==='0'?'':(out?'−':'+')+cents(i.amount_cents).replace('−','');return'<li><span><b>'+escape(i.title)+'</b><small>'+new Date(i.occurred_at).toLocaleString()+'</small></span><strong class="'+(out?'out':'in')+'">'+amount+'</strong></li>'}).join('')+'</ul>';
 }
 function paint(hidden){
  if(!state.token)return;
  const card=state.card;
  $$('[data-card-balance]').forEach(e=>e.textContent=hidden?'••••••':card?cents(card.available_cents):'No card yet');
  const chip=$('#card-state');if(chip)chip.textContent=card?statusText[card.status]||card.status:'No card yet';
  $$('.payment-bottom').forEach(e=>e.innerHTML='<span>'+(card?'•••• '+escape(card.last_four||'····'):'NO CARD YET')+'</span><span>'+escape(short(state.me?.wallet_address))+'</span>');
  const freezeButton=$('#freeze-card');if(freezeButton){freezeButton.lastChild.textContent=card?.status==='frozen_by_user'?'Resume card':'Pause card'}
  const usdc=state.wallet?.networks?.[0]?.assets?.[0];
  const total=usdc?.units!=null?units(usdc.units,usdc.decimals):'0.00',[whole,decimal]=total.split('.');
  $$('[data-total-account]').forEach(e=>e.innerHTML=hidden?'••••••':'<span class="currency">$</span>'+escape(whole)+'<span class="decimal">.'+escape(decimal)+'</span>');
  $$('.balance-sub span:last-child').forEach(e=>e.innerHTML='<i></i> '+escape(short(state.me?.wallet_address))+' · <button class="text-link" data-nk="sign-out">Disconnect</button>');
  const who=short(state.me?.wallet_address);
  $$('.connection-indicator').forEach(e=>e.innerHTML='<i></i> CONNECTED');
  $$('.account-pill span').forEach(e=>e.textContent=who);
  $$('.account-connection').forEach(e=>e.style.display='none');
  $$('#view-settings .detail-fact').forEach(e=>{const label=e.querySelector('span')?.textContent;if(label==='Connection')e.querySelector('b').textContent='Wallet '+who;if(label==='Noklith number')e.querySelector('b').textContent='Coming soon'});
  $('#recent-activity').innerHTML=activityHTML(state.history.slice(0,5));
  $('#full-activity').innerHTML=activityHTML(state.history);
 }
 function soon(what){open('COMING SOON','Not yet.','<p>'+escape(what)+' arrives in a later release.</p><button class="button dark" data-close-dialog>BACK TO MY ACCOUNT ↗</button>')}

 ui.extend({
  paint,
  actions:{connect,refill,receive:refill,freeze,'card-details':details,send:()=>soon('Sending money'),move:()=>soon('Moving money between Slabs'),'new-slab':()=>soon('Slabs')},
  connection:action=>state.token?soon(action.charAt(0).toUpperCase()+action.slice(1)):connect(),
 });
 document.addEventListener('click',e=>{const b=e.target.closest('[data-nk]');if(!b)return;e.preventDefault();({connect,issue,'sign-out':()=>signOut(),'send-refill':()=>sendRefill(b.dataset.id)})[b.dataset.nk]?.()});
 wallet()?.on?.('accountsChanged',accounts=>{
  const current=(accounts?.[0]||'').toLowerCase();
  if(state.token&&state.me?.wallet_address&&current!==state.me.wallet_address.toLowerCase()){toast('Wallet account changed. Connect again.');signOut()}
 });
 if(state.token)refresh().then(()=>{if(state.card?.status==='provisioning')watchCard()}).catch(()=>{});
})();
