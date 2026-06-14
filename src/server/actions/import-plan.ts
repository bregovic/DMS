"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { parseAnyDate, type ProjectPlan, type PlanTask } from "@/lib/plan";
import { getExpenseCategories, slugifyCategory } from "@/server/expense-categories";
import { getProjectAccess, canImportProject, fullAccessProjectIds } from "@/server/access";

export type PlanImportSummary = {
  projekt: string;
  newProjects: number;
  subProjects: { created: number; updated: number };
  vendors: { created: number; matchedByIco: number; matchedByEmail: number; fromAres: number };
  requests: { created: number; updated: number };
  offers: { created: number; updated: number; selected: number };
  phases: { created: number; updated: number };
  tasks: { created: number; updated: number };
  expenses: { created: number; updated: number };
  warnings: string[];
};

export type PlanImportState =
  | { error?: string; summary?: PlanImportSummary }
  | undefined;

function norm(s: string) {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();
}

// Dotažení subjektu z ARES (server-side). Vrací název, DIČ, adresu nebo null.
async function fetchAres(
  ico: string,
): Promise<{ name: string | null; dic: string | null; address: string | null } | null> {
  const clean = ico.replace(/\D/g, "");
  if (clean.length < 1 || clean.length > 8) return null;
  try {
    const res = await fetch(
      `https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/${clean}`,
      { headers: { Accept: "application/json" }, cache: "no-store" },
    );
    if (!res.ok) return null;
    const d = (await res.json()) as {
      obchodniJmeno?: string;
      dic?: string;
      sidlo?: { textovaAdresa?: string };
    };
    return {
      name: d.obchodniJmeno ?? null,
      dic: d.dic ?? null,
      address: d.sidlo?.textovaAdresa ?? null,
    };
  } catch {
    return null;
  }
}

