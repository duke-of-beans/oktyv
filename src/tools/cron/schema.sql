-- Cron Engine Database Schema
-- Tasks and execution history

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  schedule_type TEXT NOT NULL CHECK(schedule_type IN ('cron', 'interval', 'once')),
  schedule_expression TEXT,
  schedule_interval INTEGER,
  schedule_execute_at TEXT,
  action_type TEXT NOT NULL CHECK(action_type IN ('http', 'webhook', 'file', 'database', 'email')),
  action_config TEXT NOT NULL,
  timezone TEXT DEFAULT 'UTC',
  retry_count INTEGER DEFAULT 0,
  retry_delay INTEGER DEFAULT 5000,
  timeout INTEGER DEFAULT 30000,
  enabled INTEGER DEFAULT 1,
  tags TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_by TEXT
);

-- Executions table
CREATE TABLE IF NOT EXISTS executions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT,
  duration INTEGER,
  status TEXT NOT NULL CHECK(status IN ('success', 'failure', 'timeout')),
  result TEXT,
  error TEXT,
  retry_count INTEGER DEFAULT 0,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_executions_task_id ON executions(task_id);
CREATE INDEX IF NOT EXISTS idx_executions_start_time ON executions(start_time);
CREATE INDEX IF NOT EXISTS idx_executions_status ON executions(status);
CREATE INDEX IF NOT EXISTS idx_tasks_enabled ON tasks(enabled);
CREATE INDEX IF NOT EXISTS idx_tasks_schedule_type ON tasks(schedule_type);
