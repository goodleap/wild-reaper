#!/usr/bin/env python3
"""Bake the fixed forest map. Requires Shapely only in the build environment."""
import json
import math
import sys
from pathlib import Path
from shapely.geometry import Polygon, LineString, Point
from shapely.ops import unary_union
from shapely.geometry.polygon import orient

sys.dont_write_bytecode = True
from natural_contours import natural_ring, natural_route

ROOT = Path(__file__).resolve().parent.parent
SX, SY = 7200 / 1400, 5400 / 945
def xy(p):
    return ((p[0] - 724) * SX, (p[1] - 512.5) * SY)
def point(p):
    x, y = xy(p)
    return {"x": round(x, 2), "y": round(y, 2)}
def coords(ring):
    return [{"x": round(x, 2), "y": round(y, 2)} for x, y in list(ring.coords)[:-1]]
def rings(shape):
    shapes = [shape] if shape.geom_type == "Polygon" else list(shape.geoms)
    result = []
    for poly in shapes:
        poly = orient(poly)
        result.append({"points": coords(poly.exterior), "hole": False})
        result.extend({"points": coords(hole), "hole": True} for hole in poly.interiors)
    return result
def polygon(raw):
    poly = Polygon(natural_ring([xy(p) for p in raw]))
    assert poly.is_valid
    return poly

