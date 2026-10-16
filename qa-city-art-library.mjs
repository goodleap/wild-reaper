import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {inflateSync} from 'node:zlib';

// Importing the shared catalogue must also work in geometry/Node tooling.
const globals=new Map(['Image','document'].map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
for(const key of globals.keys())Object.defineProperty(globalThis,key,{configurable:true,get(){throw new Error(`${key} accessed during import`);}});
const {CITY_ART_ASSETS,CITY_ART_SPRITES}=await import('./dist/city-art-manifest.js');
const {CityArtLibrary,cityArtLibrary}=await import('./dist/city-art-library.js');
const {CityDetailArt,CITY_DETAIL_MANIFEST}=await import('./dist/city-detail-art.js');
assert.equal(cityArtLibrary.ready,false);
for(const [key,descriptor]of globals)if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];

const nativeIdentity={
  keepLarge:[1796,876,'62aab9b7778e9aeb7415c2ae3de242ce256b88c353684ce9a0474e29ece7e358'],
  churchLarge:[1024,1536,'644b41601a777c15ae75b783ad19b8b69372ea6164588b4f659daa303eb81d80'],
  grassGround:[1254,1254,'8f3e373bcbbd9486db276b7a396fb0c5f960a307d4fdbb4e52b7f5f2ac63ae78'],
  architecture:[1086,1448,'fe9b0894a6a0508c936c0c6655214182365441808e53a70229c314f496a4d31c'],
  props:[1254,1254,'a3e6e64adeeda1dc233ae9ede0dff25533ac30856e544011e9691aa869cc0393'],
  vegetation:[1254,1254,'370544bd42a6596b658ed2e1dfbf34b495eecc0dc3503ea218af59d75a3632d9'],
  gate:[1482,1061,'d9428bdc892ce183d6d2b7369cdcda443ba5dfc0eba42b9c59bc2220e619bdbe'],
  wall:[1774,887,'d7d437c919e491ab599401252819a100b6f6d13c4d8cf501e4d531ab1a12a12b'],
  ground:[1254,1254,'7d1adc4b91009113e8f05c18636bd96c9b7151ec40d7ffa75871535fe7333b52'],
  foliage:[1254,1254,'690af33db5eae4a3790103540ecedc13b0dec3099b27136c10c4ca253fa155d6'],
  house:[1254,1254,'2b4b607fd5e20981146c7d5c0141e818a3f5505a462a3d382614ebdeb2adeffc']
};

