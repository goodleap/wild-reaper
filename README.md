# 荒野回响 · Wild Echoes

原生 HTML、CSS 与 JavaScript Canvas 游戏的代码仓库，无运行时第三方依赖。

本仓库维护可执行代码、测试和必要的工程说明。游戏设计文档独立保存在指定的私有仓库，不能复制到本仓库；维护入口见 `AGENTS.md`。

## 开发与检查

开发和发布均在授权云端环境中进行，GitHub `goodleap/wild-reaper` 是唯一正式源码基准。开始修改前先实际执行轻量命令确认环境可用，再获取并核对远端 `main` 最新状态，保留其他会话新增的修改；推送前再次核对远端，禁止用强制推送解决发布冲突。

`dist/` 是完整静态站点目录，通过 HTTP 静态服务加载即可运行。无需前端打包；不要直接使用 `file://` 加载 ES 模块。

使用 Node.js 运行检查：

```sh
npm run check
npm test
```

世界探索使用一个连续存档，从裂谷林海开始，在游戏内通过自然通路或已点亮的传送点前往其他区域。`world-save.js` 将角色、背包、任务和已访问场景状态一起保存：游客使用当前浏览器，账号使用后端与本地待同步缓存；调试、剧情及极限挑战不读写这份存档。准备页提供继续探索和明确确认后的重新开始。

区域连接、城镇设施及传送点配置位于 `config/worlds.json` 的 `travel`；商店价格和区域供货位于 `config/economy.json` 的 `worldShops`。`exitTrigger` 定义地图边缘的全宽切换区，`sign` 单独定义路牌位置；城镇的 `ground`、`spawn`、`questBoard` 与设施同源生成。修改后构建配置，运行 `npm run test:world-campaign`，覆盖真实门口通行、边缘跨区、交易、存档及界面。配置与运行时仍以稳定世界 ID 关联。

三类商店通过 `shop-interior.js` 生成室内场景，复用地下场景的进出与队伍接收；商人使用 `world-shops.js` 的交易规则。商店不保存独立战斗状态；店内保存角色进度后，再次继续探索回到当前配置的店门外。

旅行接路使用 `python scripts/build-world-travel.py --write` 重建，离线依赖 Shapely 2.x；不带 `--write` 只检查。单独重建某张地表地图后，再运行此脚本恢复该区域的旅行接路，然后执行 `npm run build:config`。脚本保留已有区域和内部道路，几何处理依赖不进入游戏运行包。

裂谷林海的暗河洞穴及林间旧堡使用 `python scripts/build-interior-samples.py --write` 重建（离线依赖 Shapely 2.x），只更新 `config/geography.json` 的 `interiors.authoredLayouts`。构建配置后运行 `node qa-config-interiors.mjs`、`node qa-authored-interiors.mjs` 及相关室内／任务检查；小屋家具配置仍位于 `interiors.hutLayouts`。

其余世界洞穴使用 `python scripts/build-underground-maps.py --write` 重建（同样离线依赖 Shapely 2.x）。主题源文件位于 `scripts/interiors/`，仅更新 `geography.json` 的地下布局及 `interiors.caveLayouts` 绑定，不修改地表洞口或任务 ID。执行 `npm run build:config` 后，用 `node qa-themed-interiors.mjs` 检查实际移动、机关、进出和探索状态；配置校验同时核对洞口数量与布局出口。离线几何依赖不随游戏发布。

熔火之境的固定地形与景物数据可用 `scripts/build-ember-map.py` 重建（离线 Python 环境需要 Shapely 2.x），随后执行 `npm run build:config` 和 `npm run test:ember`。生成器仅更新该世界的配置；几何处理依赖不进入游戏运行包。

迷雾沼泽使用 `python scripts/build-marsh-map.py --write` 重建；可用 `--preview-dir /tmp/marsh-preview` 输出同源几何预览。离线依赖为 Shapely 2.x，随后执行 `npm run build:config`、`node qa-marsh-map.mjs` 和相关地图集成检查。生成器只更新 `marsh`，运行时复用现有地形、浅水和探索系统。

