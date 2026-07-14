/**
 * OneDrive Engine — Oktyv's 9th engine.
 *
 * Programmatic access to OneDrive (personal or business) via the Microsoft
 * Graph API. Mirrors the EmailEngine wiring pattern: the server injects a
 * vault getter/setter and the shared apiEngine.request() function, so this
 * engine reuses Oktyv's HTTP client (retries, parsing, rate limiting) and the
 * encrypted credential vault rather than introducing new plumbing.
 *
 * Auth model
 * ----------
 * Graph requires an OAuth 2.0 bearer token. Oktyv's built-in OAuth manager
 * does not (yet) ship a Microsoft provider, so this engine reads the token
 * from a vault named "onedrive":
 *   - access_token   (required)  — Graph bearer token
 *   - refresh_token  (optional)  — enables silent re-auth on 401
 *   - client_id      (optional)  — Azure app (public client) id, for refresh
 *   - client_secret  (optional)  — only for confidential clients
 *   - tenant         (optional)  — defaults to "common"
 *
 * Seed these once with the existing vault_set tool. One-time Azure app
 * registration steps are documented in the engine's setup notes
 * (see CLOUD_MIGRATION / sprint notes). Once a refresh_token + client_id are
 * present, the engine self-heals expired access tokens automatically.
 */

import { promises as fsp } from 'fs';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('onedrive');

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0/me/drive';
const SIMPLE_UPLOAD_LIMIT = 4 * 1024 * 1024; // 4 MiB — Graph simple PUT ceiling
const CHUNK_SIZE = 3932160; // 3.75 MiB, a multiple of 320 KiB (Graph requirement)

type VaultGetter = (vault: string, key: string) => Promise<string>;
type VaultSetter = (vault: string, key: string, value: string) => Promise<void>;
type ApiRequest = (url: string, options?: any) => Promise<any>;

interface GraphOpts {
  params?: Record<string, any>;
  data?: any;
  headers?: Record<string, string>;
  responseType?: 'json' | 'text' | 'arraybuffer';
}

export interface DriveItemSummary {
  id: string;
  name: string;
  type: 'file' | 'folder';
  size?: number;
  lastModified?: string;
  webUrl?: string;
  path?: string;
}

export class OneDriveEngine {
  private getVault: VaultGetter;
  private setVault: VaultSetter;
  private apiRequest: ApiRequest;

  constructor(getVault: VaultGetter, setVault: VaultSetter, apiRequest: ApiRequest) {
    this.getVault = getVault;
    this.setVault = setVault;
    this.apiRequest = apiRequest;
    logger.info('OneDrive engine initialized');
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  private async safeGet(key: string): Promise<string> {
    try {
      const v = await this.getVault('onedrive', key);
      return v || '';
    } catch {
      return '';
    }
  }

  private async getAccessToken(forceRefresh = false): Promise<string> {
    if (!forceRefresh) {
      const token = await this.safeGet('access_token');
      if (token) return token;
    }
    return this.refreshAccessToken();
  }

  private async refreshAccessToken(): Promise<string> {
    const [refreshToken, clientId] = await Promise.all([
      this.safeGet('refresh_token'),
      this.safeGet('client_id'),
    ]);
    if (!refreshToken || !clientId) {
      throw new Error(
        'OneDrive not authorized. Store credentials in vault "onedrive" via vault_set ' +
          '(access_token required; refresh_token + client_id enable auto-refresh). ' +
          'See OneDrive engine setup notes for the one-time Azure app registration.'
      );
    }
    const tenant = (await this.safeGet('tenant')) || 'common';
    const clientSecret = await this.safeGet('client_secret');
    const form = new URLSearchParams({
      client_id: clientId,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      scope: 'Files.ReadWrite.All offline_access User.Read',
    });
    if (clientSecret) form.set('client_secret', clientSecret);

    const r = await this.apiRequest(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      data: form.toString(),
    });
    const data = r?.data;
    if (!r?.success || !data?.access_token) {
      throw new Error(`OneDrive token refresh failed: ${r?.error?.message || JSON.stringify(data) || 'unknown'}`);
    }
    await this.setVault('onedrive', 'access_token', data.access_token);
    if (data.refresh_token) await this.setVault('onedrive', 'refresh_token', data.refresh_token);
    return data.access_token;
  }

