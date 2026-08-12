export const APP_VERSION = '1.0.14';
export const BUILD_NUMBER = '20260812.1526';
export const RELEASE_DATE = '2026-08-12';
export const ENVIRONMENT = import.meta.env.MODE || 'development';
export const IS_PRODUCTION = ENVIRONMENT === 'production';
export const DATABASE_SCHEMA_VERSION = '1.0';

export const getVersionInfo = () => {
  return `${APP_VERSION} (Build ${BUILD_NUMBER})`;
};
