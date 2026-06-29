const APP_SLUG = 'large-coveringbag-order';

export const APP_BASE_PATH = process.env.NODE_ENV === 'production' ? `/${APP_SLUG}` : '';

function normalizePath(path: string) {
  if (!path) return '/';
  return path.startsWith('/') ? path : `/${path}`;
}

export function withBasePath(path: string) {
  const normalizedPath = normalizePath(path);
  if (!APP_BASE_PATH) return normalizedPath;
  return `${APP_BASE_PATH}${normalizedPath === '/' ? '' : normalizedPath}`;
}

export function assetUrl(path: string) {
  return withBasePath(path);
}

export function apiUrl(path: string) {
  return withBasePath(path);
}
