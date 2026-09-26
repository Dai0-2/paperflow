import { afterEach, describe, expect, it, vi } from 'vitest';
import { getGoogleAccount } from '../../src/services/google/googleAuth';

vi.mock('../../src/config/buildConfig', () => ({
  buildConfig: { googleOAuthConfigured: true },
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Google account identity', () => {
  it('reads the connected account from Drive without requesting another OAuth scope', async () => {
    let requestUrl = '';
    let authorization = '';
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'dffiahjmpkmellmjijffpcofoahbccoc',
        lastError: undefined,
      },
      identity: {
        getAuthToken: (
          _details: { interactive: boolean },
          callback: (token?: string) => void,
        ) => callback('ephemeral-google-token'),
      },
    });
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requestUrl = input.toString();
      authorization = new Headers(init?.headers).get('Authorization') || '';
      return new Response(JSON.stringify({
        user: {
          displayName: 'Researcher',
          emailAddress: 'researcher@example.com',
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }));

    await expect(getGoogleAccount()).resolves.toEqual({
      displayName: 'Researcher',
      emailAddress: 'researcher@example.com',
    });
    expect(requestUrl).toContain('/drive/v3/about?fields=');
    expect(authorization).toBe('Bearer ephemeral-google-token');
  });

  it('does not include the access token in account lookup errors', async () => {
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'dffiahjmpkmellmjijffpcofoahbccoc',
        lastError: undefined,
      },
      identity: {
        getAuthToken: (
          _details: { interactive: boolean },
          callback: (token?: string) => void,
        ) => callback('never-expose-this-token'),
      },
    });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 403 })));

    await expect(getGoogleAccount()).rejects.toThrow(
      'Google Drive account details could not be loaded (HTTP 403).',
    );
    await expect(getGoogleAccount()).rejects.not.toThrow('never-expose-this-token');
  });
});
