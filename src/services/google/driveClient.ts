import { z } from 'zod';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

const driveFileSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  mimeType: z.string(),
  parents: z.array(z.string()).optional(),
  modifiedTime: z.string().optional(),
  trashed: z.boolean().optional(),
  appProperties: z.record(z.string(), z.string()).optional(),
});

const listResponseSchema = z.object({
  nextPageToken: z.string().optional(),
  files: z.array(driveFileSchema),
});

const startPageTokenSchema = z.object({ startPageToken: z.string().min(1) });
const changesResponseSchema = z.object({
  nextPageToken: z.string().optional(),
  newStartPageToken: z.string().optional(),
  changes: z.array(z.object({
    fileId: z.string().min(1),
    removed: z.boolean().optional(),
    file: driveFileSchema.optional(),
  })),
});

export type DriveFile = z.infer<typeof driveFileSchema>;
export type DriveChange = z.infer<typeof changesResponseSchema>['changes'][number];
export type AccessTokenProvider = () => Promise<string>;
export type DriveFetch = typeof fetch;

export interface DriveGateway {
  listByName(parentId: string | undefined, name: string, mimeType?: string): Promise<DriveFile[]>;
  createFolder(name: string): Promise<DriveFile>;
  createTextFile(
    parentId: string,
    name: string,
    content: string,
    appProperties?: Record<string, string>,
  ): Promise<DriveFile>;
  updateTextFile(
    fileId: string,
    name: string,
    content: string,
    appProperties?: Record<string, string>,
  ): Promise<DriveFile>;
  downloadText(fileId: string): Promise<string>;
}

export interface DriveSyncGateway extends DriveGateway {
  listChildren(parentId: string): Promise<DriveFile[]>;
  getStartPageToken(): Promise<string>;
  listChanges(pageToken: string): Promise<{
    changes: DriveChange[];
    nextPageToken?: string;
    newStartPageToken?: string;
  }>;
  createResumableUpload(input: {
    parentId: string;
    name: string;
    mimeType: string;
    appProperties: Record<string, string>;
    size: number;
  }): Promise<string>;
  uploadResumableChunk(
    sessionUrl: string,
    data: Uint8Array,
    offset: number,
    totalBytes: number,
  ): Promise<{ complete: boolean; nextOffset: number; file?: DriveFile }>;
  downloadBytes(fileId: string): Promise<Uint8Array>;
}

export class DriveRequestError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfter: string | null,
    message: string,
  ) {
    super(message);
    this.name = 'DriveRequestError';
  }
}

function escapeDriveQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

async function errorMessage(response: Response): Promise<string> {
  try {
    const payload = z.object({
      error: z.object({ message: z.string().optional() }).optional(),
    }).parse(JSON.parse(await response.text()) as unknown);
    return payload.error?.message || `Google Drive returned HTTP ${response.status}.`;
  } catch {
    return `Google Drive returned HTTP ${response.status}.`;
  }
}

export class DriveClient implements DriveGateway {
  constructor(
    private readonly tokenProvider: AccessTokenProvider,
    private readonly fetcher: DriveFetch = fetch,
  ) {}

