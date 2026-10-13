const define=(id,name,shortName,colors,enemyWeights,profile,danger=1)=>Object.freeze({id,name,shortName,colors:Object.freeze(colors),enemyWeights:Object.freeze(enemyWeights),profile:Object.freeze(profile),danger});

// Shared, dependency-free world catalog. Keep indices stable for saved routes.
export const REGIONS=Object.freeze([
  define('forest','低语之森','密林',{ground:'#263e30',light:'#35503a',dark:'#182b22',accent:'#a9d991',mist:'#c1d6a9',grass:'#648052',stone:'#788170'},{slime:1,beetle:1,bat:1,brute:1,boar:1,spore:1},{x:4350,y:4100,phase:.2,bays:.08}),
  define('marsh','迷雾沼泽','沼泽',{ground:'#253c3d',light:'#36504c',dark:'#192d31',accent:'#a0d0c4',mist:'#bbd5d2',grass:'#64877b',stone:'#708c85'},{slime:1.25,beetle:.8,bat:.7,brute:1.1,boar:.85,spore:1.7},{x:4450,y:3950,phase:1.6,bays:.14},1.04),
  define('ruins','失落遗迹','遗迹',{ground:'#41413a',light:'#555345',dark:'#2b302e',accent:'#dbc891',mist:'#dbd2b4',grass:'#858467',stone:'#a09b82'},{slime:.8,beetle:1.45,bat:.8,brute:1.45,boar:.9,spore:.8},{x:4250,y:4050,phase:3.5,bays:.115},1.08),
  define('beach','潮汐海岸','海岸',{ground:'#a99c71',light:'#c7b986',dark:'#766c4e',accent:'#f1d997',mist:'#cae3d9',grass:'#658c6c',stone:'#738d91'},{slime:1.25,beetle:1.35,bat:.7,brute:.9,boar:.75,spore:.75},{x:4780,y:3600,phase:.85,bays:.13},1.02),
  define('city','暮钟古城','古城',{ground:'#767568',light:'#97917d',dark:'#4d514c',accent:'#e0b99a',mist:'#d3c9bc',grass:'#697556',stone:'#949181'},{slime:.7,beetle:1.15,bat:1.15,brute:1.35,boar:1,spore:.65},{x:4020,y:4400,phase:2.65,bays:.05},1.06),
  define('mountain','群峰山地','山地',{ground:'#596866',light:'#73817a',dark:'#354948',accent:'#b9d5c8',mist:'#c2d8de',grass:'#56785b',stone:'#92a19d'},{slime:.75,beetle:1.05,bat:1.2,brute:1.2,boar:1.55,spore:.55},{x:3600,y:4850,phase:4.2,bays:.135},1.07),
  define('snow','霜雪荒原','雪原',{ground:'#aebfc5',light:'#d0dde0',dark:'#738f9d',accent:'#c9f0f5',mist:'#e3eef1',grass:'#52716b',stone:'#839ba8'},{slime:1.05,beetle:.75,bat:1.2,brute:1.3,boar:1.3,spore:.45},{x:4540,y:4200,phase:5.35,bays:.065},1.05),
  define('volcano','熔火之境','熔火',{ground:'#474143',light:'#665452',dark:'#28282d',accent:'#ffbd79',mist:'#b69a91',grass:'#765f46',stone:'#796c6b'},{slime:.8,beetle:1.35,bat:1.3,brute:1.4,boar:.85,spore:.55},{x:4220,y:4290,phase:3.95,bays:.11},1.1)
]);
export const WORLD_IDS=Object.freeze(REGIONS.map(region=>region.id));
export const normalizeWorldIndex=index=>Number.isFinite(index)?((Math.trunc(index)%REGIONS.length)+REGIONS.length)%REGIONS.length:0;
export const regionFor=index=>REGIONS[normalizeWorldIndex(index)];
export const WORLD_CONNECTIONS=Object.freeze([[0,1],[1,2],[0,2],[0,3],[3,4],[4,5],[5,6],[6,7],[7,2],[4,2]].map(edge=>Object.freeze(edge)));
const NEIGHBORS=Object.freeze(REGIONS.map((_,index)=>Object.freeze(WORLD_CONNECTIONS.flatMap(([a,b])=>a===index?[b]:b===index?[a]:[]).sort((a,b)=>a-b))));
export const worldNeighbors=index=>NEIGHBORS[normalizeWorldIndex(index)];
