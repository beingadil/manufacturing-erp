export const APP_VERSION = '1.0.9';
export const BUILD_NUMBER = '20260809.2';
export const RELEASE_DATE = '2026-08-09';
export const ENVIRONMENT = import.meta.env.MODE || 'development';
export const IS_PRODUCTION = ENVIRONMENT === 'production';
export const DATABASE_SCHEMA_VERSION = '1.0';

export const getVersionInfo = () => {
  return `${APP_VERSION} (Build ${BUILD_NUMBER})`;
};
