export const FROSTCROWN_ASSET=Object.freeze({
  path:'../assets/units/frostcrown-0d4e3d938dc5e6e0.png',
  width:1254,height:1254,
  sha256:'0d4e3d938dc5e6e087b53d02638c645d7de7dd384af9785d5551df1b8289b769'
});

function loadImage(url){
  return new Promise((resolve,reject)=>{
    const image=new Image();image.decoding='async';
    const timer=setTimeout(()=>finish(new Error('Frostcrown artwork load timed out.')),12000);
    function finish(error){clearTimeout(timer);image.onload=image.onerror=null;error?reject(error):resolve(image);}
    image.onload=()=>finish();image.onerror=()=>finish(new Error('Frostcrown artwork could not be loaded.'));
    image.src=url;
  });
}

// One decoded source shared by the archive and the bounded MonsterArt cache.
// Boot waits for this promise before either surface can cache a first frame.
export class FrostcrownAssets{
  #image=null;
  constructor(){this.pending=null;this.decodes=0;}
  get image(){return this.#image;}
  get ready(){return this.image!==null;}
  get diagnostics(){return {ready:this.ready,decodes:this.decodes,bytes:this.ready?FROSTCROWN_ASSET.width*FROSTCROWN_ASSET.height*4:0};}
  preload({load=loadImage}={}){
    if(this.ready)return Promise.resolve(this);
    if(this.pending)return this.pending;
    const attempt=(async()=>{
      const image=await load(new URL(FROSTCROWN_ASSET.path,import.meta.url).href);
      if(typeof image.decode==='function')await image.decode();
      if((image.naturalWidth??image.width)!==FROSTCROWN_ASSET.width||(image.naturalHeight??image.height)!==FROSTCROWN_ASSET.height)
        throw new Error('Frostcrown artwork dimensions do not match.');
      this.#image=image;this.decodes++;return this;
    })();
    this.pending=attempt;
    attempt.then(()=>{this.pending=null;},()=>{this.pending=null;});return attempt;
  }
}
export const frostcrownAssets=new FrostcrownAssets();
