import { defineWorld } from './define-world.js';

function generateTerrain({zone,roll,place:add}){
  if(zone.id==='palms'){
    add('tree','world-palm',135,125);add('tree','world-palm',365,370,{scale:.78+roll(9)*.35});
    if(roll(2)>.45)add('rock','world-reef',355,135,{r:28+roll(8)*13,rockForm:1});
  }else if(zone.id==='reefs'){
    add('rock','world-reef',135,145,{r:44+roll(2)*16,rockForm:2});add('rock','world-reef',365,360,{r:31+roll(3)*17,rockForm:1});
    if(roll(4)>.5)add('log','world-driftwood',365,125,{halfLength:44,r:12,angle:.22});
  }else{
    if(roll(1)>.35)add('log','world-driftwood',150,160,{halfLength:48+roll(4)*18,r:12+roll(6)*4,angle:roll(5)*.7-.35});
    if(roll(2)>.65)add('rock','world-reef',365,355,{r:26+roll(3)*12,rockForm:1});
  }
}

export default defineWorld({
  "id": "beach",
  "name": "潮汐海岸",
  "shortName": "海岸",
  "colors": {
    "ground": "#a99c71",
    "light": "#c7b986",
    "dark": "#766c4e",
    "accent": "#f1d997",
    "mist": "#cae3d9",
    "grass": "#658c6c",
    "stone": "#738d91"
  },
  "enemyWeights": {
    "slime": 1.25,
    "beetle": 1.35,
    "bat": 0.7,
    "brute": 0.9,
    "boar": 0.75,
    "spore": 0.75
  },
  "profile": {
    "x": 4780,
    "y": 3600,
    "phase": 0.85,
    "bays": 0.13
  },
  "danger": 1.02,
  "coast": {
    "beachWidth": 180
  },
  "biomeZones": [
    "sands",
    "reefs",
    "palms"
  ],
  "terrain": {
    generate: generateTerrain,
    "hashOffset": 1293,
    "variants": {}
  },
  "environment": {
    "hashOffset": 1257,
    "mushroomChance": 0,
    "water": {
      "chance": 0.54,
      "families": 4,
      "kind": "water",
      "zoneKinds": null,
      "innerIslands": false
    },
    "mechanism": null,
    "hazard": {
      "type": "tide",
      "source": "water",
      "chance": 0.46
    },
    "damagingSurface": null,
    "waterMovement": {
      "idle": 0.94,
      "active": 0.62
    },
    "waterImmersion": {
      "idle": 0.25,
      "active": 0.8
    }
  },
  "art": {
    "coast": {
      "deep": "#174e62",
      "sea": "#267c86",
      "shallow": "#77b7a6",
      "sand": "#c5b889",
      "grain": "#efe0b3",
      "edge": "#a6c8ad",
      "fringe": "#a69870"
    },
    "mapCoast": {
      "sand": "#dfc998",
      "sea": "#347a88",
      "shallow": "#75c1c3"
    },
    "ground": {
      "floor": "#b8ad80",
      "light": "#e9d3a0",
      "dark": "#827d59",
      "detail": "#6d9365"
    },
    "water": {
      "bank": "#a5956bb0",
      "rim": "#d8c99f",
      "top": "#6eaa9b",
      "deep": "#377d7b",
      "light": "#daf3d0"
    },
    "light": {
      "id": "beach",
      "rgb": "246,225,184",
      "glow": "#f2d8a80c",
      "strength": 0.6,
      "clear": "rgba(246,225,184,0)"
    }
  }
});