失落遗迹使用 `python scripts/build-ruins-map.py --write` 重建，只更新 `worlds.json` 中的 `ruins`；可用 `--preview-dir /tmp/ruins-preview` 输出同源几何预览。离线依赖 Shapely 2.x，重建后执行 `npm run build:config` 和 `npm run test:ruins`；地面、地图预览与移动碰撞共用生成的区域和边界数据。

潮汐海岸使用 `python scripts/build-beach-map.py --write` 重建，只更新 `worlds.json` 中的 `beach`；离线依赖 Shapely 2.x，`--preview-dir /tmp/beach-preview` 输出同源几何预览。随后执行 `npm run build:config` 和 `npm run test:beach`，检查海岸边界、栈桥和探索通路。

群峰山地使用 `python scripts/build-mountain-map.py --write` 重建，只更新 `worlds.json` 中的 `mountain`；离线依赖 Shapely 2.x，`--preview-dir /tmp/mountain-preview` 输出同源几何预览。随后执行 `npm run build:config` 和 `npm run test:mountain`，检查山口、溪桥、完整身体通行与地图状态。

霜雪荒原使用 `python scripts/build-snow-map.py --write` 重建，只更新 `worlds.json` 中的 `snow`；离线依赖 Shapely 2.x，`--preview-dir /tmp/snow-preview` 输出同源几何预览。随后执行 `npm run build:config` 和 `npm run test:snow`，检查雪谷、桥梁、完整身体通行及探索状态。

破浪甲板的离线源为 `scripts/build-ship-map.py`，用 Python 标准库重建 `dist/config/stages.json` 的 `ship.scenes`；随后构建配置并运行 `npm run test:ship`。各层只载入当前场景，往返保留战斗和拾取状态；地图绘制与移动碰撞读取同一场景轮廓。

寂静月面使用 `python scripts/build-moon-map.py` 重建 `dist/config/stages.json` 中的 `moon`，随后构建配置并运行 `npm run test:moon`。地形绘制、碰撞和地图预览共用 `landform` 数据，战斗关口使用 `gateSpan` 对应的隘口范围。

地形滑动、植物色板和独立地图的集成检查可运行：

```sh
npm run test:forest-maintenance
```

该检查包含 `test:verdant` 的真实身体通行、交互领取与地图状态隔离，以及原地图、伙伴、视野、高度规则和攻击深度遮挡回归。它不替代与其他改动相关的专项检查或真机性能验证。

剧情、主角气泡与段位渡劫的集中回归为 `npm run test:story`。剧情配置维护于 `dist/config/story.json`，段位与渡劫配置维护于 `dist/config/realms.json`，修改后同样需要 `npm run build:config`。章节目录、对白、地形锚点及章节战斗参数均来自该配置，`story-runtime.js` 负责创建对应章节运行器。剧情只记录整章完成结果，退出或死亡后重新开始该章；普通与 DEBUG 通关记录分开，章节解锁读取对应记录，DEBUG 可以直接选择章节但不启用战斗作弊。药效构筑只用于当前演出，档案始终观察正式构筑。

剧情内容的生成、交互和显示共用 `scene-content.js` 的场景权限；章节完成动作通过场景淡出提交通关，并结束本局；不会生成普通探索内容。`story-pursuit.js` 读取章节追兵配置并复用敌人和首领行为；`navigation-route.js` 缓存并校验完整路线，`story-navigation.js` 将其同时提供给演员移动和 `route-ribbon.js` 地面渲染。`unit-arrival.js` 提供共享显形效果，剧情与普通天使共用 `sites/angel-guardian.js` 的守护行为。普通伙伴和剧情演员共用 `follow-movement.js`，修改共享跟随或寻路时同时运行 `npm run test:party`。剧情回归覆盖内容隔离与恢复、连续增援、演员跟随、路线指引、对白暂停、药物交接、通关结算及整章流程。

