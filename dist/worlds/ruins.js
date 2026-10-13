import { defineWorld } from './define-world.js';
import { naturalTerrainCell } from './natural-terrain.js';

export default defineWorld({
  "id": "ruins",
  "name": "失落遗迹",
  "shortName": "遗迹",
  "colors": {
    "ground": "#41413a",
    "light": "#555345",
    "dark": "#2b302e",
    "accent": "#dbc891",
    "mist": "#dbd2b4",
    "grass": "#858467",
    "stone": "#a09b82"
  },
  "enemyWeights": {
    "slime": 0.8,
    "beetle": 1.45,
    "bat": 0.8,
    "brute": 1.45,
    "boar": 0.9,
    "spore": 0.8
  },
  "profile": {
    "x": 4250,
    "y": 4050,
    "phase": 3.5,
    "bays": 0.115
  },
  "danger": 1.08,
  "coast": {},
  "biomeZones": [],
  "terrain": {
    generate: naturalTerrainCell,
    "hashOffset": 811,
    "variants": {
      "tree": "pillar",
      "treeType": "rock",
      "treeId": "pillar",
      "log": "wall",
      "rock": "slab"
    }
  },
  "environment": {
    "hashOffset": 811,
    "mushroomChance": 0.48,
    "water": {
      "chance": 0.16,
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
      "deep": "#243e51",
      "sea": "#345967",
      "shallow": "#668a85",
      "sand": "#aaa995",
      "grain": "#d5d1b5",
      "edge": "#8aa399",
      "fringe": "#626b57"
    },
    "mapCoast": {
      "land": "#666d65",
      "sand": "#969985",
      "sea": "#345360",
      "shallow": "#507776"
    }
  }
});
