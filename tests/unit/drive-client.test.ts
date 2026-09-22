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
});