钟影旧都的固定地形、建筑地基及通路可用 `python scripts/build-clockshadow-map.py` 重建（离线 Python 环境需要 Shapely 2.x），随后执行 `npm run build:config`。生成器只更新 `clockshadow-city`；建筑与地基共用配置，`dist/clockshadow-building-art.js` 按需缓存建筑画面，不依赖旧城市 PNG 图集。

修改城市地图或城市素材时运行 `npm run test:city`，覆盖结构占地、全身体通行、建筑深度、桥面、洞穴状态、地图选择与缓存上限，并用真实浏览器检查城市画面。涉及共享地形、寻路或古城试炼时，再运行相应回归并检查受影响的地图。离线建筑实体与画面字段必须保持同源；不要再给景物添加第二套碰撞轮廓。

可选人物图集由 `character-sprite-manifest.js` 记录源矩形、脚点和世界显示高度，`character-sprites.js` 按需加载一次。预览需先调用 `characterSprites.preload()`，再为展示实体设置对应 `characterSpriteId`；正常冒险不自动下载该图集，主角保持既有绘制路径。这批是单姿态透明素材，尚未提供方向帧与分层动作。相关检查：`npm run test:character-sprites`。 云端安装 Playwright 与 Chromium 后，可用 `python scripts/capture-character-sprites.py --output-dir /tmp/character-preview` 重现实际游戏渲染的手机、桌面及放大细节截图；临时摆放仅作用于该浏览器会话。

世界任务的专项回归为 `npm run test:quests`，覆盖任务物品来源、真实通路变化、地下穿行、重复领奖、场景隔离和地图面板操作。`dist/quest-store.js` 管理接取状态、目标事实与任务通路状态，世界探索由 `world-save.js` 将其与角色进度一起保存；调试冒险不写入正式任务进度。任务牌打开任务面板，由玩家明确接取，探索事实可先于接取保存，奖励只在接取后结算。`quest-commissions.js` 复用战斗和跟随系统处理护送、修复、交货及增援控制，任务小状态随世界存档保存；移动护送角色进入统一人物绘制队列，固定设施使用场景道具。新增委托回归包含于 `test:quests`，普通构筑的自动输入护送抽查使用 `node qa-quest-normal-play.mjs`。

独立支线模块位于 `dist/sidequests/`：各组 `*-definitions.js` 定义任务数据，运行模块处理对应场景行为；`base.js` 和 `runtime.js` 接入交互、导航、碰撞、战斗与场景生命周期。任务小状态由 `state.js` 校验并随现有世界存档保存，室内几何由当前代码重建。专项检查为 `npm run test:sidequests`，覆盖实际道路与机关、分支结果、非致死战斗、存档重进和选择面板；已包含于 `test:quests`。

城市地面沿移动方向提前准备缓存，每个活动帧最多准备一个额外地块，耗时计入 D 与完整回调 CPU；忙帧、暂停和后台不做额外准备。预算用于准入，单块绘制不可中途打断，初入地图或瞬移仍需同步补齐可见地块。性能比较应使用相同视野、渲染分辨率与连续移动路线，检查长帧及首次缓存生成，不能只比较静止平均 FPS。

建筑画面缓存按视野调整为 12–24 MiB，手机维持 12 MiB，返回首页释放；绘制时保护当前可见建筑，避免密集街区反复驱逐。遮挡蒙版在独立的小型 CPU 画布直接生成，避免同步读取展示画布。

修改按钮焦点、弹层或快捷键时运行 `npm run test:focus`，并在浏览器验证鼠标关闭地图后空格施法、触摸准备页和 Tab 导航。输入方式与返回焦点由 `dist/focus-navigation.js` 统一处理；保留文本输入与键盘控件的原生操作。

