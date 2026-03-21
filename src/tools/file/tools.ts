import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// ============================================================================
// File Read/Write Tools
// ============================================================================

export const fileReadTool: Tool = {
  name: 'file_read',
  description: 'Read file contents (text or binary)',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to file',
      },
      encoding: {
        type: 'string',
        enum: ['utf-8', 'binary'],
        description: 'File encoding (default: utf-8)',
      },
      start: {
        type: 'number',
        description: 'Start byte offset (optional)',
      },
      end: {
        type: 'number',
        description: 'End byte offset (optional)',
      },
    },
    required: ['path'],
  },
};

export const fileWriteTool: Tool = {
  name: 'file_write',
  description: 'Write file contents',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to file',
      },
      content: {
        type: 'string',
        description: 'Content to write',
      },
      encoding: {
        type: 'string',
        enum: ['utf-8', 'binary'],
        description: 'File encoding (default: utf-8)',
      },
      mode: {
        type: 'string',
        enum: ['overwrite', 'append'],
        description: 'Write mode (default: overwrite)',
      },
    },
    required: ['path', 'content'],
  },
};

// ============================================================================
// File Operations Tools
// ============================================================================

export const fileCopyTool: Tool = {
  name: 'file_copy',
  description: 'Copy file or directory',
  inputSchema: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        description: 'Source path',
      },
      destination: {
        type: 'string',
        description: 'Destination path',
      },
      recursive: {
        type: 'boolean',
        description: 'Copy directories recursively (default: false)',
      },
      overwrite: {
        type: 'boolean',
        description: 'Overwrite if destination exists (default: false)',
      },
    },
    required: ['source', 'destination'],
  },
};

export const fileMoveTool: Tool = {
  name: 'file_move',
  description: 'Move/rename file or directory',
  inputSchema: {
    type: 'object',
    properties: {
      source: {
        type: 'string',
        description: 'Source path',
      },
      destination: {
        type: 'string',
        description: 'Destination path',
      },
      overwrite: {
        type: 'boolean',
        description: 'Overwrite if destination exists (default: false)',
      },
    },
    required: ['source', 'destination'],
  },
};

export const fileDeleteTool: Tool = {
  name: 'file_delete',
  description: 'Delete file or directory',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to delete',
      },
      recursive: {
        type: 'boolean',
        description: 'Delete directories recursively (default: false)',
      },
    },
    required: ['path'],
  },
};

export const fileListTool: Tool = {
  name: 'file_list',
  description: 'List directory contents',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Directory path',
      },
      recursive: {
        type: 'boolean',
        description: 'List recursively (default: false)',
      },
      pattern: {
        type: 'string',
        description: 'Glob pattern to filter files (optional)',
      },
    },
    required: ['path'],
  },
};

export const fileStatTool: Tool = {
  name: 'file_stat',
  description: 'Get file metadata',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path',
      },
    },
    required: ['path'],
  },
};

// ============================================================================
// Watch Tools
// ============================================================================

export const fileWatchTool: Tool = {
  name: 'file_watch',
  description: 'Watch files for changes',
  inputSchema: {
    type: 'object',
    properties: {
      watchId: {
        type: 'string',
        description: 'Unique watch ID',
      },
      paths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Paths to watch',
      },
      recursive: {
        type: 'boolean',
        description: 'Watch recursively (default: true)',
      },
      events: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['add', 'change', 'unlink', 'addDir', 'unlinkDir'],
        },
        description: 'Events to watch for',
      },
      debounce: {
        type: 'number',
        description: 'Debounce delay in ms (default: 0)',
      },
    },
    required: ['watchId', 'paths'],
  },
};

export const fileUnwatchTool: Tool = {
  name: 'file_unwatch',
  description: 'Stop watching files',
  inputSchema: {
    type: 'object',
    properties: {
      watchId: {
        type: 'string',
        description: 'Watch ID to stop',
      },
    },
    required: ['watchId'],
  },
};

// ============================================================================
// Archive Tools
// ============================================================================

export const fileArchiveCreateTool: Tool = {
  name: 'file_archive_create',
  description: 'Create archive (ZIP, TAR, TAR.GZ)',
  inputSchema: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['zip', 'tar', 'tar.gz'],
        description: 'Archive format',
      },
      sources: {
        type: 'array',
        items: { type: 'string' },
        description: 'Files/directories to archive',
      },
      destination: {
        type: 'string',
        description: 'Output archive path',
      },
    },
    required: ['format', 'sources', 'destination'],
  },
};

