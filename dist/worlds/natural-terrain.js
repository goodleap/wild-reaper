import { getConfigSection } from '../content-config.js';
const LAYOUTS=getConfigSection('geography').naturalTerrainLayouts;
// Shared seeded woodland algorithm; authored sizes, density and variants are data.
export function naturalTerrainCell({tx,ty,key,region,hash,add,treeProfiles,cell,settings}){
  const {tree,ground,log,rock}=LAYOUTS[settings.layoutId],variants=settings.variants,treeType=variants.treeType||'tree',n=hash(tx+31,ty+17);
  const visual=variant=>variant?{region,variant}:{};
  if(n>tree.threshold){
    const size=hash(tx+91,ty+43),scale=size<tree.sizeThreshold?tree.scaleBase+size*tree.scaleGain:tree.largeScaleBase+(size-tree.sizeThreshold)/tree.largeScaleSpan*tree.largeScaleGain;
    const treeForm=Math.floor(hash(tx+57,ty+101)*5),crownWidth=tree.crownWidthBase+hash(tx+37,ty+89)*tree.crownWidthGain,crownHeight=tree.crownHeightBase+hash(tx+13,ty+109)*tree.crownHeightGain;
    add({id:`${variants.treeId||'tree'}:${key}`,type:treeType,x:tx*cell+tree.x,y:ty*cell+tree.y,r:tree.radius*scale*(treeType==='rock'?1:treeProfiles[treeForm].trunkWidth),scale,seed:n,treeForm,rockForm:treeForm,crownWidth,crownHeight,...visual(variants.tree)});
  }
  const x=tx*cell+ground.x+hash(tx+71,ty+13)*ground.xJitter,y=ty*cell+ground.y+hash(tx+19,ty+81)*ground.yJitter,seed=hash(tx+41,ty+63),size=hash(tx+113,ty+59);
  if(seed>log.threshold){
    add({id:`log:${key}`,type:'log',x,y,r:log.radiusBase+size*log.radiusGain,halfLength:log.lengthBase+size*log.lengthGain,angle:hash(tx+83,ty+23)*(Math.PI*2),scale:1,seed,logForm:Math.floor(hash(tx+59,ty+29)*3),...visual(variants.log)});
  }else{
    const scale=size<rock.sizeThreshold?rock.scaleBase+size*rock.scaleGain:rock.largeScaleBase+(size-rock.sizeThreshold)*rock.largeScaleGain,r=rock.radius*scale,rockForm=Math.floor(hash(tx+97,ty+137)*5);
    add({id:`rock:${key}`,type:'rock',x,y,r,scale,seed,rockForm,...visual(variants.rock)});
  }
}
