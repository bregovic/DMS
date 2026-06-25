// Výpočet forecastu (očekávané zbývající výdaje) z žádanek a reálných výdajů.
//
// Model: forecast úkolu = jeho žádanky − reálné výdaje. Reálný výdaj navázaný na
// úkol/fázi snižuje forecast CELÉHO jeho podstromu (úkol + potomci); přebytek
// (overspend) se zahodí a nepřelévá se mimo podstrom. Výdaj navázaný přímo na
// žádanku snižuje jen tu žádanku. Reálné výdaje aplikujeme od nejhlubších úkolů
// nahoru, aby se vnitřní výdaj započítal dřív než výdaj na nadřazené fázi.

export type ForecastRequestInput = {
  price: number;
  taskId: string | null;
  subId: string | null;
  realOnRequest: number; // reálné výdaje navázané přímo na tuto žádanku
};
export type ForecastTaskInput = { id: string; parentId: string | null };
export type ForecastContrib = { amount: number; subId: string | null };

export function computeForecastContribs(
  requests: ForecastRequestInput[],
  tasks: ForecastTaskInput[],
  realByTask: Map<string, number>,
): ForecastContrib[] {
  const contribs: ForecastContrib[] = [];

  // 1) Žádanky po úkolu (netto po výdajích navázaných přímo na žádanku); bez úkolu rovnou.
  const fcByTask = new Map<string, { sum: number; subId: string | null }>();
  for (const r of requests) {
    const net = Math.max(0, r.price - r.realOnRequest);
    if (net <= 0) continue;
    if (r.taskId) {
      const g = fcByTask.get(r.taskId) ?? { sum: 0, subId: r.subId };
      g.sum += net;
      fcByTask.set(r.taskId, g);
    } else {
      contribs.push({ amount: net, subId: r.subId });
    }
  }

  // 2) Roll-up reálných výdajů na úkol přes celý podstrom.
  const baseFc = new Map<string, number>();
  const fcSub = new Map<string, string | null>();
  for (const [id, g] of fcByTask) { baseFc.set(id, g.sum); fcSub.set(id, g.subId); }

  const taskById = new Map(tasks.map((t) => [t.id, t]));
  const children = new Map<string, string[]>();
  for (const t of tasks) {
    if (t.parentId) {
      const a = children.get(t.parentId) ?? [];
      a.push(t.id);
      children.set(t.parentId, a);
    }
  }
  const depthOf = (id: string) => {
    let d = 0;
    let cur = taskById.get(id);
    while (cur?.parentId) { d++; cur = taskById.get(cur.parentId); }
    return d;
  };
  const subtreeNodes = (id: string) => {
    const out = [id];
    const stack = [...(children.get(id) ?? [])];
    while (stack.length) {
      const x = stack.pop()!;
      out.push(x);
      for (const ch of children.get(x) ?? []) stack.push(ch);
    }
    return out;
  };

  const realTasks = [...realByTask.keys()]
    .filter((id) => (realByTask.get(id) ?? 0) > 0)
    .sort((a, b) => depthOf(b) - depthOf(a));
  for (const T of realTasks) {
    let credit = realByTask.get(T) ?? 0;
    for (const n of subtreeNodes(T)) {
      if (credit <= 0) break;
      const fc = baseFc.get(n) ?? 0;
      if (fc <= 0) continue;
      const used = Math.min(credit, fc);
      baseFc.set(n, fc - used);
      credit -= used;
    }
  }

  // 3) Zbylý forecast po úkolech.
  for (const [id, fc] of baseFc) if (fc > 0) contribs.push({ amount: fc, subId: fcSub.get(id) ?? null });
  return contribs;
}
