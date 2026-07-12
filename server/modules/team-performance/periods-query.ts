export function parsePeriodsQuery(
  periods?: string | string[],
): string[] | undefined {
  if (periods == null) return undefined;

  const values = (Array.isArray(periods) ? periods : [periods])
    .flatMap((period) => period.split(','))
    .map((period) => period.trim())
    .filter(Boolean);

  return values.length > 0 ? values : undefined;
}
