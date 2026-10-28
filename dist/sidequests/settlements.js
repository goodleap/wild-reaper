import { SideQuestScene, foot, distance } from './base.js';
import { terrainNavigation } from '../terrain-navigation.js';

const target=(point,objectiveId,label)=>({...point,objectiveId,label});
const lerp=(a,b,t)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
const near=(a,b,r=80)=>distance(a,b)<=r;

class SettlementScene extends SideQuestScene {
  setup(){
    const d=this.definition.discovery;
    this.home=this.point('home',d.area,d.dx||0,d.dy||0);
    this.showGiver();
  }
  showGiver(){const d=this.definition.discovery;return this.actor('giver',this.home,{kind:d.kind,name:d.name});}
  get playerFoot(){return foot(this.game.player);}
  setFlag(key,value=true){this.state.flags[key]=value;this.changed();}
  done(id){return !!this.record.objectives?.[id];}
  supplyAction(key,point,label,price=12){
    return this.action(key,point,label,()=>this.buySupply('heal',price),{enabled:this.canBuySupply('heal',price),description:`购买一份随身疗伤药，${price} 金币。`});
  }
}

class InteriorQuest extends SettlementScene {
  setup(){
    super.setup();
    const d=this.definition.discovery,p=this.point('entrance',d.area,70,65,28);
    this.site={id:`sidequest:${this.id}:interior`,sideQuestId:this.id,type:'hut',region:this.definition.worldId,
      name:this.id==='overdue-book'?'藏书院残存书室':'白帆残船舱口',x:p.x,y:p.y-28,door:{...p},interactRadius:110};
    this.surface();
  }
  get inside(){return this.handlesDungeon(this.game.dungeon?.active);}
  handlesDungeon(state){return state?.sideQuestId===this.id||state?.site?.sideQuestId===this.id;}
  getSites(){return [this.site];}
  surface(){
    this.showGiver();
    this.prop('entrance','hatch',this.site.door,{label:this.site.name,width:80,height:60});
  }
  enterAction(){return this.action('enter',this.site.door,`进入 · ${this.site.name}`,()=>this.game.dungeon.enter(this.site),{range:110});}
  onDungeonEnter(){this.clearFixtures();this.interior();this.mark('entered');}
  onDungeonExit(){this.clearFixtures();this.surface();}
}

class OverdueBook extends InteriorQuest {
  surface(){
    super.surface();
    if(this.completed){this.prop('bookstall','bookstall',{x:this.home.x+74,y:this.home.y+20},{label:'抄书匠的旧书摊'});this.setService('reading',this.home,{name:'在书摊休息',healing:.2});}
  }
  interior(){
    if(this.state.flags.carrying){this.state.flags.carrying=false;this.changed();}
    this.boxPoint={x:430,y:-105};
    this.prop('box','book-box',this.boxPoint,{label:'四十年前的手稿',hidden:!!this.state.flags.rescued});
    for(const [i,p]of [{x:-520,y:-245},{x:20,y:-315},{x:500,y:245}].entries())this.gate(`books-${i}`,{x:p.x-20,y:p.y},{x:p.x+20,y:p.y},{kind:'bookcase',r:12,width:64,height:70,label:'残存书架'});
    this.prop('exit-mark','books',{x:-400,y:280},{label:'手稿暂存处'});
    this.syncDoor();
    if(!this.state.flags.rescued)this.spawnGroup('book-guards',{x:5,y:160},['royalguard','royalarbalist'],{spread:60,hp:180,damage:9,speed:140,xp:0});
  }
  syncDoor(){
    const open=!!this.state.flags['side-door'];this.gate('side-door',{x:-200,y:-270},{x:-200,y:-150},{open,r:8,label:'侧廊书门'});
    const cells=this.game.dungeon.active.cells;cells[0].open=open?[1,2]:[2];cells[1].open=open?[1,2,3]:[1,2];
  }
  get blocksPlayerAttacks(){return this.inside&&!!this.state.flags.carrying;}
  onDeactivate(){
    if(this.state.flags.carrying){this.state.flags.carrying=false;this.changed();}
  }
  update(){
    if(!this.inside)return;
    if(this.state.flags.carrying){
      const p=this.playerFoot;this.prop('box','book-box',{x:p.x,y:p.y-14},{width:35,height:30});
      if(near(p,{x:-400,y:280},65)){
        this.state.flags.carrying=false;this.state.flags.rescued=true;this.props.get('box').hidden=true;
        this.mark('rescued');this.changed();
      }
    }
  }
  actions(){
    if(!this.inside){
      if(this.completed)return [this.action('read-books',this.home,'翻阅归还的手稿',()=>{this.say(this.actors.get('giver'),'四十年前借走的书，今天总算有人替他还了。');return true;})];
      const actions=[this.enterAction()];
      if(this.state.flags.rescued)actions.push(this.action('return',this.home,'交还手稿箱',()=>{this.mark('returned');this.surface();return true;}));
      return actions;
    }
    const actions=[];
    if(!this.state.flags['side-door'])actions.push(this.action('open-side',{x:-230,y:-210},'拨开侧廊书门',()=>{this.setFlag('side-door');this.syncDoor();return true;},{description:'这条狭窄书廊绕开中央守卫。'}));
    if(!this.state.flags.rescued){
      if(this.state.flags.carrying)actions.push(this.action('put-down',this.playerFoot,'放下手稿箱',()=>{
        this.boxPoint=this.safePoint(this.playerFoot,18);this.state.flags.carrying=false;this.prop('box','book-box',this.boxPoint);this.changed();return true;
      },{description:'腾出双手后可以正常战斗。'}));
      else actions.push(this.action('carry',this.boxPoint,'抱起手稿箱',()=>{this.setFlag('carrying');return true;},{description:'搬运时不能攻击；随时可以放下箱子。'}));
    }
    return actions;
  }
  targets(){return this.inside?[target(this.state.flags.carrying?{x:-400,y:280}:this.boxPoint,'rescued',this.state.flags.carrying?'把手稿搬到书室出口':'取回手稿箱')]:[target(this.state.flags.rescued?this.home:this.site.door,this.state.flags.rescued?'returned':'entered',this.state.flags.rescued?'交还手稿':'进入书室')];}
}