临时通知由 `dist/notifications.js` 统一筛选与调度，检查使用 `node qa-notifications.mjs`；同时运行 `qa-character-hud.mjs`、`qa-hud-map.mjs` 和 `qa-story-ui.mjs` 验证入口提示、场景可见性与玩法切换。短时攻击预警继续使用场景和首领施法反馈，不进入文字队列。

语法检查覆盖运行模块；回归脚本验证游戏逻辑与界面交互。验证中遇到失败时直接定位并处理，包括已存在的失败：修复代码缺陷，或更新过时的测试预期并保留有效的行为断言。离线 DOM 与 Canvas 检查不能替代真实浏览器和触屏设备验证。

## 探索与副本

冒险准备支持「剧情模式」「世界探索」和「极限挑战」。剧情按配置选择已实现章节，角色与初始武器由章节限制；世界探索与极限挑战保留原有选择方式。世界探索使用固定怪物领域：接近或攻击后警戒追逐，离开追逐范围后返回，当前探索内往返地区保留清理状态。极限挑战包括怪潮生存、船上横向推进、月面纵向推进及八个地图试炼；各副本规定目标与强度，准备页不再选择难度。

三种新版角色形象为标准形象，旧选择自动迁移到对应角色。选择页保留完整角色名，对话称呼使用「王子」「公主」「老登」。世界探索与副本的普通气泡不暂停游戏；隐藏或离屏角色不显示，对话在没有安全空间时省略。剧情模式禁用普通自动气泡，关键对白使用固定对话面板，阅读期间暂停战斗，通过继续或跳过本段推进；战斗目标与进度独立显示。

领域规则位于 `config/difficulty.json` 的 `territories`，新增副本位于 `config/stages.json` 的 `expeditions`，台词及触发间隔位于 `config/sites.json` 的 `dialogue`；这些路径均相对于 `dist/`。修改后构建配置，并运行 `npm run test:exploration` 验证领域、副本、通关记录、地图、对话及准备流程。

修改地图布局后运行 `npm run test:maps`，检查八世界实际入口与探索空地的可达性、连续障碍绕行、领域及奖励持久化、水域查询、地表缓存和三个副本通路；渲染仍需在云端浏览器检查手机 540 视野与桌面画面。固定地形、地表绘制和小地图共用 `Island.layout`，不要分别生成不一致的碰撞和外观。

固定森林地图的离线源在 `scripts/build-rift-map.py`，自然轮廓处理在 `scripts/natural_contours.py`；只在需要重烘焙几何时安装构建依赖 Shapely，运行该脚本后执行 `npm run build:config`。浏览器只读取 `config/worlds.json` 的 `rift-forest.authored` 数据，不加载 Python 或生成工具。修改这张地图还需运行 `npm run test:rift`，验证入口封闭后的隔离性、桥梁与水域边界、伙伴绕行、捷径及跨场景状态，以及景物预留空间、补给和宝箱的实际可达性。

## 账号与进度

`account-client.js` 管理账号会话及存档同步，`account-panel.js` 仅处理界面。账号 API 复用 `config-source.js` 的完整域名推导和开发地址覆盖，但独立于配置加载开关。请求携带服务端 HttpOnly Cookie；存档请求绑定当前账号 ID，写请求由后端检查允许的 Origin 和浏览器请求头。

游客使用新的 `wild-echoes-guest-world-v1` 本地槽，账号缓存按 API 地址和用户 ID 隔离。账号功能不读取或迁移旧世界存档。注册时可明确选择沿用游客进度；登录已有账号读取其云端进度。DEBUG 世界探索使用独立调试槽：游客写入 `wild-echoes-debug-guest-world-v1`，账号使用独立缓存和 `/api/account/debug-save` 云端接口。登录会话共用，普通与调试存档的内容、版本及重置互不影响；注册沿用游客进度时，只复制当前模式的游客槽。