export const fileArchiveExtractTool: Tool = {
  name: 'file_archive_extract',
  description: 'Extract archive',
  inputSchema: {
    type: 'object',
    properties: {
      archive: {
        type: 'string',
        description: 'Archive path',
      },
      destination: {
        type: 'string',
        description: 'Extraction destination',
      },
      format: {
        type: 'string',
        enum: ['zip', 'tar', 'tar.gz'],
        description: 'Archive format (auto-detect if not provided)',
      },
    },
    required: ['archive', 'destination'],
  },
};

export const fileArchiveListTool: Tool = {
  name: 'file_archive_list',
  description: 'List archive contents',
  inputSchema: {
    type: 'object',
    properties: {
      archive: {
        type: 'string',
        description: 'Archive path',
      },
      format: {
        type: 'string',
        enum: ['zip', 'tar', 'tar.gz'],
        description: 'Archive format (auto-detect if not provided)',
      },
    },
    required: ['archive'],
  },
};

// ============================================================================
// Hash Tools
// ============================================================================

export const fileHashTool: Tool = {
  name: 'file_hash',
  description: 'Calculate file hash',
  inputSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'File path',
      },
      algorithm: {
        type: 'string',
        enum: ['md5', 'sha1', 'sha256', 'sha512'],
        description: 'Hash algorithm (default: sha256)',
      },
    },
    required: ['path'],
  },
};

// ============================================================================
// S3 Tools
// ============================================================================

export const fileS3UploadTool: Tool = {
  name: 'file_s3_upload',
  description: 'Upload file to S3',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Local file path',
      },
      bucket: {
        type: 'string',
        description: 'S3 bucket name',
      },
      key: {
        type: 'string',
        description: 'S3 object key',
      },
      vaultName: {
        type: 'string',
        description: 'Vault name for credentials',
      },
      credentialName: {
        type: 'string',
        description: 'Credential name in vault',
      },
    },
    required: ['filePath', 'bucket', 'key', 'vaultName', 'credentialName'],
  },
};

export const fileS3DownloadTool: Tool = {
  name: 'file_s3_download',
  description: 'Download file from S3',
  inputSchema: {
    type: 'object',
    properties: {
      bucket: {
        type: 'string',
        description: 'S3 bucket name',
      },
      key: {
        type: 'string',
        description: 'S3 object key',
      },
      destination: {
        type: 'string',
        description: 'Local destination path',
      },
      vaultName: {
        type: 'string',
        description: 'Vault name for credentials',
      },
      credentialName: {
        type: 'string',
        description: 'Credential name in vault',
      },
    },
    required: ['bucket', 'key', 'destination', 'vaultName', 'credentialName'],
  },
};

export const fileS3ListTool: Tool = {
  name: 'file_s3_list',
  description: 'List S3 objects',
  inputSchema: {
    type: 'object',
    properties: {
      bucket: {
        type: 'string',
        description: 'S3 bucket name',
      },
      prefix: {
        type: 'string',
        description: 'Object key prefix (optional)',
      },
      vaultName: {
        type: 'string',
        description: 'Vault name for credentials',
      },
      credentialName: {
        type: 'string',
        description: 'Credential name in vault',
      },
    },
    required: ['bucket', 'vaultName', 'credentialName'],
  },
};

// ============================================================================
// Batch Tools
// ============================================================================

export const fileBatchOperationTool: Tool = {
  name: 'file_batch_operation',
  description: 'Execute batch file operations',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['copy', 'move', 'delete'],
        description: 'Operation type',
      },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            source: { type: 'string' },
            destination: { type: 'string' },
          },
          required: ['source'],
        },
        description: 'Items to process',
      },
      concurrency: {
        type: 'number',
        description: 'Parallel operations (default: 5)',
      },
      continueOnError: {
        type: 'boolean',
        description: 'Continue if errors occur (default: true)',
      },
    },
    required: ['operation', 'items'],
  },
};

// ============================================================================
// Export all tools
// ============================================================================

export const fileTools: Tool[] = [
  fileCopyTool,
  fileDeleteTool,
  fileArchiveCreateTool,
  fileArchiveExtractTool,
  fileArchiveListTool,
  fileHashTool,
];
