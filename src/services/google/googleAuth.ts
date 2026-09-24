import { buildConfig } from '../../config/buildConfig';

const PRODUCTION_EXTENSION_ID = 'dffiahjmpkmellmjijffpcofoahbccoc';

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
  if (chrome.runtime?.id && chrome.runtime.id !== PRODUCTION_EXTENSION_ID) {
    throw new GoogleAuthError(
      'not-configured',
      `Google Drive sign-in requires the stable PaperFlow extension ID. This build is ${chrome.runtime.id}; install the device-test or Chrome Web Store build (${PRODUCTION_EXTENSION_ID}).`,
    );
  }
}

export function getGoogleAuthToken(interactive: boolean): Promise<string> {
  assertAuthAvailable();
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      const runtimeError = chrome.runtime.lastError;
      if (runtimeError) {
        const detail = runtimeError.message || 'Google Drive authorization failed.';
        reject(new GoogleAuthError(
          interactive ? 'authorization-failed' : 'not-authorized',
          /oauth|client id|bad client/i.test(detail)
            ? `${detail} Verify that this build uses extension ID ${PRODUCTION_EXTENSION_ID} and the configured Chrome OAuth client.`
            : detail,
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
