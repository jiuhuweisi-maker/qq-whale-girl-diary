# FundPilot 纯模拟服务

Node.js 24及以上；无券商连接。与QQ机器人主服务分开运行。当前模板为自由模拟：用户明确下单时按需补入虚拟资金，不设本金、单笔仓位或每日订单的业务额度；有限数值范围、市场规则与手动暂停仍生效。补款有独立流水，PnL扣除累计投入本金。

`config/paper.json`可选择`capitalMode: "elastic"`（必须`autoPaper:false`），或使用旧`fixed`模式。旧模式的1000/900约束保持兼容。切换配置不清账户、仓位、订单或暂停锁；首次升级自动迁移累计投入和分批持仓。自由模式不会自动运行旧策略买卖，QQ关注提醒仍由机器人自己的模块负责。

源码与个人数据分离；数据目录用`FUNDPILOT_DATA`，服务访问票用`FUNDPILOT_TOKEN_FILE`指定自己的私有文件。HTTP只监听本机3092，鉴权后可查`/status`、`/market`、`/journal`。`/paper/order`接受`mode:paper`、唯一`requestId`、原支持产品`symbol`、`side`，以及二选一的`quantity`份数或`amountFen`买入总预算（分、含模拟手续费）。只有成功的模拟成交才更新持仓；回包不明应按同一requestId对账，不换编号重下。

金额下单按100份交易单位向下换算；总成本含手续费不超预算，余量返回`unspentBudgetFen`。行情采用公开买卖一档并假定全量成交，没有验证大单真实市场深度，不表示真实可成交或投资策略有效。

测试：在本目录运行`node --test tests/*.test.mjs`。生成部署脚本：`node scripts/build-deploy.mjs /你自己的目录/fundpilot-install.py`。先检查脚本与`deploy/fundpilot-paper.service`中的路径、用户、数据位置，再部署；不要覆盖不属于本项目的服务或个人数据库。新服务仍需自行配置自己的鉴权，不携带任何账号、票据或运行数据。