保存先写本地缓存，再异步合并发送；普通和 DEBUG 世界探索都在关键节点及每 20 秒有效游玩时保存，暂停、返回首页和页面离开也保存；调试续档恢复等级、经验、任务、传送点和休息点，开局金币不会重复发放。后端按版本号原子更新，重试复用同一操作 ID；冲突停止旧进度上传，玩家读取最新存档后继续。退出账号保留该账号的待同步缓存，游客槽独立。页面离开时尽力同步，本地缓存负责保留未完成的请求，不依赖页面关闭后网络继续执行。

存档只重建活动区域，暂停区域复用不可变快照、校验结果和序列化内容；跨区域内容若直接修改非当前区域的怪物或掉落，必须调用 `worldSave.invalidateRegion(worldId)`。磁盘／网络读档仍进行完整校验。云存档 PUT 仅返回 `{revision, updatedAt, mutationId}`，GET 返回完整存档，前后端需配套发布；客户端只有确认版本和操作 ID 后才清除待同步标记。世界存档耗时按一分钟合并到行为日志，仅记录快照、校验、序列化、本地写入的耗时、体积及区域复用数量，不记录存档内容。

修改账号代码后运行 `npm run test:accounts`、`node qa-world-save.mjs`、`node qa-debug-world-save.mjs`、`node qa-world-save-workload.mjs`、`node qa-world-save-diagnostics.mjs`、`node qa-world-selection.mjs` 与 `npm run test:focus`，并用独立浏览器上下文验证注册、续档、断网恢复和冲突。后端账号接口、SQLite 备份及代理上传限制见 `goodleap/wild-reaper-server` README；不要将账号密码、会话凭据或完整存档写入行为日志。

## 内容配置

`dist/config/*.json` 是各领域内容数据的唯一编辑源，保持纯 JSON。角色、战斗、怪物、遭遇、难度、世界、关卡、地理规则、场景、伙伴、经济和图鉴分别维护；行为函数、公式、绘制和生成算法保留在运行模块，通过稳定 ID 关联。

修改配置后运行：

```sh
npm run build:config
npm run test:config
npm run check
```

构建会校验字段、数值范围与跨文件引用，生成同一内容版本的 `content-pack.json` 和 `content-defaults.js`；不要手工修改生成文件。版本发布脚本也会执行此构建，`check` 会拒绝过期产物。

修改战斗距离时运行 `npm run test:distances`，覆盖主角索敌与实际射程、怪物四方向触发边界、Boss 分技能接近及预警。领域与对话范围另由 `npm run test:exploration` 覆盖。

移速以游戏单位/秒计。`config/heroes.json` 的 `defaults.baseMoveSpeed` 是角色共享基准，新增角色通过 `statModifiers.moveSpeed` 设置相对倍率或固定修正；不要在角色代码中另写基准值。敌人及伙伴的基础速度分别在 `config/enemies.json`、`config/companions.json`，城堡首领复用敌人基础速度。修改后运行 `npm run test:movement`，验证实际位移、成长与减速、伙伴跟随以及首领与冲刺的行程。

人型敌军的行为与绘制分别位于 `dist/enemies/royal.js` 和 `dist/enemy-art/royal.js`，预警与命中共用 `royal-attack-geometry.js`。相关检查为 `npm run test:human-enemies`；新首领由明确遭遇引用，不自动加入其他模式的随机轮换。

修改伙伴行为时运行 `npm run test:party`，检查重复招募与独立管理、真实囚牢出口寻路、群体战斗与远程撤退。直线预警与命中边界由 `npm run test:clarity` 覆盖。

首页先加载并校验整包配置，再初始化游戏模块，每次页面会话固定一份只读配置。`dist/config/*.json` 仍是唯一编辑源，整包及内置回退配置始终随前端发布。

`dist/config-source.js` 的 `USE_SERVER_CONFIG` 控制配置来源，当前已启用 `true`；设为 `false` 可切回前端配置：

