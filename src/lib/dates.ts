export function todayYM() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

export function ymFromDateISO(dateISO: string) {
  return dateISO.slice(0, 7);
}
