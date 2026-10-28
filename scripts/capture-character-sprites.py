import argparse,functools,http.server,threading,json,re,shutil
from pathlib import Path
from playwright.sync_api import sync_playwright
parser=argparse.ArgumentParser(description='Capture optional character assets through the real game renderer.')
parser.add_argument('--output-dir',type=Path,required=True)
parser.add_argument('--browser',default=shutil.which('chromium'))
args=parser.parse_args()
ROOT=Path(__file__).resolve().parents[1]/'dist';OUT=args.output_dir.resolve();OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*a):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)));threading.Thread(target=server.serve_forever,daemon=True).start()
HOOK='''
globalThis.characterQA={get game(){return game;},async stage(){
 const module=await import('./character-sprites.js');await module.characterSprites.preload();
 const entries=Object.entries(module.CHARACTER_SPRITES);
 const order=entries.slice(0,8);if(order.length!==8)throw Error('Expected eight character assets');
 const offsets=[[-130,-145],[0,-145],[130,-145],[-130,0],[130,0],[-130,145],[0,145],[130,145]];
 const areas=game.terrain.island?.layout?.areas||[],candidates=[];
 for(const area of areas)for(const [dx,dy]of [[0,0],[-80,0],[80,0],[0,80],[0,-80]])candidates.push({x:area.center.x+dx,y:area.center.y+dy});
 const collisionClear=p=>game.terrain.isFree(p.x,p.y,38)&&game.environment?.isHazardFree(p.x,p.y,40)!==false;
 let anchor=candidates.find(p=>collisionClear(p)&&offsets.every(([x,y])=>collisionClear({x:p.x+x,y:p.y+y})));
 if(!anchor)throw Error('No visually clear authored location for the actual-size comparison');
 game.player.x=anchor.x;game.player.y=anchor.y-19.8;game.player.facing=0;game.player.moving=false;
 const actors=order.map(([id,entry],i)=>({id:'art-preview-'+i,type:'player',characterSpriteId:id,sideQuestActor:true,isTownNpc:true,townKind:'merchant',appearanceId:'merchant',heroId:'merchant',name:entry.name,kind:'merchant',x:anchor.x+offsets[i][0],y:anchor.y+offsets[i][1]-19.8,groundY:anchor.y+offsets[i][1],groundOffset:19.8,r:15,hp:1,maxHp:1,facing:0,moving:false}));
 game.enemies=[];game.effects=[];game.bullets=[];game.enemyBullets=[];game.orbitals=[];game._spawn=game.nextBossAt=Infinity;game.companions.members=[];game.companions.camps=[];
 game.quests.getActors=()=>actors;game.quests.getProps=()=>[];game.quests.getGuide=()=>null;game.quests.getDialogue=()=>[];
 game.settlements.sites=game.settlements.sites.filter(site=>!['merchant','angel'].includes(site.type));
 game.relicSites.sites=game.relicSites.sites.filter(site=>!['rescue','dogcamp'].includes(site.type));
 paused=true;clearInput();sceneDialogue.reset();notifications.clear();updateHUD();renderSchedule.invalidate();
 return {anchor,ids:order.map(([id])=>id),worldView:{width:viewWidth,height:viewHeight},worldZoom,actors:actors.map(a=>({id:a.characterSpriteId,name:a.name,x:a.x,y:a.groundY})),hero:{id:game.player.appearanceId,x:game.player.x,y:game.player.y+19.8}};
},detail(){viewWidth=720;viewHeight=450;worldZoom=1280/720;game.viewWidth=viewWidth;game.viewHeight=viewHeight;renderSchedule.invalidate();}};
'''
results=[]
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path=args.browser,headless=True,args=['--no-sandbox'])
  for phone in [True,False]:
   context=browser.new_context(viewport={'width':393,'height':754}if phone else {'width':1280,'height':800},device_scale_factor=2 if phone else 1,is_mobile=phone,has_touch=phone);page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   page.route(re.compile(r'.*/app\.js(?:\?.*)?$'),lambda r:r.fulfill(status=200,content_type='text/javascript',body=(ROOT/'app.js').read_text()+HOOK))
   page.goto(f'http://127.0.0.1:{server.server_port}/',wait_until='networkidle');page.wait_for_function("!document.querySelector('#start-button').disabled",timeout=60000)
   page.locator('#start-button').click();page.locator('#mode-world').check();page.locator('#prepare-start-button').click()
   page.wait_for_function("globalThis.characterQA?.game&&document.querySelector('#scene-loading').classList.contains('hidden')",timeout=60000)
   result=page.evaluate('characterQA.stage()');page.wait_for_timeout(180)
   result.update(phone=phone,errors=errors);assert not errors,errors
   if phone:assert abs(result['worldView']['width']-540)<1
   file='characters.phone.png' if phone else 'characters.desktop.png';page.screenshot(path=str(OUT/file));result['screenshot']=str(OUT/file);results.append(result);print(json.dumps({'screenshot':str(OUT/file),'worldView':result['worldView'],'characters':len(result['ids']),'errors':errors},ensure_ascii=False),flush=True)
   if not phone:
    page.evaluate('characterQA.detail()');page.wait_for_timeout(100);page.screenshot(path=str(OUT/'characters.detail.png'))
   context.close()
  browser.close()
finally:server.shutdown();server.server_close()
(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