ROOMS = [
    ("01", "南岸营地", (108, 827), "camp", [(38,792),(62,772),(91,772),(111,757),(139,773),(151,798),(173,815),(171,858),(148,880),(135,902),(98,902),(79,882),(57,876),(39,847)]),
    ("02", "林间谷地", (283, 739), "grove", [(191,678),(220,656),(253,648),(284,664),(315,649),(337,678),(335,705),(362,724),(379,754),(355,779),(354,813),(328,840),(306,823),(283,827),(266,801),(234,804),(218,786),(185,776),(169,743),(180,714)]),
    ("03", "采石盆地", (550, 735), "quarry", [(438,651),(472,628),(517,621),(555,609),(591,624),(623,615),(657,642),(662,672),(693,679),(730,714),(717,745),(687,767),(695,798),(656,821),(622,826),(603,849),(551,846),(530,861),(489,841),(456,842),(448,816),(419,809),(412,777),(395,752),(412,718),(410,685)]),
    ("04", "西侧林地", (240, 548), "grove", [(198,476),(232,458),(265,474),(286,469),(308,487),(338,498),(347,524),(333,546),(350,574),(330,598),(303,597),(281,615),(255,600),(226,604),(213,581),(184,577),(168,554),(178,529),(169,510),(188,496)]),
    ("05", "旧猎场", (406, 382), "grove", [(344,330),(376,313),(406,320),(425,309),(448,322),(469,324),(480,349),(471,371),(492,392),(489,418),(467,435),(433,434),(410,453),(382,440),(356,455),(337,432),(320,416),(325,392),(308,372),(324,351)]),
    ("06", "西岸渡口", (550, 510), "ruins", [(514,445),(539,425),(573,430),(596,450),(600,474),(616,494),(609,522),(599,547),(575,560),(563,586),(534,579),(522,558),(500,549),(485,518),(487,491),(504,473)]),
    ("07", "河心荒岛", (749, 509), "island", [(706,481),(727,461),(752,458),(778,474),(795,479),(810,502),(809,526),(791,547),(764,550),(740,561),(717,546),(693,540),(683,518),(689,495)]),
    ("08", "东岸洼地", (989, 514), "grove", [(908,445),(940,425),(971,433),(998,420),(1032,435),(1053,420),(1081,438),(1089,459),(1122,471),(1108,500),(1095,519),(1104,542),(1082,573),(1052,588),(1028,611),(998,601),(981,582),(951,588),(929,566),(901,558),(889,533),(868,520),(867,493),(882,477),(882,455)]),
    ("09", "苔石盆地", (1160, 729), "grove", [(1041,650),(1067,638),(1092,647),(1120,635),(1144,648),(1174,646),(1191,668),(1219,681),(1229,708),(1212,730),(1217,754),(1193,771),(1168,776),(1144,798),(1120,793),(1097,810),(1070,795),(1061,771),(1031,761),(1018,737),(1029,713),(1013,688),(1020,668)]),
    ("10", "南部断谷", (862, 883), "ravine", [(631,842),(666,844),(699,842),(730,849),(760,842),(797,849),(826,843),(859,851),(894,850),(931,849),(963,838),(994,840),(1022,827),(1041,808),(1064,810),(1085,832),(1085,854),(1067,870),(1042,882),(1015,881),(988,895),(960,901),(932,914),(906,916),(882,931),(849,927),(827,915),(801,919),(773,906),(744,906),(718,897),(692,902),(661,896),(635,896),(619,879),(617,858)]),
    ("11", "沉没遗址", (1312, 789), "ruins", [(1256,730),(1286,716),(1328,715),(1355,724),(1379,747),(1385,777),(1374,805),(1376,833),(1357,851),(1328,865),(1300,861),(1278,850),(1251,848),(1234,825),(1228,797),(1240,774),(1237,749)]),
    ("12", "东部林地", (1247, 510), "grove", [(1215,408),(1244,398),(1271,416),(1286,440),(1306,448),(1317,481),(1307,508),(1324,535),(1311,560),(1314,588),(1292,611),(1274,639),(1248,650),(1223,634),(1207,610),(1185,599),(1173,568),(1190,541),(1179,516),(1189,490),(1180,467),(1193,441),(1192,420)]),
    ("13", "钟塔高地", (1165, 179), "ruins", [(1107,111),(1139,91),(1161,103),(1176,125),(1194,137),(1208,161),(1218,177),(1210,202),(1200,216),(1196,245),(1175,253),(1150,238),(1127,242),(1112,218),(1090,208),(1089,177),(1075,154),(1092,133)]),
    ("14", "北部山口", (945, 174), "pass", [(852,146),(880,139),(904,149),(929,138),(952,148),(975,139),(1000,149),(1026,166),(1013,188),(985,201),(958,214),(930,211),(910,198),(882,203),(865,190),(843,184),(839,162)]),
    ("15", "西北村落", (372, 205), "village", [(288,171),(314,161),(337,143),(363,151),(389,137),(407,161),(432,174),(438,194),(460,207),(448,228),(428,242),(420,260),(391,264),(370,253),(343,266),(324,247),(299,248),(285,231),(266,220),(268,194)]),
    ("16", "北部旷野", (600, 229), "grove", [(487,133),(517,110),(551,122),(574,113),(604,129),(631,122),(661,139),(690,132),(718,145),(754,147),(776,168),(770,191),(755,211),(738,235),(715,253),(685,248),(659,273),(629,275),(607,263),(582,268),(553,249),(530,247),(516,226),(494,215),(491,191),(475,167),(477,147)]),
    ("17", "旧城内堡", (1314, 142), "fortress", [(1251,76),(1281,63),(1311,65),(1335,59),(1369,69),(1380,94),(1382,125),(1392,149),(1380,174),(1382,201),(1356,222),(1323,222),(1294,216),(1266,222),(1244,204),(1240,174),(1247,146),(1238,120),(1241,95)]),
    ("18", "深林秘地", (108, 420), "secret", [(53,371),(78,355),(101,367),(126,359),(141,376),(146,397),(164,414),(164,440),(148,455),(142,476),(114,488),(90,480),(77,461),(53,459),(46,438),(34,420),(39,394)]),
]
areas, polys = [], []
for id, name, center, kind, raw in ROOMS:
    poly = polygon(raw)
    assert poly.contains(Point(xy(center))), id
    polys.append(poly)
    areas.append({"id": id, "name": name, "center": point(center), "kind": kind, "points": coords(poly.exterior)})

