const EMPTY_SCENE=Symbol('empty-shadow-scene');
const validBounds=b=>b&&Number.isFinite(b.minX)&&Number.isFinite(b.minY)&&Number.isFinite(b.maxX)&&Number.isFinite(b.maxY)&&b.maxX>b.minX&&b.maxY>b.minY;

// Descriptors append closed world-space subpaths; they must not begin/fill a
// separate path. Supply every caster intersecting the complete visible tiles,
// and change signature whenever its geometry changes without changing bounds.
export class ShadowTileCache {
  constructor(makeCanvas=()=>document.createElement('canvas'),{tileSize=512,resolution=.5,pixelBudget=1536*1024}={}){
    const side=tileSize*resolution;
    if(!Number.isFinite(tileSize)||tileSize<=0||!Number.isInteger(side)||side<=0)throw new RangeError('Shadow tiles require a positive integral backing size');
    if(!Number.isFinite(pixelBudget)||pixelBudget<side*side)throw new RangeError('Shadow pixel budget must hold at least one tile');
    this.makeCanvas=makeCanvas;this.tileSize=tileSize;this.resolution=resolution;this.side=side;
    this.pixelBudget=Math.floor(pixelBudget);this.tilePixels=side*side;this.entryLimit=Math.floor(this.pixelBudget/this.tilePixels);
    this.cache=new Map();this.pixels=0;this.builds=0;this.hits=0;this.evictions=0;this.directPasses=0;this.sceneKey=EMPTY_SCENE;
  }
  get cacheStats(){return{entries:this.cache.size,pixels:this.pixels,bytes:this.pixels*4,limitBytes:this.pixelBudget*4,builds:this.builds,hits:this.hits,evictions:this.evictions,directPasses:this.directPasses};}
  _release(entry){if(entry.canvas){this.pixels-=this.tilePixels;entry.canvas.width=0;entry.canvas.height=0;entry.canvas=null;}}
  clear(){for(const entry of this.cache.values())this._release(entry);this.cache.clear();this.sceneKey=EMPTY_SCENE;}
  _evict(protectedKeys){for(const [key,entry] of this.cache){if(protectedKeys.has(key))continue;this._release(entry);this.cache.delete(key);this.evictions++;return true;}return false;}
  _tile(key,x,y,items,protectedKeys){
    // Encoding the sorted list avoids delimiter collisions and makes source
    // query order irrelevant. Bounds also detect movement with a stable id.
    const fingerprint=JSON.stringify(items.map(item=>JSON.stringify([item.key,item.signature,item.bounds.minX,item.bounds.minY,item.bounds.maxX,item.bounds.maxY])).sort());
    let entry=this.cache.get(key);
    if(entry){this.cache.delete(key);this.cache.set(key,entry);if(entry.fingerprint===fingerprint){this.hits++;return entry;}}
    else{
      while(this.cache.size>=this.entryLimit)if(!this._evict(protectedKeys))return null;
      entry={canvas:null,fingerprint:null};this.cache.set(key,entry);
    }
    if(!items.length){this._release(entry);entry.fingerprint=fingerprint;return entry;}
    if(!entry.canvas){
      // Evict before allocation, so even unusually large viewports stay within
      // the bitmap budget rather than temporarily holding the whole view.
      entry.canvas=this.makeCanvas();entry.canvas.width=this.side;entry.canvas.height=this.side;this.pixels+=this.tilePixels;
    }
    const c=entry.canvas.getContext('2d');
    c.setTransform(1,0,0,1,0,0);c.clearRect(0,0,this.side,this.side);
    c.save();c.setTransform(this.resolution,0,0,this.resolution,-x*this.resolution,-y*this.resolution);
    c.globalAlpha=1;c.globalCompositeOperation='source-over';c.fillStyle='#10271d';c.beginPath();
    for(const item of items)item.drawPath(c);
    c.fill();c.restore();entry.fingerprint=fingerprint;this.builds++;return entry;
  }
  draw(target,bounds,items,sceneKey){
    if(this.sceneKey!==sceneKey){this.clear();this.sceneKey=sceneKey;}
    if(!validBounds(bounds))return;
    const size=this.tileSize,left=Math.floor(bounds.minX/size),right=Math.ceil(bounds.maxX/size)-1,top=Math.floor(bounds.minY/size),bottom=Math.ceil(bounds.maxY/size)-1;
    const buckets=new Map(),visibleKeys=new Set();
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++)visibleKeys.add(`${x},${y}`);
    for(const item of items){
      const b=item.bounds;if(!validBounds(b))continue;
      const minX=Math.max(left,Math.floor(b.minX/size)),maxX=Math.min(right,Math.ceil(b.maxX/size)-1),minY=Math.max(top,Math.floor(b.minY/size)),maxY=Math.min(bottom,Math.ceil(b.maxY/size)-1);
      for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){const key=`${x},${y}`;let bucket=buckets.get(key);if(!bucket)buckets.set(key,bucket=[]);bucket.push(item);}
    }
    target.save();target.globalAlpha=1;target.globalCompositeOperation='source-over';target.imageSmoothingEnabled=false;
    for(let y=top;y<=bottom;y++)for(let x=left;x<=right;x++){
      const key=`${x},${y}`,bucket=buckets.get(key)||[],entry=this._tile(key,x*size,y*size,bucket,visibleKeys);
      if(entry?.canvas)target.drawImage(entry.canvas,x*size,y*size,size,size);
      else if(!entry&&bucket.length){
        // An oversized viewport keeps its resident tiles warm. Overflow uses
        // the already aligned mask directly rather than allocating or evicting
        // a tile that will be needed again on the following frame.
        target.save();target.beginPath();target.rect(x*size,y*size,size,size);target.clip();target.beginPath();
        for(const item of bucket)item.drawPath(target);
        target.fillStyle='#10271d';target.fill();target.restore();this.directPasses++;
      }
    }
    target.restore();
  }
}
