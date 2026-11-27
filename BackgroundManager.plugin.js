/**
 * @name BackgroundManager
 * @author Local rewrite
 * @description 本機資料夾背景輪播與獨立區域背景（不修改 Discord 內部模組）。
 * @version 3.1.0
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
    if(this.s.auto && this.s.path) this.startTimer=setTimeout(()=>{if(this.running) this.applyPath(this.s.path);},3000 + (this.owner?.order(this.zone)||0)*1200);
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
    if(!this.running)return; this.reset(); this.mode='path'; this.s.path=String(path||'').trim().replace(/^"|"$/g,''); this.save();
    if(!this.s.path){this.setStatus('請輸入資料夾路徑');return;}
    try { this.files=this.scan(this.s.path); if(!this.files.length){this.setStatus('找不到符合格式且小於 12 MiB 的圖片');return;} this.active=true; this.next(); }
    catch(e){this.report(e);}
  }
  applyFiles(list) {
    if(!this.running)return; this.reset(); this.mode='picker';
    this.files=Array.from(list).filter(f=>this.valid(f.name,f.size)&&(this.s.recursive||String(f.webkitRelativePath||f.name).split('/').length<=2)).map(f=>({name:f.name,key:f.webkitRelativePath||f.name,size:f.size,file:f})).sort((a,b)=>a.key.localeCompare(b.key,undefined,{numeric:true}));
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
    // One bounded read. No Buffer guessing, retries, or IPC fallback.
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
  {id:'channels', label:'左側頻道／私訊列表', selectors:['[class^="sidebarList_"]','[class^="privateChannels_"]','[class^="sidebar_"]']},
  {id:'servers', label:'最左側伺服器列表', selectors:['[class^="guilds_"]']},
  {id:'members', label:'右側成員列表', selectors:['[class^="membersWrap_"]','[class^="members_"]']},
  {id:'user', label:'底部使用者控制列', selectors:['[class^="panels_"]']}
];
const SOURCE_DEFAULTS={path:'',recursive:false,shuffle:true,minutes:10,fade:1000,dim:50,blur:0,auto:false,fit:'cover',x:50,y:50};
const REGION_DEFAULTS={mode:'shared',override:false,dim:50,blur:0,fit:'cover',x:50,y:50,source:{}};
const CSS=`
      #bgm-local-v3 {position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;background:var(--bgm-base,#18191c);}
      #bgm-local-v3 .bgm-picture {position:absolute;inset:0;background-size:cover;background-position:center;opacity:0;pointer-events:none;transition:opacity var(--bgm-fade,1000ms) ease;filter:brightness(var(--bgm-bright,.5)) blur(var(--bgm-blur,0px));}
      body:has(> #bgm-local-v3) #app-mount {position:relative;z-index:1;background:transparent!important;}
      body:has(> #bgm-local-v3) #app-mount :is([class^="app_"],[class*=" app_"],[class^="appMount_"],[class^="bg_"],[class*=" bg_"],[class^="base_"],[class^="baseLayer_"],[class^="layers_"],[class^="layer_"],[class^="content_"],[class^="chat_"],[class^="chatContent_"],[class^="sidebar_"],[class^="sidebarList_"],[class^="guilds_"],[class^="membersWrap_"],[class^="members_"],[class^="container_"][class*="themed_"],[class^="privateChannels_"],[class^="scroller_"][class*="thin_"]) {background-color:transparent!important;}
      body:has(> #bgm-local-v3) #app-mount :is(.theme-dark,.theme-light,#app-mount), body:has(> #bgm-local-v3) #app-mount {--background-primary:transparent;--background-secondary:transparent;--background-secondary-alt:rgba(0,0,0,.12);--background-tertiary:transparent;--background-base-lowest:transparent;--background-base-lower:transparent;--background-base-low:transparent;--background-base-normal:transparent;--background-surface-high:rgba(25,25,29,.82);--bg-base-primary:transparent;--bg-base-secondary:transparent;--bg-base-tertiary:transparent;--bg-surface-overlay:rgba(25,25,29,.94);--chat-background-default:transparent;--app-frame-background:transparent;--custom-channel-members-bg:transparent;}
      
      #bgm-local-v3 .bgm-frame {position:absolute;overflow:hidden;pointer-events:none;}
      #bgm-local-v3 .bgm-picture {background-repeat:no-repeat; background-size:var(--bgm-fit,cover);background-position:var(--bgm-position,center);}
      body:has(> #bgm-local-v3) #app-mount [data-bgm-zone], body:has(> #bgm-local-v3) #app-mount [data-bgm-zone="user"] > [class^="container_"] {background-color:transparent!important;}
`;
module.exports=class BackgroundManager {
  constructor(){this.id='BackgroundManager';this.key='folderRewriteV3';this.regionKey='regionsV31';this.running=false;this.sources={};this.regions={};this.root=null;this.css=null;this.overlays={};this.targets={};this.nativeColors={};this.timer=null;this.refreshUI=null;this.base='#18191c';this.decodeTail=Promise.resolve();}
  num(v,min,max,d){const n=Number(v);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):d;}
  cleanSource(v){const a={...SOURCE_DEFAULTS,...(v||{})};for(const [k,min,max] of [['minutes',1,1440],['fade',0,5000],['dim',0,95],['blur',0,20],['x',0,100],['y',0,100]])a[k]=this.num(a[k],min,max,SOURCE_DEFAULTS[k]);a.fit=['cover','contain','auto','100% 100%'].includes(a.fit)?a.fit:'cover';a.path=typeof a.path==='string'?a.path:'';for(const k of ['recursive','shuffle','auto'])a[k]=typeof a[k]==='boolean'?a[k]:SOURCE_DEFAULTS[k];return a;}
  cleanRegion(v){const r={...REGION_DEFAULTS,...(v||{})};r.mode=['native','shared','independent'].includes(r.mode)?r.mode:'shared';r.override=r.override===true;const a=this.cleanSource(r);for(const k of ['dim','blur','fit','x','y'])r[k]=a[k];r.source=this.cleanSource(r.source);return r;}
  acquire(){let release;const prior=this.decodeTail;this.decodeTail=new Promise(r=>{release=r;});return prior.then(()=>release);}
  sourceSettings(zone){return zone==='shared'?this.shared:this.regions[zone].source;}
  order(zone){return zone==='shared'?0:ZONES.findIndex(z=>z.id===zone)+1;}
  start(){if(this.running)return;this.running=true;let old,regions;try{old=BdApi.Data.load(this.id,this.key);regions=BdApi.Data.load(this.id,this.regionKey);}catch(e){console.warn('[BackgroundManager]',e);}
    this.shared=this.cleanSource(old);for(const z of ZONES)this.regions[z.id]=this.cleanRegion(regions?.[z.id]);
    this.sources.shared=new WallpaperSource(this,'shared');this.sources.shared.start();for(const z of ZONES){const src=this.sources[z.id]=new WallpaperSource(this,z.id);src.s=this.regions[z.id].source;if(this.regions[z.id].mode==='independent')src.start();}
  }
  save(){try{BdApi.Data.save(this.id,this.key,this.shared);BdApi.Data.save(this.id,this.regionKey,this.regions);}catch(e){console.warn('[BackgroundManager] save',e);}}
  stop(){this.running=false;clearInterval(this.timer);this.timer=null;for(const s of Object.values(this.sources))s.stop();this.unmount();this.sources={};this.refreshUI=null;}
  unmount(){clearInterval(this.timer);this.timer=null;this.root?.remove();this.css?.remove();this.root=this.css=null;for(const t of Object.values(this.targets))t?.removeAttribute('data-bgm-zone');this.targets={};this.overlays={};this.nativeColors={};}
  target(z){for(const sel of z.selectors){for(const e of document.querySelectorAll('#app-mount '+sel)){const r=e.getBoundingClientRect();if(r.width>5&&r.height>5&&getComputedStyle(e).visibility!=='hidden')return e;}}return null;}
  nativeColor(e,zone){let c=e?getComputedStyle(e).backgroundColor:'';if(c&&c!=='transparent'&&!/^rgba\([^)]*,\s*0(?:\.0+)?\)$/.test(c))return c;return this.nativeColors[zone]||this.base;}
  ensureRoot(){if(this.root?.isConnected)return this.root;
    const app=document.querySelector('#app-mount');const theme=app?.querySelector('.theme-light,.theme-dark')||app;const style=theme&&getComputedStyle(theme);const light=!!theme?.classList.contains('theme-light')||document.documentElement.classList.contains('theme-light');this.base=(style?.getPropertyValue('--background-base-lowest')||'').trim()||(light?'#f2f3f5':'#18191c');if(this.base==='transparent')this.base=light?'#f2f3f5':'#18191c';
    for(const z of ZONES){const e=this.target(z);const fallback=(style?.getPropertyValue(z.id==='chat'?'--background-primary':'--background-secondary')||'').trim();this.nativeColors[z.id]=fallback&&fallback!=='transparent'?fallback:this.base;this.nativeColors[z.id]=this.nativeColor(e,z.id);}
    const root=document.createElement('div');root.id='bgm-local-v3';root.setAttribute('aria-hidden','true');root.style.setProperty('--bgm-base',this.base);const css=document.createElement('style');css.textContent=CSS;document.head.append(css);document.body.prepend(root);this.root=root;this.css=css;this.timer=setInterval(()=>{try{this.render();}catch(e){console.warn('[BackgroundManager] layout',e);}},500);return root;
  }
  frame(zone){const e=document.createElement('div');e.className='bgm-frame';e.dataset.bgmFrame=zone;e.style.zIndex=String(this.order(zone));if(zone==='shared')e.style.inset='0';return e;}
  styleFrame(e,s){e.style.setProperty('--bgm-fade',`${s.fade??this.shared.fade}ms`);e.style.setProperty('--bgm-bright',String(1-s.dim/100));e.style.setProperty('--bgm-blur',`${s.blur}px`);e.style.setProperty('--bgm-fit',s.fit||'cover');e.style.setProperty('--bgm-position',`${s.x??50}% ${s.y??50}%`);}
  geometry(e,t){if(!t){e.style.display='none';return;}const r=t.getBoundingClientRect();e.style.display='';Object.assign(e.style,{left:`${r.left}px`,top:`${r.top}px`,width:`${r.width}px`,height:`${r.height}px`});}
  removeOverlay(id){this.overlays[id]?.remove();delete this.overlays[id];}
  overlay(id){if(!this.overlays[id]){const e=this.frame(id);e.dataset.bgmOverlay=id;this.root.append(e);this.overlays[id]=e;}return this.overlays[id];}
  render(){if(!this.running||!this.root)return;const shared=this.sources.shared;const any=Object.values(this.sources).some(s=>s.index>=0&&s.root?.isConnected);if(!any){this.unmount();return;}
    for(const z of ZONES){const id=z.id,r=this.regions[id],src=this.sources[id],t=this.target(z);if(this.targets[id]!==t){this.targets[id]?.removeAttribute('data-bgm-zone');this.targets[id]=t;t?.setAttribute('data-bgm-zone',id);}
      if(src.root)this.geometry(src.root,t);
      if(r.mode==='independent'&&src.index>=0&&src.root?.isConnected){this.removeOverlay(id);continue;}
      if(r.mode==='shared'&&!r.override&&shared.index>=0){this.removeOverlay(id);continue;}
      if(!t){this.removeOverlay(id);continue;}
      const e=this.overlay(id);this.geometry(e,t);
      if(r.mode==='native'||r.mode==='independent'||shared.index<0){if(e.children.length)e.replaceChildren();e.style.backgroundColor=this.base;const color=this.nativeColors[id]||this.base;e.style.backgroundImage=`linear-gradient(${color},${color})`;continue;}
      e.style.backgroundColor=this.base;e.style.backgroundImage='none';this.styleFrame(e,{...r,fade:shared.s.fade});
      if(e.children.length!==2){e.replaceChildren();for(let i=0;i<2;i++){const l=document.createElement('div');l.className='bgm-picture';e.append(l);}}
      for(let i=0;i<2;i++){const l=e.children[i],u=shared.urls[i];const img=u?`url("${u}")`:'';if(l.style.backgroundImage!==img){l.style.backgroundImage=img;if(i===shared.index){l.style.opacity='0';void l.offsetWidth;}}l.style.opacity=i===shared.index?'1':'0';}
    }
  }
  setMode(id,mode){const r=this.regions[id],s=this.sources[id];if(r.mode===mode)return;r.mode=mode;if(mode==='independent'){s.start();}else{s.stop();}this.save();this.render();}
  getSettingsPanel(){
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
    const sourcePanel=(p,src)=>{const a=src.s;const path=field(add(p,el('input')));path.type='text';path.placeholder='D:\\Coding\\Background';path.value=a.path;path.style.width='100%';const pick=add(p,el('input'));pick.type='file';pick.multiple=true;pick.setAttribute('webkitdirectory','');pick.style.display='none';pick.onchange=()=>{src.applyFiles(pick.files);pick.value='';};const bar=add(p,el('div'));bar.append(button('原生選取資料夾',()=>pick.click()),button('套用路徑',()=>src.applyPath(path.value)),button('下一張',()=>src.next()),button('重新掃描',()=>src.sync()),button('停止此背景',()=>{src.reset();src.setStatus('已停止');}));
      check(p,'包含子資料夾（重新套用後生效）',a,'recursive');check(p,'隨機輪播',a,'shuffle');check(p,'自動載入已儲存路徑',a,'auto');number(p,'輪播間隔（分鐘）',a,'minutes',1,1440,()=>{if(src.timer)src.schedule();});number(p,'轉場（ms）',a,'fade',0,5000,()=>src.appearance());appearance(p,a,()=>src.appearance());const st=add(p,el('div',src.status));st.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;padding:8px;border:1px solid currentColor;border-radius:4px;';src.refreshUI=()=>{st.textContent=src.status;};};
    const section=(title,open=false)=>{const d=add(panel,el('details'));d.open=open;d.style.cssText='padding:10px;border:1px solid #7776;border-radius:6px;';add(d,el('summary',title));const body=add(d,el('div'));body.style.cssText='display:grid;gap:9px;padding-top:12px;';return body;};
    add(panel,el('h3','BackgroundManager 3.1 — 分區背景'));add(panel,el('p','預設所有區域共用全視窗背景。原生色模式以不透明色遮住背景；獨立模式可選不同資料夾。建議先用原生資料夾選取，確認正常後再啟用自動載入。'));
    const global=section('全視窗共用背景',true);sourcePanel(global,this.sources.shared);
    for(const z of ZONES){const p=section(z.label),r=this.regions[z.id];const body=el('div');body.style.cssText='display:grid;gap:9px;';const draw=()=>{body.replaceChildren();if(r.mode==='shared'){check(body,'獨立調整共用背景的外觀',r,'override',()=>{draw();this.render();});if(r.override)appearance(body,r,()=>this.render());}else if(r.mode==='independent'){sourcePanel(body,this.sources[z.id]);}else add(body,el('p','以區域原生底色遮蔽背景圖片（不修改文字與圖示）。'));};select(p,'背景模式',[['shared','共用背景'],['native','原生色（無圖片）'],['independent','獨立背景及輪播']],r.mode,v=>{this.setMode(z.id,v);draw();});add(p,body);draw();}
    add(panel,el('p','安全限制同 3.0：單張 12 MiB／2400 萬像素；路徑每分鐘掃描，最多 3000 個項目。每個獨立區域持有自己的圖片及計時器，建議先測試少量區域。'));
    return panel;
  }
};
