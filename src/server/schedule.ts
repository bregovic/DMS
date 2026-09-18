import { prisma } from "@/lib/prisma";
import { TASK_DONE_STATUSES } from "@/lib/constants";

const DAY_MS = 86400000;

/*
 * Plánovač termínů (Přepočítat termíny). Interní modul – NE "use server":
 * volá se jen ze serverových akcí po kontrole oprávnění (i z vykazování
 * dodavatele, který sám přepočet spouštět nesmí).
 */
/** Přepočítá termíny celé složky/projektu.
 *  Plánovací jednotky = fáze + samostatné úkoly (bez rodiče). Řadí se podle
 *  návazností (TaskDependency) a pořadí fází; neukotvená fáze jde hned za
 *  předchozí, první od začátku projektu. Skutečnost má přednost (hotové drží
 *  skutečné datumy, rozpracované končí nejdřív dnes). Pravidla na jednotku:
 *   1) ručně uzamčený termín (dateLocked) = kotva, nepřepisuje se;
 *   2) hotový samostatný úkol = kotva (drží reálná data);
 *   3) fáze s dílčími úkoly → délku řídí úkoly (respektují dostupnost dodavatele);
 *   4) jednotka s odhadem dní + dodavatelem → naplánuje se dle jeho dostupnosti
 *      (nedostupné dny posunou termín), jinak kalendářní dny od kurzoru;
 *   5) jednotka bez odhadu dní → drží délku, jde za předchůdcem (hotová jen dopředu). */