  async listByName(parentId: string | undefined, name: string, mimeType?: string): Promise<DriveFile[]> {
    const query = [
      `name = '${escapeDriveQuery(name)}'`,
      'trashed = false',
      parentId ? `'${escapeDriveQuery(parentId)}' in parents` : undefined,
      mimeType ? `mimeType = '${escapeDriveQuery(mimeType)}'` : undefined,
    ].filter((item): item is string => Boolean(item)).join(' and ');
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const parameters = new URLSearchParams({
        q: query,
        spaces: 'drive',
        pageSize: '1000',
        fields: 'nextPageToken,files(id,name,mimeType,parents,modifiedTime,trashed,appProperties)',
      });
      if (pageToken) parameters.set('pageToken', pageToken);
      const response = await this.request(`${DRIVE_API}/files?${parameters}`);
      const page = listResponseSchema.parse(await response.json() as unknown);
      files.push(...page.files);
      pageToken = page.nextPageToken;
    } while (pageToken);
    return files;
  }

  async listChildren(parentId: string): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    do {
      const parameters = new URLSearchParams({
        q: `'${escapeDriveQuery(parentId)}' in parents and trashed = false`,
        spaces: 'drive',
        pageSize: '1000',
        fields: 'nextPageToken,files(id,name,mimeType,parents,modifiedTime,trashed,appProperties)',
      });
      if (pageToken) parameters.set('pageToken', pageToken);
      const response = await this.request(`${DRIVE_API}/files?${parameters}`);
      const page = listResponseSchema.parse(await response.json() as unknown);
      files.push(...page.files);
      pageToken = page.nextPageToken;
    } while (pageToken);
    return files;
  }

  async createFolder(name: string): Promise<DriveFile> {
    const response = await this.request(`${DRIVE_API}/files?fields=id,name,mimeType,parents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });
    return driveFileSchema.parse(await response.json() as unknown);
  }

  createTextFile(
    parentId: string,
    name: string,
    content: string,
    appProperties?: Record<string, string>,
  ): Promise<DriveFile> {
    return this.uploadText(undefined, parentId, name, content, appProperties);
  }

  updateTextFile(
    fileId: string,
    name: string,
    content: string,
    appProperties?: Record<string, string>,
  ): Promise<DriveFile> {
    return this.uploadText(fileId, undefined, name, content, appProperties);
  }

  async downloadText(fileId: string): Promise<string> {
    const response = await this.request(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`,
    );
    return response.text();
  }

  async downloadBytes(fileId: string): Promise<Uint8Array> {
    const response = await this.request(
      `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`,
    );
    return new Uint8Array(await response.arrayBuffer());
  }

  async getStartPageToken(): Promise<string> {
    const response = await this.request(
      `${DRIVE_API}/changes/startPageToken?supportsAllDrives=false`,
    );
    return startPageTokenSchema.parse(await response.json() as unknown).startPageToken;
  }

  async listChanges(pageToken: string): Promise<{
    changes: DriveChange[];
    nextPageToken?: string;
    newStartPageToken?: string;
  }> {
    const parameters = new URLSearchParams({
      pageToken,
      spaces: 'drive',
      pageSize: '1000',
      includeRemoved: 'true',
      fields: 'nextPageToken,newStartPageToken,changes(fileId,removed,file(id,name,mimeType,parents,modifiedTime,trashed,appProperties))',
    });
    const response = await this.request(`${DRIVE_API}/changes?${parameters}`);
    return changesResponseSchema.parse(await response.json() as unknown);
  }

  async createResumableUpload(input: {
    parentId: string;
    name: string;
    mimeType: string;
    appProperties: Record<string, string>;
    size: number;
  }): Promise<string> {
    const response = await this.request(`${DRIVE_UPLOAD_API}/files?uploadType=resumable&fields=id,name,mimeType,parents,appProperties`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': input.mimeType,
        'X-Upload-Content-Length': String(input.size),
      },
      body: JSON.stringify({
        name: input.name,
        mimeType: input.mimeType,
        parents: [input.parentId],
        appProperties: input.appProperties,
      }),
    });
    const location = response.headers.get('Location');
    if (!location) throw new Error('Google Drive did not return a resumable upload session.');
    return location;
  }

  async uploadResumableChunk(
    sessionUrl: string,
    data: Uint8Array,
    offset: number,
    totalBytes: number,
  ): Promise<{ complete: boolean; nextOffset: number; file?: DriveFile }> {
    const token = await this.tokenProvider();
    const end = offset + data.byteLength - 1;
    const response = await this.fetcher(sessionUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Range': `bytes ${offset}-${end}/${totalBytes}`,
      },
      body: data.slice().buffer,
    });
    if (response.status === 308) {
      const range = response.headers.get('Range');
      const match = range?.match(/bytes=0-(\d+)/);
      return {
        complete: false,
        nextOffset: match ? Number(match[1]) + 1 : offset + data.byteLength,
      };
    }
    if (!response.ok) {
      throw new DriveRequestError(
        response.status,
        response.headers.get('Retry-After'),
        await errorMessage(response),
      );
    }
    return {
      complete: true,
      nextOffset: totalBytes,
      file: driveFileSchema.parse(await response.json() as unknown),
    };
  }

  private async uploadText(
    fileId: string | undefined,
    parentId: string | undefined,
    name: string,
    content: string,
    appProperties?: Record<string, string>,
  ): Promise<DriveFile> {
    const boundary = `paperflow-${crypto.randomUUID()}`;
    const metadata = {
      name,
      mimeType: 'application/json',
      ...(parentId ? { parents: [parentId] } : {}),
      ...(appProperties ? { appProperties } : {}),
    };
    const body = [
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n`,
      content,
      `\r\n--${boundary}--`,
    ].join('');
    const path = fileId
      ? `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(fileId)}`
      : `${DRIVE_UPLOAD_API}/files`;
    const response = await this.request(`${path}?uploadType=multipart&fields=id,name,mimeType,parents`, {
      method: fileId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    return driveFileSchema.parse(await response.json() as unknown);
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    const token = await this.tokenProvider();
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${token}`);
    const response = await this.fetcher(url, { ...init, headers });
    if (!response.ok) {
      throw new DriveRequestError(
        response.status,
        response.headers.get('Retry-After'),
        await errorMessage(response),
      );
    }
    return response;
  }
}
