import {frostcrownAssets,FROSTCROWN_ASSET} from './enemy-art/frostcrown-assets.js';
import {characterSprites} from './character-sprites.js';

// All decoded actor images are ready before the app can draw or cache an actor.
// Importing this list performs no download; boot owns progress and failures.
export const BOOT_IMAGE_ASSETS=Object.freeze([
  Object.freeze({path:'./'+FROSTCROWN_ASSET.path.replace(/^\.\.\//,''),label:'角色图片',assets:frostcrownAssets}),
  ...characterSprites.atlasAssets
]);
