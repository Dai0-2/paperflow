import { describe, expect, it } from 'vitest';
import { DriveClient, type DriveFetch } from '../../src/services/google/driveClient';

describe('Google Drive client', () => {
  it('uses bearer tokens, escapes queries, and follows list pagination', async () => {
    const requests: Array<{ url: string; authorization: string | null }> = [];
    const fetcher: DriveFetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      requests.push({
        url,
        authorization: new Headers(init?.headers).get('Authorization'),
      });
      const secondPage = new URL(url).searchParams.get('pageToken') === 'next-page';
      return new Response(JSON.stringify(secondPage
        ? { files: [{ id: 'file-2', name: "author's paper", mimeType: 'application/json' }] }
        : {
            nextPageToken: 'next-page',
            files: [{ id: 'file-1', name: "author's paper", mimeType: 'application/json' }],
          }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    const client = new DriveClient(async () => 'ephemeral-token', fetcher);

    const files = await client.listByName('folder-1', "author's paper", 'application/json');

    expect(files.map((file) => file.id)).toEqual(['file-1', 'file-2']);
    expect(requests).toHaveLength(2);
    expect(requests.every((request) => request.authorization === 'Bearer ephemeral-token')).toBe(true);
    expect(new URL(requests[0].url).searchParams.get('q')).toContain("name = 'author\\'s paper'");
    expect(requests[1].url).toContain('pageToken=next-page');
  });

  it('surfaces Drive status and retry guidance without exposing the token', async () => {
    const client = new DriveClient(
      async () => 'never-log-this-token',
      async () => new Response(JSON.stringify({
        error: { message: 'Rate limit exceeded.' },
      }), {
        status: 429,
        headers: { 'Retry-After': '15' },
      }),
    );

    await expect(client.downloadText('file-1')).rejects.toMatchObject({
      status: 429,
      retryAfter: '15',
      message: 'Rate limit exceeded.',
    });
  });

  it('reads Drive changes and advances resumable uploads from HTTP 308', async () => {
    const requests: string[] = [];
    const fetcher: DriveFetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      requests.push(`${init?.method || 'GET'} ${url}`);
      if (url.includes('/changes/startPageToken')) {
        return new Response(JSON.stringify({ startPageToken: 'start-1' }), { status: 200 });
      }
      if (url.includes('/changes?')) {
        return new Response(JSON.stringify({
          newStartPageToken: 'start-2',
          changes: [{
            fileId: 'batch-file',
            file: {
              id: 'batch-file',
              name: 'opaque.pfo',
              mimeType: 'application/vnd.paperflow.encrypted+json',
              appProperties: {
                paperflowVault: 'vault-1',
                paperflowType: 'batch',
                paperflowLogicalId: 'batch-1',
              },
            },
          }],
        }), { status: 200 });
      }
      if (url.includes('uploadType=resumable')) {
        return new Response(null, {
          status: 200,
          headers: { Location: 'https://upload.example/session-1' },
        });
      }
      if (url === 'https://upload.example/session-1') {
        return new Response(null, {
          status: 308,
          headers: { Range: 'bytes=0-2' },
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    };
    const client = new DriveClient(async () => 'token', fetcher);

    expect(await client.getStartPageToken()).toBe('start-1');
    const changes = await client.listChanges('start-1');
    expect(changes.newStartPageToken).toBe('start-2');
    const session = await client.createResumableUpload({
      parentId: 'folder-1',
      name: 'opaque.pfo',
      mimeType: 'application/vnd.paperflow.encrypted+json',
      appProperties: { paperflowType: 'blob' },
      size: 6,
    });
    expect(await client.uploadResumableChunk(
      session,
      new Uint8Array([1, 2, 3]),
      0,
      6,
    )).toEqual({ complete: false, nextOffset: 3 });
    expect(requests.some((request) => request.includes('pageToken=start-1'))).toBe(true);
  });
});
