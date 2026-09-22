// @ts-check
/** Три промпта-сценария из страницы «Сценарии». */
import { z } from 'zod';

export const PROMPT_NAMES = ['planner_upload_draft_guide', 'planner_point_changes_guide', 'planner_release_flow_guide'];

/** @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server @param {import('./context.js').Ctx} ctx */
export function registerPrompts(server, ctx) {
  const { t } = ctx;
  for (const name of PROMPT_NAMES) {
    server.registerPrompt(name, { title: t(`prompts.${name}.title`), description: t(`prompts.${name}.description`), argsSchema: { projectKey: z.string().describe(t('fields.projectKey')) } },
      ({ projectKey }) => ({ messages: [{ role: 'user', content: { type: 'text', text: t(`prompts.${name}.text`, { projectKey }) } }] }));
  }
}