class WreckKnocking extends InteriorQuest {
  surface(){
    super.surface();
    if(this.state.flags.rescued)this.actor('survivor',{x:this.home.x-65,y:this.home.y+30},{kind:'warden',name:'获救的水手'});
    if(this.completed)this.prop('salvage-stall','stall',{x:this.home.x+85,y:this.home.y+20},{label:this.state.flags.salvaged?'齐备的打捞补给站':'旧港打捞站'});
  }
  interior(){
    this.gate('sealed-passage',{x:-200,y:-270},{x:-200,y:-150},{r:9,label:'封死的舱壁'});
    this.prop('valve-one','valve',{x:-405,y:85},{label:'前舱排水闸'});
    this.prop('valve-two','valve',{x:15,y:30},{label:'主舱排水闸'});
    this.prop('valve-three','valve',{x:310,y:100},{label:'侧舱排水闸'});
    this.prop('tools','cargo',{x:440,y:-310},{label:'打捞工具',hidden:!!this.state.flags.salvaged});
    this.actor('survivor',{x:430,y:55},{kind:'warden',name:'被困的水手',speed:245,hidden:!!this.state.flags.rescued});
    for(const [i,p]of [{x:-510,y:-310},{x:80,y:285},{x:520,y:280}].entries())this.gate(`cargo-${i}`,{x:p.x-5,y:p.y},{x:p.x+5,y:p.y},{kind:'cargo',r:12,width:34,height:28});
    this.syncWater();
  }
  syncWater(){
    const stage=this.state.values['water-stage']||0;
    this.gate('water-one',{x:-200,y:110},{x:-200,y:250},{open:stage>=1,r:9,label:'前舱水闸'});
    this.gate('water-two',{x:200,y:-170},{x:200,y:-30},{open:stage>=2,r:9,label:'主舱水闸'});
    this.gate('water-three',{x:320,y:-220},{x:480,y:-220},{open:stage>=3,r:9,label:'侧舱水闸'});
    this.prop('flood-one','water',{x:0,y:0},{floor:true,width:370,height:765,hidden:stage>=1,state:'flooded',label:'积水前舱'});
    this.prop('flood-two','water',{x:400,y:90},{floor:true,width:365,height:575,hidden:stage>=2,state:'flooded',label:'积水主舱'});
    this.prop('flood-three','water',{x:400,y:-310},{floor:true,width:365,height:160,hidden:stage>=3,state:'flooded',label:'积水侧舱'});
    for(const [i,key]of ['valve-one','valve-two','valve-three'].entries())this.props.get(key).state=stage>i?'open':'ready';
    const cells=this.game.dungeon.active.cells;cells[3].open=stage>=1?[0,1]:[0];cells[4].open=stage>=1?[0,3]:[0];
    cells[1].open=stage>=2?[1,2]:[2];cells[2].open=stage>=2?[2,3]:[2];
  }
  update(dt){
    if(!this.inside||!this.state.flags.escorting||this.state.flags.rescued)return;
    const survivor=this.actors.get('survivor');
    this.follow(survivor,this.playerFoot,dt,{speed:245,start:100,stop:48});
    if(near(foot(survivor),{x:-400,y:280},85)&&near(this.playerFoot,{x:-400,y:280},105)){
      this.state.flags.rescued=true;this.state.flags.escorting=false;survivor.hidden=true;this.mark('rescued');this.changed();
    }
  }
  onDeactivate(){if(this.state.flags.escorting){this.state.flags.escorting=false;this.changed();}}
  actions(){
    if(!this.inside){
      if(this.completed)return [this.supplyAction('salvage-supply',this.home,this.state.flags.salvaged?'打捞站疗伤药 · 8 金币':'打捞站疗伤药 · 12 金币',this.state.flags.salvaged?8:12),...!this.state.flags.salvaged?[this.enterAction()]:[]];
      return [this.enterAction(),...this.state.flags.rescued?[this.action('return',this.home,'确认水手安全返回',()=>{this.mark('returned');this.surface();return true;})]:[]];
    }
    const stage=this.state.values['water-stage']||0,actions=[];
    if(stage<3){const points=[{x:-405,y:85},{x:15,y:30},{x:310,y:100}];actions.push(this.action(`drain-${stage+1}`,points[stage],stage===2?'排空侧舱（可选）':'转动排水闸',()=>{
      this.state.values['water-stage']=stage+1;this.syncWater();this.changed();return true;
    },{description:stage===2?'水位再次下降，露出侧舱工具箱。':'固定水位下降，通往下一隔舱的水闸打开。'}));}
    if(stage>=2&&!this.state.flags.rescued&&!this.state.flags.escorting)actions.push(this.action('rescue',foot(this.actors.get('survivor')),'带水手离开',()=>{this.setFlag('escorting');this.say(this.actors.get('survivor'),'我跟得上，带我回舱口。');return true;}));
    if(stage>=3&&!this.state.flags.salvaged)actions.push(this.action('salvage',{x:440,y:-310},'取回打捞工具',()=>{this.state.flags.salvaged=true;this.props.get('tools').hidden=true;this.mark('salvaged');this.changed();return true;}));
    return actions;
  }
  targets(){
    if(!this.inside)return [target(this.state.flags.rescued?this.home:this.site.door,this.state.flags.rescued?'returned':'entered',this.state.flags.rescued?'确认安全返回':'进入残船')];
    if(this.state.flags.escorting)return [target({x:-400,y:280},'rescued','带水手回到舱口')];
    const stage=this.state.values['water-stage']||0;
    if(stage<2)return [target(stage?{x:15,y:30}:{x:-405,y:85},'rescued','降低舱内水位')];
    if(!this.state.flags.rescued)return [target(foot(this.actors.get('survivor')),'rescued','救出水手')];
    return [target(stage<3?{x:310,y:100}:{x:440,y:-310},'salvaged','可选：探索侧舱')];
  }
}

