export function validateWorldLayout(layout,bossIds,path){
  const fail=key=>{throw new TypeError(`Invalid world configuration: ${path}.${key}`);};
  if(!layout||typeof layout!=='object'||!bossIds.has(layout.bossKind))fail('bossKind');
  const number=(v,key,min=-10000,max=10000)=>{if(!Number.isFinite(v)||v<min||v>max)fail(key);};
  const array=(v,key,min,max)=>{if(!Array.isArray(v)||v.length<min||v.length>max)fail(key);return v;};
  for(const line of array(layout.paths,'paths',1,24))for(const p of array(line,'path',2,32)){array(p,'point',2,2);p.forEach(n=>number(n,'point'));}
  for(const p of array(layout.patches,'patches',1,32)){
    array(p,'patch',6,7);if(!['forest','brush','ridge','ruins','city','ice','ash'].includes(p[0]))fail('patch.kind');
    number(p[1],'patch.x');number(p[2],'patch.y');number(p[3],'patch.rx',40,1800);number(p[4],'patch.ry',40,1800);number(p[5],'patch.angle',-Math.PI,Math.PI);if(p[6]!=null)number(p[6],'patch.density',0,1);
  }
  for(const p of array(layout.lakes,'lakes',0,12)){
    array(p,'lake',6,6);number(p[0],'lake.x');number(p[1],'lake.y');number(p[2],'lake.rx',80,1400);number(p[3],'lake.ry',80,1400);number(p[4],'lake.angle',-Math.PI,Math.PI);if(!['rounded','elongated','kidney','bays','branching'].includes(p[5]))fail('lake.shape');
  }
  for(const p of array(layout.ridges,'ridges',0,48)){array(p,'ridge',4,4);p.forEach(n=>number(n,'ridge'));}
  return true;
}
