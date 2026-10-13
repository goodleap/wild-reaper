import { defineWorld } from './define-world.js';
import { naturalTerrainCell } from './natural-terrain.js';

export default defineWorld({
  "id": "marsh",
  "name": "迷雾沼泽",
  "shortName": "沼泽",
  "colors": {
    "ground": "#253c3d",
    "light": "#36504c",
    "dark": "#192d31",
    "accent": "#a0d0c4",
    "mist": "#bbd5d2",
    "grass": "#64877b",
    "stone": "#708c85"
  },
  "enemyWeights": {
    "slime": 1.25,
    "beetle": 0.8,
    "bat": 0.7,
    "brute": 1.1,
    "boar": 0.85,
    "spore": 1.7
  },
  "profile": {
    "x": 4450,
    "y": 3950,
    "phase": 1.6,
    "bays": 0.14
  },
  "danger": 1.04,
  "coast": {},
  "biomeZones": [],
  "terrain": {
    generate: naturalTerrainCell,
    "hashOffset": 419,
    "variants": {
      "tree": "dead-tree",
      "log": "sunken-log",
      "rock": "moss-rock"
    }
  },
  "environment": {
    "hashOffset": 419,
    "mushroomChance": 0.61,
    "water": {
      "chance": 0.52,
      "families": 5,
      "kind": "water",
      "zoneKinds": null,
      "innerIslands": true
    },
    "mechanism": {
      "type": "gas",
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
      "deep": "#213e48",
      "sea": "#30555a",
      "shallow": "#57796b",
      "sand": "#858e69",
      "grain": "#bbc49a",
      "edge": "#728c75",
      "fringe": "#465846"
    },
    "mapCoast": {
      "land": "#4a5e50",
      "sand": "#7f896b",
      "sea": "#294b51",
      "shallow": "#507776"
    }
  }
});
