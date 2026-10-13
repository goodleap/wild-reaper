import { defineWorld } from './define-world.js';

function generateTerrain({zone,roll,place:add}){
  if(zone.id==='basalt'){
    add('log','world-ridge',155,135,{halfLength:78,r:32,angle:-.2});add('rock','world-basalt',365,365,{r:51,rockForm:2});
  }else if(zone.id==='vents'){
    add('rock','world-basalt',135,145,{r:36+roll(2)*13,rockForm:2});
    if(roll(3)>.35)add('rock','world-basalt',370,365,{r:31+roll(4)*13,rockForm:0});
  }else{
    add('tree','world-charred',145,125,{scale:.84+roll(2)*.3,r:18});
    if(roll(3)>.35)add('rock','world-basalt',365,355,{r:39,rockForm:1});
  }
}

export default defineWorld({
  "id": "volcano",
  "name": "熔火之境",
  "shortName": "熔火",
  "colors": {
    "ground": "#474143",
    "light": "#665452",
    "dark": "#28282d",
    "accent": "#ffbd79",
    "mist": "#b69a91",
    "grass": "#765f46",
    "stone": "#796c6b"
  },
  "enemyWeights": {
    "slime": 0.8,
    "beetle": 1.35,
    "bat": 1.3,
    "brute": 1.4,
    "boar": 0.85,
    "spore": 0.55
  },
  "profile": {
    "x": 4220,
    "y": 4290,
    "phase": 3.95,
    "bays": 0.11
  },
  "danger": 1.1,
  "coast": {},
  "biomeZones": [
    "ashfield",
    "basalt",
    "vents"
  ],
  "terrain": {
    generate: generateTerrain,
    "hashOffset": 3017,
    "variants": {}
  },
  "environment": {
    "hashOffset": 2933,
    "mushroomChance": 0,
    "water": {
      "chance": 0.38,
      "families": 4,
      "kind": "lava",
      "zoneKinds": null,
      "innerIslands": false
    },
    "mechanism": null,
    "hazard": {
      "type": "vent",
      "source": "terrain",
      "chance": 0.46
    },
    "damagingSurface": "lava",
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
      "deep": "#273d4a",
      "sea": "#395b63",
      "shallow": "#668980",
      "sand": "#77786b",
      "grain": "#aaa891",
      "edge": "#879588",
      "fringe": "#585e55"
    },
    "mapCoast": {
      "sand": "#937366",
      "sea": "#453c48",
      "shallow": "#776a71"
    },
    "ground": {
      "floor": "#423f40",
      "light": "#79706a",
      "dark": "#292c31",
      "detail": "#97674d"
    },
    "water": {
      "bank": "#202730ab",
      "rim": "#7c7c6b",
      "top": "#567c77",
      "deep": "#335454",
      "light": "#c3d1ba"
    },
    "light": {
      "id": "volcano",
      "rgb": "247,171,110",
      "glow": "#f5a86806",
      "strength": 0.2,
      "clear": "rgba(247,171,110,0)"
    }
  }
});
