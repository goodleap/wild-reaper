import { groundOffset } from './terrain.js';
import { INTERIOR_REWARDS } from './interior-profiles.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const foot=g=>({x:g.player.x,y:g.player.y+groundOffset(g.player,true)});

function legacyInteractions(layout){
  const marks=layout.landmarks;
  return {
    caves:['cave05','cave15'].filter(key=>marks[key]).map((key,index)=>({id:key,...marks[key],caveId:'underground-passage',seed:716,name:index===0?'暗河洞穴 · 林间入口':'暗河洞穴 · 北境出口',caveName:'暗河洞穴',exitName:index===0?'返回林间洞口':'前往北境林地'})),
    gates:[{id:'bell-shortcut',key:'shortcutGate',name:'钟楼旧门',approach:marks.shortcut13,description:'打通返回林地的捷径',lockedDescription:'从北侧钟楼绕行'}],
    chests:['treasure07','treasure18'].filter(key=>marks[key]).map(key=>({id:key,...marks[key],name:key==='treasure07'?'林地遗藏':'隐谷遗藏'})),
  };
}

// Each finite authored map owns its doors, caves and rewards. Region snapshots
// retain these instances; revisiting never replenishes a claimed objective.
export class RiftExploration {
  constructor(game){
    this.game=game;this.sites=[];
    const layout=game.terrain.island?.layout;
    if(game.stage||game.expedition||layout?.kind!=='rift-forest')return;
    this.layout=layout;this.shortcutOpen=false;
    this.namespace=layout.worldId?`${layout.worldId}:`:'';
    const spec=layout.interactions??legacyInteractions(layout);
    for(const cave of spec.caves)this.sites.push({...cave,id:`rift:${this.namespace}${cave.id}`,key:cave.id,kind:'cave',state:'ready',r:45});
    for(const descriptor of spec.gates){
      const gate=layout.passages.find(passage=>passage.gateId===descriptor.id)?.gate;if(!gate)continue;
      this.sites.push({...descriptor,...gate,id:`rift:${this.namespace}${descriptor.id}`,key:descriptor.key??descriptor.id,gateId:descriptor.id,kind:'shortcut',angle:Math.atan2(gate.by-gate.ay,gate.bx-gate.ax),halfLength:Math.hypot(gate.bx-gate.ax,gate.by-gate.ay)/2,state:'locked',open:false});
      game.terrain.setRiftGate?.(descriptor.id,false);
    }
    for(const chest of spec.chests)this.sites.push({...chest,id:`rift:${this.namespace}${chest.id}`,key:chest.id,kind:'chest',state:'closed',r:22});
  }
  _near(site,r=105){return distance(foot(this.game),site)<=r;}
  _clearApproach(site){const p=foot(this.game);return !this.game.terrain.firstBlocker(p.x,p.y,site.x,site.y,0,'sight');}
  _gateApproach(site){
    const p=foot(this.game),dx=site.approach.x-site.x,dy=site.approach.y-site.y,n=Math.hypot(dx,dy)||1;
    return {x:site.x+dx/n*76,y:site.y+dy/n*76,allowed:(p.x-site.x)*dx+(p.y-site.y)*dy>0};
  }
  getInteraction(){
    const g=this.game;if(g.status!=='playing'||g.dungeon?.active||!this.layout)return null;
    const candidates=[];
    for(const site of this.sites){
      if(site.kind==='shortcut'){
        if(site.open||!this._near(site,145))continue;
        const point=this._gateApproach(site);
        candidates.push({id:site.id,category:'rift',type:'riftShortcut',label:point.allowed?`打开${site.name}`:`${site.name}从另一侧锁住`,description:point.allowed?(site.description??'打通返回的捷径'):(site.lockedDescription??'从另一侧探索并开启'),x:point.x,y:point.y,touchRadius:40,enabled:point.allowed});
      }else if(site.kind==='cave'&&this._near(site)&&this._clearApproach(site)){
        candidates.push({id:site.id,category:'rift',type:'riftCave',label:`进入${site.caveName??site.name}`,description:site.description??(this.namespace?'地下探索 · 保留战斗与宝物进度':'地下通道连接北境林地'),x:site.x,y:site.y,touchRadius:35,enabled:true});
      }else if(site.kind==='chest'&&site.state==='closed'&&this._near(site,80)&&this._clearApproach(site)){
        const guarded=g.enemies.some(e=>e.hp>0&&e.guardActive!==false&&distance({x:e.x,y:e.y+groundOffset(e)},site)<190);
        candidates.push({id:site.id,category:'rift',type:'riftChest',label:guarded?'清理附近守卫':`开启${site.name}`,description:'金币、灵晶与恢复补给',x:site.x,y:site.y,touchRadius:38,enabled:!guarded});
      }
    }
    return candidates.sort((a,b)=>distance(foot(g),a)-distance(foot(g),b))[0]||null;
  }
  interact(id){
    const choice=this.getInteraction();if(!choice||choice.id!==id||!choice.enabled)return false;
    const site=this.sites.find(s=>s.id===id),g=this.game;
    if(site.kind==='cave')return g.dungeon.enter({id:`rift:${this.namespace}${site.caveId}`,type:'castle',riftCave:true,caveId:site.caveId,entryKey:site.key,name:site.caveName??site.name,x:site.x,y:site.y,door:{x:site.x,y:site.y},interactRadius:105,seed:site.seed});
    if(site.kind==='shortcut'){
      this.shortcutOpen=true;site.open=true;site.state='cleared';g.terrain.setRiftGate?.(site.gateId,true);
      g._emit('riftShortcutOpened',{name:site.name});return true;
    }
    if(site.kind==='chest'){
      site.state='claimed';g.grantResources(INTERIOR_REWARDS.castleSide,'riftTreasure');g.adventure?.dropPickup('herb',site.x,site.y+32);
      g._effect(site.x,site.y,'ring',.7,65,'#d6b66e');g._emit('dungeonChest',{name:site.name});return true;
    }
    return false;
  }
  createCaveState(dungeon,site){
    const state=dungeon._makeState(site),mouths=this.sites.filter(s=>s.kind==='cave'&&s.caveId===site.caveId);
    state.kind='cave';state.name=site.name;state.treasureName=this.namespace?'洞穴遗藏':'暗河遗藏';
    // A paired mouth occupies a distant explored room of the existing seeded
    // maze. A challenge cave keeps only its original surface return opening.
    const occupied=new Set([state.entranceId,state.bossRoom.id,...state.chests.map(c=>c.cellId)]);
    const candidates=state.cells.filter(c=>c.row===0&&!occupied.has(c.id)).sort((a,b)=>state.distances.get(b.id)-state.distances.get(a.id));
    const end=candidates[0]||state.cells.filter(c=>!occupied.has(c.id)).sort((a,b)=>state.distances.get(b.id)-state.distances.get(a.id))[0];
    state.riftExits=mouths.map((mouth,index)=>({id:`${state.id}:exit:${mouth.key}`,key:mouth.key,...(index?{x:end.x,y:end.y-90}:state.entrance),name:mouth.exitName,direction:{x:0,y:index?1:-1}}));
    state.surfaceExits=Object.fromEntries(mouths.map(mouth=>[mouth.key,{x:mouth.x,y:mouth.y}]));
    return state;
  }
}
