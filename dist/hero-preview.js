const TAU=Math.PI*2;
const DIRECTIONS=Object.freeze({front:Math.PI/2,back:-Math.PI/2,left:Math.PI,right:0});
const DIRECTION_NAMES={front:'正面',back:'背面',left:'左侧',right:'右侧'};
const ACTION_NAMES={idle:'待机',walk:'行走',melee:'近战攻击',ranged:'远程攻击',cast:'施法',hurt:'受击',fall:'倒下'};

// One preview shares the application's frame loop. Selection cards remain
// static; hidden or covered preparation screens never advance this clock.
export class HeroPreview {
  constructor({document,art,poseFor,reduced=false}){
    this.document=document;this.art=art;this.poseFor=poseFor;this.reduced=reduced;
    this.canvas=document.getElementById('hero-preview-canvas');this.context=this.canvas.getContext('2d');
    this.direction='front';this.action='walk';this.playing=!reduced;this.time=0;this.dirty=true;this.draws=0;
    this.buttons=new Map(Object.keys(DIRECTIONS).map(direction=>[direction,document.getElementById(`hero-preview-${direction}`)]));
    for(const [direction,button] of this.buttons)button.addEventListener('click',()=>{this.direction=direction;this.dirty=true;this.refreshControls();});
    this.actionControl=document.getElementById('hero-preview-action');this.actionControl.value=this.action;
    this.actionControl.addEventListener('change',()=>{if(!Object.hasOwn(ACTION_NAMES,this.actionControl.value))return;this.action=this.actionControl.value;this.time=0;this.dirty=true;this.refreshControls();});
    this.toggle=document.getElementById('hero-preview-toggle');this.toggle.addEventListener('click',()=>{this.playing=!this.playing;this.dirty=true;this.refreshControls();});
    this.refreshControls();
  }
  select(hero,appearance){
    if(this.appearance?.id===appearance.id)return;
    this.hero=hero;this.appearance=appearance;this.time=0;this.dirty=true;
    this.entity={id:'hero-selection-preview',heroId:hero.id,appearanceId:appearance.id,facing:DIRECTIONS[this.direction],walkPhase:0,walkSpeed:0,moving:false};
    this.document.getElementById('hero-action-preview-name').textContent=appearance.name;
    this.document.getElementById('hero-preview-note').textContent=appearance.animation==='legacy'?'原版保留原有动作。切换相邻新版比较，同一角色属性相同。':'新版支持四个朝向与完整动作。同一角色的新旧形象属性相同。';
    this.refreshControls();
  }
  refreshControls(){
    for(const [direction,button] of this.buttons)button.setAttribute('aria-pressed',String(direction===this.direction));
    this.toggle.textContent=this.playing?'暂停':'播放';this.toggle.setAttribute('aria-pressed',String(this.playing));
    this.canvas.setAttribute('aria-label',`${this.appearance?.name||'角色'} · ${DIRECTION_NAMES[this.direction]} · ${ACTION_NAMES[this.action]}预览`);
  }
  render(dt){
    if(!this.entity||this.document.hidden)return false;
    // Avoid work when the preview has scrolled out of its preparation viewport.
    const bounds=this.canvas.getBoundingClientRect?.(),viewport=this.document.getElementById('prepare-body').getBoundingClientRect?.();
    if(Number.isFinite(bounds?.bottom)&&Number.isFinite(viewport?.bottom)&&(bounds.bottom<=viewport.top||bounds.top>=viewport.bottom))return false;
    if(!this.playing&&!this.dirty)return false;
    const elapsed=this.playing?Math.max(0,Math.min(Number.isFinite(dt)?dt:0,.05)):0;this.time+=elapsed;
    const entity=this.entity,moving=this.action==='walk',progress=(this.time%1.5)/1.5;
    entity.facing=DIRECTIONS[this.direction];entity.moving=moving;entity.walkSpeed=moving?this.hero.baseSpeed:0;
    if(moving)entity.walkPhase=(entity.walkPhase+entity.walkSpeed*elapsed*17/220)%TAU;
    entity.cloakLift=moving?1:0;entity.castFace=['melee','ranged','cast'].includes(this.action)?.25*(1-progress):0;entity.castFacing=entity.facing;entity.hurtFace=this.action==='hurt'?.16*(1-progress):0;
    entity.heroAnimationPreview={direction:this.direction,action:this.action,progress};
    const c=this.context,w=this.canvas.width,h=this.canvas.height;
    c.clearRect(0,0,w,h);c.save();
    const background=c.createRadialGradient(w/2,h*.6,8,w/2,h*.6,w*.55);background.addColorStop(0,'#45604566');background.addColorStop(1,'#172b2200');c.fillStyle=background;c.fillRect(0,0,w,h);
    c.translate(w/2,174);c.scale(3,3);c.fillStyle='#08191066';c.beginPath();c.ellipse(0,20,17,5,0,0,TAU);c.fill();
    this.art.draw(c,this.appearance.id,{pose:this.poseFor(entity,true,this.time),entity,time:this.time,reduced:this.reduced,pixelRatio:3});
    c.restore();this.dirty=false;this.draws++;return true;
  }
}
