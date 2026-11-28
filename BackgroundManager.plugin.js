/**
 * @name BackgroundManager
 * @author Local rewrite
 * @description 本機資料夾背景輪播、獨立區域與自訂同步群組（不修改 Discord 內部模組）。
 * @version 1.0.0
 */
class WallpaperSource {
  constructor(owner, zone) {
    this.owner=owner; this.zone=zone;
    this.id = 'BackgroundManager'; this.key = 'folderRewriteV3';
    this.s = {path:'', recursive:false, shuffle:true, minutes:10, fade:1000, dim:50, blur:0, auto:false};
    this.running=false; this.active=false; this.busy=false; this.gen=0; this.files=[]; this.current=null; this.status='尚未載入背景'; this.mode='path'; this.timer=null; this.scanTimer=null; this.cleanupTimer=null; this.startTimer=null; this.layers=[]; this.urls=[null,null]; this.index=-1; this.fs=null; this.refreshUI=null;
  }
  start() {
    this.running=true;
    if(this.owner) this.s=this.owner.sourceSettings(this.zone);
    this.s.minutes=this.num(this.s.minutes,1,1440,10); this.s.fade=this.num(this.s.fade,0,5000,1000); this.s.dim=this.num(this.s.dim,0,95,50); this.s.blur=this.num(this.s.blur,0,20,0);
    if(this.s.selection==='picker') {this.mode='picker';this.setStatus('請重新選取資料夾以載入背景');}
    if(this.s.selection!=='picker' && this.s.auto && this.s.path) this.startTimer=setTimeout(()=>{if(this.running) this.applyPath(this.s.path);},3000 + (this.owner?.order(this.zone)||0)*1200);
  }
  stop() { this.running=false; this.reset(); this.refreshUI=null; }
  num(v,min,max,d) { const n=Number(v); return Number.isFinite(n)?Math.min(max,Math.max(min,n)):d; }
  save() { try { this.owner?.save(); } catch(e){this.report(e);} }
  report(e) { this.setStatus(String(e?.message||e)); console.warn('[BackgroundManager]',e); }
  setStatus(s) { this.status=s; try{this.refreshUI?.();}catch(e){console.warn(e);} }
  reset() {
    this.gen++; this.active=false; this.busy=false; clearTimeout(this.startTimer); clearInterval(this.timer); clearInterval(this.scanTimer); clearTimeout(this.cleanupTimer);
    this.timer=this.scanTimer=this.cleanupTimer=this.startTimer=null; this.files=[]; this.current=null;
    this.root?.remove(); this.css?.remove(); this.root=this.css=null; this.layers=[];
    for(const u of this.urls) if(u) URL.revokeObjectURL(u); this.urls=[null,null]; this.index=-1;
    this.owner?.render();
  }
  mime(name) { return ({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',bmp:'image/bmp',avif:'image/avif',jfif:'image/jpeg'})[String(name).split('.').pop().toLowerCase()]; }
  valid(name,size) { return !!this.mime(name)&&Number.isFinite(size)&&size>0&&size<=12*1024*1024; }
  getFS() { return this.fs||(this.fs=require('fs')); }
  scan(path) {
    const fs=this.getFS(), result=[], dirs=[{path,depth:0}], seen=new Set(); let count=0;
    while(dirs.length && seen.size<100 && count<3000) {
      const d=dirs.shift(); let key=d.path; if(typeof fs.realpathSync==='function') {try{key=String(fs.realpathSync(d.path));}catch{}}
      if(seen.has(key))continue;seen.add(key);
      const names=fs.readdirSync(d.path); if(!Array.isArray(names))throw Error('資料夾 API 未回傳檔名清單');
      for(const entry of names) {
        if(++count>3000)break; const name=typeof entry==='string'?entry:entry?.name; if(!name||name==='.'||name==='..'||/[\\/]/.test(name))continue;
        if(!this.s.recursive&&!this.mime(name))continue;
        const sep=d.path.includes('\\')?'\\':'/'; const p=d.path.replace(/[\\/]+$/,'')+sep+name;
        let st;try{st=fs.statSync(p);}catch{continue;}
        const isDir=typeof st.isDirectory==='function'?st.isDirectory():((st.mode&0o170000)===0o040000);
        const isFile=typeof st.isFile==='function'?st.isFile():((st.mode&0o170000)===0o100000);
        if(isDir&&this.s.recursive&&d.depth<8){dirs.push({path:p,depth:d.depth+1});continue;}
        if(isFile&&this.valid(name,Number(st.size)))result.push({name,path:p,key:p,size:Number(st.size),mtime:Number(st.mtimeMs||0)});
      }
    }
    return result.sort((a,b)=>a.key.localeCompare(b.key,undefined,{numeric:true,sensitivity:'base'}));
  }
  applyPath(path) {
    if(!this.running)return; this.reset(); this.mode='path'; this.s.path=String(path||'').trim().replace(/^"|"$/g,''); this.s.selection='path';this.s.pickerFolder='';this.save();
    if(!this.s.path){this.setStatus('請輸入資料夾路徑');return;}
    try { this.files=this.scan(this.s.path); if(!this.files.length){this.setStatus('找不到符合格式且小於 12 MiB 的圖片');return;} this.active=true; this.next(); }
    catch(e){this.report(e);}
  }
  applyFiles(list) {
    if(!this.running)return; const picked=Array.from(list||[]);if(!picked.length)return;this.reset(); this.mode='picker';
    const relative=String(picked[0].webkitRelativePath||'');this.s.pickerFolder=relative.includes('/')?relative.split('/')[0]:'已選取圖片';this.s.selection='picker';this.save();
    this.files=picked.filter(f=>this.valid(f.name,f.size)&&(this.s.recursive||String(f.webkitRelativePath||f.name).split('/').length<=2)).map(f=>({name:f.name,key:f.webkitRelativePath||f.name,size:f.size,file:f})).sort((a,b)=>a.key.localeCompare(b.key,undefined,{numeric:true}));
    if(!this.files.length){this.setStatus('沒有符合格式的圖片');return;}
    this.active=true;this.next();
  }
  sync() {
    if(!this.active||this.busy||this.mode!=='path')return;
    try {const files=this.scan(this.s.path);this.files=files;if(!files.length){this.setStatus('資料夾目前沒有可用圖片');return;}
      if(!files.some(f=>f.key===this.current?.key&&f.mtime===this.current?.mtime))this.next();
      else this.setStatus(`${files.length} 張｜${this.current.name}`);
    }catch(e){this.report(e);}
  }
  choose() { const n=this.files.length;if(!n)return null;const i=this.files.findIndex(f=>f.key===this.current?.key);if(n===1)return this.files[0];if(!this.s.shuffle)return this.files[(i+1+n)%n];let j=Math.floor(Math.random()*(i>=0?n-1:n));if(i>=0&&j>=i)j++;return this.files[j]; }
  read(f) {
    if(f.file)return f.file;
    const fs=this.getFS(), st=fs.statSync(f.path);if(!this.valid(f.name,Number(st.size)))throw Error('圖片超過 12 MiB 或已不存在');
    const data=fs.readFileSync(f.path,'base64');
    if(typeof data!=='string'||data.length>16*1024*1024+8)throw Error('檔案 API 未回傳預期的 Base64 字串，請改用「原生選取資料夾」');
    const raw=atob(data);if(raw.length!==Number(st.size))throw Error('圖片位元組長度不符');
    const bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);
    return new Blob([bytes],{type:this.mime(f.name)});
  }
  decode(url) {
    return new Promise((resolve,reject)=>{const im=new Image();let done=false;const end=(err)=>{if(done)return;done=true;clearTimeout(t);im.onload=im.onerror=null;if(err){im.src='';reject(err);}else resolve();};const t=setTimeout(()=>end(Error('圖片載入逾時')),8000);im.onload=()=>{if(!im.naturalWidth||im.naturalWidth*im.naturalHeight>24000000)end(Error('圖片尺寸超過 2400 萬像素'));else end();};im.onerror=()=>end(Error('瀏覽器無法解碼圖片或 CSP 阻擋 Blob URL'));im.src=url;});
  }
  async next() {
    if(!this.running||!this.active||this.busy)return;const f=this.choose();if(!f)return;const g=this.gen;this.busy=true;let u=null,release=null;
    try {this.setStatus(`載入：${f.name}`);await new Promise(r=>setTimeout(r,30));release=await this.owner.acquire();if(g!==this.gen||!this.running)return;
      u=URL.createObjectURL(this.read(f));await this.decode(u);if(g!==this.gen||!this.running)return;
      this.show(u);u=null;this.current=f;this.setStatus(`${this.files.length} 張｜${f.name}`);this.schedule();
    }catch(e){if(g===this.gen){this.setStatus(`${f.name}：${e.message||e}。已暫停自動輪播，可手動下一張。`);clearInterval(this.timer);clearInterval(this.scanTimer);this.timer=this.scanTimer=null;this.current=f;console.warn('[BackgroundManager]',e);}}
    finally {if(u)URL.revokeObjectURL(u);release?.();if(g===this.gen)this.busy=false;}
  }
  schedule() {
    clearInterval(this.timer);this.timer=null;
    if(!this.active||!this.running)return;
    this.timer=setInterval(()=>this.next(),this.s.minutes*60000);
    if(this.mode==='path'&&!this.scanTimer)this.scanTimer=setInterval(()=>this.sync(),60000);
  }
  mount() {
    if(this.root?.isConnected)return;
    const root=this.owner.ensureRoot();
    this.root=this.owner.frame(this.zone); this.layers=[document.createElement('div'),document.createElement('div')];
    this.layers.forEach(l=>l.className='bgm-picture');this.root.append(...this.layers);root.append(this.root);this.owner.styleFrame(this.root,this.s);
  }
  appearance() {if(this.root)this.owner.styleFrame(this.root,this.s);this.owner?.render();}
  show(u) {
    this.mount();clearTimeout(this.cleanupTimer);const old=this.index;const i=old<0?0:1-old;
    if(this.urls[i])URL.revokeObjectURL(this.urls[i]);this.urls[i]=u;this.layers[i].style.backgroundImage=`url("${u}")`;this.layers[i].style.opacity='0';void this.layers[i].offsetWidth;this.layers[i].style.opacity='1';if(old>=0)this.layers[old].style.opacity='0';this.index=i;
    this.owner.render();
    if(old>=0)this.cleanupTimer=setTimeout(()=>{if(this.index!==old){this.layers[old].style.backgroundImage='';if(this.urls[old])URL.revokeObjectURL(this.urls[old]);this.urls[old]=null;this.owner.render();}},this.s.fade+100);
  }
}

const ZONES = [
  {id:'chat', label:'中央聊天區', selectors:['[class^="chatContent_"]','[class^="chat_"]']},
  {id:'channels', label:'左側頻道／私訊列表', selectors:['[class^="sidebarList_"]','[class*=" sidebarList_"]','[class^="privateChannels_"]','[class^="sidebar_"]']},
  {id:'servers', label:'最左側伺服器列表', selectors:['nav[class^="guilds_"]','nav[class*=" guilds_"]','[class^="guilds_"]','[class*=" guilds_"]','nav:has([data-list-id="guildsnav"])','[data-list-id="guildsnav"]']},
  {id:'members', label:'右側成員列表', selectors:['[class^="membersWrap_"]','[class^="members_"]']},
  {id:'user', label:'底部使用者控制列', selectors:['[class^="panels_"]']}
];
const GROUPS = ['A','B','C','D','E'].map(letter=>({id:`group${letter}`,label:`同步群組 ${letter}`}));
const isGroup = id => GROUPS.some(g=>g.id===id);
const SOURCE_DEFAULTS={path:'',selection:'path',pickerFolder:'',recursive:false,shuffle:true,minutes:10,fade:1000,dim:50,blur:0,auto:false,fit:'cover',x:50,y:50};
const REGION_DEFAULTS={mode:'shared',override:false,dim:50,blur:0,fit:'cover',x:50,y:50,source:{}};
const CSS=`
      #bgm-local-v3 {position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;background:var(--bgm-base,#18191c);}
      #bgm-local-v3 .bgm-picture {position:absolute;inset:0;background-size:cover;background-position:center;opacity:0;pointer-events:none;transition:opacity var(--bgm-fade,1000ms) ease;filter:brightness(var(--bgm-bright,.5)) blur(var(--bgm-blur,0px));}
      body:has(> #bgm-local-v3) #app-mount {position:relative;z-index:1;background:transparent!important;}
      body:has(> #bgm-local-v3) #app-mount :is([class^="app_"],[class*=" app_"],[class^="appMount_"],[class^="bg_"],[class*=" bg_"],[class^="base_"],[class^="baseLayer_"],[class^="layers_"],[class^="layer_"],[class^="content_"],[class^="chat_"],[class^="chatContent_"],[class^="sidebar_"],[class^="sidebarList_"],[class^="guilds_"],[class^="membersWrap_"],[class^="members_"],[class^="container_"][class*="themed_"],[class^="privateChannels_"],[class^="scroller_"][class*="thin_"]) {background-color:transparent!important;}
      body:has(> #bgm-local-v3) #app-mount :is(.theme-dark,.theme-light,#app-mount), body:has(> #bgm-local-v3) #app-mount {--background-primary:transparent;--background-secondary:transparent;--background-secondary-alt:rgba(0,0,0,.12);--background-tertiary:transparent;--background-base-lowest:transparent;--background-base-lower:transparent;--background-base-low:transparent;--background-base-normal:transparent;--background-surface-high:rgba(25,25,29,.82);--bg-base-primary:transparent;--bg-base-secondary:transparent;--bg-base-tertiary:transparent;--bg-surface-overlay:rgba(25,25,29,.94);--chat-background-default:transparent;--app-frame-background:transparent;--custom-channel-members-bg:transparent;}
      #bgm-local-v3 .bgm-frame {position:absolute;overflow:hidden;pointer-events:none;}
      #bgm-local-v3 .bgm-picture {background-repeat:no-repeat; background-size:var(--bgm-fit,cover);background-position:var(--bgm-position,center);}
      body:has(> #bgm-local-v3) #app-mount [data-bgm-zone="servers"] :is([class^="scroller_"],[class*=" scroller_"],[class^="itemsContainer_"],[class*=" itemsContainer_"],[class^="stack_"],[data-list-id="guildsnav"]),
      body:has(> #bgm-local-v3) #app-mount [data-bgm-zone="servers"] {background-color:transparent!important;background-image:none!important;}
      body:has(> #bgm-local-v3[data-bgm-display="full"]) #app-mount :is([class^="bar_"],[class^="title_"],[class^="titleBar_"],[class^="toolbar_"],[class^="panels_"],[class^="container_"][class*=" title_"]) {background-color:transparent!important;}
      body:has(> #bgm-local-v3) #app-mount [data-bgm-zone], body:has(> #bgm-local-v3) #app-mount [data-bgm-zone="user"] > [class^="container_"] {background-color:transparent!important;}
`;
module.exports=class BackgroundManager {
  constructor(){this.id='BackgroundManager';this.key='folderRewriteV3';this.regionKey='regionsV31';this.groupKey='groupsV32';this.running=false;this.sources={};this.regions={};this.groups={};this.root=null;this.css=null;this.overlays={};this.targets={};this.nativeColors={};this.timer=null;this.refreshUI=null;this.base='#18191c';this.decodeTail=Promise.resolve();this.displayKey='displayV34';this.displayMode='regional';this.suspended={};this.watchTimer=null;this.layoutObserver=null;this.resizeObserver=null;this.layoutRAF=null;this.shortcut=null;this.dialog=null;this.resizeHandler=null;}
  num(v,min,max,d){const n=Number(v);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):d;}
  cleanSource(v){const a={...SOURCE_DEFAULTS,...(v||{})};for(const [k,min,max] of [['minutes',1,1440],['fade',0,5000],['dim',0,95],['blur',0,20],['x',0,100],['y',0,100]])a[k]=this.num(a[k],min,max,SOURCE_DEFAULTS[k]);a.fit=['cover','contain','auto','100% 100%'].includes(a.fit)?a.fit:'cover';a.path=typeof a.path==='string'?a.path:'';a.selection=a.selection==='picker'?'picker':'path';a.pickerFolder=typeof a.pickerFolder==='string'?a.pickerFolder:'';for(const k of ['recursive','shuffle','auto'])a[k]=typeof a[k]==='boolean'?a[k]:SOURCE_DEFAULTS[k];return a;}
  cleanRegion(v){const r={...REGION_DEFAULTS,...(v||{})};r.mode=['native','shared','independent',...GROUPS.map(g=>g.id)].includes(r.mode)?r.mode:'shared';r.override=r.override===true;const a=this.cleanSource(r);for(const k of ['dim','blur','fit','x','y'])r[k]=a[k];r.source=this.cleanSource(r.source);return r;}
  acquire(){let release;const prior=this.decodeTail;this.decodeTail=new Promise(r=>{release=r;});return prior.then(()=>release);}
  sourceSettings(zone){return zone==='shared'?this.shared:isGroup(zone)?this.groups[zone]:this.regions[zone].source;}
  order(zone){return zone==='shared'?0:isGroup(zone)?ZONES.length+1+GROUPS.findIndex(g=>g.id===zone):ZONES.findIndex(z=>z.id===zone)+1;}
  groupMembers(id){return ZONES.filter(z=>this.regions[z.id]?.mode===id);}
  regionSource(id){if(this.displayMode==='full')return this.sources.shared;const mode=this.regions[id]?.mode;if(mode==='shared'||isGroup(mode))return this.sources[mode];if(mode==='independent')return this.sources[id];return null;}
  needed(id){if(this.displayMode==='full')return id==='shared';if(id==='shared')return ZONES.some(z=>this.regions[z.id]?.mode==='shared');if(isGroup(id))return this.groupMembers(id).length>0;return this.regions[id]?.mode==='independent';}
  updateGroupSources(){for(const [id,src] of Object.entries(this.sources)){const needed=this.needed(id);if(needed&&!src.running){src.setStatus('尚未載入背景');src.start();const old=this.suspended[id];delete this.suspended[id];if(old){clearTimeout(src.startTimer);src.startTimer=null;src.mode=old.mode;src.files=old.files;src.current=old.current;src.active=src.files.length>0;if(src.active)src.next();}}else if(!needed&&src.running){src.stop();src.setStatus('未使用');}}}
  setDisplayMode(mode){if(!['full','regional'].includes(mode)||mode===this.displayMode)return;this.displayMode=mode;for(const [id,src] of Object.entries(this.sources)){if(!this.needed(id)&&src.active){this.suspended[id]={mode:src.mode,files:src.files.slice(),current:null};}}this.updateGroupSources();this.save();this.render();}
  start(){if(this.running)return;this.running=true;let old,regions,groups,display;try{old=BdApi.Data.load(this.id,this.key);regions=BdApi.Data.load(this.id,this.regionKey);groups=BdApi.Data.load(this.id,this.groupKey);display=BdApi.Data.load(this.id,this.displayKey);}catch(e){console.warn('[BackgroundManager]',e);}
    this.displayMode=display==='full'?'full':'regional';this.shared=this.cleanSource(old);for(const z of ZONES)this.regions[z.id]=this.cleanRegion(regions?.[z.id]);for(const g of GROUPS)this.groups[g.id]=this.cleanSource(groups?.[g.id]);
    for(const id of ['shared',...ZONES.map(z=>z.id),...GROUPS.map(g=>g.id)]){const src=this.sources[id]=new WallpaperSource(this,id);src.s=this.sourceSettings(id);src.status='未使用';}this.updateGroupSources();this.startWatch();
  }
  save(){try{BdApi.Data.save(this.id,this.key,this.shared);BdApi.Data.save(this.id,this.regionKey,this.regions);BdApi.Data.save(this.id,this.groupKey,this.groups);BdApi.Data.save(this.id,this.displayKey,this.displayMode);}catch(e){console.warn('[BackgroundManager] save',e);}}
  stop(){this.running=false;clearInterval(this.watchTimer);this.watchTimer=null;this.layoutObserver?.disconnect();this.resizeObserver?.disconnect();this.layoutObserver=this.resizeObserver=null;if(this.layoutRAF!==null&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(this.layoutRAF);this.layoutRAF=null;if(this.resizeHandler&&typeof window!=='undefined')window.removeEventListener('resize',this.resizeHandler);this.resizeHandler=null;this.shortcut?.remove();this.shortcut=null;this.closeQuickSettings();for(const s of Object.values(this.sources))s.stop();this.unmount();this.sources={};this.suspended={};this.refreshUI=null;}
  unmount(){clearInterval(this.timer);this.timer=null;this.root?.remove();this.css?.remove();this.root=this.css=null;for(const t of Object.values(this.targets)){t?.removeAttribute('data-bgm-zone');if(t)this.resizeObserver?.unobserve(t);}this.targets={};this.overlays={};this.nativeColors={};}
  target(z){if(typeof document==='undefined')return null;for(const sel of z.selectors){for(const e of document.querySelectorAll('#app-mount '+sel)){const r=e.getBoundingClientRect();if(r.width>5&&r.height>5&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none')return e;}}return null;}
  startWatch(){if(typeof document==='undefined')return;const update=()=>{if(!this.running)return;try{this.ensureShortcut();this.render();}catch(e){console.warn('[BackgroundManager] layout',e);}};const queue=()=>{if(this.layoutRAF!==null||!this.running)return;this.layoutRAF=requestAnimationFrame(()=>{this.layoutRAF=null;update();});};if(typeof MutationObserver!=='undefined'){this.layoutObserver=new MutationObserver(queue);this.layoutObserver.observe(document.body,{childList:true,subtree:true});}if(typeof ResizeObserver!=='undefined')this.resizeObserver=new ResizeObserver(queue);this.resizeHandler=queue;window.addEventListener('resize',queue);this.watchTimer=setInterval(update,500);update();}
  ensureShortcut(){if(!this.running||typeof document==='undefined')return;const app=document.querySelector('#app-mount');if(!app)return;const candidates=[...app.querySelectorAll('[class^="toolbar_"],[class*=" toolbar_"],[class^="trailing_"],[class*=" trailing_"]')];const host=candidates.find(e=>{const r=e.getBoundingClientRect();return r.width>20&&r.height>10&&r.top<120&&r.right>window.innerWidth*.6;});if(!this.shortcut){const b=document.createElement('button');b.id='bgm-quick-settings';b.type='button';b.title='BackgroundManager 背景設定';b.setAttribute('aria-label',b.title);b.style.cssText='display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;flex:0 0 28px;border:0;border-radius:4px;background:transparent;color:var(--interactive-normal,#b5bac1);cursor:pointer;padding:3px;';b.innerHTML='<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m3 17 5-5 4 4 3-3 6 6"/></svg>';b.onclick=()=>this.openQuickSettings();this.shortcut=b;}const b=this.shortcut;if(host){if(b.parentElement!==host)host.prepend(b);b.style.position='';b.style.top='';b.style.right='';b.style.zIndex='';}else{if(b.parentElement!==document.body)document.body.append(b);Object.assign(b.style,{position:'fixed',top:'5px',right:'155px',zIndex:'1000'});}}
  openQuickSettings(){if(!this.running)return;if(this.dialog?.isConnected){this.dialog.focus();return;}const d=document.createElement('dialog');d.id='bgm-quick-dialog';d.setAttribute('aria-label','BackgroundManager 背景設定');d.style.cssText='width:min(680px,92vw);max-height:85vh;overflow:auto;padding:16px;border:1px solid #7776;border-radius:10px;background:var(--background-floating,#232428);color:var(--text-normal,#eee);';const close=document.createElement('button');close.type='button';close.textContent='關閉 ×';close.style.cssText='position:sticky;top:0;float:right;z-index:1;padding:8px;background:#5865f2;color:white;border-radius:5px;cursor:pointer';close.onclick=()=>this.closeQuickSettings();d.append(close,this.getSettingsPanel());d.addEventListener('cancel',e=>{e.preventDefault();this.closeQuickSettings();});d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)this.closeQuickSettings();}});document.body.append(d);this.dialog=d;d.showModal();}
  closeQuickSettings(){if(!this.dialog)return;const d=this.dialog;this.dialog=null;if(d.open)d.close();d.remove();if(this.running)this.shortcut?.focus();}
  nativeColor(e,zone){let c=e?getComputedStyle(e).backgroundColor:'';if(c&&c!=='transparent'&&!/^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(c))return c;return this.nativeColors[zone]||this.base;}
  ensureRoot(){if(this.root?.isConnected)return this.root;
    const app=document.querySelector('#app-mount');const theme=app?.querySelector('.theme-light,.theme-dark')||app;const style=theme&&getComputedStyle(theme);const light=!!theme?.classList.contains('theme-light')||document.documentElement.classList.contains('theme-light');this.base=(style?.getPropertyValue('--background-base-lowest')||'').trim()||(light?'#f2f3f5':'#18191c');if(this.base==='transparent')this.base=light?'#f2f3f5':'#18191c';
    for(const z of ZONES){const e=this.target(z);const fallback=(style?.getPropertyValue(z.id==='chat'?'--background-primary':'--background-secondary')||'').trim();this.nativeColors[z.id]=fallback&&fallback!=='transparent'?fallback:this.base;this.nativeColors[z.id]=this.nativeColor(e,z.id);}
    const root=document.createElement('div');root.id='bgm-local-v3';root.setAttribute('aria-hidden','true');root.style.setProperty('--bgm-base',this.base);const css=document.createElement('style');css.textContent=CSS;document.head.append(css);document.body.prepend(root);this.root=root;this.css=css;return root;
  }
  frame(zone){const e=document.createElement('div');e.className='bgm-frame';e.dataset.bgmFrame=zone;e.style.zIndex=String(this.order(zone));e.style.display='none';return e;}
  styleFrame(e,s){e.style.setProperty('--bgm-fade',`${s.fade??this.shared.fade}ms`);e.style.setProperty('--bgm-bright',String(1-s.dim/100));e.style.setProperty('--bgm-blur',`${s.blur}px`);e.style.setProperty('--bgm-fit',s.fit||'cover');e.style.setProperty('--bgm-position',`${s.x??50}% ${s.y??50}%`);}
  geometry(e,t){if(!t){e.style.display='none';return;}const r=t.getBoundingClientRect();e.style.display='';Object.assign(e.style,{left:`${r.left}px`,top:`${r.top}px`,width:`${r.width}px`,height:`${r.height}px`});}
  groupBounds(id,rects){const boxes=this.groupMembers(id).map(z=>rects[z.id]).filter(Boolean);if(!boxes.length)return null;const left=Math.min(...boxes.map(r=>r.left)),top=Math.min(...boxes.map(r=>r.top)),right=Math.max(...boxes.map(r=>r.right)),bottom=Math.max(...boxes.map(r=>r.bottom));return {left,top,width:right-left,height:bottom-top};}
  removeOverlay(id){this.overlays[id]?.remove();delete this.overlays[id];}
  overlay(id){if(!this.overlays[id]){const e=this.frame(id);e.dataset.bgmOverlay=id;e.style.display='';this.root.append(e);this.overlays[id]=e;}return this.overlays[id];}
  render(){if(!this.running||!this.root)return;const shared=this.sources.shared;const any=Object.values(this.sources).some(s=>s.running&&s.index>=0&&s.root?.isConnected);if(!any){this.unmount();return;}
    this.root.dataset.bgmDisplay=this.displayMode;const targets={},rects={},bounds={};for(const z of ZONES){const t=targets[z.id]=this.target(z);if(t)rects[z.id]=t.getBoundingClientRect();if(this.targets[z.id]!==t){const prev=this.targets[z.id];prev?.removeAttribute('data-bgm-zone');if(prev)this.resizeObserver?.unobserve(prev);this.targets[z.id]=t;t?.setAttribute('data-bgm-zone',z.id);if(t)this.resizeObserver?.observe(t);}}
    // Every source frame is hidden except the exclusive full-window canvas. Regional frames clip shared coordinates.
    for(const src of Object.values(this.sources))if(src.root)src.root.style.display='none';
    if(this.displayMode==='full'){for(const z of ZONES)this.removeOverlay(z.id);if(shared.root&&shared.index>=0){Object.assign(shared.root.style,{display:'',inset:'0',width:'',height:''});}return;}
    for(const g of GROUPS)bounds[g.id]=this.groupBounds(g.id,rects);
    const viewport={left:0,top:0,width:this.root.clientWidth,height:this.root.clientHeight};
    for(const z of ZONES){const id=z.id,r=this.regions[id],t=targets[id];if(!t){this.removeOverlay(id);continue;}const e=this.overlay(id);this.geometry(e,t);const selected=this.regionSource(id);
      if(!selected||selected.index<0||!selected.root?.isConnected){if(e.children.length)e.replaceChildren();delete e.dataset.bgmSource;e.style.backgroundColor=this.base;const color=this.nativeColors[id]||this.base;e.style.backgroundImage=`linear-gradient(${color},${color})`;continue;}
      e.style.backgroundColor=this.base;e.style.backgroundImage='none';const grouped=isGroup(r.mode),common=grouped||r.mode==='shared';this.styleFrame(e,r.override&&common?{...selected.s,dim:r.dim,blur:r.blur}:selected.s);
      if(e.dataset.bgmSource!==selected.zone||e.children.length!==2){e.replaceChildren();e.dataset.bgmSource=selected.zone;for(let i=0;i<2;i++){const l=document.createElement('div');l.className='bgm-picture';e.append(l);}}
      const b=grouped?bounds[r.mode]:r.mode==='shared'?viewport:null,rr=rects[id];for(let i=0;i<2;i++){const l=e.children[i],u=selected.urls[i];if(b&&rr){Object.assign(l.style,{inset:'auto',left:`${b.left-rr.left}px`,top:`${b.top-rr.top}px`,width:`${b.width}px`,height:`${b.height}px`});}else Object.assign(l.style,{inset:'0',width:'',height:''});const img=u?`url("${u}")`:'';if(l.style.backgroundImage!==img){l.style.backgroundImage=img;if(i===selected.index){l.style.opacity='0';void l.offsetWidth;}}l.style.opacity=i===selected.index?'1':'0';}
    }
  }
  setMode(id,mode){const r=this.regions[id],src=this.sources[id];if(!r||!src||!['shared','native','independent',...GROUPS.map(g=>g.id)].includes(mode)||r.mode===mode)return;r.mode=mode;for(const key of Object.keys(this.suspended))if(this.displayMode==='regional'&&!this.needed(key))delete this.suspended[key];this.updateGroupSources();this.save();this.render();}
  getSettingsPanel(){const shell=document.createElement('div');const redraw=()=>shell.replaceChildren(this.buildSettingsPanel(redraw));redraw();return shell;}
  buildSettingsPanel(redraw){
    const panel=document.createElement('div');panel.style.cssText='display:grid;gap:12px;padding:12px;color:var(--text-normal,#eee);';
    const el=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};
    const add=(parent,e)=>{parent.append(e);return e;};
    const button=(text,fn)=>{const b=el('button',text);b.type='button';b.style.cssText='padding:8px 12px;border-radius:5px;background:#5865f2;color:white;cursor:pointer;margin:2px;';b.onclick=()=>{try{fn();}catch(e){console.warn('[BackgroundManager]',e);}};return b;};
    const row=(p,label,input)=>{const l=el('label',label+' ');l.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:12px;';l.append(input);add(p,l);};
    const field=(e)=>{e.style.cssText='padding:6px;background:var(--input-background,#222);color:var(--text-normal,#fff);border-radius:4px;';return e;};
    const check=(p,label,obj,key,cb)=>{const c=el('input');c.type='checkbox';c.checked=!!obj[key];c.onchange=()=>{obj[key]=c.checked;this.save();cb?.();};row(p,label,c);};
    const number=(p,label,obj,key,min,max,cb)=>{const n=field(el('input'));n.type='number';n.min=min;n.max=max;n.value=obj[key];n.style.width='85px';n.onchange=()=>{obj[key]=this.num(n.value,min,max,obj[key]);n.value=obj[key];this.save();cb?.();};row(p,label,n);};
    const select=(p,label,opts,value,fn)=>{const q=field(el('select'));for(const [v,t] of opts){const o=el('option',t);o.value=v;q.append(o);}q.value=value;q.onchange=()=>fn(q.value);row(p,label,q);return q;};
    const appearance=(p,obj,cb)=>{number(p,'暗化 (%)',obj,'dim',0,95,cb);number(p,'模糊 (px)',obj,'blur',0,20,cb);select(p,'縮放',[['cover','填滿（裁切）'],['contain','完整顯示'],['100% 100%','拉伸'],['auto','原始尺寸']],obj.fit,v=>{obj.fit=v;this.save();cb();});number(p,'水平位置 (%)',obj,'x',0,100,cb);number(p,'垂直位置 (%)',obj,'y',0,100,cb);};
    const sourcePanel=(p,src)=>{const a=src.s;const path=field(add(p,el('input')));path.type='text';path.value=a.selection==='picker'?'':a.path;path.setAttribute('aria-label','資料夾路徑');path.style.cssText+=';width:100%;box-sizing:border-box;';const folder=add(p,el('div'));folder.style.cssText='overflow-wrap:anywhere;font-size:13px;';const showFolder=()=>{folder.textContent=a.selection==='picker'?`已選資料夾：${a.pickerFolder||'未知'}${src.mode==='picker'&&!src.files.length?'（需重新選取）':''}`:`已設定資料夾：${a.path||'尚未選取'}`;folder.title=folder.textContent;};showFolder();const pick=add(p,el('input'));pick.type='file';pick.multiple=true;pick.setAttribute('webkitdirectory','');pick.style.display='none';pick.onchange=()=>{src.applyFiles(pick.files);if(a.selection==='picker')path.value='';showFolder();pick.value='';};const bar=add(p,el('div'));bar.append(button('原生選取資料夾',()=>pick.click()),button('套用路徑',()=>{src.applyPath(path.value);path.value=a.path;showFolder();}),button('下一張',()=>src.next()),button('重新掃描',()=>src.sync()),button('停止此背景',()=>{src.reset();src.setStatus('已停止');}));
      check(p,'包含子資料夾（重新套用後生效）',a,'recursive');check(p,'隨機輪播',a,'shuffle');check(p,'自動載入已儲存路徑',a,'auto');number(p,'輪播間隔（分鐘）',a,'minutes',1,1440,()=>{if(src.timer)src.schedule();});number(p,'轉場（ms）',a,'fade',0,5000,()=>src.appearance());appearance(p,a,()=>src.appearance());const st=add(p,el('div',src.status));st.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;padding:8px;border:1px solid currentColor;border-radius:4px;';src.refreshUI=()=>{st.textContent=src.status;showFolder();};};
    const section=(title,open=false,parent=panel,modeLabel=null)=>{const d=add(parent,el('details'));d.open=open;d.style.cssText='padding:10px;border:1px solid #7776;border-radius:6px;';const heading=add(d,el('summary',title));if(modeLabel!==null){const badge=add(heading,el('span',modeLabel));badge.dataset.bgmModeLabel='';badge.style.cssText='float:right;margin-left:8px;font-size:12px;font-weight:400;color:var(--text-muted,#b5bac1);';}const body=add(d,el('div'));body.style.cssText='display:grid;gap:9px;padding-top:12px;';return body;};
    add(panel,el('h3','BackgroundManager 1.0.0 — 全視窗與分區背景'));
    select(panel,'全域顯示模式',[['full','全視窗模式'],['regional','分區模式']],this.displayMode,v=>{this.setDisplayMode(v);redraw();});
    if(this.displayMode==='full'){add(panel,el('p','所有區域統一使用全視窗背景；分區設定暫停並保留。'));sourcePanel(section('全視窗背景設定',true),this.sources.shared);return panel;}
    add(panel,el('p','分區模式：共用背景只顯示在選擇共用的區域，不再作為其他區域的底圖；獨立模式使用各區自己的圖片。將任意區域設為同一同步群組（A～E），即共用圖片、輪播與轉場。同群組跨區域無縫取景；縮放與位置由群組統一控制。'));
    const global=section('共用背景來源',true);const sharedBody=add(global,el('div'));sharedBody.style.cssText='display:grid;gap:9px';let sharedActive=null;const drawShared=()=>{const active=this.needed('shared');if(active===sharedActive)return;sharedActive=active;sharedBody.replaceChildren();if(active)sourcePanel(sharedBody,this.sources.shared);else add(sharedBody,el('p','目前沒有區域使用共用背景。'));};drawShared();
    const groupBox=section('同步群組設定（A～E）',true);
    add(groupBox,el('p','先在下方各區的「背景模式」選擇群組，再於此指定該群組的資料夾。未使用群組不會讀取圖片或執行輪播。'));
    const groupViews={};
    for(const g of GROUPS){const p=section(g.label,false,groupBox);const summary=add(p,el('div'));const body=add(p,el('div'));body.style.cssText='display:grid;gap:9px;';groupViews[g.id]={summary,body,active:null};}
    const drawGroups=()=>{for(const g of GROUPS){const {summary,body}=groupViews[g.id],view=groupViews[g.id];const members=this.groupMembers(g.id);summary.textContent=members.length?'包含：'+members.map(z=>z.label).join('、'):'目前沒有區域加入';const active=members.length>0;if(view.active===active)continue;view.active=active;body.replaceChildren();if(active)sourcePanel(body,this.sources[g.id]);else add(body,el('p','請先將至少一個區域加入此群組。'));}};
    const modeOptions=[['shared','共用背景（連續取景）'],['native','原生色（無圖片）'],['independent','獨立背景及輪播'],...GROUPS.map(g=>[g.id,g.label])];
    for(const z of ZONES){const r=this.regions[z.id],modeLabel=()=>modeOptions.find(([v])=>v===r.mode)?.[1]||r.mode,p=section(z.label,false,panel,modeLabel());const badge=p.parentElement.querySelector('[data-bgm-mode-label]');const body=el('div');body.style.cssText='display:grid;gap:9px;';const draw=()=>{body.replaceChildren();if(r.mode==='shared'||isGroup(r.mode)){const grouped=isGroup(r.mode);if(grouped)add(body,el('p','同群組圖片以共同畫布無縫拼接；縮放及位置由群組控制。'));check(body,grouped?'獨立調整暗化及模糊':'獨立調整共用背景暗化及模糊',r,'override',()=>{draw();this.render();});if(r.override){number(body,'暗化 (%)',r,'dim',0,95,()=>this.render());number(body,'模糊 (px)',r,'blur',0,20,()=>this.render());}}else if(r.mode==='independent'){sourcePanel(body,this.sources[z.id]);}else add(body,el('p','以區域原生底色遮蔽背景圖片（不修改文字與圖示）。'));};select(p,'背景模式',modeOptions,r.mode,v=>{this.setMode(z.id,v);badge.textContent=modeLabel();draw();drawGroups();drawShared();});add(p,body);draw();}
    drawGroups();
    const diag=section('區域辨識診斷',false);const diagnostics=add(diag,el('div'));const checkTargets=()=>{diagnostics.textContent=ZONES.map(z=>`${z.label}：${this.target(z)?'已辨識':'未辨識／目前隱藏'}`).join('\n');};diagnostics.style.whiteSpace='pre-line';add(diag,button('重新檢查',checkTargets));checkTargets();
    add(panel,el('p','安全限制：單張 12 MiB／2400 萬像素；路徑每分鐘掃描，最多 3000 個項目。同群組共用一份圖片與一個輪播計時器。原生選取的資料夾在重啟後需要重新選取。'));
    return panel;
  }
};
