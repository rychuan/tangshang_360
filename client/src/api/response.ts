export function unwrapApiData<T>(value: unknown): T {
  if (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error?: { message?: unknown } }).error?.message ===
      'string'
  ) {
    throw new Error((value as { error: { message: string } }).error.message);
  }

  if (typeof value === 'object' && value !== null && 'data' in value) {
    return (value as { data: T }).data;
  }

  return value as T;
}