class HalfOath extends SettlementScene {
  setup(){
    super.setup();
    this.circle=this.point('circle','10',160,130,170);
    this.relief=this.point('relief','10',-400,-140,35);
    this.rescuePoint=this.point('captive','10',530,-230,130);
    this.stonePoint=this.safePoint({x:this.home.x-75,y:this.home.y-20},30,this.home);
    this.prop('stone','oath-stone',this.stonePoint,{label:this.state.choices.inscription==='protect'?'只为身后仍有人':this.state.choices.inscription==='remember'?'守阵，亦守人':'寸步不退'});
    this.prop('relief','oath-stone',this.relief,{label:'侧廊残句'});
    this.prop('circle','trial-circle',this.circle,{radius:155,width:310,height:310,floor:true});
    const rescued=this.done('proved')&&this.state.choices.result==='rescue';
    this.actor('captive',rescued?{x:this.home.x+50,y:this.home.y+25}:this.rescuePoint,{kind:'elder',name:rescued?'获救的拓碑人':'受困的拓碑人',hidden:this.done('proved')&&!rescued});
    this.syncCage();
  }
  syncCage(){
    const p=this.rescuePoint,open=!!this.state.flags['rescue-open']||this.done('proved');
    this.gate('cage-left',{x:p.x-60,y:p.y-55},{x:p.x-60,y:p.y+55},{open,r:6,label:'侧廊残栏'});
    this.gate('cage-top',{x:p.x-60,y:p.y-55},{x:p.x+60,y:p.y-55},{open,r:6});
    this.gate('cage-right',{x:p.x+60,y:p.y-55},{x:p.x+60,y:p.y+55},{open,r:6});
    this.gate('cage-door',{x:p.x-60,y:p.y+55},{x:p.x+60,y:p.y+55},{open,r:6});
  }
  start(kind){
    this.clearGroup('oath-guards',{reset:true});this.clearGroup('rescue-guards',{reset:true});
    this.state.choices.trial=kind;this.state.flags.active=true;this.state.values.hold=0;this.state.values.outside=0;
    if(kind==='guard')this.spawnGroup('oath-guards',this.circle,['royalguard','royallancer','royalarbalist'],{spread:125,hp:140,damage:8,speed:150,xp:0});
    else{
      this.state.flags['rescue-open']=false;this.placeActor(this.actors.get('captive'),this.rescuePoint);this.actors.get('captive').hidden=false;this.syncCage();
      this.spawnGroup('rescue-guards',{x:this.rescuePoint.x,y:this.rescuePoint.y+150},['royalguard','royallancer'],{spread:52,hp:160,damage:9,speed:155,xp:0});
    }
    this.changed();return true;
  }
  finish(){
    this.state.flags.active=false;this.clearEnemies();if(!this.done('proved'))this.state.choices.result=this.state.choices.trial;this.mark('proved');
    if(this.state.choices.trial==='rescue')this.placeActor(this.actors.get('captive'),{x:this.home.x+50,y:this.home.y+25});
    this.say(this.actors.get('giver'),this.state.choices.trial==='rescue'?'原来后半句是：只为身后仍有人。':'你守住了这一圈，也该记住为什么而守。');this.changed();
  }
  onDeactivate(){
    if(this.state.flags.active){this.state.flags.active=false;this.clearGroup('oath-guards',{reset:true});this.clearGroup('rescue-guards',{reset:true});this.changed();}
  }
  update(dt){
    if(!this.state.flags.active)return;
    if(this.state.choices.trial==='guard'){
      const within=near(this.playerFoot,this.circle,155);
      this.state.values.outside=within?0:(this.state.values.outside||0)+dt;
      if(within)this.state.values.hold=(this.state.values.hold||0)+dt;
      this.props.get('circle').state=within?'active':'warning';
      this.props.get('circle').label=`守阵 ${Math.min(12,Math.floor(this.state.values.hold))} / 12 秒`;
      if(this.state.values.outside>1.5){this.onDeactivate();this.say(this.actors.get('giver'),'已经离开阵圈，试炼停下了。准备好再来。');}
      else if(this.state.values.hold>=12&&this.groupCleared('oath-guards'))this.finish();
    }else if(this.state.flags['rescue-open']){
      const actor=this.actors.get('captive');this.follow(actor,this.playerFoot,dt,{speed:250,start:100,stop:52});
      if(near(foot(actor),this.home,90)&&near(this.playerFoot,this.home,115))this.finish();
    }
    this.dirty();
  }
  actions(){
    const actions=[];
    if(!this.state.flags['read-stone'])actions.push(this.action('read-stone',this.stonePoint,'读誓碑',()=>{this.setFlag('read-stone');if(this.state.flags['read-relief'])this.mark('read');this.say(this.actors.get('giver'),'碑上只刻着寸步不退，侧廊还有一块旧浮雕。');return true;}));
    if(!this.state.flags['read-relief'])actions.push(this.action('read-relief',this.relief,'辨认侧廊浮雕',()=>{this.setFlag('read-relief');if(this.state.flags['read-stone'])this.mark('read');this.say(this.actors.get('giver'),'不是守一块石头，是守住石头后面的人。');return true;},{description:'浮雕刻着守卫护送平民离开，残句是“只为身后仍有人”。'}));
    if(this.done('read')&&!this.state.flags.active&&!this.done('proved'))actions.push(this.action('choose-trial',this.circle,'选择试炼',choice=>this.start(choice),{choices:[
      {id:'guard',label:'守住阵圈',description:'留在圈内至少 12 秒，并击退守卫；离圈太久会重试。'},
      {id:'rescue',label:'完成后半句',description:'打开侧廊残栏，把受困者实际带回学徒身边。'}]}));
    if(this.state.flags.active&&this.state.choices.trial==='rescue'&&!this.state.flags['rescue-open'])actions.push(this.action('release',{x:this.rescuePoint.x,y:this.rescuePoint.y+95},'扳开残栏',()=>{this.setFlag('rescue-open');this.syncCage();return true;},{enabled:this.groupCleared('rescue-guards'),description:'先击退守在残栏前的两名守卫。'}));
    if(this.done('proved')&&!this.completed)actions.push(this.action('inscribe',this.home,'补上誓言',choice=>{this.state.choices.inscription=choice;this.mark('inscribed');this.props.get('stone').label=choice==='protect'?'只为身后仍有人':'守阵，亦守人';this.changed();return true;},{choices:[{id:'protect',label:'刻上“只为身后仍有人”'},{id:'remember',label:'保留旧句，添上救援浮雕'}]}));
    if(this.completed&&!this.state.flags.active)actions.push(this.action('replay',this.circle,'再练一次守阵（不重复领奖）',()=>this.start('guard')));
    return actions;
  }
  targets(){
    if(!this.done('read'))return [target(this.state.flags['read-stone']?this.relief:this.home,'read','读完整的誓言')];
    if(this.done('proved'))return [target(this.home,'inscribed','与刻碑学徒交谈')];
    return [target(this.state.choices.trial==='rescue'&&this.state.flags.active?(this.state.flags['rescue-open']?this.home:this.rescuePoint):this.circle,'proved',this.state.choices.trial==='rescue'?'救人归来':'守住阵圈')];
  }
}

