const {test} = require('node:test');
const assert = require('node:assert/strict');
const Plugin = require('../BackgroundManager.plugin.js');
const memory = new Map();
global.BdApi = {Data:{load:(_,k)=>memory.get(k),save:(_,k,v)=>memory.set(k,structuredClone(v))}};
function fresh(){memory.clear();const p=new Plugin();p.start();return p;}
test('old settings retain shared, independent and native modes',()=>{
  memory.clear();memory.set('folderRewriteV3',{path:'old',dim:33});memory.set('regionsV31',{channels:{mode:'independent',source:{path:'left'}},members:{mode:'native'}});
  const p=new Plugin();p.start();try{assert.equal(p.shared.path,'old');assert.equal(p.regions.chat.mode,'shared');assert.equal(p.sources.channels.running,true);assert.equal(p.sources.channels.s.path,'left');assert.equal(p.regionSource('members'),null);assert.equal(p.sources.groupA.running,false);}finally{p.stop();}
});
test('same group shares source; separate groups and independent regions do not',()=>{
  const p=fresh();try{p.setMode('channels','groupA');p.setMode('members','groupA');p.setMode('chat','groupB');p.setMode('servers','independent');assert.strictEqual(p.regionSource('channels'),p.regionSource('members'));assert.notStrictEqual(p.regionSource('chat'),p.regionSource('channels'));assert.notStrictEqual(p.regionSource('servers'),p.regionSource('chat'));assert.equal(p.groupMembers('groupA').length,2);assert.equal(p.sources.groupA.running,true);assert.equal(p.sources.groupC.running,false);assert.equal(p.sources.channels.running,false);}finally{p.stop();}
});
test('leaving a group retains playback until final member leaves, then clears resources',()=>{
  const p=fresh();try{p.setMode('channels','groupA');p.setMode('members','groupA');const s=p.sources.groupA;s.active=true;s.urls[0]=URL.createObjectURL(new Blob(['x']));const url=s.urls[0];s.schedule();const timer=s.timer;p.setMode('channels','native');assert.equal(s.timer,timer);assert.equal(s.running,true);p.setMode('members','independent');assert.equal(s.running,false);assert.equal(s.timer,null);assert.equal(s.scanTimer,null);assert.equal(s.urls[0],null);assert.equal(require('node:buffer').resolveObjectURL(url),undefined);assert.equal(p.sources.members.running,true);}finally{p.stop();}
});
test('group settings and assignments survive restart; invalid modes are rejected',()=>{
  const p=fresh();p.setMode('channels','groupD');p.setMode('members','groupD');p.groups.groupD.path='D:/pics';p.groups.groupD.minutes=3;p.save();p.setMode('chat','invalid');assert.equal(p.regions.chat.mode,'shared');p.stop();const q=new Plugin();q.start();try{assert.equal(q.regions.channels.mode,'groupD');assert.equal(q.regions.members.mode,'groupD');assert.equal(q.sources.groupD.s.path,'D:/pics');assert.equal(q.sources.groupD.s.minutes,3);assert.equal(q.sources.groupD.running,true);assert.equal(q.sources.groupA.running,false);}finally{q.stop();}
});
test('switching independent to group preserves previous independent source settings',()=>{
  const p=fresh();try{p.setMode('chat','independent');p.regions.chat.source.path='previous';p.setMode('chat','groupB');assert.equal(p.sources.chat.running,false);p.setMode('chat','independent');assert.equal(p.sources.chat.running,true);assert.equal(p.sources.chat.s.path,'previous');assert.equal(p.sources.groupB.running,false);}finally{p.stop();}
});
test('group canvas spans physical gaps and excludes hidden members',()=>{
  const p=fresh();try{p.setMode('channels','groupA');p.setMode('members','groupA');p.setMode('chat','groupB');const rects={channels:{left:70,top:20,right:270,bottom:700},members:{left:820,top:50,right:1000,bottom:700},chat:{left:270,top:20,right:820,bottom:700}};assert.deepEqual(p.groupBounds('groupA',rects),{left:70,top:20,width:930,height:680});delete rects.members;assert.deepEqual(p.groupBounds('groupA',rects),{left:70,top:20,width:200,height:680});assert.equal(p.groupBounds('groupC',rects),null);}finally{p.stop();}
});
test('native picker name persists and stale path does not autoload on restart',()=>{
  const p=fresh();const s=p.sources.shared;s.s.path='old-path';s.s.auto=true;s.next=()=>{};const f=new File(['x'],'a.png',{type:'image/png'});Object.defineProperty(f,'webkitRelativePath',{value:'Hanfu/a.png'});s.applyFiles([f]);assert.equal(s.s.pickerFolder,'Hanfu');assert.equal(s.s.selection,'picker');p.stop();const q=new Plugin();q.start();try{assert.equal(q.shared.pickerFolder,'Hanfu');assert.equal(q.sources.shared.startTimer,null);assert.equal(q.sources.shared.mode,'picker');assert.match(q.sources.shared.status,/重新選取/);}finally{q.stop();}
});

test('full mode exclusively activates shared source, restores regional assignments and persists mode',()=>{
  const p=fresh();try{p.setMode('servers','groupA');p.setMode('channels','groupA');p.setMode('chat','independent');const a=p.sources.groupA;a.active=true;a.urls[0]=URL.createObjectURL(new Blob(['x']));const url=a.urls[0];a.schedule();p.setDisplayMode('full');assert.equal(p.displayMode,'full');assert.equal(p.regions.servers.mode,'groupA');assert.equal(p.regionSource('servers'),p.sources.shared);assert.deepEqual(Object.entries(p.sources).filter(([,s])=>s.running).map(([id])=>id),['shared']);assert.equal(a.timer,null);assert.equal(require('node:buffer').resolveObjectURL(url),undefined);p.setDisplayMode('regional');assert.equal(p.regionSource('servers'),a);assert.equal(p.sources.chat.running,true);p.setDisplayMode('full');p.stop();const q=new Plugin();q.start();try{assert.equal(q.displayMode,'full');assert.equal(q.regions.chat.mode,'independent');assert.equal(q.sources.chat.running,false);}finally{q.stop();}}finally{p.stop();}
});
