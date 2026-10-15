import { groundOffset } from './terrain.js';
import { INTERIOR_REWARDS } from './interior-profiles.js';

const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const foot=g=>({x:g.player.x,y:g.player.y+groundOffset(g.player,true)});

// This finite world owns its doors and rewards just like a settlement. Region
// snapshots retain the instance, so returning never rebuilds a closed gate or
// replenishes a claimed chest.
export class RiftExploration {
  constructor(game){
    this.game=game;this.sites=[];
    const layout=game.terrain.island?.layout;
    if(game.stage||game.expedition||layout?.kind!=='rift-forest')return;
    const marks=layout.landmarks;
    this.layout=layout;this.shortcutOpen=false;
    for(const key of ['cave05','cave15'])if(marks[key])this.sites.push({id:`rift:${key}`,key,kind:'cave',name:key==='cave05'?'暗河洞穴 · 林间入口':'暗河洞穴 · 北境出口',...marks[key],state:'ready',r:45});
    const gate=layout.passages.find(passage=>passage.gateId==='bell-shortcut')?.gate;
    if(gate)this.sites.push({id:'rift:bell-shortcut',key:'shortcutGate',...gate,kind:'shortcut',name:'钟楼旧门',angle:Math.atan2(gate.by-gate.ay,gate.bx-gate.ax),halfLength:Math.hypot(gate.bx-gate.ax,gate.by-gate.ay)/2,state:'locked',open:false});
    for(const key of ['treasure07','treasure18'])if(marks[key])this.sites.push({id:`rift:${key}`,key,...marks[key],kind:'chest',name:key==='treasure07'?'林地遗藏':'隐谷遗藏',state:'closed',r:22});
    game.terrain.setRiftGate?.('bell-shortcut',false);
  }
  _near(site,r=105){return distance(foot(this.game),site)<=r;}
  _clearApproach(site){const p=foot(this.game);return !this.game.terrain.firstBlocker(p.x,p.y,site.x,site.y,0,'sight');}
  _gateApproach(site){
    const upper=this.layout.landmarks.shortcut13,p=foot(this.game);
    const dx=upper.x-site.x,dy=upper.y-site.y,n=Math.hypot(dx,dy)||1;
    return {x:site.x+dx/n*76,y:site.y+dy/n*76,allowed:(p.x-site.x)*dx+(p.y-site.y)*dy>0};
  }
  getInteraction(){
    const g=this.game;if(g.status!=='playing'||g.dungeon?.active||!this.layout)return null;
    const candidates=[];
    for(const site of this.sites){
      if(site.kind==='shortcut'){
        if(site.open||!this._near(site,145))continue;
        const point=this._gateApproach(site);
        candidates.push({id:site.id,category:'rift',type:'riftShortcut',label:point.allowed?'打开钟楼旧门':'旧门从另一侧锁住',description:point.allowed?'打通返回林地的捷径':'从北侧钟楼绕行',x:point.x,y:point.y,touchRadius:40,enabled:point.allowed});
      }else if(site.kind==='cave'&&this._near(site)&&this._clearApproach(site)){
        candidates.push({id:site.id,category:'rift',type:'riftCave',label:'进入暗河洞穴',description:'地下通道连接北境林地',x:site.x,y:site.y,touchRadius:35,enabled:true});
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
    if(site.kind==='cave')return g.dungeon.enter({id:'rift:underground-passage',type:'castle',riftCave:true,entryKey:site.key,name:'暗河洞穴',x:site.x,y:site.y,door:{x:site.x,y:site.y},interactRadius:105,seed:716});
    if(site.kind==='shortcut'){
      this.shortcutOpen=true;site.open=true;site.state='cleared';g.terrain.setRiftGate?.('bell-shortcut',true);
      g._emit('riftShortcutOpened',{name:site.name});return true;
    }
    if(site.kind==='chest'){
      site.state='claimed';g.grantResources(INTERIOR_REWARDS.castleSide,'riftTreasure');g.adventure?.dropPickup('herb',site.x,site.y+32);
      g._effect(site.x,site.y,'ring',.7,65,'#d6b66e');g._emit('dungeonChest',{name:site.name});return true;
    }
    return false;
  }
  createCaveState(dungeon,site){
    const state=dungeon._makeState(site);
    state.kind='cave';state.name='暗河洞穴';state.treasureName='暗河遗藏';
    // Reuse the finite seeded underground maze and its existing room rewards.
    // Its opposite opening is a real explored room, not a direct surface warp.
    const occupied=new Set([state.entranceId,state.bossRoom.id,...state.chests.map(c=>c.cellId)]);
    const candidates=state.cells.filter(c=>c.row===0&&!occupied.has(c.id)).sort((a,b)=>state.distances.get(b.id)-state.distances.get(a.id));
    const end=candidates[0]||state.cells.filter(c=>!occupied.has(c.id)).sort((a,b)=>state.distances.get(b.id)-state.distances.get(a.id))[0];
    state.riftExits=[{id:`${state.id}:exit:cave05`,key:'cave05',...state.entrance,name:'返回林间洞口',direction:{x:0,y:-1}},
      {id:`${state.id}:exit:cave15`,key:'cave15',x:end.x,y:end.y-90,name:'前往北境林地',direction:{x:0,y:1}}];
    state.surfaceExits=Object.fromEntries(this.sites.filter(s=>s.kind==='cave').map(s=>[s.key,{x:s.x,y:s.y}]));
    return state;
  }
}
