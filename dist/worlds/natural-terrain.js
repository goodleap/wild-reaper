// Shared woodland layout, parameterized by each world's scenery variants.
export function naturalTerrainCell({tx,ty,key,region,hash,add,treeProfiles,cell,settings}){
  const variants=settings.variants,treeType=variants.treeType||'tree',n=hash(tx+31,ty+17);
  const visual=variant=>variant?{region,variant}:{};
  if(n>.62){
    const size=hash(tx+91,ty+43),scale=size<.86?.70+size*.64:1.28+(size-.86)/.14*.22;
    const treeForm=Math.floor(hash(tx+57,ty+101)*5),crownWidth=.93+hash(tx+37,ty+89)*.14,crownHeight=.96+hash(tx+13,ty+109)*.08;
    add({id:`${variants.treeId||'tree'}:${key}`,type:treeType,x:tx*cell+110,y:ty*cell+50,r:24*scale*(treeType==='rock'?1:treeProfiles[treeForm].trunkWidth),scale,seed:n,treeForm,rockForm:treeForm,crownWidth,crownHeight,...visual(variants.tree)});
  }
  const x=tx*cell+240+hash(tx+71,ty+13)*90,y=ty*cell+245+hash(tx+19,ty+81)*85,seed=hash(tx+41,ty+63),size=hash(tx+113,ty+59);
  if(seed>.49){
    add({id:`log:${key}`,type:'log',x,y,r:12+size*10,halfLength:35+size*43,angle:hash(tx+83,ty+23)*(Math.PI*2),scale:1,seed,logForm:Math.floor(hash(tx+59,ty+29)*3),...visual(variants.log)});
  }else{
    const scale=size<.9?.60+size*.91:1.45+(size-.9)*3.5,r=36*scale,rockForm=Math.floor(hash(tx+97,ty+137)*5);
    add({id:`rock:${key}`,type:'rock',x,y,r,scale,seed,rockForm,...visual(variants.rock)});
  }
}
