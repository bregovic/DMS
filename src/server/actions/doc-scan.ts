"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { canWrite, getProjectRole, getTaskOnlyAccess, isManager } from "@/server/access";
import { storage } from "@/lib/storage";
import { createDocScan, fetchAres, runDocScan, type ScanResult } from "@/server/doc-scan";
import { notifyExpenseAdded } from "@/server/notify";
import { EXPENSE_PAID_STAGE } from "@/lib/constants";

async function writable(projectId: string) {
  const user = await requireUser();
  const role = await getProjectRole(projectId, user);
  if (!canWrite(role)) throw new Error("Nemáš oprávnění.");
  return user;
}

/** Spustí (nebo zopakuje) vytěžení dokladu z přílohy. */
export async function scanDocument(formData: FormData) {
  const documentId = String(formData.get("documentId"));
  const doc = await prisma.document.findUnique({ where: { id: documentId }, select: { projectId: true } });
  if (!doc) throw new Error("Příloha nenalezena.");
  const user = await writable(doc.projectId);
  const id = await createDocScan(doc.projectId, documentId, user.id);
  after(() => runDocScan(id));
  revalidatePath(`/projects/${doc.projectId}`);
  return { id };
}

/**
 * Hromadné přečtení: pustí vytěžení u všech nahraných dokladů projektu, které
 * ještě přečtené nejsou. Doklady se tak dají nahrávat průběžně a zpracovat
 * naráz.
 */