- `false`：沿用同站 `content-pack.json`，失败时使用内置整包；不查询后端，也不读取后端缓存。
- `true`：按完整页面 hostname 构造 `https://api.<hostname>`，保留所有子域和 `www`，例如 `wild.example.com` 对应 `api.wild.example.com`。先查询 `/api/config/manifest?clientVersion=v0.0.N&schemaVersion=2`，再下载指定版本的整包。
- 本地开发可以显式设置 `SERVER_CONFIG_ORIGIN_OVERRIDE`，仅允许 HTTPS 或回环 HTTP 地址；服务器的 CORS 配置须允许前端的完整 origin。API 域名需要独立配置 DNS 和 HTTPS，不能假定 GitHub 默认域名或本机 IP 自动拥有 API 子域。

清单包含客户端兼容范围、配置版本、解压后字节数和 SHA-256；下载后同时检查完整性与现有内容规则。IndexedDB 缓存按 API origin、客户端版本和配置格式版本隔离，最多保留 4 份。API 查询成功且内容未变时复用缓存，网络或校验失败时依次尝试兼容缓存、内置整包；缓存不可用不阻断启动。首页行为日志记录实际来源和回退原因。debug 模式首页右下角版本行显示实际来源：`REMOTE` 表示后端配置或已验证的后端缓存，`LOCAL` 表示站点或内置配置；普通模式只显示版本号。后端路径使用有界下载与超时，不在战斗过程中请求配置。

独立后端仓库为 `goodleap/wild-reaper-server`。其发布脚本从已提交的游戏配置生成导入包，通过 SSH 导入后端 SQLite；兼容范围默认锁定该前端版本，扩大范围必须验证旧客户端仍能解释新配置。新增行为、素材或校验规则时，先同步所需后端校验代码并准备兼容发布，再上线启用后端的客户端。配置发布脚本会核对服务器导出的校验器与本次前端提交的静态依赖文件哈希；已验证的旧校验器最多等待 6 分钟，网络、凭据或损坏导出直接报错。相应检查为 `npm run test:config-publish`。具体导入、回退和服务器部署命令见后端 README。API 不可用或尚无兼容发布时自动回退，启用开关不代表后端部署已完成。

加载接入的专项检查为 `npm run test:config-api`；修改本模块后同时运行 `npm run test:config`、`npm run check`，并在浏览器检查真实 HTTP/CORS、缓存复用、服务离线和关闭开关的路径。

## 按需性能诊断

使用 `?debug` 显示冒险准备页底部的调试设置，各开关独立生效并在当前浏览器记住上次选择，普通对局不读取这些增益。旧的 `?debug=full` 链接兼容进入调试模式，但满级武器技能由准备页开关决定。

手机竖屏默认横向视野为 540 游戏单位，桌面保持原有视野与布局。调试对局的暂停菜单提供「世界视野」：默认、原视野（1:1）、480／540／600 快捷设置，或输入 240–1600 的整数后应用。数字越大，世界视野越广；设置只保留在本页，刷新恢复默认，当前宽高会即时显示。调整视野不改变技能配置中的距离。

暂停菜单提供「省电 30 帧／流畅 60 帧／高帧 120 帧」，默认 60 帧，选择保存在当前浏览器；实际帧率受设备与浏览器限制，首页动画上限 30 帧。`FramePacer` 合并跳过的显示回调时间，用不超过 1/30 秒的子步推进，单次补算上限 200 ms；暂停、后台、切图和剧情边界丢弃积压。修改这一流程运行 `npm run test:frame-pacing`。

开局后，在暂停菜单中选择「移动性能诊断」。「单组 15 秒」按所选模式采样；「全自动约 15 秒」依次采集默认、停更 HUD、关闭光影各 5 秒，切换后的首帧仅建立时间基线。自动组间保持游戏运行和移动输入，结束后恢复默认显示并暂停，可一次复制最近 6 组结果；手动模式选择「默认」恢复正常显示。性能对照设置不持久化，新开局重置。

