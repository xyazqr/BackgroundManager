/**
 * @name BackgroundManager
 * @author Local rewrite
 * @description 本機資料夾背景輪播（獨立重寫，不修改 Discord 內部模組）。
 * @version 3.0.0
 */
module.exports = class BackgroundManager {
  constructor() {
    this.id = 'BackgroundManager'; this.key = 'folderRewriteV3';
    this.s = {path:'', recursive:false, shuffle:true, minutes:10, fade:1000, dim:50, blur:0, auto:false};
    this.running=false; this.active=false; this.busy=false; this.gen=0; this.files=[]; this.current=null; this.status='尚未載入背景'; this.mode='path'; this.timer=null; this.scanTimer=null; this.cleanupTimer=null; this.startTimer=null; this.layers=[]; this.urls=[null,null]; this.index=-1; this.fs=null; this.refreshUI=null;
  }
  start() {
    this.running=true;
    try { const old=BdApi.Data.load(this.id,this.key); if(old && typeof old==='object') this.s={...this.s,...old}; } catch(e){this.report(e);}
    this.s.minutes=this.num(this.s.minutes,1,1440,10); this.s.fade=this.num(this.s.fade,0,5000,1000); this.s.dim=this.num(this.s.dim,0,95,50); this.s.blur=this.num(this.s.blur,0,20,0);
    if(this.s.auto && this.s.path) this.startTimer=setTimeout(()=>{if(this.running) this.applyPath(this.s.path);},3000);
  }
  stop() { this.running=false; this.reset(); this.refreshUI=null; }
  num(v,min,max,d) { const n=Number(v); return Number.isFinite(n)?Math.min(max,Math.max(min,n)):d; }
  save() { try { BdApi.Data.save(this.id,this.key,this.s); } catch(e){this.report(e);} }
  report(e) { this.setStatus(String(e?.message||e)); console.warn('[BackgroundManager]',e); }
  setStatus(s) { this.status=s; try{this.refreshUI?.();}catch(e){console.warn(e);} }
  reset() {
    this.gen++; this.active=false; this.busy=false; clearTimeout(this.startTimer); clearInterval(this.timer); clearInterval(this.scanTimer); clearTimeout(this.cleanupTimer);
    this.timer=this.scanTimer=this.cleanupTimer=this.startTimer=null; this.files=[]; this.current=null;
    this.root?.remove(); this.css?.remove(); this.root=this.css=null; this.layers=[];
    for(const u of this.urls) if(u) URL.revokeObjectURL(u); this.urls=[null,null]; this.index=-1;
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
    if(!this.running||!this.active||this.busy)return;const f=this.choose();if(!f)return;const g=this.gen;this.busy=true;let u=null;
    try {this.setStatus(`載入：${f.name}`);await new Promise(r=>setTimeout(r,30));if(g!==this.gen)return;
      u=URL.createObjectURL(this.read(f));await this.decode(u);if(g!==this.gen||!this.running)return;
      this.show(u);u=null;this.current=f;this.setStatus(`${this.files.length} 張｜${f.name}`);this.schedule();
    }catch(e){if(g===this.gen){this.setStatus(`${f.name}：${e.message||e}。已暫停自動輪播，可手動下一張。`);clearInterval(this.timer);clearInterval(this.scanTimer);this.timer=this.scanTimer=null;this.current=f;console.warn('[BackgroundManager]',e);}}
    finally {if(u)URL.revokeObjectURL(u);if(g===this.gen)this.busy=false;}
  }
  schedule() {
    clearInterval(this.timer);this.timer=null;
    if(!this.active||!this.running)return;
    this.timer=setInterval(()=>this.next(),this.s.minutes*60000);
    if(this.mode==='path'&&!this.scanTimer)this.scanTimer=setInterval(()=>this.sync(),60000);
  }
  mount() {
    if(this.root?.isConnected)return;
    const root=document.createElement('div');root.id='bgm-local-v3';root.setAttribute('aria-hidden','true');
    const css=document.createElement('style');css.textContent=`
      #bgm-local-v3 {position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden;background:#18191c;}
      #bgm-local-v3 > div {position:absolute;inset:-24px;background-size:cover;background-position:center;opacity:0;pointer-events:none;transition:opacity var(--bgm-fade,1000ms) ease;filter:brightness(var(--bgm-bright,.5)) blur(var(--bgm-blur,0px));}
      body:has(> #bgm-local-v3) #app-mount {position:relative;z-index:1;background:transparent!important;}
      body:has(> #bgm-local-v3) #app-mount :is([class^="app_"],[class*=" app_"],[class^="appMount_"],[class^="bg_"],[class*=" bg_"],[class^="base_"],[class^="baseLayer_"],[class^="layers_"],[class^="layer_"],[class^="content_"],[class^="chat_"],[class^="chatContent_"],[class^="sidebar_"],[class^="sidebarList_"],[class^="guilds_"],[class^="membersWrap_"],[class^="members_"],[class^="container_"][class*="themed_"],[class^="privateChannels_"],[class^="scroller_"][class*="thin_"]) {background-color:transparent!important;}
      body:has(> #bgm-local-v3) #app-mount :is(.theme-dark,.theme-light,#app-mount), body:has(> #bgm-local-v3) #app-mount {--background-primary:transparent;--background-secondary:transparent;--background-secondary-alt:rgba(0,0,0,.12);--background-tertiary:transparent;--background-base-lowest:transparent;--background-base-lower:transparent;--background-base-low:transparent;--background-base-normal:transparent;--background-surface-high:rgba(25,25,29,.82);--bg-base-primary:transparent;--bg-base-secondary:transparent;--bg-base-tertiary:transparent;--bg-surface-overlay:rgba(25,25,29,.94);--chat-background-default:transparent;--app-frame-background:transparent;--custom-channel-members-bg:transparent;}
      `;
    this.layers=[document.createElement('div'),document.createElement('div')];root.append(...this.layers);document.head.append(css);document.body.prepend(root);this.root=root;this.css=css;this.appearance();
  }
  appearance() {if(!this.root)return;this.root.style.setProperty('--bgm-fade',`${this.s.fade}ms`);this.root.style.setProperty('--bgm-bright',String(1-this.s.dim/100));this.root.style.setProperty('--bgm-blur',`${this.s.blur}px`);}
  show(u) {
    this.mount();clearTimeout(this.cleanupTimer);const old=this.index;const i=old<0?0:1-old;
    if(this.urls[i])URL.revokeObjectURL(this.urls[i]);this.urls[i]=u;this.layers[i].style.backgroundImage=`url("${u}")`;this.layers[i].style.opacity='0';void this.layers[i].offsetWidth;this.layers[i].style.opacity='1';if(old>=0)this.layers[old].style.opacity='0';this.index=i;
    if(old>=0)this.cleanupTimer=setTimeout(()=>{if(this.index!==old){this.layers[old].style.backgroundImage='';if(this.urls[old])URL.revokeObjectURL(this.urls[old]);this.urls[old]=null;}},this.s.fade+100);
  }
  getSettingsPanel() {
    const panel=document.createElement('div');panel.style.cssText='display:grid;gap:12px;padding:12px;color:var(--text-normal);';
    const el=(tag,text)=>{const e=document.createElement(tag);if(text)e.textContent=text;return e;};const add=(e)=>{panel.append(e);return e;};
    const button=(text,fn)=>{const b=el('button',text);b.type='button';b.style.cssText='padding:8px 12px;border-radius:5px;background:#5865f2;color:white;cursor:pointer;margin:2px;';b.onclick=()=>{try{fn();}catch(e){this.report(e);}};return b;};
    const row=(label,input)=>{const l=el('label',label+' ');l.style.cssText='display:flex;justify-content:space-between;align-items:center;gap:12px;';l.append(input);add(l);};
    const check=(label,key)=>{const c=el('input');c.type='checkbox';c.checked=!!this.s[key];c.onchange=()=>{this.s[key]=c.checked;this.save();};row(label,c);};
    const number=(label,key,min,max)=>{const n=el('input');n.type='number';n.min=min;n.max=max;n.value=this.s[key];n.style.cssText='width:85px;padding:5px;background:var(--input-background,#222);color:var(--text-normal,#fff);';n.onchange=()=>{this.s[key]=this.num(n.value,min,max,this.s[key]);n.value=this.s[key];this.save();this.appearance();if(this.timer)this.schedule();};row(label,n);};
    add(el('h3','本機資料夾背景輪播 3.0'));add(el('p','建議先用原生選取資料夾測試，不透過 BetterDiscord 檔案 API。路徑模式可自動重新掃描；原生模式重新開啟 Discord 後需再選一次。'));
    const path=add(el('input'));path.type='text';path.placeholder='D:\\Coding\\Background';path.value=this.s.path;path.style.cssText='width:100%;padding:8px;background:var(--input-background,#222);color:var(--text-normal,#fff);';
    const pick=el('input');pick.type='file';pick.multiple=true;pick.setAttribute('webkitdirectory','');pick.style.display='none';pick.onchange=()=>{this.applyFiles(pick.files);pick.value='';};add(pick);
    const controls=add(el('div'));controls.append(button('原生選取資料夾（建議）',()=>pick.click()),button('套用路徑',()=>this.applyPath(path.value)),button('下一張',()=>this.next()),button('重新掃描',()=>this.sync()),button('停止背景',()=>{this.reset();this.setStatus('已停止');}));
    check('包含子資料夾（重新選取或套用後生效）','recursive');check('隨機輪播','shuffle');check('啟動 Discord 時自動載入路徑（預設關閉）','auto');number('輪播間隔（分鐘）','minutes',1,1440);number('轉場（ms）','fade',0,5000);number('背景暗化（%）','dim',0,95);number('模糊（px）','blur',0,20);
    const status=add(el('div',this.status));status.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;color:var(--text-normal,#fff);padding:8px;border:1px solid currentColor;border-radius:4px;';this.refreshUI=()=>{status.textContent=this.status;};
    add(el('p','安全限制：單張 12 MiB、2400 萬像素；路徑模式每分鐘掃描，最多 3000 個項目／100 個資料夾／8 層。背景失敗會停止自動輪播，不會連續重試。'));
    return panel;
  }
};