// Decode alpha directly from the immutable native PNGs. This checks source
// isolation using actual pixels without requiring a browser or Python package.
function pngAlpha(buffer){
  assert.equal(buffer.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  const width=buffer.readUInt32BE(16),height=buffer.readUInt32BE(20),depth=buffer[24],type=buffer[25];
  assert.equal(depth,8);assert([2,6].includes(type));assert.equal(buffer[28],0,'native source is non-interlaced');
  const chunks=[];
  for(let offset=8;offset<buffer.length;){const length=buffer.readUInt32BE(offset),kind=buffer.toString('ascii',offset+4,offset+8);if(kind==='IDAT')chunks.push(buffer.subarray(offset+8,offset+8+length));offset+=length+12;}
  const channels=type===6?4:3,stride=width*channels,filtered=inflateSync(Buffer.concat(chunks));
  assert.equal(filtered.length,(stride+1)*height);
  const pixels=new Uint8Array(stride*height),alpha=new Uint8Array(width*height);
  const paeth=(a,b,c)=>{const p=a+b-c,da=Math.abs(p-a),db=Math.abs(p-b),dc=Math.abs(p-c);return da<=db&&da<=dc?a:db<=dc?b:c;};
  for(let y=0;y<height;y++){
    const filter=filtered[y*(stride+1)];assert(filter<=4);
    for(let x=0;x<stride;x++){
      const target=y*stride+x,left=x>=channels?pixels[target-channels]:0,up=y?pixels[target-stride]:0,upperLeft=y&&x>=channels?pixels[target-stride-channels]:0;
      const predictor=filter===0?0:filter===1?left:filter===2?up:filter===3?Math.floor((left+up)/2):paeth(left,up,upperLeft);
      pixels[target]=(filtered[y*(stride+1)+1+x]+predictor)&255;
    }
    for(let x=0;x<width;x++)alpha[y*width+x]=channels===4?pixels[y*stride+x*channels+3]:255;
  }
  return{width,height,alpha};
}
const native=new Map(),assets={...CITY_DETAIL_MANIFEST.assets,...CITY_ART_ASSETS};
const atlasKeys=['architecture','props','vegetation'],assetCount=Object.keys(CITY_ART_ASSETS).length;
assert(atlasKeys.every(key=>CITY_ART_ASSETS[key]));
assert.equal(Object.keys(CITY_DETAIL_MANIFEST.assets).length,5);
for(const [key,spec]of Object.entries(assets)){
  const identity=nativeIdentity[key]??Object.values(nativeIdentity).find(pin=>pin[2]===spec.sha256);
  assert(identity,`${key}: original native identity is explicitly pinned`);
  assert.deepEqual([spec.width,spec.height,spec.sha256],identity,`${key}: original native identity is pinned`);
  const bytes=await readFile(new URL(spec.path,new URL('./dist/city-art-library.js',import.meta.url)));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),spec.sha256,`${key}: source PNG has not been repainted, resized, or recompressed`);
  const decoded=pngAlpha(bytes);assert.equal(decoded.width,spec.width);assert.equal(decoded.height,spec.height);native.set(key,decoded);
}
assert(native.get('grassGround').alpha.every(value=>value===255),'the shared grass/dirt floor is an opaque diffuse tile');
assert(Object.isFrozen(CITY_ART_ASSETS)&&Object.isFrozen(CITY_ART_SPRITES));
assert.equal(Object.keys(CITY_ART_SPRITES).length,20,'twenty complete reusable source sprites');

function components({width,height,alpha}){
  const seen=new Uint8Array(alpha.length),queue=new Uint32Array(alpha.length),result=[];
  for(let first=0;first<alpha.length;first++){
    if(seen[first]||alpha[first]<16)continue;
    let head=0,tail=1,minX=width,minY=height,maxX=0,maxY=0;queue[0]=first;seen[first]=1;
    while(head<tail){
      const index=queue[head++],x=index%width,y=Math.floor(index/width);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x+1);maxY=Math.max(maxY,y+1);
      for(const next of[x?index-1:-1,x+1<width?index+1:-1,y?index-width:-1,y+1<height?index+width:-1])if(next>=0&&!seen[next]&&alpha[next]>=16){seen[next]=1;queue[tail++]=next;}
    }
    if(tail>=400)result.push({minX,minY,maxX,maxY,area:tail,pixels:queue.slice(0,tail)});
  }
  return result;
}
const silhouetteAssets=new Set([...atlasKeys,...Object.values(CITY_ART_SPRITES).map(spec=>spec.asset)]);
const silhouettes=new Map([...silhouetteAssets].map(key=>[key,components(native.get(key))]));
for(const key of atlasKeys)assert.equal(silhouettes.get(key).length,6,`${key}: six disconnected real painted silhouettes`);
for(const key of silhouetteAssets)if(!atlasKeys.includes(key))assert.equal(silhouettes.get(key).length,1,`${key}: one complete standalone native silhouette`);
for(const [key,spec]of Object.entries(CITY_ART_SPRITES)){
  const image=native.get(spec.asset);assert(image,`${key}: asset exists`);assert(Object.isFrozen(spec));
  assert([spec.sx,spec.sy,spec.sw,spec.sh].every(Number.isInteger));
  assert(spec.sx>=0&&spec.sy>=0&&spec.sw>0&&spec.sh>0&&spec.sx+spec.sw<=image.width&&spec.sy+spec.sh<=image.height,`${key}: complete source rect is inside its actual PNG`);
  assert(spec.footX>=0&&spec.footX<=spec.sw&&spec.footY>=0&&spec.footY<=spec.sh,`${key}: foot anchor belongs to the complete source cell`);
  assert(spec.footprintWidth>0&&spec.footprintDepth>0&&spec.projectionHeightFactor>0);
  if(silhouettes.has(spec.asset)){
    const x1=spec.sx+spec.sw,y1=spec.sy+spec.sh;
    const touching=silhouettes.get(spec.asset).filter(box=>box.minX<x1&&box.maxX>spec.sx&&box.minY<y1&&box.maxY>spec.sy&&box.pixels.some(index=>{const x=index%image.width,y=Math.floor(index/image.width);return x>=spec.sx&&x<x1&&y>=spec.sy&&y<y1;}));
    assert.equal(touching.length,1,`${key}: rect contains its own painted building and no neighboring atlas item`);
    const box=touching[0];assert(box.minX>=spec.sx&&box.maxX<=x1&&box.minY>=spec.sy&&box.maxY<=y1,`${key}: no part of its connected painted silhouette is clipped`);
  }
}