  /** Authenticated Graph call with one transparent retry on 401. */
  private async graph(method: string, pathOrUrl: string, opts: GraphOpts = {}, _retried = false): Promise<any> {
    const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${GRAPH_BASE}${pathOrUrl}`;
    const token = await this.getAccessToken();
    const r = await this.apiRequest(url, {
      method,
      params: opts.params,
      data: opts.data,
      responseType: opts.responseType,
      headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    });
    if (!r?.success) {
      const status = r?.status ?? r?.error?.status;
      if (status === 401 && !_retried) {
        await this.getAccessToken(true);
        return this.graph(method, pathOrUrl, opts, true);
      }
      throw new Error(`Graph ${method} ${url} failed: ${r?.error?.code || status || ''} ${r?.error?.message || ''}`.trim());
    }
    return r;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private encodePath(p: string): string {
    return p
      .replace(/^\/+|\/+$/g, '')
      .split('/')
      .filter(Boolean)
      .map(encodeURIComponent)
      .join('/');
  }

  private childrenUrl(opts: { itemId?: string; path?: string }): string {
    if (opts.itemId) return `/items/${opts.itemId}/children`;
    if (opts.path) return `/root:/${this.encodePath(opts.path)}:/children`;
    return '/root/children';
  }

  private summarize(item: any): DriveItemSummary {
    return {
      id: item.id,
      name: item.name,
      type: item.folder ? 'folder' : 'file',
      size: item.size,
      lastModified: item.lastModifiedDateTime,
      webUrl: item.webUrl,
      path: item.parentReference?.path,
    };
  }

  // ── Public operations ───────────────────────────────────────────────────────

  /** List files/folders at a drive path (or under an item id, or drive root). */
  async list(opts: { path?: string; itemId?: string } = {}): Promise<DriveItemSummary[]> {
    const r = await this.graph('GET', this.childrenUrl(opts));
    const value = r.data?.value || [];
    return value.map((i: any) => this.summarize(i));
  }

  /** Search the drive for files/folders by name or content. */
  async search(query: string): Promise<DriveItemSummary[]> {
    const q = encodeURIComponent(query);
    const r = await this.graph('GET', `/root/search(q='${q}')`);
    const value = r.data?.value || [];
    return value.map((i: any) => this.summarize(i));
  }

  /** Read a file's contents. Returns text by default, or base64 for binary. */
  async read(opts: { itemId?: string; path?: string; as?: 'text' | 'base64' }): Promise<{ encoding: string; content: string }> {
    if (!opts.itemId && !opts.path) throw new Error('read requires itemId or path');
    const base = opts.itemId ? `/items/${opts.itemId}/content` : `/root:/${this.encodePath(opts.path!)}:/content`;
    const as = opts.as || 'text';
    const r = await this.graph('GET', base, { responseType: as === 'base64' ? 'arraybuffer' : 'text' });
    const d = r.data;
    if (as === 'base64') {
      const buf = Buffer.isBuffer(d)
        ? d
        : d instanceof ArrayBuffer
          ? Buffer.from(new Uint8Array(d))
          : Buffer.from(typeof d === 'string' ? d : JSON.stringify(d));
      return { encoding: 'base64', content: buf.toString('base64') };
    }
    return { encoding: 'utf8', content: typeof d === 'string' ? d : JSON.stringify(d) };
  }

  /** Create a folder. Provide the new folder name and an optional parent. */
  async mkdir(opts: { name: string; parentPath?: string; parentId?: string; conflict?: 'rename' | 'replace' | 'fail' }): Promise<DriveItemSummary> {
    if (!opts.name) throw new Error('mkdir requires a folder name');
    const parentUrl = this.childrenUrl({ itemId: opts.parentId, path: opts.parentPath });
    const r = await this.graph('POST', parentUrl, {
      data: {
        name: opts.name,
        folder: {},
        '@microsoft.graph.conflictBehavior': opts.conflict || 'rename',
      },
    });
    return this.summarize(r.data);
  }

  /** Get changes since the last sync. Pass a prior deltaLink to page forward. */
  async delta(opts: { path?: string; deltaLink?: string } = {}): Promise<{ changes: DriveItemSummary[]; deltaLink?: string; nextLink?: string }> {
    let r: any;
    if (opts.deltaLink) {
      r = await this.graph('GET', opts.deltaLink);
    } else {
      const base = opts.path ? `/root:/${this.encodePath(opts.path)}:/delta` : '/root/delta';
      r = await this.graph('GET', base);
    }
    return {
      changes: (r.data?.value || []).map((i: any) => this.summarize(i)),
      deltaLink: r.data?.['@odata.deltaLink'],
      nextLink: r.data?.['@odata.nextLink'],
    };
  }

  /**
   * Upload a file to a drive path. Source is one of:
   *   - localPath:     read bytes from a local file
   *   - contentBase64: base64-encoded bytes
   *   - content:       inline UTF-8 text
   * Files <= 4 MiB use a simple PUT; larger files use a resumable upload session.
   */
  async upload(opts: { path: string; localPath?: string; contentBase64?: string; content?: string }): Promise<DriveItemSummary> {
    if (!opts.path) throw new Error('upload requires a destination path');
    const buffer = await this.resolveUploadBuffer(opts);
    const encPath = this.encodePath(opts.path);

    if (buffer.length <= SIMPLE_UPLOAD_LIMIT) {
      const r = await this.graph('PUT', `/root:/${encPath}:/content`, {
        data: buffer,
        headers: { 'Content-Type': 'application/octet-stream' },
      });
      return this.summarize(r.data);
    }
    return this.uploadLarge(encPath, buffer);
  }

  private async resolveUploadBuffer(opts: { localPath?: string; contentBase64?: string; content?: string }): Promise<Buffer> {
    if (opts.localPath) return fsp.readFile(opts.localPath);
    if (opts.contentBase64) return Buffer.from(opts.contentBase64, 'base64');
    if (typeof opts.content === 'string') return Buffer.from(opts.content, 'utf8');
    throw new Error('upload requires one of: localPath, contentBase64, or content');
  }

  /** Resumable upload session for files larger than 4 MiB. */
  private async uploadLarge(encPath: string, buffer: Buffer): Promise<DriveItemSummary> {
    const session = await this.graph('POST', `/root:/${encPath}:/createUploadSession`, {
      data: { item: { '@microsoft.graph.conflictBehavior': 'replace' } },
    });
    const uploadUrl: string = session.data?.uploadUrl;
    if (!uploadUrl) throw new Error('OneDrive did not return an upload session URL');

    const total = buffer.length;
    let last: any;
    for (let start = 0; start < total; start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE, total);
      const chunk = buffer.subarray(start, end);
      // Upload-session URLs are pre-authenticated — do NOT attach the bearer token.
      last = await this.apiRequest(uploadUrl, {
        method: 'PUT',
        data: chunk,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(chunk.length),
          'Content-Range': `bytes ${start}-${end - 1}/${total}`,
        },
      });
      const ok = last?.success || [200, 201, 202].includes(last?.status);
      if (!ok) {
        throw new Error(`OneDrive chunk upload failed at byte ${start}: ${last?.error?.message || last?.status || 'unknown'}`);
      }
    }
    return this.summarize(last?.data || {});
  }
}
