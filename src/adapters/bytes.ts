const UNITS: Record<string, number> = {
  b: 1,
  byte: 1,
  bytes: 1,
  k: 1024,
  kb: 1024,
  kib: 1024,
  m: 1024 ** 2,
  mb: 1024 ** 2,
  mib: 1024 ** 2,
  g: 1024 ** 3,
  gb: 1024 ** 3,
  gib: 1024 ** 3,
  t: 1024 ** 4,
  tb: 1024 ** 4,
  tib: 1024 ** 4,
};

export function toNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      return Number.parseInt(trimmed, 10);
    }
  }

  return undefined;
}

export function parseHumanBytes(value: string): number | undefined {
  const bytesMatch = value.match(/([0-9]+)\s+bytes?/i);
  if (bytesMatch) {
    return Number.parseInt(bytesMatch[1], 10);
  }

  const unitMatch = value.trim().match(/^([0-9]+(?:\.[0-9]+)?)\s*([kmgt]i?b?|bytes?|b)$/i);
  if (!unitMatch) {
    return undefined;
  }

  const amount = Number.parseFloat(unitMatch[1]);
  const unit = unitMatch[2].toLowerCase();
  const multiplier = UNITS[unit];

  return multiplier ? Math.round(amount * multiplier) : undefined;
}

export function formatBytes(bytes: number | undefined): string {
  if (bytes === undefined) {
    return "unknown";
  }

  const units = ["B", "KiB", "MiB", "GiB", "TiB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}