function harness({failure=()=>null}={}){
  const loads=new Map(),decodes=new Map(),canvases=[],reads=[];
  const loader=async(url,key,spec)=>{
    loads.set(key,(loads.get(key)??0)+1);assert.equal(new URL(url).origin,new URL(import.meta.url).origin);
    const fail=failure(key,loads.get(key));if(fail==='load')throw new Error(`network failed: ${key}`);
    return Object.freeze({key,naturalWidth:spec.width+(fail==='size'?1:0),naturalHeight:spec.height,async decode(){decodes.set(key,(decodes.get(key)??0)+1);if(fail==='decode')throw new Error(`decode failed: ${key}`);}});
  };
  const makeCanvas=()=>{
    const canvas={width:0,height:0};canvases.push(canvas);let draw;
    canvas.getContext=()=>({
      drawImage(...args){draw=args;},
      getImageData(x,y,width,height){
        assert.equal(x,0);assert.equal(y,0);const source=native.get(draw[0].key);assert(source);
        let sx=0,sy=0,sw=source.width,sh=source.height;
        if(draw.length===9)[,sx,sy,sw,sh]=draw;
        const data=new Uint8ClampedArray(width*height*4);
        for(let yy=0;yy<height;yy++)for(let xx=0;xx<width;xx++){
          const px=Math.min(source.width-1,Math.floor(sx+(xx+.5)*sw/width)),py=Math.min(source.height-1,Math.floor(sy+(yy+.5)*sh/height));
          data[(yy*width+xx)*4+3]=source.alpha[py*source.width+px];
        }
        reads.push({asset:draw[0].key,width,height,draw});return{data};
      }
    });return canvas;
  };
  const detail=new CityDetailArt({loadImage:loader,makeCanvas}),library=new CityArtLibrary({detail,loadImage:loader,makeCanvas});
  return{library,detail,loads,decodes,canvases,reads};
}
const h=harness(),art=h.library;
assert.equal(art.draw({},'unknown',{}),false);assert.equal(art.getSprite('unknown'),null);
assert.throws(()=>art.draw({},'keep',{x:0,y:0,width:200,height:100}),/preloaded/);
const first=art.preload();assert.equal(first,art.preload(),'concurrent users share a preload');await first;
assert(art.ready&&h.detail.ready);assert.equal(art.cacheStats.decodes,assetCount);assert.equal(art.cacheStats.entries,assetCount);
assert(art.getImage('grassGround'));assert(art.getImage('house'));assert.equal(art.getImage('unknown'),null);
for(const key of Object.keys(assets)){assert.equal(h.loads.get(key),1);assert.equal(h.decodes.get(key),1,`${key}: decoded once`);}
assert.equal(h.detail.cacheStats.maskBuilds,4,'old detail retains its four shared masks');
assert.equal(art.cacheStats.maskBuilds,20,'one catalogue mask per source sprite, never per map prop');
assert.equal(art.cacheStats.maskPixelReads,20);
const catalogueReads=h.reads.filter(read=>read.draw.length===9);assert.equal(catalogueReads.length,20);
for(const read of catalogueReads){
  assert(read.width<=256&&read.height<=256,'source masks are bounded to a 256 pixel edge');
  assert.equal(Math.max(read.width,read.height),256,'long source edge uses the fixed mask resolution');
  assert(Object.values(CITY_ART_SPRITES).some(spec=>spec.asset===read.asset&&JSON.stringify([spec.sx,spec.sy,spec.sw,spec.sh])===JSON.stringify(read.draw.slice(1,5))),'mask samples exactly one entire declared source sprite');
}
assert(h.canvases.every(canvas=>canvas.width===0&&canvas.height===0),'temporary RGBA canvases are released after alpha extraction');
const nativeImageBytes=Object.values(assets).reduce((sum,spec)=>sum+spec.width*spec.height*4,0),maskBytes=h.reads.reduce((sum,read)=>sum+read.width*read.height,0);
assert.equal(art.cacheStats.bytes,nativeImageBytes+maskBytes,'budget includes every native image, four detail masks, and twenty catalogue masks');
assert.equal(art.cacheStats.limitBytes,96*1024*1024);assert(art.cacheStats.bytes<art.cacheStats.limitBytes);

