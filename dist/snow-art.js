// Public snow-theme artwork entry point. Callers supply placement, geometry,
// depth ordering and bounded caches; no map identity is embedded in painters.
export { paintSnowPine, paintSnowRock, paintSnowShrub, paintSnowGrass, paintSnowLog, SNOW_SCENERY_BOUNDS, SNOW_ROCK_PROFILES } from './snow-scenery-art.js';
export { paintSnowGround, paintSnowSurface, paintSnowIceTexture, SNOW_GROUND_COLOR, SNOW_ICE_COLOR } from './snow-surface-art.js';
export { paintSnowRidge, drawSnowCliffs, drawSnowBridge, drawSnowLandmark, SNOW_STRUCTURE_PALETTE } from './snow-structure-art.js';
