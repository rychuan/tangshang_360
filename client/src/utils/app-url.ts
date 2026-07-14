export function buildAppBaseUrl(origin: string, basePath: string): string {
  const normalizedOrigin = origin.replace(/\/+$/, '');
  const normalizedPath = basePath.replace(/^\/+|\/+$/g, '');
  return normalizedPath
    ? `${normalizedOrigin}/${normalizedPath}`
    : normalizedOrigin;
}

export function getAppBaseUrl(): string {
  return buildAppBaseUrl(
    window.location.origin,
    process.env.CLIENT_BASE_PATH || '/',
  );
}
