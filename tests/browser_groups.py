from playwright.sync_api import sync_playwright
from pathlib import Path
import os, shutil
s=(Path(__file__).resolve().parents[1] / 'BackgroundManager.plugin.js').read_text()
with sync_playwright() as p:
 b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or shutil.which('chromium-browser'),args=['--no-sandbox']);page=b.new_page(viewport={'width':1000,'height':700});errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content('''<style>body{margin:0}#app-mount{width:100vw;height:100vh;background:#111}.app_x{display:flex;height:100%;background:#222}.guilds_x{width:70px;background:#161616}.sidebarList_x{width:200px;background:#333;position:relative}.panels_x{position:absolute;bottom:0;width:100%;height:70px;background:#555}.chatContent_x{flex:1;background:#444}.membersWrap_x{width:180px;background:#666}</style><div id="app-mount"><div class="app_x theme-dark"><div class="guilds_x"></div><div class="sidebarList_x"><div class="panels_x"></div></div><div class="chatContent_x"></div><div class="membersWrap_x"></div></div></div>''')
 page.evaluate('window.module={exports:{}};window.BdApi={Data:{load:()=>undefined,save:()=>{}}};');page.add_script_tag(content=s)
 page.evaluate('''async()=>{window.plugin=new module.exports();plugin.start();window.file=async(color,name)=>{const c=document.createElement('canvas');c.width=8;c.height=8;const x=c.getContext('2d');x.fillStyle=color;x.fillRect(0,0,8,8);return new File([await new Promise(r=>c.toBlob(r))],name,{type:'image/png'});};plugin.shared.fade=0;plugin.sources.shared.applyFiles([await file('red','red.png')]);}''')
 page.wait_for_function('plugin.sources.shared.index>=0');assert page.evaluate('plugin.sources.shared.root.getBoundingClientRect().width===1000')
 page.evaluate('''async()=>{plugin.setMode('channels','groupA');plugin.setMode('members','groupA');plugin.setMode('chat','groupB');plugin.setMode('servers','independent');plugin.setMode('user','native');for(const id of ['groupA','groupB','servers']){plugin.sources[id].s.fade=0;plugin.sources[id].s.shuffle=false;}plugin.sources.groupA.applyFiles([await file('blue','a.png'),await file('green','b.png')]);plugin.sources.groupB.applyFiles([await file('yellow','c.png')]);plugin.sources.servers.applyFiles([await file('white','d.png')]);}''')
 page.wait_for_function("['groupA','groupB','servers'].every(id=>plugin.sources[id].index>=0)")
 assert page.evaluate('''()=>{const p=plugin,a=p.sources.groupA, l=p.overlays.channels,r=p.overlays.members,c=p.overlays.chat;return l.children[a.index].style.backgroundImage===r.children[a.index].style.backgroundImage && l.children[a.index].style.backgroundImage.includes(a.urls[a.index]) && c.dataset.bgmSource==='groupB' && a.root.style.display==='none' && l.getBoundingClientRect().width===200 && r.getBoundingClientRect().width===180 && p.overlays.user.style.backgroundImage!=='none'}''')
 page.evaluate('plugin.sources.groupA.next()');page.wait_for_function("plugin.sources.groupA.current.name==='b.png'")
 assert page.evaluate('''()=>{const p=plugin,a=p.sources.groupA;return ['channels','members'].every(id=>p.overlays[id].children[a.index].style.backgroundImage.includes(a.urls[a.index])) && p.sources.groupB.current.name==='c.png' && p.sources.servers.current.name==='d.png'}''')
 page.evaluate("plugin.regions.members.override=true;plugin.regions.members.dim=20;plugin.render()")
 assert page.evaluate("plugin.overlays.members.style.getPropertyValue('--bgm-bright')==='0.8' && plugin.overlays.channels.style.getPropertyValue('--bgm-bright')==='0.5'")
 page.evaluate("document.querySelector('.membersWrap_x').style.display='none'");page.wait_for_function('!plugin.overlays.members');page.evaluate("document.querySelector('.membersWrap_x').style.display='block'");page.wait_for_function("plugin.overlays.members?.dataset.bgmSource==='groupA'")
 page.evaluate("plugin.setMode('members','groupB')");assert page.evaluate("plugin.overlays.members.dataset.bgmSource==='groupB' && plugin.sources.groupA.running")
 page.evaluate("plugin.setMode('channels','shared')");assert page.evaluate("!plugin.sources.groupA.running && plugin.sources.groupA.timer===null && !plugin.overlays.channels")
 page.evaluate('document.body.append(plugin.getSettingsPanel())');assert page.get_by_text('同步群組設定（A～E）',exact=True).count()==1
 # Exercise the actual region selector and group panel, not only direct method calls.
 page.get_by_text('中央聊天區',exact=True).click();page.locator('details').filter(has=page.locator('summary',has_text='中央聊天區')).last.locator('select').first.select_option('groupC',timeout=5000)
 assert page.evaluate("plugin.regions.chat.mode==='groupC' && plugin.sources.groupC.running")
 page.evaluate('plugin.stop()');assert page.evaluate('!document.querySelector("#bgm-local-v3") && !document.querySelector("[data-bgm-zone]")');assert not errors,errors;print('Chromium group integration passed');b.close()
