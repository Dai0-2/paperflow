import { buildConfig } from '../../config/buildConfig';

export type GoogleAuthErrorCode =
  | 'not-configured'
  | 'not-supported'
  | 'not-authorized'
  | 'authorization-failed';

export class GoogleAuthError extends Error {
  constructor(readonly code: GoogleAuthErrorCode, message: string) {
    super(message);
    this.name = 'GoogleAuthError';
  }
}

function assertAuthAvailable(): void {
  if (!buildConfig.googleOAuthConfigured) {
    throw new GoogleAuthError(
      'not-configured',
      'Google Drive sync is not configured in this build.',
    );
  }
  if (typeof chrome === 'undefined' || !chrome.identity?.getAuthToken) {
    throw new GoogleAuthError(
      'not-supported',
      'Google Drive authorization is only available inside the Chrome extension.',
    );
  }
}

export function getGoogleAuthToken(interactive: boolean): Promise<string> {
  assertAuthAvailable();
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        reject(new GoogleAuthError(
          interactive ? 'authorization-failed' : 'not-authorized',
          runtimeError.message || 'Google Drive authorization failed.',
        ));
        return;
      }
      if (!token) {
        reject(new GoogleAuthError(
          interactive ? 'authorization-failed' : 'not-authorized',
          interactive ? 'Google Drive authorization returned no access token.' : 'Google Drive is not connected.',
        ));
        return;
      }
      resolve(token);
    });
  });
}

export async function clearGoogleAuthToken(token?: string): Promise<void> {
  if (typeof chrome === 'undefined' || !chrome.identity?.removeCachedAuthToken) return;
  const current = token || await getGoogleAuthToken(false).catch(() => '');
  if (!current) return;
  await new Promise<void>((resolve) => {
    chrome.identity.removeCachedAuthToken({ token: current }, () => resolve());
  });
}

export const googleAuth = {
  isConfigured: () => buildConfig.googleOAuthConfigured,
  connect: () => getGoogleAuthToken(true),
  getToken: () => getGoogleAuthToken(false),
  disconnect: clearGoogleAuthToken,
};
