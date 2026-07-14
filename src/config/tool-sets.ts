/**
 * Tool subset configuration for ASURIQ Hands Engine.
 *
 * When OKTYV_MODE=asuriq, only these tools are registered.
 * Phase 1: browser, DB, API, email, cron — all BYOK, stateless.
 *
 * NOT included: vault, file ops, shell, parallel, job scrapers,
 * OneDrive, image_read, OAuth flows — see HANDS_ENGINE_ADR.md.
 */

export const ASURIQ_TOOLS = new Set([
  // Browser
  'browser_navigate',
  'browser_click',
  'browser_type',
  'browser_extract',
  'browser_screenshot',
  'browser_pdf',
  'browser_form_fill',
  'browser_scroll_capture',
  'browser_selector_capture',
  'browser_computed_styles',

  // Database
  'db_connect',
  'db_query',
  'db_insert',
  'db_update',
  'db_delete',
  'db_raw_query',
  'db_disconnect',
  'db_transaction',
  'db_aggregate',

  // API
  'api_request',

  // Email (SMTP only — BYOK credentials)
  'email_smtp_connect',
  'email_smtp_send',

  // Cron (Supabase-backed in asuriq mode)
  'cron_create_task',
  'cron_list_tasks',
  'cron_get_task',
  'cron_enable_task',
  'cron_disable_task',
  'cron_delete_task',
  'cron_execute_now',
  'cron_update_task',
  'cron_get_history',
  'cron_get_statistics',
  'cron_clear_history',
  'cron_validate_expression',
]);

/**
 * Check if a tool should be registered in the current mode.
 * In local mode (no OKTYV_MODE), all tools are registered.
 * In asuriq mode, only ASURIQ_TOOLS are registered.
 */
export function shouldRegisterTool(toolName: string): boolean {
  if (process.env.OKTYV_MODE !== 'asuriq') return true;
  return ASURIQ_TOOLS.has(toolName);
}

export const isAsuriqMode = (): boolean => process.env.OKTYV_MODE === 'asuriq';
