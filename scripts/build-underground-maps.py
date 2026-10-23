"""Bake the remaining world cave layouts and their stable surface bindings."""
import argparse
import json
from pathlib import Path
from interiors.wet_caves import build_layouts as wet_layouts
from interiors.highland_caves import build_layouts as highland_layouts
from interiors.masonry_caves import build_layouts as masonry_layouts

BINDINGS = {
    'rift-forest': {'underground-passage': 'darkriver'},
    'marsh': {'rootwater-tunnel': 'marshRootwater', 'moss-vault': 'marshMoss'},
    'ruins': {'buried-aqueduct': 'ruinsAqueduct', 'starwell-vault': 'ruinsStarwell'},
    'beach': {'limestone-tideway': 'beachTideway', 'shell-vault': 'beachShell'},
    'mountain': {'folded-ridge-tunnel': 'mountainFold', 'echo-vein-vault': 'mountainVein'},
    'snow': {'frost-vein-tunnel': 'snowVein', 'blue-ice-vault': 'snowBlueIce'},
    'verdant-rift': {'west-maze': 'verdantRoots', 'echo-maze': 'verdantEcho'},
    'clockshadow-city': {'city-sewer': 'citySewer', 'city-cellar': 'cityCellar'},
    'ember-realm-large': {'ember-bridge-mine': 'emberBridge', 'ember-north-mine': 'emberNorth', 'ember-south-cavern': 'emberSouth'},
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--write', action='store_true', help='Update geography authored layouts and cave bindings only')
    parser.add_argument('--output', type=Path, help='Optional generated JSON fragment')
    args = parser.parse_args()
    layouts = {}
    for build in (wet_layouts, highland_layouts, masonry_layouts):
        group = build()
        assert not layouts.keys() & group.keys(), 'Duplicate authored layout key'
        layouts.update(group)
    expected = {key for caves in BINDINGS.values() for key in caves.values()} - {'darkriver'}
    assert layouts.keys() == expected, 'Incomplete cave layouts'
    fragment = dict(authoredLayouts=layouts, caveLayouts=BINDINGS)
    if args.output:
        args.output.write_text(json.dumps(fragment, ensure_ascii=False, indent=2) + '\n')
    if args.write:
        target = Path(__file__).resolve().parents[1] / 'dist/config/geography.json'
        data = json.loads(target.read_text())
        data['interiors']['authoredLayouts'].update(layouts)
        data['interiors']['caveLayouts'] = BINDINGS
        target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print(f'Baked {len(layouts)} layouts; {sum(map(len, BINDINGS.values()))} stable cave bindings.')


if __name__ == '__main__':
    main()