const inRing=(p,ring)=>{
  let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++)if((ring[i].y>p.y)!==(ring[j].y>p.y)&&p.x<(ring[j].x-ring[i].x)*(p.y-ring[i].y)/(ring[j].y-ring[i].y)+ring[i].x)inside=!inside;
  return inside;
};

class TwinBeacons extends SettlementScene {
  setup(){
    super.setup();
    this.lights=[this.point('beacon-one','05',-650,0,38),this.point('beacon-two','04',770,-440,38)];
    this.observation=this.point('observation','05',-380,100,30);
    this.water=this.terrain.island.layout.lakes||[];
    this.dock=this.findDock(this.lights[0]);
    this.markers=this.lights.map((p,i)=>i===0?lerp(this.dock.arrival,this.dock.start,.35):this.waterward(p,{x:4500,y:2450},180));
    this.reefs=this.lights.map((p,i)=>{const angle=Math.atan2(this.markers[i].y-p.y,this.markers[i].x-p.x)-.6;return {x:p.x+Math.cos(angle)*145,y:p.y+Math.sin(angle)*145};});
    this.lights.forEach((p,i)=>{this.prop(`beacon-${i}`,'beacon',p,{label:i?'礁门灯台':'岬角灯台'});this.prop(`buoy-${i}`,'beacon',this.markers[i],{width:32,height:40,label:i?'双点航标':'双叉航标',state:'marker'});this.prop(`reef-${i}`,'oath-stone',this.reefs[i],{width:65,height:45,label:'礁影'});});
    this.prop('dock','dock',lerp(this.dock.land,this.dock.arrival,.5),{width:distance(this.dock.land,this.dock.arrival)+70,height:65,angle:Math.atan2(this.dock.arrival.y-this.dock.land.y,this.dock.arrival.x-this.dock.land.x),label:'候船栈台',floor:true});
    this.prop('lookout','banner',this.observation,{label:'观测台'});
    this.syncBeams();this.syncBoat();
    this.actor('visitor',this.dock.land,{kind:'merchant',name:'渡海的药商',hidden:!this.state.flags.landed});
  }
  isWater(p,r=0){return [p,...r?[{x:p.x+r,y:p.y},{x:p.x-r,y:p.y},{x:p.x,y:p.y+r},{x:p.x,y:p.y-r}]:[]].every(q=>this.water.some(lake=>!lake.hole&&inRing(q,lake.points)));}
  waterward(from,toward,extra){
    const angle=Math.atan2(toward.y-from.y,toward.x-from.x);
    for(let d=40;d<1600;d+=20){const p={x:from.x+Math.cos(angle)*d,y:from.y+Math.sin(angle)*d};if(this.isWater(p,35))return {x:p.x+Math.cos(angle)*extra,y:p.y+Math.sin(angle)*extra};}
    throw new Error('The beacon needs a real water approach.');
  }
  findDock(land){
    const arrival=this.waterward(land,{x:4300,y:2200},35);
    for(let turn=0;turn<24;turn++){
      const angle=Math.PI+turn*Math.PI/12,start={x:arrival.x+Math.cos(angle)*570,y:arrival.y+Math.sin(angle)*570};
      if(Array.from({length:25},(_,i)=>this.isWater(lerp(arrival,start,i/24),30)).every(Boolean))return {land,arrival,start};
    }
    throw new Error('No continuous water lane for the beacon boat.');
  }
  beamGeometry(i){
    const origin=this.lights[i],marker=this.markers[i],index=this.state.values[`lamp-${i}`]||0,
      base=Math.atan2(marker.y-origin.y,marker.x-origin.x),angle=base+(index-1)*.6,length=distance(origin,marker)+65;
    let end={x:origin.x+Math.cos(angle)*length,y:origin.y+Math.sin(angle)*length},occluded=false;
    const reef=this.reefs[i],projection=(reef.x-origin.x)*Math.cos(angle)+(reef.y-origin.y)*Math.sin(angle),side=Math.abs((reef.x-origin.x)*Math.sin(angle)-(reef.y-origin.y)*Math.cos(angle));
    if(projection>0&&projection<length&&side<32){end={x:origin.x+Math.cos(angle)*(projection-Math.sqrt(32**2-side**2)),y:origin.y+Math.sin(angle)*(projection-Math.sqrt(32**2-side**2))};occluded=true;}
    const markerProjection=(marker.x-origin.x)*Math.cos(angle)+(marker.y-origin.y)*Math.sin(angle),markerSide=Math.abs((marker.x-origin.x)*Math.sin(angle)-(marker.y-origin.y)*Math.cos(angle));
    return {points:[origin,end],angle,length:distance(origin,end),hit:!occluded&&markerProjection>0&&markerProjection<=distance(origin,end)&&markerSide<24,occluded};
  }
  syncBeams(){
    this.lights.forEach((p,i)=>{const beam=this.beamGeometry(i);this.prop(`beam-${i}`,'beam',p,{...beam,beamWidth:22,floor:true,state:beam.hit?'aligned':beam.occluded?'blocked':'active',color:beam.hit?'#f5e7a0':'#d8dcc8'});this.props.get(`beacon-${i}`).angle=beam.angle;});
    if(this.done('observed')&&this.lights.every((_,i)=>this.beamGeometry(i).hit)&&!this.state.flags.sailing){this.state.flags.sailing=true;this.mark('aligned');this.changed();}
  }
  syncBoat(){
    const progress=this.state.flags.landed?1:this.state.values.sailing||0,p=lerp(this.dock.start,this.dock.arrival,progress);
    this.prop('boat','boat',p,{width:105,height:65,angle:Math.atan2(this.dock.arrival.y-this.dock.start.y,this.dock.arrival.x-this.dock.start.x),hidden:!this.state.flags.sailing&&!this.state.flags.landed,state:'active',floor:true});
  }
  update(dt){
    if(!this.state.flags.sailing||this.state.flags.landed)return;
    this.state.values.sailing=Math.min(1,(this.state.values.sailing||0)+dt/12);this.syncBoat();this.dirty();
    if(this.state.values.sailing>=1){this.state.flags.landed=true;this.actors.get('visitor').hidden=false;this.say(this.actors.get('visitor'),'灯终于照对了。船上的药，还能赶上岸上的人。');this.changed();}
  }
  actions(){
    const actions=[];
    if(!this.done('observed'))actions.push(this.action('observe',this.observation,'观察礁门航标',()=>{this.mark('observed');this.say(this.actors.get('giver'),'岬角照双叉，礁门照双点。别把石影当成航标。',6);this.syncBeams();return true;},{description:'岬角灯应照双叉航标，礁门灯应照双点航标。灯束撞上礁影就无法为船引路。'}));
    if(this.done('observed')&&!this.state.flags.sailing)for(let i=0;i<2;i++)actions.push(this.action(`turn-${i}`,this.lights[i],`调整${i?'礁门':'岬角'}灯头`,choice=>{this.state.values[`lamp-${i}`]=Number(choice.slice(-1));this.syncBeams();this.changed();return true;},{choices:[{id:'angle-0',label:'偏向礁影'},{id:'angle-1',label:i?'对准双点航标':'对准双叉航标'},{id:'angle-2',label:'偏向外海'}]}));
    if(this.state.flags.landed&&!this.completed)actions.push(this.action('greet',this.dock.land,'迎接靠岸来客',()=>{this.mark('landed');return true;}));
    if(this.completed)actions.push(this.supplyAction('sea-supply',this.dock.land,'购买渡海药商的药 · 10 金币',10));
    return actions;
  }
  targets(){if(!this.done('observed'))return [target(this.observation,'observed','观察礁门航标')];if(!this.state.flags.sailing)return this.lights.map((p,i)=>target(p,'aligned',`调整${i?'礁门':'岬角'}灯台`)).filter((_,i)=>!this.beamGeometry(i).hit);return [target(this.dock.land,'landed',this.state.flags.landed?'迎接来客':'等待来船靠岸')];}
}

