declare const __PAPERFLOW_GOOGLE_OAUTH_CONFIGURED__: boolean;

export const buildConfig = Object.freeze({
  googleOAuthConfigured:
    typeof __PAPERFLOW_GOOGLE_OAUTH_CONFIGURED__ !== 'undefined'
    && __PAPERFLOW_GOOGLE_OAUTH_CONFIGURED__,
});