export async function scanProjectDocuments(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const user = await requireUser();
  const role = await getProjectRole(projectId, user);
  if (!canWrite(role)) return { error: "Nemáš oprávnění." };
  if (!(await mayScan(projectId, user, role))) return { error: "Vytěžování dokladů ti vlastník projektu nepovolil." };

  const docs = await prisma.document.findMany({
    where: { projectId, type: { in: ["receipt", "invoice"] }, expenseId: null, scan: { is: null } },
    orderBy: { createdAt: "asc" },
    take: 25,
    select: { id: true },
  });
  const ids: string[] = [];
  for (const d of docs) ids.push(await createDocScan(projectId, d.id, user.id));
  after(async () => {
    // po jednom, ať se nevyčerpá limit a chyba se projeví u konkrétního dokladu
    for (const id of ids) await runDocScan(id);
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/doklady");
  return { count: ids.length };
}

/** Návrh k potvrzení (pro dialog kontroly). */
export async function getDocScan(id: string) {
  const scan = await prisma.docScan.findUnique({
    where: { id },
    select: {
      id: true,
      projectId: true,
      status: true,
      error: true,
      result: true,
      expenseId: true,
      document: { select: { id: true, originalName: true, type: true } },
    },
  });
  if (!scan) throw new Error("Návrh nenalezen.");
  const user = await writable(scan.projectId);
  const result = (scan.result ?? null) as ScanResult | null;

  // Vystavil doklad majitel projektu? Poznáme podle jeho IČO/DIČ z nastavení
  // (Fakturace a daně) – ne podle toho, kdo je zrovna přihlášený, aby to
  // spolusprávci vyhodnotilo stejně jako vlastníkovi.
  const owner = await prisma.project.findUnique({
    where: { id: scan.projectId },
    select: { ownerId: true, owner: { select: { billingIco: true, billingDic: true, billingName: true } } },
  });
  const me = owner?.owner ?? null;
  const norm = (v: string | null | undefined) => (v ?? "").replace(/\s/g, "").toUpperCase().replace(/^CZ/, "");
  const myIco = norm(me?.billingIco);
  const myDic = norm(me?.billingDic);
  const mine = (ico?: string | null, dic?: string | null) =>
    (!!myIco && (norm(ico) === myIco || norm(dic) === myIco)) || (!!myDic && norm(dic) === myDic);
  const issued = !!result && mine(result.supplier?.ico, result.supplier?.dic);
  const received = !!result && mine(result.customer?.ico, result.customer?.dic);

  // Stejný doklad už v evidenci? (číslo + IČO protistrany)
  const dupNumber = result?.number?.trim() || null;
  const dupIco = (issued ? result?.customer?.ico : result?.supplier?.ico)?.replace(/\D/g, "") || null;
  let duplicate: { kind: "expense" | "income"; title: string; date: Date; amount: number; project: string } | null = null;
  if (dupNumber) {
    if (issued) {
      const hit = await prisma.income.findFirst({
        where: { project: { ownerId: owner?.ownerId }, docNumber: dupNumber, ...(dupIco ? { customerIco: dupIco } : {}) },
        select: { title: true, date: true, amount: true, project: { select: { name: true } } },
      });
      if (hit) duplicate = { kind: "income", title: hit.title, date: hit.date, amount: Number(hit.amount), project: hit.project.name };
    } else {
      const hit = await prisma.expense.findFirst({
        where: { project: { ownerId: owner?.ownerId }, docNumber: dupNumber, ...(dupIco ? { supplierIco: dupIco } : {}) },
        select: { title: true, date: true, amount: true, project: { select: { name: true } } },
      });
      if (hit) duplicate = { kind: "expense", title: hit.title, date: hit.date, amount: Number(hit.amount), project: hit.project.name };
    }
  }
  return {
    ...scan,
    result,
    // vystavený = já jsem dodavatel; přijatý = já jsem odběratel (nebo neurčeno)
    direction: issued && !received ? ("issued" as const) : ("received" as const),
    duplicate,
    myBilling: { ico: me?.billingIco ?? null, dic: me?.billingDic ?? null, name: me?.billingName ?? null },
  };
}

const num = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").replace(/\s/g, "").replace(",", ".");
  if (!s) return null;
  const x = Number(s);
  return Number.isFinite(x) ? x : null;
};
const date = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Potvrzení návrhu → vznikne výdaj s daňovými údaji a položkami.
 * Dodavatel se spáruje podle IČO (jinak podle názvu); když neexistuje a je
 * zadané IČO, založí se z ARESu.
 */
export async function applyDocScan(formData: FormData) {
  const scanId = String(formData.get("scanId"));
  const scan = await prisma.docScan.findUnique({
    where: { id: scanId },
    select: { id: true, projectId: true, documentId: true, status: true, expenseId: true },
  });
  if (!scan) throw new Error("Návrh nenalezen.");
  if (scan.expenseId) throw new Error("Z tohoto dokladu už výdaj vznikl.");
  const user = await writable(scan.projectId);
  const project = await prisma.project.findUnique({ where: { id: scan.projectId }, select: { ownerId: true } });
  if (!project) throw new Error("Projekt nenalezen.");

  // dodavatel: vybraný, nebo podle IČO / názvu, případně nový z ARESu
  const ico = String(formData.get("supplierIco") || "").replace(/\D/g, "") || null;
  const dic = String(formData.get("supplierDic") || "").trim() || null;
  const supplierName = String(formData.get("supplierName") || "").trim();
  let vendorId = String(formData.get("vendorId") || "") || null;
  if (vendorId === "__new") vendorId = null;
  const createVendor = formData.get("createVendor") === "1";
  if (!vendorId && (ico || supplierName)) {
    const found = await prisma.vendor.findFirst({
      where: {
        ownerId: project.ownerId,
        OR: [...(ico ? [{ ico }] : []), ...(supplierName ? [{ name: { equals: supplierName, mode: "insensitive" as const } }] : [])],
      },
      select: { id: true },
    });
    vendorId = found?.id ?? null;
  }
  if (!vendorId && createVendor && (ico || supplierName)) {
    const ares = ico ? await fetchAres(ico) : null;
    const v = await prisma.vendor.create({
      data: {
        ownerId: project.ownerId,
        name: (ares?.name || supplierName || ico || "Dodavatel").slice(0, 200),
        email: `${ico ?? Date.now()}@ares.local`,
        category: "other",
        ico,
        dic: dic ?? ares?.dic ?? null,
        address: ares?.address ?? null,
      },
      select: { id: true },
    });
    vendorId = v.id;
  }

  const vatRows = JSON.parse(String(formData.get("vatRows") || "[]")) as { rate: number; base: number; vat: number }[];
  const items = JSON.parse(String(formData.get("items") || "[]")) as {
    description: string;
    quantity: number | null;
    unit: string | null;
    unitPrice: number | null;
    amount: number;
    vatRate: number | null;
  }[];
  const total = num(formData.get("total")) ?? 0;
  const paid = formData.get("paid") === "1";
  const subProjectId = String(formData.get("subProjectId") || "") || null;
  const issued = formData.get("direction") === "issued";
  const force = formData.get("force") === "1";

  // Pojistka proti dvojímu zaúčtování stejného dokladu
  const dupNum = String(formData.get("docNumber") || "").trim();
  if (dupNum && !force) {
    const dupIcoRaw = String(formData.get(issued ? "customerIco" : "supplierIco") || "").replace(/\D/g, "");
    const exists = issued
      ? await prisma.income.findFirst({
          where: { project: { ownerId: project.ownerId }, docNumber: dupNum, ...(dupIcoRaw ? { customerIco: dupIcoRaw } : {}) },
          select: { id: true },
        })
      : await prisma.expense.findFirst({
          where: { project: { ownerId: project.ownerId }, docNumber: dupNum, ...(dupIcoRaw ? { supplierIco: dupIcoRaw } : {}) },
          select: { id: true },
        });
    if (exists) throw new Error(`Doklad č. ${dupNum} od téhle protistrany už v evidenci je. Když ho chceš přesto založit, potvrď to v dialogu.`);
  }

  // Vystavený doklad = příjem a uskutečněné plnění (do DPH na výstupu)
  if (issued) {
    const income = await prisma.income.create({
      data: {
        projectId: scan.projectId,
        subProjectId,
        title: String(formData.get("title") || "Vystavená faktura").slice(0, 200),
        description: String(formData.get("description") || "").slice(0, 2000) || null,
        amount: total,
        currency: String(formData.get("currency") || "CZK").slice(0, 3),
        category: String(formData.get("category") || "prodej"),
        date: date(formData.get("date")) ?? new Date(),
        dueDate: date(formData.get("dueDate")),
        taxDate: date(formData.get("taxDate")),
        docNumber: String(formData.get("docNumber") || "").slice(0, 100) || null,
        vatBase: num(formData.get("vatBase")),
        vatAmount: num(formData.get("vatAmount")),
        vatBreakdown: vatRows.length ? vatRows : undefined,
        exchangeRate: num(formData.get("exchangeRate")),
        customerName: String(formData.get("customerName") || "").slice(0, 200) || null,
        customerIco: String(formData.get("customerIco") || "").replace(/\D/g, "") || null,
        customerDic: String(formData.get("customerDic") || "").trim() || null,
        taxable: formData.get("deductible") !== "0",
        documentId: scan.documentId,
        createdById: user.id,
      },
      select: { id: true },
    });
    await prisma.docScan.update({ where: { id: scan.id }, data: { status: "applied" } });
    revalidatePath(`/projects/${scan.projectId}`);
    revalidatePath("/dph");
    revalidatePath("/doklady");
    return { incomeId: income.id };
  }

  const expense = await prisma.expense.create({
    data: {
      projectId: scan.projectId,
      subProjectId,
      title: String(formData.get("title") || "Doklad").slice(0, 200),
      description: String(formData.get("description") || "").slice(0, 2000) || null,
      amount: total,
      currency: String(formData.get("currency") || "CZK").slice(0, 3),
      category: String(formData.get("category") || "other"),
      kind: "expense",
      status: "approved",
      stage: paid ? EXPENSE_PAID_STAGE : null,
      date: date(formData.get("date")) ?? new Date(),
      dueDate: date(formData.get("dueDate")),
      taxDate: date(formData.get("taxDate")),
      docNumber: String(formData.get("docNumber") || "").slice(0, 100) || null,
      variableSymbol: String(formData.get("variableSymbol") || "").slice(0, 50) || null,
      vatBase: num(formData.get("vatBase")),
      vatAmount: num(formData.get("vatAmount")),
      vatRate: vatRows.length === 1 ? vatRows[0].rate : null,
      vatBreakdown: vatRows.length ? vatRows : undefined,
      exchangeRate: num(formData.get("exchangeRate")),
      supplierIco: ico,
      supplierDic: dic,
      deductible: formData.get("deductible") !== "0",
      vendorId,
      createdById: user.id,
      items: {
        create: items.slice(0, 100).map((i, idx) => ({
          line: idx,
          description: String(i.description || "").slice(0, 300) || "Položka",
          quantity: i.quantity ?? null,
          unit: i.unit ?? null,
          unitPrice: i.unitPrice ?? null,
          amount: i.amount ?? 0,
          vatRate: i.vatRate ?? null,
        })),
      },
    },
    select: { id: true },
  });

  await prisma.document.update({ where: { id: scan.documentId }, data: { expenseId: expense.id } });
  // porovnání nakoupených položek s ceníkem katalogu (na pozadí)
  after(async () => {
    const { checkExpensePrices } = await import("@/server/price-check");
    await checkExpensePrices(expense.id).catch(() => []);
  });
  await prisma.docScan.update({ where: { id: scan.id }, data: { status: "applied", expenseId: expense.id } });
  await notifyExpenseAdded([expense.id], user.id);
  revalidatePath(`/projects/${scan.projectId}`);
  revalidatePath("/payments");
  return { expenseId: expense.id };
}

/** Zahodit návrh (doklad zůstane jako příloha). */
export async function dismissDocScan(formData: FormData) {
  const id = String(formData.get("id"));
  const scan = await prisma.docScan.findUnique({ where: { id }, select: { projectId: true } });
  if (!scan) return;
  await writable(scan.projectId);
  await prisma.docScan.update({ where: { id }, data: { status: "dismissed" } });
  revalidatePath(`/projects/${scan.projectId}`);
}

/** Dodavatelé projektu pro výběr v dialogu (spárování dokladu). */
export async function vendorsForScan(projectId: string) {
  const user = await writable(projectId);
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } });
  void user;
  if (!project) return [];
  return prisma.vendor.findMany({
    where: { ownerId: project.ownerId },
    orderBy: { name: "asc" },
    select: { id: true, name: true, ico: true },
  });
}

