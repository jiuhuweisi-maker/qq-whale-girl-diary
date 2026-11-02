// Operational context only. Persona, style, memories and wait policy stay whole.
export function bootstrapToolContext({roleProvided=false,recommended=null}={}) {
  if(!roleProvided)return '请先调用 qq_get_prompt 查看角色、推荐值、可用工具和状态。';
  return '本轮已提供完整现行角色、关系、偏好、会话令牌和消息快照；直接处理当前消息，不必重复调用 qq_get_prompt 或重读已经完整展示的消息。工具定义已列出可用能力；缺少资料或需要刷新时仍可按需查询。'
    +(recommended?'\n【当前工具推荐配置】'+JSON.stringify(recommended):'');
}

export function backgroundPromptRefresh(refresh,report=()=>{}) {
  // Prompt reads must not wait for an unrelated QQ favorites network request.
  const task=Promise.resolve().then(refresh);
  task.catch(error=>{try{report(error?.name||'Error');}catch{/* Diagnostics cannot alter the prompt response. */}});
  return task;
}
