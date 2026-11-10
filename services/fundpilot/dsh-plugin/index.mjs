import { defineTool } from '@deepseek-ai/dsh-tools';
import { request } from '../src/client.mjs';
export const name = 'fundpilot';
export const inject = ['tools'];
const TOOL_ROUTES = Object.freeze({
  fundpilot_status: ['/status', '查看基金助手状态。所有资金和成交都是模拟数据；华宝证券未连接，真实下单不可用。'],
  fundpilot_market: ['/market', '查看公开行情、数据时间与未验证的20/60日趋势信号。行情不是交易所直连，不构成可靠买点。'],
  fundpilot_journal: ['/journal', '查看模拟成交、费用及按需补入虚拟资金的持久审计记录。'],
  fundpilot_paper_cycle: ['/paper/cycle', '仅查看或运行当前模拟模式：自由模拟模式只观察，固定小额模式才运行旧策略。不能买卖真实基金。'],
  fundpilot_paper_halt: ['/paper/halt', '锁定暂停虚拟账户，停止模拟开新仓。此工具不能恢复交易、修改风险预算或操作真实账户。'],
});
export function apply(ctx) {
  for (const [toolName, [route, description]] of Object.entries(TOOL_ROUTES)) {
    ctx.tools.register(defineTool({
      name: toolName, description, parameters: {},
      output: {
        schema: { type: 'object', additionalProperties: false, properties: { text: { type: 'string', required: true } } },
        render: (_args, result) => [{ type: 'text', text: result.text }],
      },
      async execute(args) {
        if (Object.keys(args).length) throw new Error('NO_PARAMETERS_ACCEPTED');
        const result = await request(route, route.startsWith('/paper/') ? {} : undefined);
        return { text: JSON.stringify(result) };
      },
      presentCall: () => ({ card: 'generic', title: description.split('。')[0], kind: 'other' }),
    }));
  }
}