LINKS = [
    ("01-02", "01", "02", 180, "trail", [(108,827),(154,805),(206,780),(283,739)]),
    ("02-03", "02", "03", 190, "trail", [(283,739),(355,751),(400,745),(451,742),(550,735)]),
    ("02-04-west", "02", "04", 170, "trail", [(283,739),(239,704),(231,670),(246,625),(257,579),(274,534)]),
    ("02-04-east", "02", "04", 150, "trail", [(283,739),(326,751),(339,681),(332,614),(318,579),(274,534)]),
    ("04-05", "04", "05", 160, "trail", [(274,534),(321,497),(344,464),(350,445),(372,430),(406,382)]),
    ("04-18", "04", "18", 150, "secret", [(274,534),(208,498),(165,459),(126,440),(108,420)]),
    ("05-06", "05", "06", 165, "trail", [(406,382),(452,419),(480,461),(510,484),(550,510)]),
    ("03-06", "03", "06", 180, "trail", [(550,735),(533,664),(539,617),(544,550),(550,510)]),
    ("06-07", "06", "07", 160, "bridge", [(550,510),(595,508),(692,508),(749,509)]),
    ("07-08", "07", "08", 160, "bridge", [(749,509),(802,508),(887,508),(989,514)]),
    ("08-09", "08", "09", 180, "trail", [(989,514),(997,578),(1018,640),(1062,672),(1117,710)]),
    ("03-10", "03", "10", 180, "trail", [(550,735),(639,783),(629,837),(631,870),(719,869),(801,889),(862,883)]),
    ("09-10", "09", "10", 180, "trail", [(1117,710),(1084,758),(1066,818),(1044,854),(970,868),(916,893),(862,883)]),
    ("09-11", "09", "11", 165, "trail", [(1117,710),(1197,705),(1246,738),(1270,761),(1312,789)]),
    ("08-12", "08", "12", 180, "trail", [(989,514),(1084,480),(1130,471),(1199,476),(1247,510)]),
    ("12-13", "12", "13", 165, "trail", [(1247,510),(1246,420),(1237,345),(1190,289),(1180,227),(1165,179)]),
    ("13-14", "13", "14", 180, "trail", [(1165,179),(1128,142),(1072,132),(1013,160),(983,173),(945,174)]),
    ("14-16", "14", "16", 170, "trail", [(945,174),(868,169),(814,173),(764,159),(730,175),(621,189)]),
    ("15-16", "15", "16", 170, "trail", [(372,205),(441,223),(460,207),(503,210),(534,208),(621,189)]),
    ("05-15", "05", "15", 160, "trail", [(406,382),(387,348),(385,286),(378,250),(372,205)]),
    ("13-17", "13", "17", 180, "trail", [(1165,179),(1213,179),(1257,133),(1270,138),(1314,142)]),
    ("08-13", "08", "13", 170, "shortcut", [(989,514),(1054,427),(1074,365),(1103,300),(1140,268),(1176,218),(1165,179)]),
    ("05-cave", "05", None, 180, "cave", [(406,382),(343,379),(312,378),(291,377)]),
    ("15-cave", "15", None, 180, "cave", [(372,205),(279,226),(229,245),(173,232),(118,202)]),
    ("16-exit", "16", None, 220, "exit", [(621,189),(607,148),(606,107),(606,80)]),
    ("11-exit", "11", None, 190, "bridge", [(1312,789),(1306,843),(1306,901),(1306,938)]),
    ("01-exit", "01", None, 180, "exit", [(108,827),(82,862),(68,902),(62,927)]),
]
passages, corridor_polys = [], []
for id, source, target, width, kind, raw in LINKS:
    raw=list(raw);raw[0]=next(room[2] for room in ROOMS if room[0]==source)
    if target:raw[-1]=next(room[2] for room in ROOMS if room[0]==target)
    anchors = [xy(p) for p in raw]
    # Artificial crossings and the locked shortcut retain their exact axes.
    # Natural trails keep all authored anchors, including both region centers.
    route = natural_route(anchors) if kind in ("trail", "secret") else anchors
    line = LineString(route)
    poly = line.buffer(width / 2, quad_segs=8)
    corridor_polys.append(poly)
    passage = {"id": id, "from": source, "to": target, "width": width, "kind": kind,
               "points": coords(poly.exterior),
               "waypoints": [{"x":round(x,2),"y":round(y,2)} for x,y in route]}
    if id == "08-13":
        gx, gy = xy((1074,365)); dx,dy=xy((1103,300)); dx-=gx;dy-=gy;length=math.hypot(dx,dy)
        nx,ny=-dy/length,dx/length
        passage.update(gateId="bell-shortcut",gate={"x":round(gx,2),"y":round(gy,2),"ax":round(gx-nx*100,2),"ay":round(gy-ny*100,2),"bx":round(gx+nx*100,2),"by":round(gy+ny*100,2),"r":16})
    if id == "06-07": passage["deck"]=[point((595,508)),point((692,508))]
    if id == "07-08": passage["deck"]=[point((802,508)),point((887,508))]
    if id == "11-exit": passage["deck"]=[point((1306,843)),point((1306,938))]
    passages.append(passage)