手动诊断仅在 debug 下开始后记录详细帧样本，上限 4096。暂停、弹窗和后台时间不计入，调整窗口或切换场景取消本次采样；自动流程取消时恢复默认显示，已完成的组仍保留。绘制帧间隔与提交该帧的回调 CPU 分别统计，限帧等待计入帧间隔；CPU 不包含浏览器合成或 GPU 时间，HUD 是回调 CPU 的子项，可能同时计入逻辑阶段。暂停菜单保留本页最近 6 组结果；一次手动诊断的完整组也会归档至本地行为日志，不上传。

调试首页在音效按钮左侧提供「日志」。按首页加载、开始冒险、场景切换、持续游玩、手动诊断、存档读写和运行异常查看，支持展开详情与逐项复制；三组性能对照可分别复制。日志仅存在当前浏览器的 IndexedDB，保留最近 24 小时，最多 1000 项 / 2 MiB；存储不可用时退回本页内存，并在面板提示。

普通模式只记录关键行为和异常；debug 额外生成每 30 秒有效游玩的性能摘要，每秒读取现有数量缓存。核心模拟、辅助逻辑和光影提交用于辅助定位，HUD、光影均存在父项包含关系，不能重复相加；记录不含完整 GPU 或浏览器合成耗时。日志不逐帧写盘，不采集完整存档或逐次攻击。相关检查使用 `npm run test:activity-log`；涉及帧循环或界面时再运行 `node qa-performance-integration.mjs`、`npm run test:focus` 及本地浏览器验证。

## 仓库结构

| 路径 | 用途 |
|---|---|
| `dist/` | 页面、样式与浏览器运行模块 |
| `qa-*.mjs` | 自动回归脚本 |
| `scripts/stamp-version.mjs` | 根据代码仓库历史提交数写入版本 |
| `.github/workflows/pages.yml` | GitHub Pages 部署流程 |

## 部署与版本

将 `dist/` 作为静态站点目录部署，资源使用相对路径。GitHub Pages 工作流在 `main` 更新后拉取完整历史、写入版本并部署产物，不额外生成版本提交。

游戏版本格式为 `v0.0.N`，`N` 为 `goodleap/wild-reaper` 当前提交可达的完整历史提交总数；本代码仓库的文档提交也计入。设计仓库的独立提交不计入。

在完整历史的云端检出中，可按当前提交生成版本与资源标记：

```sh
npm run stamp-version
```

发布前运行与改动相关的检查，在云端核对待发布版本是否等于该提交的 `git rev-list --count <SHA>`，并通过资源检查和必要的浏览器验证确认静态页面与相关资源正常加载。同步 GitHub 后，核对 `.github/workflows/pages.yml` 对应本次提交 SHA 的部署成功；不能用其他提交的成功记录代替本次部署验证。云端不再访问正式网站，正式网站的直接访问不作为交付检查或阻塞项。必要检查或部署受阻时应明确报告，修复后重试同一发布，避免为重试额外创建版本提交。

版本脚本以内容 hash 标记入口脚本、样式和 ES 模块依赖；未变化的文件跨游戏版本复用缓存。`dist/index.html` 中的 `release-imports` 由脚本生成，发布前运行版本脚本，确保缓存中的父模块也通过当前 import map 读取正确的子模块。

启动模块发生浏览器报告的下载失败时，最多自动刷新一次，以清除当前页面缓存的失败模块状态；再次失败保留手动重试入口，代码执行异常不自动刷新。日志记录当前模块组、已观察请求、HTTP 失败及未确认文件；浏览器没有提供的状态不推断为失败。记录仅在启动失败时汇总，正常游戏不增加采样开销。相关检查为 `node qa-boot-modules.mjs`、`node qa-boot-activity-log.mjs` 和 `node qa-release-assets.mjs`。

原 Site 保留为历史版本，不参与日常源码恢复、版本核验、同步或发布。日常工作无需访问它，也不创建替代 Site；私有 `.cloud/` 工具、凭据和私有材料不得复制到本仓库或部署产物。