const rect=Object.freeze({x:-210,y:78,width:430,height:290}),before=JSON.stringify(rect),calls=[],stack=[];
const context={globalAlpha:.72,transform:[1,0,0,1,0,0],save(){stack.push({alpha:this.globalAlpha,transform:[...this.transform]});},restore(){const saved=stack.pop();assert(saved);this.globalAlpha=saved.alpha;this.transform=saved.transform;},translate(x,y){this.transform[4]+=x;this.transform[5]+=y;},scale(x,y){this.transform[0]*=x;this.transform[3]*=y;},clip(){throw new Error('whole transparent sprites cannot inherit a floor clip');},drawImage(...args){calls.push({args,alpha:this.globalAlpha,transform:[...this.transform]});}};
for(const [key,spec]of Object.entries(CITY_ART_SPRITES)){
  assert(art.draw(context,key,rect,{alpha:.4}));const call=calls.at(-1);
  assert.deepEqual(call.args.slice(1),[spec.sx,spec.sy,spec.sw,spec.sh,rect.x,rect.y,rect.width,rect.height],`${key}: draw the entire source object without an internal crop`);
  const sprite=art.getSprite(key);assert(Object.isFrozen(sprite));assert.equal(sprite,art.getSprite(key),'source descriptors are shared across map instances');
  assert.equal(call.args[0],sprite.image);assert(Math.abs(call.alpha-.288)<1e-12);
}
assert(art.draw(context,'house',rect,{alpha:.4,flipX:true}));assert.deepEqual(calls.at(-1).args.slice(5),[0,0,430,290]);assert.deepEqual(calls.at(-1).transform,[-1,0,0,1,220,78]);
assert.equal(context.globalAlpha,.72);assert.deepEqual(context.transform,[1,0,0,1,0,0]);assert.equal(stack.length,0);assert.equal(JSON.stringify(rect),before);
const successDraws=art.cacheStats.draws;
assert.throws(()=>art.draw({...context,drawImage(){throw new Error('drawing failed');}},'keep',rect),/drawing failed/);assert.equal(stack.length,0);assert.equal(art.cacheStats.draws,successDraws);
for(const invalid of[{...rect,width:0},{...rect,height:-1},{...rect,x:NaN}])assert.throws(()=>art.draw(context,'keep',invalid),/Invalid city sprite projection/);

