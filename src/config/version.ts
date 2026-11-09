export const APP_VERSION = '1.2.1';
export const BUILD_NUMBER = '20261109.1042';
export const RELEASE_DATE = '2026-11-09';
export const ENVIRONMENT = import.meta.env.MODE || 'development';
export const IS_PRODUCTION = ENVIRONMENT === 'production';
export const DATABASE_SCHEMA_VERSION = '1.0';

export const getVersionInfo = () => {
  return `${APP_VERSION} (Build ${BUILD_NUMBER})`;
};
