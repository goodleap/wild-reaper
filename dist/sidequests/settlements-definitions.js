const quest=(id,worldId,name,area,kind,npc,description,objectives,rewardText,gold=50,crystals=30)=>({
  id,sidequest:true,worldId,name,description,discovery:{area,dx:-110,dy:80,kind,name:npc},
  objectives:objectives.map(([id,label,optional])=>({id,label,...optional?{optional:true}:{}})),reward:{gold,crystals},rewardText
});

export const DEFINITIONS=Object.freeze([
  quest('overdue-book','ruins','逾期四十年','05','elder','老抄书匠',
    '藏书院里的手稿还没有烂透。进入残存书室，把手稿箱带到门口，再交还老抄书匠。搬箱时腾不出手攻击，可以随时放下；侧门能够避开中央守卫。',
    [['entered','进入藏书院残存书室'],['rescued','把手稿箱完整搬到出口'],['returned','把手稿交还抄书匠']],
    '考察营地出现书摊 · 50 金币 · 30 灵晶'),
  quest('half-oath','ruins','誓言留了半句','10','warden','刻碑学徒',
    '誓碑只留下了“寸步不退”。可以在圈内完成守阵挑战，也可以寻找侧廊的后半句，带着被困者离开。两种试炼都必须亲自走完。',
    [['read','辨认誓碑与侧廊浮雕'],['proved','完成守阵或救援试炼'],['inscribed','与刻碑学徒确认新的碑文']],
    '保留可重试的遗迹试炼 · 55 金币 · 35 灵晶',55,35),
  quest('twin-beacons','beach','两盏灯','05','warden','守灯人',
    '礁门外的船分不清两座灯台。先从观测台检查礁门位置，再调整两个灯头，让灯束沿安全水道交会。方向不对时，灯会照在礁标上。',
    [['observed','在观测台辨认礁门航标'],['aligned','调整两盏灯，让灯束经过正确航标'],['landed','等候船只实际靠岸并与来客交谈']],
    '港湾迎来补给来客 · 50 金币 · 30 灵晶'),
  quest('wreck-knocking','beach','船骸里的敲击声','11','merchant','旧港船匠',
    '船骸里仍有人敲击舱壁。进入后用排水闸依次降低舱内水位，打通救援通道。主舱救人后，可以继续排空侧舱寻找打捞工具。',
    [['entered','进入船骸的前舱'],['rescued','排空主通道并带被困者走到舱口'],['salvaged','可选：排空侧舱，找回打捞工具',true],['returned','与旧港船匠交谈，确认安全返回']],
    '旧港建立打捞补给点 · 60 金币 · 35 灵晶',60,35),
  quest('market-pickpocket','clockshadow-city','顺手牵羊','07','merchant','丢货摊主',
    '摊主不想再冤枉路过的人。站在街口观察，等窃贼实际拿走货物后，可以拦住他，也可以保持距离跟到藏赃处。被发现或跟丢后可以重新蹲守。',
    [['witnessed','亲眼看到摊位失窃'],['recovered','截住窃贼或跟到藏赃处取回失物'],['returned','把失物交还摊主']],
    '归还市集失物，留下可回访的藏赃处 · 50 金币 · 30 灵晶'),
  quest('courtyard-stage','clockshadow-city','借我半个广场','08','princess','戏班领班',
    '旧院还能演戏，只是舞台与杂物挡住了演员的路。安排舞台、座椅和货箱的位置，再请演员完整排练。挡路时可以重新调整，不会损失材料。',
    [['arranged','为舞台、座椅和货箱安排位置'],['rehearsed','让演员沿排练路线实际走完'],['opened','与领班一起开放演出']],
    '广场出现常驻小戏台与观众 · 45 金币 · 25 灵晶',45,25)
]);
