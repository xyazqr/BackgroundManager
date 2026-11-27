const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Plugin = require('../BackgroundManager.plugin.js');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jv1sAAAAASUVORK5CYII=', 'base64');
global.BdApi = {Data:{load:()=>undefined, save:()=>{}}};

test('fresh install starts safely without configuration',()=>{
  const p=new Plugin(); p.start();
  assert.equal(p.running,true); assert.equal(p.shared.path,''); assert.equal(p.shared.auto,false); assert.equal(p.sources.shared.startTimer,null);
  p.stop(); assert.equal(p.running,false); assert.equal(p.sources.shared?.active??false,false);
});
test('saved settings are bounded',()=>{
  const load=BdApi.Data.load; BdApi.Data.load=()=>({minutes:-10,fade:99999,dim:999,blur:-5});
  try{const p=new Plugin();p.start();assert.deepEqual([p.shared.minutes,p.shared.fade,p.shared.dim,p.shared.blur],[1,5000,95,0]);p.stop();}finally{BdApi.Data.load=load;}
});
test('scan, recursion, natural sorting, deletion, and byte read',async()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'bgm-'));
  try{
    fs.writeFileSync(path.join(dir,'10.png'),png);fs.writeFileSync(path.join(dir,'2.png'),png);fs.writeFileSync(path.join(dir,'ignore.txt'),'x');
    fs.mkdirSync(path.join(dir,'nested'));fs.writeFileSync(path.join(dir,'nested','3.png'),png);
    const plugin=new Plugin();plugin.start();const p=plugin.sources.shared; let files=p.scan(dir);assert.deepEqual(files.map(f=>f.name),['2.png','10.png']);
    const blob=p.read(files[0]);assert.equal(blob.type,'image/png');assert.deepEqual(Buffer.from(await blob.arrayBuffer()),png);
    p.s.recursive=true;assert.equal(p.scan(dir).length,3);fs.unlinkSync(path.join(dir,'2.png'));assert.equal(p.scan(dir).length,2);
    assert.equal(p.valid('large.png',12*1024*1024+1),false);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('native file selection does not read via fs; nonrecursive filters subfolders',()=>{
  const plugin=new Plugin();plugin.start();const p=plugin.sources.shared;let nextCalls=0;p.next=()=>{nextCalls++;};
  const root=new File([png],'a.png',{type:'image/png'});Object.defineProperty(root,'webkitRelativePath',{value:'wallpapers/a.png'});
  const nested=new File([png],'b.png',{type:'image/png'});Object.defineProperty(nested,'webkitRelativePath',{value:'wallpapers/nested/b.png'});
  p.applyFiles([root,nested]);assert.equal(p.mode,'picker');assert.equal(p.files.length,1);assert.equal(p.read(p.files[0]),root);assert.equal(p.fs,null);
  p.s.recursive=true;p.applyFiles([root,nested]);assert.equal(p.files.length,2);assert.equal(nextCalls,2);p.stop();
});
test('sequential and random selection avoid repeating current image',()=>{
  const plugin=new Plugin();plugin.start();const p=plugin.sources.shared;p.files=[{key:'a'},{key:'b'},{key:'c'}];p.current=p.files[0];p.s.shuffle=false;assert.equal(p.choose().key,'b');p.current=p.files[2];assert.equal(p.choose().key,'a');
  p.s.shuffle=true;for(let i=0;i<100;i++)assert.notEqual(p.choose().key,'c');
});
test('stop clears timers and releases object URLs',()=>{
  const plugin=new Plugin();plugin.start();const p=plugin.sources.shared;p.active=true;p.urls=[URL.createObjectURL(new Blob([png])),null];const url=p.urls[0];p.schedule();assert.ok(p.timer);assert.ok(p.scanTimer);p.stop();
  assert.equal(p.timer,null);assert.equal(p.scanTimer,null);assert.equal(p.active,false);assert.deepEqual(p.urls,[null,null]);assert.equal(require('node:buffer').resolveObjectURL(url),undefined);
});

test('region migration, distinct settings and lifecycle',()=>{
  const old=BdApi.Data.load;BdApi.Data.load=(_,k)=>k==='folderRewriteV3'?{path:'existing',dim:33}:k==='regionsV31'?{channels:{mode:'independent',source:{path:'left',dim:19}},members:{mode:'native'}}:undefined;
  try{const p=new Plugin();p.start();assert.equal(p.shared.path,'existing');assert.equal(p.shared.dim,33);assert.equal(p.regions.chat.mode,'shared');assert.equal(p.sources.channels.running,true);assert.equal(p.sources.channels.s.path,'left');assert.equal(p.sources.members.running,false);p.setMode('channels','native');assert.equal(p.sources.channels.running,false);p.setMode('members','independent');assert.equal(p.sources.members.running,true);assert.notEqual(p.sources.members.s,p.sources.channels.s);p.stop();}finally{BdApi.Data.load=old;}
});
test('decode queue serializes concurrent sources',async()=>{const p=new Plugin();const first=await p.acquire();let acquired=false;const next=p.acquire().then(release=>{acquired=true;release();});await Promise.resolve();assert.equal(acquired,false);first();await next;assert.equal(acquired,true);});