class MarketPickpocket extends SettlementScene {
  setup(){
    super.setup();
    this.stall=this.point('stall','07',40,-80,35);
    this.watch=this.point('watch','07',-180,145,25);
    this.startPoint=this.point('thief-start','07',-350,-180,25);
    this.route=[this.point('turn-one','07',210,20,25),this.point('turn-two','07',390,230,25),this.point('hideout','07',610,330,45)];
    this.prop('stall','stall',this.stall,{label:'杂货摊'});
    this.prop('watch','footprints',this.watch,{label:'蹲守街角',floor:true});
    this.actor('thief',this.startPoint,{kind:'rogue',name:'可疑的盗贼',characterSpriteId:'bandit',speed:210,hidden:this.completed});
    this.state.choices.phase=this.completed?'done':this.state.flags.recovered?'recovered':'idle';
    this.syncOutcome();
  }
  syncOutcome(){
    const followed=this.state.choices.outcome==='follow';
    this.prop('stash','stolen-bag',this.route[2],{label:'藏匿的货袋',hidden:this.state.choices.phase!=='stash'||!!this.state.flags.recovered});
    this.prop('returned-stall','banner',{x:this.stall.x+60,y:this.stall.y},{label:'失物已找回',hidden:!this.completed});
    this.prop('hideout','cargo',{x:this.route[2].x+70,y:this.route[2].y},{label:'可回访的藏赃处',hidden:!followed});
    if(this.completed&&!followed)this.actor('watchman',{x:this.stall.x+80,y:this.stall.y+65},{kind:'warden',name:'市场巡守'});
  }
  retry(){
    this.placeActor(this.actors.get('thief'),this.startPoint);this.actors.get('thief').hidden=false;
    this.state.choices.phase='approach';this.state.values.waypoint=0;this.state.values.watch=0;this.state.values.lost=0;this.state.values.close=0;
    this.props.delete('carried-bag');this.changed();return true;
  }
  reset(reason){
    this.state.choices.phase='idle';this.state.values.lost=0;this.state.values.close=0;this.props.delete('carried-bag');
    this.placeActor(this.actors.get('thief'),this.startPoint);this.say(this.actors.get('giver'),reason||'先别急，再到街角看看他的动静。');this.changed();
  }
  onDeactivate(){if(['approach','stealing','running'].includes(this.state.choices.phase))this.reset();}
  update(dt){
    const actor=this.actors.get('thief'),phase=this.state.choices.phase;
    if(phase==='approach'){
      if(this.move(actor,this.stall,dt,{speed:160,stop:12})){this.state.choices.phase='stealing';this.state.values.watch=0;this.changed();}
    }else if(phase==='stealing'){
      if(near(this.playerFoot,foot(actor),380)&&!this.terrain.firstBlocker(this.playerFoot.x,this.playerFoot.y,actor.x,foot(actor).y,0,'sight'))this.state.values.watch=(this.state.values.watch||0)+dt;
      if(this.state.values.watch>=1.2){
        this.mark('witnessed');this.state.choices.phase='running';this.state.values.waypoint=0;
        this.say(this.actors.get('giver'),'货袋少了一只！就是刚才那个人。');this.changed();
      }
    }else if(phase==='running'){
      const gap=distance(this.playerFoot,foot(actor)),visible=gap<580&&!this.terrain.firstBlocker(this.playerFoot.x,this.playerFoot.y,actor.x,foot(actor).y,0,'sight');
      this.state.values.lost=!visible?(this.state.values.lost||0)+dt:0;
      this.state.values.close=gap<55?(this.state.values.close||0)+dt:0;
      if(this.state.values.lost>5){this.reset('跟丢了。他还会回来，再到街口蹲守。');return;}
      if(this.state.values.close>4){this.reset('他发现有人紧贴着跟踪，藏起货物绕走了。下次拦住他，或者留出距离。');return;}
      const index=Math.min(2,this.state.values.waypoint||0);
      if(this.move(actor,this.route[index],dt,{speed:210,stop:12})){
        if(index<2)this.state.values.waypoint=index+1;
        else if(visible&&gap<420){this.state.choices.phase='stash';this.state.choices.outcome='follow';this.props.delete('carried-bag');this.syncOutcome();this.say(actor,'放在这里，等天黑再来拿。');this.changed();}
      }
      if(this.state.choices.phase==='running')this.prop('carried-bag','stolen-bag',{x:actor.x+18,y:foot(actor).y-9},{width:22,height:20});
      this.dirty();
    }
  }
  recover(outcome){
    this.state.flags.recovered=true;this.state.choices.outcome=outcome;this.state.choices.phase='recovered';this.props.delete('carried-bag');
    this.mark('recovered');this.syncOutcome();this.changed();return true;
  }
  actions(){
    const phase=this.state.choices.phase,actions=[];
    if(phase==='idle')actions.push(this.action('watch',this.watch,'在街角观察',()=>this.retry(),{description:'等他伸手取货，再决定当场拦住还是保持距离跟随。'}));
    if(phase==='running')actions.push(this.action('intercept',foot(this.actors.get('thief')),'拦住拿货的人',choice=>{
      if(choice==='return')return this.recover('intercept');
      this.state.values.close=-2;this.say(this.actors.get('thief'),'没你的事，别挡路。');return true;
    },{range:95,choices:[{id:'return',label:'当场取回货袋',description:'取回失物，巡守会留在摊位旁。'},{id:'follow',label:'让开，继续跟随',description:'保持一段距离，找出藏赃处。'}]}));
    if(phase==='stash'&&!this.state.flags.recovered)actions.push(this.action('recover',this.route[2],'取回藏匿的货袋',()=>this.recover('follow')));
    if(this.state.flags.recovered&&!this.completed)actions.push(this.action('return',this.home,'把货袋交还摊主',()=>{
      this.mark('returned');this.state.choices.phase='done';this.actors.get('thief').hidden=true;this.syncOutcome();this.changed();return true;
    }));
    if(this.completed){
      actions.push(this.supplyAction('market-supply',this.stall,this.state.choices.outcome==='intercept'?'巡守照看的摊位 · 药 10 金币':'失主的摊位 · 药 12 金币',this.state.choices.outcome==='intercept'?10:12));
      if(this.state.choices.outcome==='follow'&&!this.state.flags['stash-claimed'])actions.push(this.action('stash-find',this.route[2],'清点藏赃处剩余零钱',()=>{this.game.gold+=16;this.setFlag('stash-claimed');this.game._scheduleWorldSave?.('sidequest-stash');return true;},{description:'一次性找回 16 金币；货物已经交还失主。'}));
    }
    return actions;
  }
  targets(){
    if(this.state.flags.recovered)return [target(this.home,'returned','交还失物')];
    if(this.state.choices.phase==='running')return [target(foot(this.actors.get('thief')),'recovered','拦截，或保持距离跟随')];
    if(this.state.choices.phase==='stash')return [target(this.route[2],'recovered','取回藏匿的货袋')];
    return [target(this.watch,'witnessed','在街角观察窃贼')];
  }
}

