import { defineWorld } from './define-world.js';

function generateTerrain({zone,roll,place:add}){
  if(zone.id==='pines'){
    add('tree','world-snowpine',135,125,{scale:1.08,r:23});add('tree','world-snowpine',365,365,{scale:.86,r:19});
    if(roll(3)>.5)add('rock','world-ice',365,125,{r:28,rockForm:1});
  }else if(zone.id==='icefield'){
    if(roll(2)>.3)add('rock','world-ice',140,140,{r:35+roll(3)*13,rockForm:2});
    if(roll(4)>.6)add('rock','world-ice',370,365,{r:29+roll(5)*13,rockForm:0});
  }else{
    add('rock','world-ice',365,350,{r:41+roll(3)*16,rockForm:1});
    if(roll(4)>.5)add('tree','world-snowpine',135,135,{scale:.83,r:18});
  }
}

export default defineWorld({
  "id": "snow",
  "name": "霜雪荒原",
  "shortName": "雪原",
  "colors": {
    "ground": "#aebfc5",
    "light": "#d0dde0",
    "dark": "#738f9d",
    "accent": "#c9f0f5",
    "mist": "#e3eef1",
    "grass": "#52716b",
    "stone": "#839ba8"
  },
  "enemyWeights": {
    "slime": 1.05,
    "beetle": 0.75,
    "bat": 1.2,
    "brute": 1.3,
    "boar": 1.3,
    "spore": 0.45
  },
  "profile": {
    "x": 4540,
    "y": 4200,
    "phase": 5.35,
    "bays": 0.065
  },
  "danger": 1.05,
  "coast": {},
  "biomeZones": [
    "pines",
    "icefield",
    "drifts"
  ],
  "terrain": {
    generate: generateTerrain,
    "hashOffset": 2586,
    "variants": {}
  },
  "environment": {
    "hashOffset": 2514,
    "mushroomChance": 0,
    "water": {
      "chance": 0.56,
      "families": 4,
      "kind": "snow",
      "zoneKinds": {
        "icefield": "ice"
      },
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
      "deep": "#274853",
      "sea": "#517c88",
      "shallow": "#9fbfc0",
      "sand": "#b7c8c4",
      "grain": "#e6f0dc",
      "edge": "#d1e1d4",
      "fringe": "#9cb8b0"
    },
    "mapCoast": {
      "sand": "#a7c7cf",
      "sea": "#416e84",
      "shallow": "#85bdcf"
    },
    "ground": {
      "floor": "#b7c9c9",
      "light": "#e6efdf",
      "dark": "#8aabae",
      "detail": "#6c8e85"
    },
    "water": {
      "bank": "#729a9c70",
      "rim": "#d2e1d5",
      "top": "#b8d7d3",
      "deep": "#7eafb6",
      "light": "#f1f9e5"
    },
    "light": {
      "id": "snow",
      "rgb": "216,240,255",
      "glow": "#d4f1ff08",
      "strength": 0.35,
      "clear": "rgba(216,240,255,0)"
    }
  }
});