/**
 * Naskenovaný doklad od dodavatele: kdo smí do projektu zapisovat, a taky
 * dodavatel, který v projektu má jen přidělené úkoly. Soubor se uloží jako
 * příloha a rovnou se přečte; výdaj z něj založí správce po kontrole.
 */
/** Vlastník a spolusprávci projektu – jim chodí oznámení o nových dokladech. */
async function managerIds(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, ownerId: true, memberships: { where: { role: "member" }, select: { email: true } } },
  });
  if (!project) return null;
  const emails = project.memberships.map((m) => m.email);
  const members = emails.length
    ? await prisma.user.findMany({ where: { email: { in: emails, mode: "insensitive" } }, select: { id: true } })
    : [];
  return { name: project.name, ownerId: project.ownerId, ids: [project.ownerId, ...members.map((m) => m.id)] };
}

/** Smí tenhle člověk spustit vytěžení? Vlastník, spolusprávce, nebo komu to vlastník povolil. */
async function mayScan(projectId: string, user: { id: string; email?: string | null }, role: string | null) {
  if (isManager(role)) return true;
  const email = user.email?.toLowerCase();
  if (!email) return false;
  const m = await prisma.projectMembership.findFirst({
    where: { projectId, email: { equals: email, mode: "insensitive" }, canScan: true },
    select: { id: true },
  });
  return !!m;
}

