// Themes select shared content; map identities and seeds belong to instances.
export const mapIdentity=game=>game?.mapId??game?.regionIndex??0;
export function mapSeed(game){
  const seed=game?.stage?.currentIsland?.seed??game?.regionIndex;
  return Number.isFinite(seed)?Math.trunc(seed):0;
}
