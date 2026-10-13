import { defineWorld } from './define-world.js';
import { naturalTerrainCell } from './natural-terrain.js';

export default defineWorld({
  "id": "forest",
  "name": "低语之森",
  "shortName": "密林",
  "colors": {
    "ground": "#263e30",
    "light": "#35503a",
    "dark": "#182b22",
    "accent": "#a9d991",
    "mist": "#c1d6a9",
    "grass": "#648052",
    "stone": "#788170"
  },
  "enemyWeights": {
    "slime": 1,
    "beetle": 1,
    "bat": 1,
    "brute": 1,
    "boar": 1,
    "spore": 1
  },
  "profile": {
    "x": 4350,
    "y": 4100,
    "phase": 0.2,
    "bays": 0.08
  },
  "danger": 1,
  "coast": {},
  "biomeZones": [],
  "terrain": {
    generate: naturalTerrainCell,
    "hashOffset": 0,
    "variants": {}
  },
  "environment": {
    "hashOffset": 0,
    "mushroomChance": 0.57,
    "water": {
      "chance": 0.36,
      "families": 4,
      "kind": "water",
      "zoneKinds": null,
      "innerIslands": false
    },
    "mechanism": {
      "type": "vine",
      "chance": 0.64
    },
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
      "deep": "#193e48",
      "sea": "#25535a",
      "shallow": "#537e71",
      "sand": "#97996d",
      "grain": "#d8cc98",
      "edge": "#779b85",
      "fringe": "#415439"
    },
    "mapCoast": {
      "land": "#476246",
      "sand": "#919a6b",
      "sea": "#264e54",
      "shallow": "#507776"
    },
    "light": {
      "id": "forest",
      "rgb": "225,237,172",
      "glow": "#c7d98a12",
      "strength": 1,
      "clear": "#e3ebaf00"
    }
  }
});