export async function uploadReceipt(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Vyber nebo vyfoť soubor.");
  if (file.size > 14 * 1024 * 1024) throw new Error("Soubor je větší než 14 MB.");

  const role = await getProjectRole(projectId, user);
  const taskOnly = role ? null : await getTaskOnlyAccess(projectId, user);
  if (!canWrite(role) && !taskOnly) throw new Error("K tomuhle projektu nemáš přístup.");

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } });
  if (!project) throw new Error("Projekt nenalezen.");
  const docType = formData.get("type") === "invoice" ? "invoice" : "receipt";
  const buffer = Buffer.from(await file.arrayBuffer());
  const key = await storage.save(buffer, file.name, `${project.ownerId}/${projectId}/${docType}`);
  const doc = await prisma.document.create({
    data: {
      projectId,
      fileName: key,
      originalName: file.name,
      mimeType: file.type || "application/octet-stream",
      size: file.size,
      type: docType,
      uploadedById: user.id,
      note: String(formData.get("note") || "").slice(0, 300) || null,
    },
    select: { id: true },
  });
  // Doklady se nečtou samy – nahrají se a vytěžení se pouští v přehledu
  // (po jednom, nebo celá dávka). Správcům dáme vědět, že přibyl doklad.
  if (!isManager(role)) {
    const mgr = await managerIds(projectId);
    if (mgr) {
      const { notifyUsers } = await import("@/server/notify");
      await notifyUsers(
        mgr.ids.filter((id) => id !== user.id),
        {
          kind: "doc_uploaded",
          title: `Nový doklad od ${user.name ?? user.email ?? "dodavatele"}`,
          body: `${mgr.name} · ${file.name}`,
          href: "/doklady",
          projectId,
          dedupeKey: `docup:${doc.id}`,
        },
      );
    }
  }
  revalidatePath("/ukoly");
  revalidatePath("/doklady");
  revalidatePath(`/projects/${projectId}`);
  return { scanId: null as string | null };
}