walkable = unary_union(polys+corridor_polys)
assert walkable.geom_type == "Polygon", "Every area must join through an authored passage"
assert walkable.is_valid
for index, area in enumerate(polys):
    for other in polys[index+1:]:
        assert area.intersection(other).area < .01, "Regions must connect only through authored passages"
for passage in passages:
    spine=LineString([(p["x"],p["y"]) for p in passage["waypoints"]])
    assert walkable.buffer(.03).covers(spine.buffer(70)), passage["id"]

LAKES = [
    ("central", [(570,327),(589,306),(610,317),(625,347),(650,352),(674,340),(700,352),(726,337),(753,341),(771,321),(782,290),(797,279),(805,244),(824,234),(830,209),(849,207),(867,233),(870,259),(892,285),(889,307),(910,330),(916,354),(942,376),(974,385),(1006,386),(1032,374),(1059,375),(1042,398),(1011,409),(978,407),(944,421),(918,419),(890,432),(868,457),(854,482),(858,529),(874,555),(900,573),(927,590),(946,617),(974,642),(958,674),(979,699),(1002,717),(1032,736),(1040,765),(1017,797),(983,814),(948,818),(921,803),(899,820),(875,806),(855,817),(830,803),(808,824),(780,823),(763,802),(739,817),(707,810),(708,790),(728,779),(735,749),(731,716),(708,698),(699,674),(677,660),(664,633),(636,619),(624,602),(594,597),(576,607),(564,592),(580,578),(600,576),(619,552),(628,529),(628,487),(611,459),(619,431),(598,423),(581,401),(562,386),(572,369),(563,347)]),
    ("sunken", [(1228,700),(1259,683),(1291,690),(1313,675),(1343,680),(1373,695),(1398,715),(1415,742),(1419,774),(1405,804),(1413,836),(1396,866),(1364,884),(1330,893),(1299,887),(1267,901),(1234,884),(1215,862),(1200,832),(1207,804),(1216,777),(1205,750),(1213,722)]),
]
lakes, water_polys = [], []
for id, raw in LAKES:
    poly = polygon(raw).difference(walkable)
    water_polys.append(poly)
    for i, ring in enumerate(rings(poly)):
        lakes.append({"id":f"rift-water:{id}:{i}","kind":"water",**ring})
solid = unary_union([walkable,*water_polys])

def at(raw, **extra): return {**point(raw),**extra}
landmarks = {
    "spawn":at((108,852),area="01"),
    "cave05":at((291,377),area="05",kind="cave",destination="cave15"),
    "cave15":at((118,202),area="15",kind="cave",destination="cave05"),
    "shortcut08":at((1054,427),area="08",kind="gate",gateId="bell-shortcut"),
    "shortcut13":at((1103,300),area="13",kind="gate",gateId="bell-shortcut"),
    "shortcutGate":at((1074,365),area="13",kind="gate",gateId="bell-shortcut"),
    "boss11":at((1313,805),area="11",kind="boss"),
    "boss17":at((1320,180),area="17",kind="boss"),
    "exitNorth":at((606,94),area="16",kind="exit",target=1),
    "exitSouth":at((1306,914),area="11",kind="exit",target=2),
    "exitWest":at((65,915),area="01",kind="exit",target=3),
    "treasure18":at((108,444),area="18",kind="treasure"),
    "treasure07":at((750,533),area="07",kind="treasure"),
}
PLAN = {
    "merchant":((202,776),105),"supply":((250,752),125),"occupied":((369,188),225),
    "castle":((1310,105),360),"hunt":((419,371),280),"rescue":((273,530),240),
    "rune":((1151,164),185),"rescue-warden":((284,691),240),"dogcamp":((323,786),115),
    "owlroost":((624,194),240),"golemaltar":((513,710),270),"stonevault":((1126,700),240),
    "portal:1":((606,94),95),"portal:2":((1306,914),85),"portal:3":((65,915),80),
}
plan = {key:at(raw,r=r) for key,(raw,r) in PLAN.items()}
plan["portal:1"]["arrivalDirection"]={"x":0,"y":1}
plan["portal:2"]["arrivalDirection"]={"x":0,"y":-1}
plan["portal:3"]["arrivalDirection"]={"x":.4,"y":-.9165}
for key, p in plan.items():
    assert walkable.covers(Point(p["x"],p["y"]).buffer(28)), f"Site standing space: {key}"
