// Small run-local state machine. Chapters supply authored steps and their own
// actions; combat, terrain and persistence remain owned by their existing APIs.
export class StoryFlow {
  constructor(steps,onEnter=()=>{}) {
    if(!Array.isArray(steps)||!steps.length||new Set(steps).size!==steps.length)throw new TypeError('StoryFlow requires unique steps');
    this.steps=Object.freeze([...steps]);this.index=-1;this.elapsed=0;this.revision=0;this.onEnter=onEnter;
  }
  get step(){return this.steps[this.index]??null;}
  start(){return this.index<0&&this.go(this.steps[0]);}
  go(step) {
    const next=this.steps.indexOf(step);
    if(next<0||next<=this.index)return false;
    this.index=next;this.elapsed=0;this.revision++;this.onEnter(step);return true;
  }
  next(){return this.go(this.steps[this.index+1]);}
  update(dt){if(this.index>=0&&Number.isFinite(dt)&&dt>0)this.elapsed+=dt;}
}