export async function importPlanJson(
  _prev: PlanImportState,
  formData: FormData,
): Promise<PlanImportState> {
  const user = await requireUser();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Vyber soubor plánu (.json)." };
  }

  let plan: ProjectPlan;
  try {
    plan = JSON.parse(await file.text());
  } catch {
    return { error: "Soubor není platný JSON." };
  }
  if (!plan || typeof plan !== "object" || !plan.projekt?.nazev) {
    return { error: "Soubor není projektový plán DMS (chybí projekt.nazev)." };
  }

  const warnings: string[] = [];
  const sum: PlanImportSummary = {
    projekt: plan.projekt.nazev,
    newProjects: 0,
    subProjects: { created: 0, updated: 0 },
    vendors: { created: 0, matchedByIco: 0, matchedByEmail: 0, fromAres: 0 },
    requests: { created: 0, updated: 0 },
    offers: { created: 0, updated: 0, selected: 0 },
    phases: { created: 0, updated: 0 },
    tasks: { created: 0, updated: 0 },
    expenses: { created: 0, updated: 0 },
    warnings,
  };

  // --- Projekt (podle id, jinak podle názvu, jinak založ) ---
  // Importovat smí vlastník i plný člen projektu (active). Dodavatelé patří
  // vlastníkovi projektu (ne nutně importujícímu).
  let projectId: string | null = null;
  let projectOwnerId = user.id;
  if (plan.projekt.id) {
    const p = await prisma.project.findUnique({
      where: { id: plan.projekt.id },
      select: { id: true, ownerId: true },
    });
    if (p) {
      const access = await getProjectAccess(p.id, user);
      if (!canImportProject(access)) {
        return { error: "Do tohoto projektu nemáš oprávnění importovat." };
      }
      projectId = p.id;
      projectOwnerId = p.ownerId;
    }
  }
  if (!projectId) {
    // shoda názvu mezi projekty s plným přístupem (vlastní + členství)
    const accessibleIds = [...(await fullAccessProjectIds(user))];
    const existing = accessibleIds.length
      ? await prisma.project.findFirst({
          where: { id: { in: accessibleIds }, name: plan.projekt.nazev },
          select: { id: true, ownerId: true },
        })
      : null;
    if (existing) {
      projectId = existing.id;
      projectOwnerId = existing.ownerId;
    }
  }
  if (!projectId) {
    const p = await prisma.project.create({
      data: {
        ownerId: user.id,
        name: plan.projekt.nazev,
        type: plan.projekt.typ || "other",
      },
      select: { id: true },
    });
    projectId = p.id;
    projectOwnerId = user.id;
    sum.newProjects++;
  }
  const PID = projectId;

  // --- Dodavatelé: párování IČO → e-mail → název; auto-založení z ARES ---
  const byIco = new Map<string, string>(); // ico -> vendorId
  const byEmail = new Map<string, string>(); // email -> vendorId

  async function resolveVendor(opts: {
    ico?: string | null;
    email?: string | null;
    name?: string | null;
  }): Promise<string | null> {
    const ico = (opts.ico || "").replace(/\D/g, "") || null;
    const email = (opts.email || "").trim().toLowerCase() || null;
    if (!ico && !email && !opts.name) return null;

    if (ico && byIco.has(ico)) return byIco.get(ico)!;
    if (email && byEmail.has(email)) return byEmail.get(email)!;

    if (ico) {
      const v = await prisma.vendor.findFirst({
        where: { ownerId: projectOwnerId, ico },
        select: { id: true, email: true },
      });
      if (v) {
        byIco.set(ico, v.id);
        if (v.email) byEmail.set(v.email.toLowerCase(), v.id);
        sum.vendors.matchedByIco++;
        return v.id;
      }
    }
    if (email) {
      const v = await prisma.vendor.findFirst({
        where: { ownerId: projectOwnerId, email },
        select: { id: true, ico: true },
      });
      if (v) {
        byEmail.set(email, v.id);
        // doplň IČO, pokud chybělo
        if (ico && !v.ico) {
          await prisma.vendor.update({ where: { id: v.id }, data: { ico } }).catch(() => {});
        }
        if (ico) byIco.set(ico, v.id);
        sum.vendors.matchedByEmail++;
        return v.id;
      }
    }

    // Založení nového dodavatele (potřebuje e-mail kvůli unikátnosti).
    const finalEmail = email || (ico ? `${ico}@ares.local` : null);
    if (!finalEmail) return null; // bez e-mailu i IČO nelze – necháme volný text

    let aresName: string | null = null;
    let dic: string | null = null;
    let address: string | null = null;
    if (ico) {
      const ares = await fetchAres(ico);
      if (ares) {
        aresName = ares.name;
        dic = ares.dic;
        address = ares.address;
        sum.vendors.fromAres++;
      }
    }
    const name = (opts.name || aresName || email || ico || "Dodavatel")!.trim();
    try {
      const v = await prisma.vendor.create({
        data: {
          ownerId: projectOwnerId,
          email: finalEmail,
          name,
          ico,
          dic,
          address,
          category: "other",
        },
        select: { id: true },
      });
      if (ico) byIco.set(ico, v.id);
      byEmail.set(finalEmail.toLowerCase(), v.id);
      sum.vendors.created++;
      return v.id;
    } catch {
      return null;
    }
  }

  // Předzpracuj seznam dodavatelů (enrichment z ARES proběhne jednou) + dostupnost.
  for (const d of plan.dodavatele ?? []) {
    const vid = await resolveVendor({ ico: d.ico, email: d.email, name: d.nazev });
    if (vid && d.dostupnost?.length) {
      for (const a of d.dostupnost) {
        const date = new Date(a.datum);
        if (isNaN(date.getTime())) continue;
        await prisma.vendorAvailability.upsert({
          where: { vendorId_date: { vendorId: vid, date } },
          create: { vendorId: vid, date, available: !!a.dostupny },
          update: { available: !!a.dostupny },
        });
      }
    }
  }

  // --- Složky (subprojekty) ---
  const subKeyToId = new Map<string, string>(); // ref|id -> subProjectId
  const subParentRef = new Map<string, string>(); // subProjectId -> rodicRef
  for (const s of plan.slozky ?? []) {
    let id: string | null = null;
    if (s.id) {
      const ex = await prisma.subProject.findFirst({
        where: { id: s.id, projectId: PID },
        select: { id: true },
      });
      if (ex) {
        await prisma.subProject.update({
          where: { id: ex.id },
          data: { name: s.nazev, description: s.popis ?? null },
        });
        id = ex.id;
        sum.subProjects.updated++;
      }
    }
    if (!id) {
      const ex = await prisma.subProject.findFirst({
        where: { projectId: PID, name: s.nazev },
        select: { id: true },
      });
      if (ex) {
        id = ex.id;
      } else {
        const created = await prisma.subProject.create({
          data: { projectId: PID, name: s.nazev, description: s.popis ?? null, createdById: user.id },
          select: { id: true },
        });
        id = created.id;
        sum.subProjects.created++;
      }
    }
    if (s.ref) subKeyToId.set(s.ref, id);
    if (s.id) subKeyToId.set(s.id, id);
    if (s.rodicRef) subParentRef.set(id, s.rodicRef);
  }
  // Nastav rodiče (druhý průchod, ať existují obě strany).
  for (const [childId, parentRef] of subParentRef) {
    const parentId = subKeyToId.get(parentRef);
    if (parentId && parentId !== childId) {
      await prisma.subProject.update({ where: { id: childId }, data: { parentId } }).catch(() => {});
    }
  }
  const resolveSub = (ref: string | null | undefined) =>
    (ref && subKeyToId.get(ref)) || null;

  // --- Kategorie výdajů (label -> key) ---
  const catCache = new Map<string, string>();
  for (const c of await getExpenseCategories()) catCache.set(norm(c.label), c.key);
  async function resolveCategory(label: string | null | undefined): Promise<string> {
    const l = (label || "").trim();
    if (!l) return "other";
    // přijmi i přímo zadaný key
    if (catCache.has(norm(l))) return catCache.get(norm(l))!;
    const known = [...catCache.values()];
    if (known.includes(l)) return l;
    const key = slugifyCategory(l);
    await prisma.expenseCategory.upsert({ where: { key }, update: { label: l }, create: { key, label: l } });
    catCache.set(norm(l), key);
    return key;
  }

  // --- Žádanky + nabídky ---
  const reqKeyToId = new Map<string, string>();
  const offerKeyToId = new Map<string, string>();
  const taskKeyToId = new Map<string, string>(); // ref|id úkolu/fáze -> id
  const taskDepRefs: { taskId: string; refs: string[] }[] = []; // závislosti (2. průchod)
  const reqTaskRefs: { rid: string; ref: string }[] = []; // navázání žádanky na úkol (2. průchod)
  for (const z of plan.zadanky ?? []) {
    if (!z.nazev) continue;
    const subId = resolveSub(z.slozkaRef);
    const data = {
      title: z.nazev,
      description: z.popis ?? null,
      startDate: parseAnyDate(z.start),
      requiredDate: parseAnyDate(z.termin),
      leadDays: z.dodaciLhutaDny != null && isFinite(z.dodaciLhutaDny) ? Math.round(z.dodaciLhutaDny) : null,
      status: z.stav || "poptavka",
      subProjectId: subId,
      unit: z.jednotka || "ks",
      category: z.kategorie || "other",
      quantity: z.mnozstvi != null && isFinite(z.mnozstvi) ? z.mnozstvi : null,
    };
    let rid: string | null = null;
    if (z.id) {
      const ex = await prisma.request.findFirst({
        where: { id: z.id, projectId: PID },
        select: { id: true },
      });
      if (ex) {
        await prisma.request.update({ where: { id: ex.id }, data });
        rid = ex.id;
        sum.requests.updated++;
      }
    }
    if (!rid) {
      const created = await prisma.request.create({
        data: { ...data, projectId: PID, createdById: user.id },
        select: { id: true },
      });
      rid = created.id;
      sum.requests.created++;
    }
    if (z.ref) reqKeyToId.set(z.ref, rid);
    if (z.id) reqKeyToId.set(z.id, rid);
    if (z.ukolRef) reqTaskRefs.push({ rid, ref: z.ukolRef });

    // Nabídky této žádanky
    let selectedOffer: { id: string; vendorId: string | null; price: number | null } | null = null;
    for (const o of z.nabidky ?? []) {
      const vendorId = await resolveVendor({
        ico: o.dodavatelIco,
        email: o.dodavatelEmail,
        name: o.dodavatelNazev,
      });
      const odata = {
        requestId: rid,
        vendorId,
        vendorName: vendorId ? null : o.dodavatelNazev ?? null,
        price: o.cena != null && isFinite(o.cena) ? o.cena : null,
        deliveryDate: parseAnyDate(o.terminDodani),
        note: o.komentar ?? null,
        rating: o.hodnoceni ?? null,
        score: o.body != null && isFinite(o.body) ? Math.round(o.body) : null,
        status: o.stav || "nova",
        selected: false,
      };
      let oid: string | null = null;
      if (o.id) {
        const ex = await prisma.offer.findFirst({
          where: { id: o.id, requestId: rid },
          select: { id: true },
        });
        if (ex) {
          await prisma.offer.update({ where: { id: ex.id }, data: odata });
          oid = ex.id;
          sum.offers.updated++;
        }
      }
      if (!oid) {
        const created = await prisma.offer.create({ data: { ...odata, createdById: user.id }, select: { id: true } });
        oid = created.id;
        sum.offers.created++;
      }
      if (o.ref) offerKeyToId.set(o.ref, oid);
      if (o.id) offerKeyToId.set(o.id, oid);
      if (o.vybrana) selectedOffer = { id: oid, vendorId, price: odata.price };
    }

    // Vybraná nabídka → označit, ostatní odznačit, předvyplnit žádanku.
    if (selectedOffer) {
      await prisma.offer.updateMany({ where: { requestId: rid }, data: { selected: false } });
      await prisma.offer.update({
        where: { id: selectedOffer.id },
        data: { selected: true, status: "vybrana" },
      });
      await prisma.request.update({
        where: { id: rid },
        data: {
          ...(selectedOffer.vendorId ? { vendorId: selectedOffer.vendorId } : {}),
          ...(selectedOffer.price != null ? { price: selectedOffer.price } : {}),
        },
      });
      sum.offers.selected++;
    }
  }

  // --- Fáze + úkoly ---
  async function upsertTask(
    t: PlanTask,
    kind: "phase" | "task",
    parentId: string | null,
  ): Promise<string | null> {
    if (!t.nazev) return null;
    const vendorId =
      t.dodavatelIco || t.dodavatelEmail
        ? await resolveVendor({ ico: t.dodavatelIco, email: t.dodavatelEmail })
        : null;
    const data: {
      title: string; assigneeEmail: string | null; startDate: Date | null;
      dueDate: Date | null; status: string; subProjectId: string | null;
      kind: "phase" | "task"; parentId: string | null;
      priority?: string | null; profession?: string | null;
      estimateDays?: number | null; percentDone?: number; vendorId?: string | null;
    } = {
      title: t.nazev,
      assigneeEmail: (t.komu || "").trim().toLowerCase() || null,
      startDate: parseAnyDate(t.start),
      dueDate: parseAnyDate(t.termin),
      status: t.stav || "todo",
      subProjectId: resolveSub(t.slozkaRef),
      kind,
      parentId,
    };
    if (t.priorita !== undefined)
      data.priority = ["high", "medium", "low"].includes(t.priorita || "") ? t.priorita : null;
    if (t.profese !== undefined) data.profession = (t.profese || "").trim() || null;
    if (t.odhadDni !== undefined)
      data.estimateDays = t.odhadDni != null && isFinite(t.odhadDni) ? Math.round(t.odhadDni) : null;
    if (t.hotovoProcent !== undefined)
      data.percentDone =
        t.hotovoProcent != null && isFinite(t.hotovoProcent)
          ? Math.max(0, Math.min(100, Math.round(t.hotovoProcent)))
          : 0;
    if (t.dodavatelIco !== undefined || t.dodavatelEmail !== undefined) data.vendorId = vendorId;

    let id: string | null = null;
    if (t.id) {
      const ex = await prisma.task.findFirst({ where: { id: t.id, projectId: PID }, select: { id: true } });
      if (ex) {
        await prisma.task.update({ where: { id: ex.id }, data });
        if (kind === "phase") sum.phases.updated++;
        else sum.tasks.updated++;
        id = ex.id;
      }
    }
    if (!id) {
      const created = await prisma.task.create({ data: { ...data, projectId: PID, createdById: user.id }, select: { id: true } });
      if (kind === "phase") sum.phases.created++;
      else sum.tasks.created++;
      id = created.id;
    }
    if (t.ref) taskKeyToId.set(t.ref, id);
    if (t.id) taskKeyToId.set(t.id, id);
    if (t.navazuje?.length) taskDepRefs.push({ taskId: id, refs: t.navazuje });
    return id;
  }

  for (const f of plan.faze ?? []) {
    const phaseId = await upsertTask(f, "phase", null);
    if (!phaseId) continue;
    for (const u of f.ukoly ?? []) {
      // dílčí úkol dědí složku z fáze, pokud nemá vlastní
      await upsertTask({ ...u, slozkaRef: u.slozkaRef ?? f.slozkaRef }, "task", phaseId);
    }
  }
  for (const u of plan.ukoly ?? []) {
    await upsertTask(u, "task", null);
  }

  // --- Závislosti mezi úkoly/fázemi (2. průchod – ref→id) ---
  for (const { taskId, refs } of taskDepRefs) {
    const depIds = [
      ...new Set(refs.map((r) => taskKeyToId.get(r)).filter((x): x is string => !!x)),
    ].filter((d) => d !== taskId);
    await prisma.taskDependency.deleteMany({ where: { taskId } });
    if (depIds.length) {
      await prisma.taskDependency.createMany({
        data: depIds.map((dependsOnId) => ({ taskId, dependsOnId })),
        skipDuplicates: true,
      });
    }
  }
  // --- Navázání žádanek na úkol/fázi (2. průchod) ---
  for (const { rid, ref } of reqTaskRefs) {
    const tid = taskKeyToId.get(ref);
    if (tid) await prisma.request.update({ where: { id: rid }, data: { taskId: tid } });
  }

  // --- Výdaje (realizace plánu) ---
  for (const v of plan.vydaje ?? []) {
    const amount = Number(v.castka);
    if (!v.nazev || !isFinite(amount)) continue;
    const vendorId = await resolveVendor({ ico: v.dodavatelIco, email: v.dodavatelEmail });
    let requestId = (v.zadankaRef && reqKeyToId.get(v.zadankaRef)) || null;
    const offerId = (v.nabidkaRef && offerKeyToId.get(v.nabidkaRef)) || null;
    if (!requestId && offerId) {
      const off = await prisma.offer.findUnique({ where: { id: offerId }, select: { requestId: true } });
      requestId = off?.requestId ?? null;
    }
    const data = {
      title: v.nazev,
      amount,
      currency: v.mena || "CZK",
      category: await resolveCategory(v.kategorie),
      date: parseAnyDate(v.datum) ?? new Date(),
      subProjectId: resolveSub(v.slozkaRef),
      taskId: (v.ukolRef && taskKeyToId.get(v.ukolRef)) || null,
      vendorId,
      requestId,
      offerId,
    };
    let didUpdate = false;
    if (v.id) {
      const ex = await prisma.expense.findFirst({ where: { id: v.id, projectId: PID }, select: { id: true } });
      if (ex) {
        await prisma.expense.update({ where: { id: ex.id }, data });
        sum.expenses.updated++;
        didUpdate = true;
      }
    }
    if (!didUpdate) {
      await prisma.expense.create({ data: { ...data, projectId: PID, createdById: user.id } });
      sum.expenses.created++;
    }
  }

  // Propoj dodavatele s projektem (pro přehlednost).
  const allVendorIds = [...new Set([...byIco.values(), ...byEmail.values()])];
  if (allVendorIds.length) {
    await prisma.project
      .update({ where: { id: PID }, data: { vendors: { connect: allVendorIds.map((id) => ({ id })) } } })
      .catch(() => {});
  }

  revalidatePath(`/projects/${PID}`);
  revalidatePath("/projects");
  revalidatePath("/planning");
  revalidatePath("/vendors");
  revalidatePath("/dashboard");

  return { summary: sum };
}
