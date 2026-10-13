import { defineWorld } from './define-world.js';

function generateTerrain({zone,roll,place:add}){
  if(zone.id==='plaza'){
    if(roll(2)>.45)add('log','world-city-wall',145,145,{halfLength:42,r:15,angle:0});
    if(roll(3)>.6)add('tree','world-pine',375,370,{scale:.8,r:17});
  }else{
    add('log','world-building',172,155,{halfLength:54+roll(2)*10,r:28+roll(5)*5,scale:1});
    add('log','world-building',355,365,{halfLength:50+roll(3)*8,r:28+roll(6)*4,scale:1});
    if(zone.id==='courtyard')add('tree','world-pine',360,140,{scale:.7,r:15});
    else if(roll(8)>.45)add('log','world-city-wall',145,360,{halfLength:43,r:14,angle:Math.PI/2});
  }
}

export default defineWorld({
  "id": "city",
  "name": "暮钟古城",
  "shortName": "古城",
  "colors": {
    "ground": "#767568",
    "light": "#97917d",
    "dark": "#4d514c",
    "accent": "#e0b99a",
    "mist": "#d3c9bc",
    "grass": "#697556",
    "stone": "#949181"
  },
  "enemyWeights": {
    "slime": 0.7,
    "beetle": 1.15,
    "bat": 1.15,
    "brute": 1.35,
    "boar": 1,
    "spore": 0.65
  },
  "profile": {
    "x": 4020,
    "y": 4400,
    "phase": 2.65,
    "bays": 0.05
  },
  "danger": 1.06,
  "coast": {},
  "biomeZones": [
    "streets",
    "plaza",
    "courtyard"
  ],
  "terrain": {
    generate: generateTerrain,
    "hashOffset": 1724,
    "variants": {}
  },
  "environment": {
    "hashOffset": 1676,
    "mushroomChance": 0,
    "water": {
      "chance": 0,
      "families": 4,
      "kind": "water",
      "zoneKinds": null,
      "innerIslands": false
    },
    "mechanism": null,
    "hazard": null,
    "damagingSurface": null,
    "waterMovement": {
      "idle": 0.74,
      "active": 0.74
    },
    "waterImmersion": {
      "idle": 1,
      "active": 1
    }
  },
  "art": {
    "coast": {
      "deep": "#294b58",
      "sea": "#3e6970",
      "shallow": "#83a391",
      "sand": "#aaa98b",
      "grain": "#d6d1ad",
      "edge": "#9ba98f",
      "fringe": "#777e69"
    },
    "mapCoast": {
      "sand": "#ad9d80",
      "sea": "#425f66",
      "shallow": "#72928c"
    },
    "ground": {
      "floor": "#65685f",
      "light": "#a3a28d",
      "dark": "#474d49",
      "detail": "#8f8470"
    },
    "water": {
      "bank": "#626a5990",
      "rim": "#a3ab8c",
      "top": "#759d8d",
      "deep": "#456e69",
      "light": "#d6e5c8"
    },
    "light": {
      "id": "city",
      "rgb": "240,229,211",
      "glow": "#eee0c60a",
      "strength": 0.48,
      "clear": "rgba(240,229,211,0)"
    }
  }
});
