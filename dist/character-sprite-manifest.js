// Source rectangles preserve the complete transparent silhouette; anchors
// are the midpoint between grounded feet, relative to each source frame.
export const CHARACTER_SPRITE_ATLAS=Object.freeze({"path":"./assets/units/humanoids-013f39c762b0ef5c.png","width":1774,"height":887});
const sprite=definition=>Object.freeze({...definition,frame:Object.freeze(definition.frame),anchor:Object.freeze(definition.anchor)});
export const CHARACTER_SPRITES=Object.freeze({
  hunter:sprite({"name":"老猎人","frame":{"x":48,"y":51,"w":395,"h":395},"anchor":{"x":172,"y":385},"worldHeight":54,"referenceScale":1.1}),
  courier:sprite({"name":"年轻送信人","frame":{"x":487,"y":37,"w":355,"h":409},"anchor":{"x":184,"y":398},"worldHeight":54,"referenceScale":1.1}),
  potter:sprite({"name":"陶工少女","frame":{"x":974,"y":48,"w":296,"h":400},"anchor":{"x":138,"y":391},"worldHeight":53,"referenceScale":1.1}),
  bellkeeper:sprite({"name":"守钟老妇","frame":{"x":1396,"y":38,"w":299,"h":419},"anchor":{"x":147,"y":410},"worldHeight":54,"referenceScale":1.1}),
  bandit:sprite({"name":"双刀盗匪","frame":{"x":38,"y":474,"w":407,"h":371},"anchor":{"x":167,"y":365},"worldHeight":54,"referenceScale":1.1}),
  swordsman:sprite({"name":"游荡剑客","frame":{"x":458,"y":445,"w":386,"h":409},"anchor":{"x":219,"y":398},"worldHeight":55,"referenceScale":1.1}),
  ironmarshal:sprite({"name":"铁面统领","frame":{"x":873,"y":460,"w":451,"h":402},"anchor":{"x":247,"y":390},"worldHeight":74,"referenceScale":1.1}),
  emberpriest:sprite({"name":"烬火祭司","frame":{"x":1356,"y":455,"w":397,"h":411},"anchor":{"x":182,"y":400},"worldHeight":68,"referenceScale":1.1})
});
