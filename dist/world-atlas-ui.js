const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const finite=value=>Number.isFinite(value)?value:0;

export function worldAtlasHTML(atlas,{travel=false,selectedId=null}={}){
  const regions=atlas?.regions||[],connections=atlas?.connections||[];
  if(!regions.length)return '<p class="character-empty">尚无区域记录</p>';
  const xs=regions.map(region=>finite(region.atlas?.x)),ys=regions.map(region=>finite(region.atlas?.y));
  const minX=Math.min(...xs),minY=Math.min(...ys),spanX=Math.max(1,Math.max(...xs)-minX),spanY=Math.max(1,Math.max(...ys)-minY);
  const positions=new Map(regions.map(region=>[region.worldId,{x:40+(finite(region.atlas?.x)-minX)/spanX*340,y:30+(finite(region.atlas?.y)-minY)/spanY*220}]));
  const lines=connections.map(connection=>{
    const a=positions.get(connection.from),b=positions.get(connection.to);if(!a||!b)return '';
    return '<line x1="'+a.x+'" y1="'+a.y+'" x2="'+b.x+'" y2="'+b.y+'" class="'+(connection.connected?'is-connected':connection.discovered?'is-known':'')+'"/>';
  }).join('');
  const dots=regions.map(region=>{
    const point=positions.get(region.worldId),known=region.discovered||region.current;
    return '<g class="atlas-node '+(region.current?'is-current':known?'is-known':'')+'"><circle cx="'+point.x+'" cy="'+point.y+'" r="'+(region.current?8:6)+'"/><text x="'+point.x+'" y="'+(point.y+21)+'">'+escape(known?region.name:'未探索')+'</text></g>';
  }).join('');
  const rows=regions.map(region=>{
    const known=region.discovered||region.current,disabled=travel?!region.canTravel:!known;
    const state=region.current?'当前区域':region.activated?'传送点已激活':known?'传送点未激活':'尚未探索';
    const detail=travel?(region.current?'当前位置':region.reason||state):[known?region.coreName:'',state].filter(Boolean).join(' · ');
    return '<button type="button" class="atlas-destination'+(region.worldId===selectedId?' is-selected':'')+'" data-world-target="'+escape(region.worldId)+'"'+(disabled?' disabled':'')+'><span><strong>'+escape(known?region.name:'未探索区域')+'</strong><small>'+escape(detail)+'</small></span><span class="atlas-destination-action">'+(travel?(region.canTravel?'传送 →':'—'):(region.current?'你在这里':'查看'))+'</span></button>';
  }).join('');
  const selected=regions.find(region=>region.worldId===(selectedId||atlas.currentWorldId));
  const detail=!travel&&selected?.discovered?'<p class="atlas-selection"><strong>'+escape(selected.name)+'</strong> · '+escape(selected.coreName)+'<br><span>沿郊外道路探索相邻区域；在已激活的传送点之间往返。</span></p>':'';
  return '<div class="world-atlas'+(travel?' is-travel':'')+'"><svg class="world-atlas-diagram" viewBox="0 0 420 285" role="img" aria-label="世界区域与道路连接"><g class="atlas-connections">'+lines+'</g>'+dots+'</svg>'+detail+'<div class="atlas-destinations" aria-label="'+(travel?'传送目的地':'世界区域')+'">'+rows+'</div><p id="world-travel-feedback" class="atlas-feedback" role="status"></p></div>';
}

export function inventoryHTML(items=[]){
  const owned=items.filter(item=>item.count>0);
  if(!owned.length)return '<p class="character-empty">背包里还没有补给。可在城镇补给铺购买，留待需要时使用。</p><p id="supply-feedback" class="atlas-feedback" role="status"></p>';
  return '<p class="character-summary">购买的补给保存在这里，使用后消耗一份。</p><div class="supply-inventory">'+owned.map(item=>'<article class="supply-inventory-item"><span class="shop-icon" aria-hidden="true">'+escape(item.icon)+'</span><div><h3>'+escape(item.name)+' <small>×'+item.count+'</small></h3><p>'+escape(item.desc)+'</p><small>'+escape(item.available?'':item.reason)+'</small></div><button type="button" class="secondary-button" data-use-supply="'+escape(item.id)+'"'+(item.available?'':' disabled')+'>使用</button></article>').join('')+'</div><p id="supply-feedback" class="atlas-feedback" role="status"></p>';
}