for key, p in landmarks.items():
    radius = 55 if p.get("kind") == "boss" else 28
    assert walkable.covers(Point(p["x"],p["y"]).buffer(radius)), f"Landmark standing space: {key}"

encounters = []
for id, raw, kind, tier, radius in [
    ("02-east",(341,761),"combat",0,125),("03-north",(594,672),"combat",1,175),
    ("04-north",(311,504),"combat",1,130),("05-south",(379,425),"combat",2,130),
    ("06-west",(522,494),"guard",2,120),("08-east",(1081,482),"guard",3,120),
    ("09-south",(1110,769),"combat",2,150),("10-west",(646,875),"guard",3,110),
    ("12-north",(1247,449),"combat",2,145),("12-south",(1263,585),"combat",2,140),
    ("14-west",(904,172),"guard",3,135),("15-east",(412,228),"combat",2,125),
    ("16-east",(710,192),"combat",2,155),("11-boss",(1313,805),"boss",4,190),
    ("17-boss",(1320,180),"boss",4,190),
]:
    encounter=at(raw,id=f"clearing:rift:{id}",r=radius,kind=kind,tier=tier)
    if kind == "boss":
        encounter["bossKind"]="ancient" if id.startswith("17") else "deepcaller"
        encounter["name"]="内堡古树王" if id.startswith("17") else "沉湖守望者"
    if kind == "guard":encounter.update(name="山口守卫" if id.startswith("14") else "要道守卫",strength=1.4,count=4)
    encounters.append(encounter)

PATCHES = [((257,510),80,34),((319,777),30,35),((413,365),49,42),((544,222),37,23),((690,213),43,27),((978,468),55,27),((1062,542),40,34),((1238,545),38,57),((1166,735),35,30),((96,402),35,27)]
patches=[]
for i,(raw,rx,ry) in enumerate(PATCHES):
    cx,cy=xy(raw)
    pts=[(cx+math.cos(j*math.tau/16)*rx*SX,cy+math.sin(j*math.tau/16)*ry*SY) for j in range(16)]
    shape=Polygon(pts).intersection(walkable)
    for ring in rings(shape):
        if not ring["hole"]: patches.append({"id":f"rift-brush:{i}","kind":"sparse",**point(raw),"center":point(raw),"rx":rx*SX,"ry":ry*SY,"angle":0,"density":0.3,"points":ring["points"]})

layout = {
    "kind":"rift-forest","id":"rift-forest:1","name":"裂谷林海","revision":1,
    "bounds":{"minX":-3600,"minY":-2700,"maxX":3600,"maxY":2700},
    "spawn":landmarks["spawn"],"areas":areas,"passages":passages,
    "boundaries":rings(walkable),"solidBoundaries":rings(solid),"lakes":lakes,
    "landmarks":landmarks,"plan":plan,"encounters":encounters,"patches":patches,
    "palette":{"ground":"#f5e5bd","brush":"#b6cd8e","forest":"#294b39","ridge":"#665f5c","water":"#2474a1","waterLight":"#4395b7","bridge":"#bd884c"},
}
path=ROOT/"dist/config/worlds.json"
worlds=json.loads(path.read_text())
forest=next(w for w in worlds["definitions"] if w["id"]=="forest")
forest["name"]="裂谷林海"
forest["shortName"]="裂谷"
bosses=json.loads((ROOT/"dist/config/enemies.json").read_text())["bosses"]
for e in encounters:
    if e["kind"]=="boss":assert e["bossKind"] in bosses
forest["authored"]=layout
path.write_text(json.dumps(worlds,ensure_ascii=False,indent=2)+"\n")
print(f"Baked {len(areas)} areas, {len(passages)} passages; {len(layout['boundaries'])} walkable rings; {round(walkable.area)} square units")
