import { defineWorld } from './define-world.js';

function generateTerrain({zone,roll,place:add}){
  if(zone.id==='pass'){
    add('log','world-ridge',125,245,{halfLength:128,r:30+roll(2)*7,angle:Math.PI/2});
    add('log','world-ridge',395,255,{halfLength:105+roll(3)*18,r:30,angle:Math.PI/2});
  }else if(zone.id==='summit'){
    add('log','world-ridge',150,140,{halfLength:76+roll(2)*17,r:35,angle:.28});
    add('rock','world-reef',370,365,{r:54+roll(3)*15,rockForm:2});
  }else{
    add('tree','world-pine',135,135);add('rock','world-reef',365,365,{r:46+roll(3)*12,rockForm:2});
    if(roll(4)>.55)add('tree','world-pine',365,135,{scale:.75,r:16});
  }
}

export default defineWorld({
  "id": "mountain",
  "name": "群峰山地",
  "shortName": "山地",
  "colors": {
    "ground": "#596866",
    "light": "#73817a",
    "dark": "#354948",
    "accent": "#b9d5c8",
    "mist": "#c2d8de",
    "grass": "#56785b",
    "stone": "#92a19d"
  },
  "enemyWeights": {
    "slime": 0.75,
    "beetle": 1.05,
    "bat": 1.2,
    "brute": 1.2,
    "boar": 1.55,
    "spore": 0.55
  },
  "profile": {
    "x": 3600,
    "y": 4850,
    "phase": 4.2,
    "bays": 0.135
  },
  "danger": 1.07,
  "coast": {},
  "biomeZones": [
    "foothills",
    "pass",
    "summit"
  ],
  "terrain": {
    generate: generateTerrain,
    "hashOffset": 2155,
    "variants": {}
  },
  "environment": {
    "hashOffset": 2095,
    "mushroomChance": 0,
    "water": {
      "chance": 0.18,
      "families": 4,
      "kind": "water",
      "zoneKinds": null,
      "innerIslands": false
    },
    "mechanism": null,
    "hazard": {
      "type": "rockfall",
      "source": "terrain",
      "chance": 0.46
    },
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
      "deep": "#224953",
      "sea": "#386b72",
      "shallow": "#799e94",
      "sand": "#a3ac94",
      "grain": "#d3d8ba",
      "edge": "#99b1a1",
      "fringe": "#687f6e"
    },
    "mapCoast": {
      "sand": "#8f9e8d",
      "sea": "#3c6878",
      "shallow": "#79a3a6"
    },
    "ground": {
      "floor": "#687369",
      "light": "#a9b5a4",
      "dark": "#465b53",
      "detail": "#9b9e80"
    },
    "water": {
      "bank": "#637b697d",
      "rim": "#a8baa2",
      "top": "#779f9a",
      "deep": "#3c787c",
      "light": "#e0edd5"
    },
    "light": {
      "id": "mountain",
      "rgb": "219,235,239",
      "glow": "#d8e8eb09",
      "strength": 0.46,
      "clear": "rgba(219,235,239,0)"
    }
  }
});
