// Ephemeral headless overlay for the private daily report, not the QQ preset.
// A missing/incompatible restriction API fails profile boot, so the caller uses
// the deterministic report template instead of an unrestricted coding agent.
export const name = 'whale-report-no-tools';
export const inject = ['tools'];
export function apply(ctx) {
  ctx.tools.restrict({allow:[]});
  ctx.tools.guard(() => {throw Error('日报改写不执行工具');});
}