// Use real native ruin alpha, not a synthetic rectangle: the central open
// arch stays transparent while its stone columns really cover the body.
const ruin=CITY_ART_SPRITES.ruin,ruinRect={x:0,y:0,width:ruin.sw,height:ruin.sh};
assert.equal(art.coversPlayer('ruin',ruinRect,{x:242,y:240.2}),false,'open real arch is transparent across the player body');
assert.equal(art.coversPlayer('ruin',ruinRect,{x:80,y:240.2}),true,'real opaque stone column covers the player body');
assert.equal(art.coversPlayer('ruin',ruinRect,{x:80,y:240.2},-100),false,'explicit physical foot can place the complete body outside the sprite');
assert.equal(art.coversPlayer('ruin',ruinRect,{x:80,y:10000},260),true,'explicit physical foot overrides unrelated sprite y');
assert.equal(art.coversPlayer('ruin',ruinRect,{x:-1000,y:240.2}),false,'outside painted bounds does not fade an unrelated object');
assert.equal(art.coversPlayer('missing',ruinRect,{x:0,y:0}),true,'missing masks retain the conservative existing fade fallback');
const warm={reads:h.reads.length,decodes:art.cacheStats.decodes,builds:art.cacheStats.maskBuilds,bytes:art.cacheStats.bytes};
for(let frame=0;frame<150;frame++){
  for(const key of Object.keys(CITY_ART_SPRITES)){art.draw(context,key,rect);art.coversPlayer(key,rect,{x:0,y:0});}
  await art.preload();
}
assert.deepEqual({reads:h.reads.length,decodes:art.cacheStats.decodes,builds:art.cacheStats.maskBuilds,bytes:art.cacheStats.bytes},warm,'warm drawing and coverage never decode, read pixels, build masks, or grow the retained cache');

const retry=harness({failure:(key,attempt)=>key==='props'&&attempt===1?'load':null});
await assert.rejects(retry.library.preload(),/failed to load/);assert.equal(retry.library.ready,false);assert.equal(retry.library.cacheStats.entries,assetCount-1);
await retry.library.preload();assert(retry.library.ready);assert.equal(retry.library.cacheStats.failures,1);assert.equal(retry.loads.get('props'),2);
for(const key of Object.keys(assets).filter(key=>key!=='props'))assert.equal(retry.loads.get(key),1,`${key}: successful source survives retry`);
assert.equal(retry.library.cacheStats.maskBuilds,20);assert.equal(retry.library.cacheStats.decodes,assetCount);
const malformed=harness({failure:(key,attempt)=>attempt===1?(key==='architecture'?'size':key==='props'?'decode':null):null});
await assert.rejects(malformed.library.preload(),error=>{
  assert(error instanceof AggregateError);assert.equal(error.errors.length,2);assert(error.errors.some(item=>/size mismatch/.test(item.cause?.message)));assert(error.errors.some(item=>/decode failed/.test(item.cause?.message)));return true;
});
assert.equal(malformed.library.cacheStats.entries,assetCount-2,'wrong native dimensions and rejected decoding cannot become ready');
await malformed.library.preload();assert(malformed.library.ready);assert.equal(malformed.loads.get('architecture'),2);assert.equal(malformed.loads.get('props'),2);assert.equal(malformed.loads.get('vegetation'),1);assert.equal(malformed.library.cacheStats.decodes,assetCount);assert.equal(malformed.library.cacheStats.maskBuilds,20);

console.log(`City shared art library passed: ${Object.keys(assets).length} immutable native PNGs, 20 complete isolated source sprites, Node-safe import, full unclipped rendering/context restoration, real-alpha open arch and stone coverage, one-time ${assetCount}-image/20-mask allocation, retry/decode/dimension failures, and ${(art.cacheStats.bytes/1024/1024).toFixed(2)} MiB total retained art below 96 MiB.`);
