export function euro(n: number) {
  const v = Number.isFinite(n) ? n : 0;
  return `€ ${v.toFixed(2).replace(".", ",")}`;
}

export function parseNumber(v: string) {
  const parsed = Number(String(v).trim().replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}