export async function scheduleProject(projectId: string, subProjectId: string | null) {
  const tasks = await prisma.task.findMany({
    where: { projectId, ...(subProjectId ? { subProjectId } : {}) },
    select: {
      id: true, kind: true, parentId: true, estimateDays: true, status: true,
      vendorId: true, startDate: true, dueDate: true, dateLocked: true, createdAt: true,
      actualStart: true, actualEnd: true,
      dependsOn: { select: { dependsOnId: true } },
    },
  });
  const byId = new Map(tasks.map((t) => [t.id, t]));
  // Začátek projektu = kotva plánu: první fáze (a úkoly bez návaznosti a bez
  // pevného termínu) začínají od něj – i zpětně, když se plán zapisuje podle
  // skutečnosti. Změna začátku projektu tak přeplánuje vše, co není ukotvené.
  const proj = await prisma.project.findUnique({ where: { id: projectId }, select: { startDate: true } });
  const PROJECT_START = proj?.startDate
    ? Date.UTC(proj.startDate.getUTCFullYear(), proj.startDate.getUTCMonth(), proj.startDate.getUTCDate())
    : null;

  // dílčí úkoly fází (řazené dle vzniku)
  const childrenOf = new Map<string, typeof tasks>();
  for (const t of tasks)
    if (t.kind === "task" && t.parentId) {
      const a = childrenOf.get(t.parentId) ?? [];
      a.push(t);
      childrenOf.set(t.parentId, a);
    }
  for (const [, arr] of childrenOf) arr.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  // plánovací jednotky = fáze + samostatné úkoly (bez rodiče)
  const units = tasks.filter((t) => t.kind === "phase" || (t.kind === "task" && !t.parentId));
  const unitIds = new Set(units.map((u) => u.id));

  // dostupnost dodavatelů (jen volné dny), seřazené
  const vendorIds = [...new Set(tasks.map((t) => t.vendorId).filter((v): v is string => !!v))];
  const availMap = new Map<string, number[]>();
  if (vendorIds.length) {
    const rows = await prisma.vendorAvailability.findMany({
      where: { vendorId: { in: vendorIds }, available: true },
      select: { vendorId: true, date: true },
    });
    for (const r of rows) {
      const a = availMap.get(r.vendorId) ?? [];
      a.push(r.date.getTime());
      availMap.set(r.vendorId, a);
    }
    for (const [, a] of availMap) a.sort((x, y) => x - y);
  }
  // od `fromMs` najdi `dur` volných dnů dodavatele → {start,end}; null když nemá kalendář
  const bookAvail = (vendorId: string | null, fromMs: number, dur: number) => {
    if (!vendorId) return null;
    const arr = availMap.get(vendorId);
    if (!arr || !arr.length) return null;
    let i = 0;
    while (i < arr.length && arr[i] < fromMs) i++;
    const slice = arr.slice(i, i + dur);
    if (!slice.length) return null; // žádná dostupnost od cursoru → fallback na kalendář
    return { start: slice[0], end: slice[slice.length - 1] };
  };

  // topologické pořadí jednotek dle návazností (cykly se přeskočí)
  const pred = new Map<string, string[]>(
    units.map((u) => [u.id, u.dependsOn.map((d) => d.dependsOnId).filter((x) => unitIds.has(x))]),
  );
  // Auto-sekvence fází: každá fáze implicitně navazuje na předchozí (dle pořadí
  // startu, pak vzniku), aby posun jedné fáze posunul i následující – i bez
  // ručního „Navazuje na". Posun je jen dopředu (jako zbytek plánovače).
  const phaseSeq = units
    .filter((u) => u.kind === "phase")
    .sort(
      (a, b) =>
        (a.startDate?.getTime() ?? a.createdAt.getTime()) -
        (b.startDate?.getTime() ?? b.createdAt.getTime()),
    );
  // Výslovné „Navazuje na“ = přilepit hned za předchůdce (co nejdřív).
  // Takové fáze nedostávají implicitní návaznost na předchozí fázi podle data.
  const explicitPred = new Set(units.filter((u) => (pred.get(u.id) ?? []).length > 0).map((u) => u.id));
  for (let i = 1; i < phaseSeq.length; i++) {
    if (explicitPred.has(phaseSeq[i].id)) continue;
    const p = pred.get(phaseSeq[i].id)!;
    if (!p.includes(phaseSeq[i - 1].id)) p.push(phaseSeq[i - 1].id);
  }
  const indeg = new Map(units.map((u) => [u.id, pred.get(u.id)!.length]));
  const radj = new Map<string, string[]>(units.map((u) => [u.id, []]));
  for (const u of units) for (const pr of pred.get(u.id)!) radj.get(pr)?.push(u.id);
  const queue = units.filter((u) => indeg.get(u.id) === 0).map((u) => u.id);
  const order: string[] = [];
  while (queue.length) {
    const x = queue.shift()!;
    order.push(x);
    for (const n of radj.get(x) ?? []) { indeg.set(n, indeg.get(n)! - 1); if (indeg.get(n) === 0) queue.push(n); }
  }
  for (const u of units) if (!order.includes(u.id)) order.push(u.id);

  const done = (s: string) => TASK_DONE_STATUSES.includes(s);
  const now = new Date();
  const TODAY = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  /**
   * Datumy podle skutečnosti, nebo null (plánuje se dál podle odhadu).
   * Hotový úkol se skutečným koncem: skutečný začátek–konec. Rozpracovaný:
   * skutečný (jinak plánovaný) začátek a konec podle odhadu, ale nejdřív
   * dnes – co se protáhlo, posune vše, co na to navazuje.
   */
  const actualDates = (t: {
    status: string; estimateDays: number | null; startDate: Date | null; dueDate: Date | null;
    actualStart: Date | null; actualEnd: Date | null;
  }) => {
    const day = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    if (done(t.status) && t.actualEnd) {
      const e = day(t.actualEnd);
      const s0 = t.actualStart ? day(t.actualStart) : t.startDate ? day(t.startDate) : e;
      return { s: Math.min(s0, e), e };
    }
    if (t.status === "in_progress") {
      const s = t.actualStart ? day(t.actualStart) : t.startDate ? day(t.startDate) : null;
      if (s == null) return null;
      // délka podle plánu (termín − začátek), jinak odhad dní; od skutečného začátku
      const len = t.startDate && t.dueDate ? day(t.dueDate) - day(t.startDate) : (Math.max(t.estimateDays ?? 1, 1) - 1) * DAY_MS;
      const planned = s + Math.max(len, 0);
      return { s, e: Math.max(planned, s, TODAY) };
    }
    return null;
  };
  const uStart = new Map<string, number>();
  const uDue = new Map<string, number>();
  const upd: { id: string; start: Date; due: Date }[] = [];

  for (const uid of order) {
    const u = byId.get(uid)!;
    const preds = pred.get(uid) ?? [];
    const predEnd = preds.length ? Math.max(...preds.map((x) => uDue.get(x) ?? TODAY)) : null;
    const depFloor = predEnd != null ? predEnd + DAY_MS : null;
    const curS = u.startDate?.getTime() ?? null;
    const curE = u.dueDate?.getTime() ?? null;

    const kids = childrenOf.get(uid) ?? [];
    const isPhaseWithKids = u.kind === "phase" && kids.length > 0;

    // 1) Ručně uzamčený termín = kotva; 2) hotový samostatný úkol = kotva.
    //    Fáze s dětmi se NEanchoruje – děti se musí naplánovat. Zámek u fáze
    //    pinuje jen ZAČÁTEK, konec se i tak řídí dílčími úkoly.
    if (
      !isPhaseWithKids &&
      (u.dateLocked || (u.kind !== "phase" && done(u.status))) &&
      (curS != null || curE != null)
    ) {
      const s = curS ?? curE!;
      const e = curE ?? curS!;
      uStart.set(uid, s);
      uDue.set(uid, e);
      continue;
    }

    // 3) Fáze s dílčími úkoly: děti se plánují od začátku fáze, konec fáze = z dětí.
    //    Uzamčená fáze drží svůj START (pin); konec se přesto počítá z úkolů.
    if (isPhaseWithKids) {
      const lockedStart = u.dateLocked && curS != null ? curS : null;
      let cursor =
        lockedStart != null
          ? lockedStart
          : depFloor != null
            ? depFloor // neukotvená fáze: hned za předchůdcem (výslovným i podle pořadí)
            : (PROJECT_START ?? curS ?? TODAY); // první fáze od začátku projektu
      const dates: { start: number; end: number }[] = [];
      for (const k of kids) {
        let s: number, e: number;
        // Kotva: hotový úkol NEBO ručně uzamčený termín (dateLocked) drží svá
        // data; ostatní se skládají za sebou dle odhadu dní. Díky tomu jde
        // u dílčího úkolu zafixovat vlastní termín a nepřepíše ho přeplánování.
        const real = actualDates(k);
        if (real) {
          // Podle skutečnosti: hotový drží skutečné datumy, rozpracovaný
          // skutečný začátek a konec nejdřív dnes – navazující se posunou.
          s = real.s;
          e = real.e;
          cursor = Math.max(cursor, e + DAY_MS);
          if (k.startDate?.getTime() !== s || k.dueDate?.getTime() !== e)
            upd.push({ id: k.id, start: new Date(s), due: new Date(e) });
        } else if ((done(k.status) || k.dateLocked) && k.dueDate) {
          s = (k.startDate ?? k.dueDate).getTime();
          e = k.dueDate.getTime();
          cursor = Math.max(cursor, e + DAY_MS);
        } else {
          const dur = Math.max(k.estimateDays ?? 1, 1);
          // Nezačatá práce se plánuje podle pořadí – i do minulosti (plán
          // zpětně podle dokumentace); co je po termínu, zčervená.
          const av = bookAvail(k.vendorId, cursor, dur);
          if (av) { s = av.start; e = av.end; } // dle dostupnosti dodavatele
          else { s = cursor; e = s + (dur - 1) * DAY_MS; } // kalendářní dny
          cursor = e + DAY_MS;
          upd.push({ id: k.id, start: new Date(s), due: new Date(e) });
        }
        dates.push({ start: s, end: e });
      }
      const kidsStart = dates.length ? Math.min(...dates.map((d) => d.start)) : (lockedStart ?? depFloor ?? curS ?? TODAY);
      const kidsDue = dates.length ? Math.max(...dates.map((d) => d.end)) : kidsStart;
      const effStart = lockedStart != null ? lockedStart : kidsStart;
      const effDue = kidsDue; // konec fáze vždy podle dílčích úkolů
      uStart.set(uid, effStart);
      uDue.set(uid, effDue);
      if (u.startDate?.getTime() !== effStart || u.dueDate?.getTime() !== effDue)
        upd.push({ id: uid, start: new Date(effStart), due: new Date(effDue) });
      continue;
    }

    // 3b) Samostatný úkol podle skutečnosti (hotový / rozpracovaný).
    const realU = u.kind !== "phase" ? actualDates(u) : null;
    if (realU) {
      uStart.set(uid, realU.s);
      uDue.set(uid, realU.e);
      if (curS !== realU.s || curE !== realU.e) upd.push({ id: uid, start: new Date(realU.s), due: new Date(realU.e) });
      continue;
    }

    // 4) Samostatný úkol (nebo prázdná fáze) s odhadem dní → plán dle dostupnosti.
    const hasDur = (u.estimateDays ?? 0) > 0;
    if (hasDur && !(u.kind === "phase" && done(u.status))) {
      const cursor = depFloor ?? (u.dateLocked ? curS : null) ?? PROJECT_START ?? curS ?? TODAY;
      const dur = Math.max(u.estimateDays!, 1);
      const av = bookAvail(u.vendorId, cursor, dur);
      const s = av ? av.start : cursor;
      const e = av ? av.end : s + (dur - 1) * DAY_MS;
      uStart.set(uid, s);
      uDue.set(uid, e);
      if (curS !== s || curE !== e) upd.push({ id: uid, start: new Date(s), due: new Date(e) });
      continue;
    }

    // 5) Bez odhadu dní: drží délku, posune se jen když ho předchůdce tlačí dál.
    if (curS == null && curE == null) continue; // není co plánovat
    const dur = curS != null && curE != null ? curE - curS : 0;
    let s = curS ?? curE!;
    // hotová fáze drží skutečné datumy – nepřilepuje se
    if (depFloor != null && (s < depFloor || !done(u.status))) s = depFloor;
    const e = s + dur;
    uStart.set(uid, s);
    uDue.set(uid, e);
    if (curS !== s || curE !== e) upd.push({ id: uid, start: new Date(s), due: new Date(e) });
  }

  if (upd.length)
    await prisma.$transaction(
      upd.map((u) =>
        prisma.task.update({
          where: { id: u.id },
          data: { startDate: u.start, dueDate: u.due },
        }),
      ),
    );
}
