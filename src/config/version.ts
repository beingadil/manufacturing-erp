export const APP_VERSION = '1.0.20';
export const BUILD_NUMBER = '20260817.0118';
export const RELEASE_DATE = '2026-08-17';
export const ENVIRONMENT = import.meta.env.MODE || 'development';
export const IS_PRODUCTION = ENVIRONMENT === 'production';
export const DATABASE_SCHEMA_VERSION = '1.0';

export const getVersionInfo = () => {
  return `${APP_VERSION} (Build ${BUILD_NUMBER})`;
};