class CourtyardStage extends SettlementScene {
  setup(){
    super.setup();
    this.center=this.findPlaza();
    const p=this.center;
    this.route=[{x:p.x-180,y:p.y+80},{x:p.x,y:p.y+80},{x:p.x+180,y:p.y+80},{x:p.x+180,y:p.y-110}];
    this.positions={
      stage:[{x:p.x,y:p.y-130},{x:p.x,y:p.y+80}],
      seat:[{x:p.x,y:p.y+170},{x:p.x+80,y:p.y+80}],
      crate:[{x:p.x-175,y:p.y-110},{x:p.x+180,y:p.y+10}]
    };
    this.actor('performer',this.route[0],{kind:'bard',name:'试台的演员',speed:135});
    this.state.flags.rehearsing=false;
    this.syncFurniture();
    if(this.completed)this.openAudience();
  }
  findPlaza(){
    const area=this.terrain.island.layout.areas.find(a=>a.id==='08'),origin=area.center;
    // The clock tower occupies the nominal area centre. Reserve the exact
    // furniture and walking footprints in an existing open part of the plaza.
    const footprints=[[-180,80,25],[0,80,78],[180,80,28],[180,-110,28],[0,-130,78],[0,170,42],[-175,-110,30],[180,10,30],[-70,215,20],[70,215,20]];
    for(const radius of [180,300,450,600,760,920])for(let i=0;i<24;i++){
      const angle=i*Math.PI/12,p={x:origin.x+Math.cos(angle)*radius,y:origin.y+Math.sin(angle)*radius};
      if(!inRing(p,area.points))continue;
      if(!footprints.every(([x,y,r])=>this.terrain.isFree(p.x+x,p.y+y,r)))continue;
      const nav=terrainNavigation(this.terrain),a={x:p.x-180,y:p.y+80},b={x:p.x+180,y:p.y+80},c={x:p.x+180,y:p.y-110};
      if(nav.clearSegment(a,b,20,'ground')&&nav.clearSegment(b,c,20,'ground'))return p;
    }
    throw new Error('The courtyard performance needs a connected clear stage route.');
  }
  syncFurniture(){
    for(const key of ['stage','seat','crate']){
      const index=this.state.values[`place-${key}`]??1,p=this.positions[key][index],width=key==='stage'?140:key==='seat'?75:52,r=key==='stage'?36:key==='seat'?16:23;
      // Furniture uses the same footprint for drawing and collision. A narrow
      // actor route remains visible; bad placements deliberately block it.
      const a={x:p.x-width/2+r,y:p.y},b={x:p.x+width/2-r,y:p.y};
      this.gate(`furniture-${key}`,a,b,{r,kind:key,width,height:r*2,label:key==='stage'?'舞台':key==='seat'?'座椅':'货箱'});
    }
    this.controls=Object.fromEntries(['stage','seat','crate'].map(key=>{
      const p=this.positions[key][this.state.values[`place-${key}`]??1];
      return [key,this.safePoint({x:p.x,y:p.y+(key==='stage'?80:60)},20)];
    }));
    this.prop('rehearsal-route','footprints',this.center,{points:this.route,floor:true,label:'排练通道'});
  }
  openAudience(){
    const p=this.center;
    for(let i=0;i<3;i++)this.actor(`audience-${i}`,{x:p.x-70+i*70,y:p.y+215},{kind:i===1?'elder':'merchant',name:'看戏的街坊'});
    this.prop('stage-banner','banner',{x:p.x-90,y:p.y-130},{label:'旧院小戏台'});
  }
  startRehearsal(){
    this.placeActor(this.actors.get('performer'),this.route[0]);this.state.flags.rehearsing=true;this.state.values.step=1;this.state.values.stuck=0;this.changed();return true;
  }
  update(dt){
    const actor=this.actors.get('performer');
    if(this.state.flags.rehearsing){
      const index=this.state.values.step||1,goal=this.route[index],from=foot(actor),clear=terrainNavigation(this.terrain).clearSegment(from,goal,actor.r+2,'ground');
      if(!clear){
        // Rehearsal tests the marked stage route; actors may not silently
        // navigate around a misplaced seat and report a successful setup.
        this.state.values.stuck=(this.state.values.stuck||0)+dt;actor.moving=false;
        if(this.state.values.stuck>=1.2){this.state.flags.rehearsing=false;this.say(actor,'这段上场路被家具挡住了，挪开再试一次。');this.changed();}
      }else if(this.move(actor,goal,dt,{speed:135,stop:8})){
        this.state.values.step=index+1;this.state.values.stuck=0;
        if(index===this.route.length-1){this.state.flags.rehearsing=false;this.mark('rehearsed');this.say(actor,'出场、过场、退场，全走得通。可以开演了！');this.changed();}
      }
      this.dirty();
    }else if(this.completed&&near(this.playerFoot,this.center,700)){
      this._performance=(this._performance||0)+dt;
      actor.facing=Math.sin(this._performance*.7)*.5+Math.PI/2;
      const p=this.positions.stage[0];this.move(actor,{x:p.x+Math.sin(this._performance*.35)*40,y:p.y-70},dt,{speed:55,stop:10});
    }
  }
  onDeactivate(){if(this.state.flags.rehearsing){this.state.flags.rehearsing=false;this.changed();}}
  actions(){
    if(this.completed)return [this.action('watch-show',this.home,'看一小段排练',()=>{this.say(this.actors.get('performer'),'借半个广场，装下整条街的好梦。',5);return true;})];
    const actions=[];
    if(!this.state.flags.rehearsing){
      for(const key of ['stage','seat','crate'])actions.push(this.action(`place-${key}`,this.controls[key],`安排${key==='stage'?'舞台':key==='seat'?'座椅':'货箱'}`,choice=>{
        this.state.values[`place-${key}`]=choice==='clear'?0:1;this.state.flags[`placed-${key}`]=true;
        this.syncFurniture();
        if(['stage','seat','crate'].every(k=>this.state.flags[`placed-${k}`]))this.mark('arranged');
        // Moving a previously tested layout requires a fresh real rehearsal.
        if(this.done('rehearsed')){delete this.record.objectives.rehearsed;this.changed();}
        this.changed();return true;
      },{range:125,choices:[{id:'clear',label:key==='stage'?'舞台靠后':key==='seat'?'座椅留在通道外':'货箱收在左后角',description:'保留地上的上场通道。'},{id:'across',label:key==='stage'?'舞台靠近街口':key==='seat'?'座椅贴近舞台':'货箱先放右侧',description:'需要实际排练确认演员是否过得去。'}]}));
      if(this.done('arranged')&&!this.done('rehearsed'))actions.push(this.action('rehearse',this.home,'请演员走一遍排练',()=>this.startRehearsal()));
      if(this.done('rehearsed'))actions.push(this.action('open',this.home,'开放广场演出',()=>{this.mark('opened');this.openAudience();return true;}));
    }
    return actions;
  }
  targets(){return [target(this.done('arranged')?this.home:this.center,this.done('rehearsed')?'opened':this.done('arranged')?'rehearsed':'arranged',this.done('rehearsed')?'邀请街坊来看戏':this.done('arranged')?'请演员试走通道':'摆放舞台、座椅和货箱')];}
}

const SCENES={
  'overdue-book':OverdueBook,'half-oath':HalfOath,'twin-beacons':TwinBeacons,
  'wreck-knocking':WreckKnocking,'market-pickpocket':MarketPickpocket,'courtyard-stage':CourtyardStage
};
export function createScene(host,definition){const Scene=SCENES[definition.id];return Scene?new Scene(host,definition):null;}
