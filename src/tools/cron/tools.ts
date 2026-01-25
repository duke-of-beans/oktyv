import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// ============================================================================
// Task Management Tools
// ============================================================================

export const cronCreateTaskTool: Tool = {
  name: 'cron_create_task',
  description: 'Create scheduled task with cron expression or interval',
  inputSchema: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Task name',
      },
      description: {
        type: 'string',
        description: 'Task description (optional)',
      },
      scheduleType: {
        type: 'string',
        enum: ['cron', 'interval', 'once'],
        description: 'Schedule type',
      },
      cronExpression: {
        type: 'string',
        description: 'Cron expression (for cron type) - e.g., "0 2 * * *" for 2 AM daily',
      },
      interval: {
        type: 'number',
        description: 'Interval in milliseconds (for interval type)',
      },
      executeAt: {
        type: 'string',
        description: 'Execute time in ISO format (for once type)',
      },
      actionType: {
        type: 'string',
        enum: ['http', 'webhook', 'file', 'database', 'email'],
        description: 'Type of action to execute',
      },
      actionConfig: {
        type: 'object',
        description: 'Action-specific configuration',
      },
      timezone: {
        type: 'string',
        description: 'Timezone (default: UTC)',
      },
      retryCount: {
        type: 'number',
        description: 'Number of retries on failure (default: 0)',
      },
      retryDelay: {
        type: 'number',
        description: 'Delay between retries in ms (default: 5000)',
      },
      timeout: {
        type: 'number',
        description: 'Execution timeout in ms (default: 30000)',
      },
      enabled: {
        type: 'boolean',
        description: 'Enable task immediately (default: true)',
      },
    },
    required: ['name', 'scheduleType', 'actionType', 'actionConfig'],
  },
};

export const cronUpdateTaskTool: Tool = {
  name: 'cron_update_task',
  description: 'Update existing scheduled task',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'Task ID',
      },
      name: {
        type: 'string',
        description: 'Task name',
      },
      description: {
        type: 'string',
        description: 'Task description',
      },
      cronExpression: {
        type: 'string',
        description: 'Cron expression',
      },
      interval: {
        type: 'number',
        description: 'Interval in milliseconds',
      },
      executeAt: {
        type: 'string',
        description: 'Execute time in ISO format',
      },
      actionConfig: {
        type: 'object',
        description: 'Action configuration',
      },
      timezone: {
        type: 'string',
        description: 'Timezone',
      },
      retryCount: {
        type: 'number',
        description: 'Number of retries',
      },
      timeout: {
        type: 'number',
        description: 'Timeout in ms',
      },
    },
    required: ['taskId'],
  },
};

export const cronDeleteTaskTool: Tool = {
  name: 'cron_delete_task',
  description: 'Delete scheduled task',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'Task ID to delete',
      },
    },
    required: ['taskId'],
  },
};

export const cronListTasksTool: Tool = {
  name: 'cron_list_tasks',
  description: 'List all scheduled tasks',
  inputSchema: {
    type: 'object',
    properties: {
      enabled: {
        type: 'boolean',
        description: 'Filter by enabled status',
      },
      scheduleType: {
        type: 'string',
        enum: ['cron', 'interval', 'once'],
        description: 'Filter by schedule type',
      },
      actionType: {
        type: 'string',
        enum: ['http', 'webhook', 'file', 'database', 'email'],
        description: 'Filter by action type',
      },
      limit: {
        type: 'number',
        description: 'Maximum results (default: 50)',
      },
    },
  },
};

export const cronGetTaskTool: Tool = {
  name: 'cron_get_task',
  description: 'Get task details',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'Task ID',
      },
    },
    required: ['taskId'],
  },
};

export const cronEnableTaskTool: Tool = {
  name: 'cron_enable_task',
  description: 'Enable task',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'Task ID',
      },
    },
    required: ['taskId'],
  },
};

export const cronDisableTaskTool: Tool = {
  name: 'cron_disable_task',
  description: 'Disable task',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'Task ID',
      },
    },
    required: ['taskId'],
  },
};

export const cronExecuteNowTool: Tool = {
  name: 'cron_execute_now',
  description: 'Execute task immediately (ignores schedule)',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'Task ID',
      },
    },
    required: ['taskId'],
  },
};

// ============================================================================
// History & Statistics Tools
// ============================================================================

export const cronGetHistoryTool: Tool = {
  name: 'cron_get_history',
  description: 'Get task execution history',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'Task ID',
      },
      limit: {
        type: 'number',
        description: 'Maximum results (default: 50)',
      },
    },
    required: ['taskId'],
  },
};

export const cronGetStatisticsTool: Tool = {
  name: 'cron_get_statistics',
  description: 'Get task execution statistics',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'Task ID',
      },
    },
    required: ['taskId'],
  },
};

export const cronClearHistoryTool: Tool = {
  name: 'cron_clear_history',
  description: 'Clear execution history for task',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: {
        type: 'string',
        description: 'Task ID',
      },
    },
    required: ['taskId'],
  },
};

// ============================================================================
// Validation Tools
// ============================================================================

export const cronValidateExpressionTool: Tool = {
  name: 'cron_validate_expression',
  description: 'Validate cron expression and get next run time',
  inputSchema: {
    type: 'object',
    properties: {
      expression: {
        type: 'string',
        description: 'Cron expression to validate',
      },
      timezone: {
        type: 'string',
        description: 'Timezone (optional)',
      },
    },
    required: ['expression'],
  },
};

// ============================================================================
// Export all tools
// ============================================================================

export const cronTools: Tool[] = [
  cronCreateTaskTool,
  cronUpdateTaskTool,
  cronDeleteTaskTool,
  cronListTasksTool,
  cronGetTaskTool,
  cronEnableTaskTool,
  cronDisableTaskTool,
  cronExecuteNowTool,
  cronGetHistoryTool,
  cronGetStatisticsTool,
  cronClearHistoryTool,
  cronValidateExpressionTool,
];