/** Projekty, kam smím poslat doklad (mám přístup nebo tam mám úkoly). */
export async function projectsForReceipts() {
  const user = await requireUser();
  const { listProjectsForUser } = await import("@/server/access");
  const access = await listProjectsForUser(user);
  const list = access.filter((a) => canWrite(a.role) || a.role === "task");
  const email = user.email?.toLowerCase();
  const allowed = email
    ? new Set(
        (
          await prisma.projectMembership.findMany({
            where: { projectId: { in: list.map((a) => a.project.id) }, email: { equals: email, mode: "insensitive" }, canScan: true },
            select: { projectId: true },
          })
        ).map((m) => m.projectId),
      )
    : new Set<string>();
  return list
    .map((a) => ({
      id: a.project.id,
      name: a.project.name,
      // čte se rovnou (vlastník/spolusprávce nebo povolené vytěžování), jinak to zpracuje majitel
      autoRead: isManager(a.role) || allowed.has(a.project.id),
      // přístup jen k úkolům = projekt si otevřít nemůže, doklad pošle odsud
      taskOnly: a.role === "task",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "cs"));
}

/** Moje odeslané doklady a jejich stav. */
/**
 * Co jsem sem poslal já: doklady podle nahraných souborů. Status je stav
 * zpracování – sám doklad může jen čekat, až ho majitel projektu zpracuje.
 */
export async function myReceipts() {
  const user = await requireUser();
  const docs = await prisma.document.findMany({
    where: { uploadedById: user.id, type: { in: ["receipt", "invoice"] } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      originalName: true,
      createdAt: true,
      projectId: true,
      expenseId: true,
      project: { select: { name: true } },
      scan: { select: { id: true, status: true, result: true, expenseId: true } },
    },
  });
  return docs.map((d) => {
    const r = (d.scan?.result ?? null) as { supplier?: { name?: string }; total?: number } | null;
    const done = !!d.expenseId || !!d.scan?.expenseId;
    return {
      id: d.id,
      status: done ? "applied" : (d.scan?.status ?? "uploaded"),
      createdAt: d.createdAt,
      fileName: d.originalName,
      project: d.project.name,
      supplier: r?.supplier?.name ?? null,
      total: r?.total ?? null,
      done,
    };
  });
}

/**
 * Hromadné založení: z každého přečteného dokladu vznikne výdaj (nebo příjem
 * u vlastní faktury) se stejnými výchozími hodnotami, jaké nabízí kontrola.
 * Duplicity a doklady, kde chybí částka, se přeskočí a vrátí se seznam –
 * ty je potřeba projít ručně.
 */
export async function applyReadyScans(formData: FormData) {
  const projectId = String(formData.get("projectId"));
  const user = await requireUser();
  const role = await getProjectRole(projectId, user);
  if (!canWrite(role)) return { error: "Nemáš oprávnění." };

  const scans = await prisma.docScan.findMany({
    where: { projectId, status: "ready", expenseId: null },
    orderBy: { createdAt: "asc" },
    take: 25,
    select: { id: true },
  });

  let created = 0;
  const skipped: string[] = [];
  for (const s of scans) {
    try {
      const d = await getDocScan(s.id);
      const r = d.result;
      const name = r?.number ?? d.document.originalName;
      if (!r) {
        skipped.push(`${name} – není co založit`);
        continue;
      }
      if (d.duplicate) {
        skipped.push(`${name} – už v evidenci`);
        continue;
      }
      if (r.total == null) {
        skipped.push(`${name} – nepřečetla se částka`);
        continue;
      }
      const issued = d.direction === "issued";
      const fd = new FormData();
      const put = (k: string, v: unknown) => fd.set(k, v == null ? "" : String(v));
      put("scanId", s.id);
      put("title", r.title ?? r.supplier?.name ?? "Doklad");
      put("description", r.summary ?? "");
      put("direction", issued ? "issued" : "received");
      put("supplierName", r.supplier?.name ?? "");
      put("supplierIco", r.supplier?.ico ?? "");
      put("supplierDic", r.supplier?.dic ?? "");
      put("customerName", r.customer?.name ?? "");
      put("customerIco", r.customer?.ico ?? "");
      put("customerDic", r.customer?.dic ?? "");
      put("createVendor", issued ? "0" : "1");
      put("docNumber", r.number ?? "");
      put("date", r.issueDate ?? "");
      put("taxDate", r.taxDate ?? r.issueDate ?? "");
      put("dueDate", r.dueDate ?? "");
      put("variableSymbol", r.variableSymbol ?? "");
      put("currency", r.currency || "CZK");
      put("exchangeRate", r.exchangeRate ?? "");
      put("total", r.total);
      put("vatBase", r.totalBase ?? "");
      put("vatAmount", r.totalVat ?? "");
      put("category", issued ? "prodej" : "other");
      put("deductible", "1");
      put("paid", r.docType === "receipt" ? "1" : "0");
      fd.set("vatRows", JSON.stringify(r.vatBreakdown ?? []));
      fd.set("items", JSON.stringify(r.items ?? []));
      await applyDocScan(fd);
      created += 1;
    } catch (e) {
      skipped.push(e instanceof Error ? e.message : "doklad se nepodařilo založit");
    }
  }
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/doklady");
  return { created, skipped };
}
