"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { canWrite, getProjectRole, getTaskOnlyAccess, isManager, managedProjectIds } from "@/server/access";
import { storage } from "@/lib/storage";
import { createDocScan, createMailScan, fetchAres, runDocScan, type ScanResult } from "@/server/doc-scan";
import { notifyExpenseAdded } from "@/server/notify";
import { EXPENSE_PAID_STAGE } from "@/lib/constants";
import { claimedTotals } from "@/lib/vat";
import { extractable } from "@/server/extraction";
import { getExpenseCategories, slugifyCategory } from "@/server/expense-categories";

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

/**
 * Přečte přílohy, které přišly poštou a ještě přečtené nejsou. Projekt se
 * neřeší – určí se z obsahu a potvrdí v kontrole.
 */
export async function scanInbox() {
  const user = await requireUser();
  const ids: string[] = [];

  // Přílohy z pošty – projekt se určí až ze čtení.
  const prilohy = await prisma.inboundAttachment.findMany({
    where: { mail: { ownerId: user.id }, documentId: null, scan: { is: null } },
    orderBy: { id: "asc" },
    take: 25,
    select: { id: true, mimeType: true, originalName: true },
  });
  for (const a of prilohy) {
    if (!extractable(a.mimeType, a.originalName)) continue;
    ids.push(await createMailScan(a.id, user.id));
  }

  // Nahrané doklady, které ještě nikdo nečetl – ať přišly odkudkoli.
  const managed = await managedProjectIds(user);
  const docs = await prisma.document.findMany({
    where: { projectId: { in: managed }, type: { in: ["receipt", "invoice"] }, expenseId: null, scan: { is: null } },
    orderBy: { createdAt: "asc" },
    take: 25,
    select: { id: true, projectId: true, mimeType: true, originalName: true },
  });
  for (const d of docs) {
    if (!extractable(d.mimeType, d.originalName)) continue;
    ids.push(await createDocScan(d.projectId, d.id, user.id));
  }

  after(async () => {
    // po jednom, ať se nevyčerpá limit a chyba se projeví u konkrétního dokladu
    for (const id of ids) await runDocScan(id);
  });
  revalidatePath("/doklady");
  return { count: ids.length };
}

/** Otevřené žádanky uživatele pro výběr u nabídky. */
export async function zadankyProVyber() {
  const user = await requireUser();
  const rq = await prisma.request.findMany({
    where: { project: { ownerId: user.id }, status: { notIn: ["zruseno", "objednano", "dokonceno"] } },
    orderBy: [{ createdAt: "desc" }],
    take: 120,
    select: {
      id: true,
      title: true,
      projectId: true,
      project: { select: { name: true } },
      subProject: { select: { name: true } },
    },
  });
  return rq.map((r) => ({
    id: r.id,
    title: r.title,
    projectId: r.projectId,
    place: r.subProject ? `${r.project.name} › ${r.subProject.name}` : r.project.name,
  }));
}

/** Místa, kam jde doklad z pošty zařadit (projekty a složky uživatele). */
export async function mistaProZarazeni() {
  const user = await requireUser();
  const projekty = await prisma.project.findMany({
    where: { ownerId: user.id },
    orderBy: { name: "asc" },
    select: { id: true, name: true, subProjects: { select: { id: true, name: true, parentId: true } } },
  });
  const out: { value: string; label: string }[] = [];
  for (const p of projekty) {
    out.push({ value: `${p.id}:`, label: p.name });
    const cesta = (sid: string): string => {
      const sub = p.subProjects.find((x) => x.id === sid);
      if (!sub) return p.name;
      return sub.parentId ? `${cesta(sub.parentId)} › ${sub.name}` : `${p.name} › ${sub.name}`;
    };
    for (const sub of [...p.subProjects].sort((a, b) => cesta(a.id).localeCompare(cesta(b.id), "cs")))
      out.push({ value: `${p.id}:${sub.id}`, label: cesta(sub.id) });
  }
  return out;
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
      inboundAttachment: {
        select: { id: true, originalName: true, mail: { select: { subject: true, fromName: true, fromAddress: true, ownerId: true } } },
      },
    },
  });
  if (!scan) throw new Error("Návrh nenalezen.");
  // Doklad z pošty ještě projekt nemá – právo se odvozuje od majitele schránky.
  const user = scan.projectId ? await writable(scan.projectId) : await requireUser();
  if (!scan.projectId && scan.inboundAttachment && scan.inboundAttachment.mail.ownerId !== user.id)
    throw new Error("Nemáš oprávnění.");
  const result = (scan.result ?? null) as ScanResult | null;

  // Vystavil doklad majitel projektu? Poznáme podle jeho IČO/DIČ z nastavení
  // (Fakturace a daně) – ne podle toho, kdo je zrovna přihlášený, aby to
  // spolusprávci vyhodnotilo stejně jako vlastníkovi.
  const owner = scan.projectId
    ? await prisma.project.findUnique({
        where: { id: scan.projectId },
        select: { ownerId: true, owner: { select: { billingIco: true, billingDic: true, billingName: true } } },
      })
    : await prisma.user
        .findUnique({ where: { id: user.id }, select: { billingIco: true, billingDic: true, billingName: true } })
        .then((u) => (u ? { ownerId: user.id, owner: u } : null));
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
    select: {
      id: true,
      projectId: true,
      documentId: true,
      status: true,
      expenseId: true,
      result: true,
      inboundAttachment: { select: { id: true, fileName: true, originalName: true, mimeType: true, mail: { select: { subject: true, fromName: true, fromAddress: true } } } },
    },
  });
  if (!scan) throw new Error("Návrh nenalezen.");
  if (scan.expenseId) throw new Error("Z tohoto dokladu už výdaj vznikl.");
  // Nabídka není doklad k zaúčtování – výdaj by z ní udělal náklad, který
  // nevznikl. Zakládání nabídek se dodělává (#42).
  if ((scan.result as { docKind?: string } | null)?.docKind === "nabidka")
    throw new Error("Tohle je nabídka, ne doklad k zaúčtování. Zakládání nabídek se ještě dodělává.");

  /* Doklad z pošty projekt nemá – zvolí se až tady, v kontrole. Teprve
     potvrzením se soubor přesune do projektu a vznikne dokument; do té doby
     leží v poště a nikde nepřekáží. */
  const cilovy = scan.projectId ?? String(formData.get("targetProjectId") || "");
  if (!cilovy) throw new Error("Vyber projekt.");
  const user = await writable(cilovy);
  const project = await prisma.project.findUnique({ where: { id: cilovy }, select: { ownerId: true } });
  if (!project) throw new Error("Projekt nenalezen.");

  if (!scan.projectId && scan.inboundAttachment) {
    const a = scan.inboundAttachment;
    const buf = await storage.read(a.fileName);
    const key = await storage.save(buf, a.originalName, `${project.ownerId}/${cilovy}/invoice`);
    const doc = await prisma.document.create({
      data: {
        projectId: cilovy,
        fileName: key,
        originalName: a.originalName,
        mimeType: a.mimeType,
        size: buf.length,
        type: "invoice",
        summary: `${a.mail.fromName ?? a.mail.fromAddress} · ${a.mail.subject}`.slice(0, 500),
        uploadedById: user.id,
      },
      select: { id: true },
    });
    await storage.delete(a.fileName).catch(() => undefined);
    await prisma.inboundAttachment.update({ where: { id: a.id }, data: { documentId: doc.id, fileName: key } });
    await prisma.docScan.update({ where: { id: scan.id }, data: { projectId: cilovy, documentId: doc.id } });
    scan.projectId = cilovy;
    scan.documentId = doc.id;
  }

  // dodavatel: vybraný, nebo podle IČO / názvu, případně nový z ARESu
  const ico = String(formData.get("supplierIco") || "").replace(/\D/g, "") || null;
  const dic = String(formData.get("supplierDic") || "").trim() || null;
  const supplierName = String(formData.get("supplierName") || "").trim();
  // Účet z dokladu – doplní se novému dodavateli, i tomu, kdo ho ještě nemá.
  const bankAccount = String(formData.get("supplierBankAccount") || "").trim() || null;
  let vendorId = String(formData.get("vendorId") || "") || null;
  if (vendorId === "__new") vendorId = null;
  const createVendor = formData.get("createVendor") === "1";
  if (!vendorId && (ico || supplierName)) {
    const found = await prisma.vendor.findFirst({
      where: {
        ownerId: project.ownerId,
        OR: [...(ico ? [{ ico }] : []), ...(supplierName ? [{ name: { equals: supplierName, mode: "insensitive" as const } }] : [])],
      },
      select: { id: true, bankAccount: true },
    });
    vendorId = found?.id ?? null;
    if (found && bankAccount && !found.bankAccount)
      await prisma.vendor.update({ where: { id: found.id }, data: { bankAccount } });
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
        bankAccount,
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
    category?: string | null;
    deductible?: boolean;
  }[];
  // Kategorie, kterou číselník nemá, se založí – z dialogu přijde jako "__new__:Název".
  const resolveCat = async (v: unknown, fallback: string) => {
    const raw = String(v ?? "").trim();
    if (!raw) return fallback;
    if (!raw.startsWith("__new__:")) return raw;
    const label = raw.slice(8).trim().slice(0, 40);
    if (!label) return fallback;
    const key = slugifyCategory(label);
    await prisma.expenseCategory.upsert({ where: { key }, update: { label }, create: { key, label } });
    return key;
  };
  for (const i of items) i.category = i.category ? await resolveCat(i.category, "") || null : null;

  // Do přiznání jde jen to, co je zaškrtnuté. Rekapitulace dokladu se pokrátí
  // podílem odškrtnutých položek – u plného nároku zůstanou čísla beze změny.
  const claim = claimedTotals(vatRows, items);
  const claimBase = items.some((i) => i.deductible === false) ? claim.base : num(formData.get("vatBase"));
  const claimVat = items.some((i) => i.deductible === false) ? claim.vat : num(formData.get("vatAmount"));
  const claimRows = items.some((i) => i.deductible === false) ? claim.rows : vatRows;
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
        projectId: cilovy,
        subProjectId,
        title: String(formData.get("title") || "Vystavená faktura").slice(0, 200),
        description: String(formData.get("description") || "").slice(0, 2000) || null,
        amount: total,
        currency: String(formData.get("currency") || "CZK").slice(0, 3),
        category: await resolveCat(formData.get("category"), "prodej"),
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
      projectId: cilovy,
      subProjectId,
      title: String(formData.get("title") || "Doklad").slice(0, 200),
      description: String(formData.get("description") || "").slice(0, 2000) || null,
      amount: total,
      currency: String(formData.get("currency") || "CZK").slice(0, 3),
      category: await resolveCat(formData.get("category"), "other"),
      kind: "expense",
      status: "approved",
      stage: paid ? EXPENSE_PAID_STAGE : null,
      date: date(formData.get("date")) ?? new Date(),
      dueDate: date(formData.get("dueDate")),
      taxDate: date(formData.get("taxDate")),
      docNumber: String(formData.get("docNumber") || "").slice(0, 100) || null,
      variableSymbol: String(formData.get("variableSymbol") || "").slice(0, 50) || null,
      vatBase: claimBase,
      vatAmount: claimVat,
      vatRate: claimRows.length === 1 ? claimRows[0].rate : null,
      vatBreakdown: claimRows.length ? claimRows : undefined,
      // Doklad tak, jak přišel – z něj se nárok počítá znovu při každé úpravě položek.
      vatBaseDoc: num(formData.get("vatBase")),
      vatAmountDoc: num(formData.get("vatAmount")),
      vatBreakdownDoc: vatRows.length ? vatRows : undefined,
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
          category: i.category || null,
          deductible: i.deductible !== false,
        })),
      },
    },
    select: { id: true },
  });

  if (scan.documentId)
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
  if (scan.projectId) await writable(scan.projectId);
  else await requireUser();
  await prisma.docScan.update({ where: { id }, data: { status: "dismissed" } });
  revalidatePath(`/projects/${scan.projectId}`);
}

/** Dodavatelé projektu pro výběr v dialogu (spárování dokladu). */
export async function vendorsForScan(projectId: string | null) {
  // Doklad z pošty projekt ještě nemá – dodavatelé se berou podle přihlášeného.
  const user = projectId ? await writable(projectId) : await requireUser();
  const ownerId = projectId
    ? (await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } }))?.ownerId
    : user.id;
  if (!ownerId) return [];
  return prisma.vendor.findMany({
    where: { ownerId },
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

  // Starší skeny mají v category volný text („palivo"), novější klíč („fuel").
  const cats = await getExpenseCategories();
  const bez = (x: string) => x.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const katKlic = (v: string | null | undefined) => {
    const raw = (v ?? "").trim();
    if (!raw) return null;
    return cats.find((c) => c.key === raw)?.key ?? cats.find((c) => bez(c.label) === bez(raw))?.key ?? null;
  };

  let created = 0;
  const skipped: string[] = [];
  for (const s of scans) {
    try {
      const d = await getDocScan(s.id);
      const r = d.result;
      const name = r?.number ?? d.document?.originalName ?? d.inboundAttachment?.originalName ?? "doklad";
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
      put("category", issued ? "prodej" : katKlic(r.category) ?? (r.newCategory ? `__new__:${r.newCategory}` : "other"));
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

/**
 * Potvrzení nabídky → vznikne nabídka u každé vybrané žádanky a dokument
 * u ní, ne kopie u všech (#42).
 *
 * Pokrývá-li nabídka víc žádanek, sdruží se přes společnou nabídku na
 * balíček: dokument pak leží jednou a je vidět u všech žádanek balíčku.
 */
export async function applyOfferScan(formData: FormData) {
  const scanId = String(formData.get("scanId"));
  const scan = await prisma.docScan.findUnique({
    where: { id: scanId },
    select: {
      id: true,
      projectId: true,
      documentId: true,
      inboundAttachment: {
        select: { id: true, fileName: true, originalName: true, mimeType: true, mail: { select: { subject: true, fromName: true, fromAddress: true } } },
      },
    },
  });
  if (!scan) throw new Error("Návrh nenalezen.");

  const requestIds = (JSON.parse(String(formData.get("requestIds") || "[]")) as string[]).filter(Boolean);
  if (requestIds.length === 0) throw new Error("Vyber aspoň jednu žádanku.");

  const zadanky = await prisma.request.findMany({
    where: { id: { in: requestIds } },
    select: { id: true, projectId: true, title: true, bundleId: true },
  });
  if (zadanky.length !== requestIds.length) throw new Error("Některá žádanka už neexistuje.");
  const projectId = zadanky[0].projectId;
  if (zadanky.some((r) => r.projectId !== projectId))
    throw new Error("Vybrané žádanky nejsou ze stejného projektu.");

  const user = await writable(projectId);
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { ownerId: true } });
  if (!project) throw new Error("Projekt nenalezen.");

  // dodavatel: vybraný, nebo podle IČO / názvu, případně nový z ARESu
  const ico = String(formData.get("supplierIco") || "").replace(/\D/g, "") || null;
  const dic = String(formData.get("supplierDic") || "").trim() || null;
  const supplierName = String(formData.get("supplierName") || "").trim();
  let vendorId = String(formData.get("vendorId") || "") || null;
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
  if (!vendorId && (ico || supplierName)) {
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

  const price = num(formData.get("total"));
  const priceWithoutVat = num(formData.get("vatBase"));
  const note = String(formData.get("description") || "").slice(0, 2000) || null;
  const vic = zadanky.length > 1;

  /* Dokument visí na nabídce (u jedné žádanky), nebo na společné nabídce
     balíčku (u víc žádanek) – tak leží jednou a je vidět u všech. */
  let bundleOfferId: string | null = null;
  const offerIds: string[] = [];
  if (vic) {
    // Sdružení, ve kterém už ty žádanky jsou, jinak nové.
    const existujici = zadanky.find((r) => r.bundleId)?.bundleId ?? null;
    const bundleId =
      existujici ??
      (
        await prisma.requestBundle.create({
          data: {
            projectId,
            name: zadanky.map((r) => r.title).join(" + ").slice(0, 200),
            createdById: user.id,
          },
          select: { id: true },
        })
      ).id;
    await prisma.request.updateMany({ where: { id: { in: requestIds } }, data: { bundleId } });
    const bo = await prisma.bundleOffer.create({
      data: { bundleId, vendorId, vendorName: vendorId ? null : supplierName || null, price, priceWithoutVat, note, createdById: user.id },
      select: { id: true },
    });
    bundleOfferId = bo.id;
  }

  for (const r of zadanky) {
    const o = await prisma.offer.create({
      data: {
        requestId: r.id,
        bundleOfferId,
        vendorId,
        vendorName: vendorId ? null : supplierName || null,
        // Celková cena patří balíčku; část bez vlastní ceny znamená „kryje“.
        price: vic ? null : price,
        note,
        createdById: user.id,
      },
      select: { id: true },
    });
    offerIds.push(o.id);
  }

  // Soubor z pošty se přesune do projektu a zavěsí na nabídku.
  if (!scan.documentId && scan.inboundAttachment) {
    const a = scan.inboundAttachment;
    const buf = await storage.read(a.fileName);
    const key = await storage.save(buf, a.originalName, `${project.ownerId}/${projectId}/nabidky`);
    const doc = await prisma.document.create({
      data: {
        projectId,
        offerId: bundleOfferId ? null : offerIds[0],
        bundleOfferId,
        fileName: key,
        originalName: a.originalName,
        mimeType: a.mimeType,
        size: buf.length,
        type: "offer",
        summary: `${a.mail.fromName ?? a.mail.fromAddress} · ${a.mail.subject}`.slice(0, 500),
        uploadedById: user.id,
      },
      select: { id: true },
    });
    await storage.delete(a.fileName).catch(() => undefined);
    await prisma.inboundAttachment.update({ where: { id: a.id }, data: { documentId: doc.id, fileName: key, kind: "offer" } });
  } else if (scan.documentId) {
    await prisma.document.update({
      where: { id: scan.documentId },
      data: { offerId: bundleOfferId ? null : offerIds[0], bundleOfferId, type: "offer" },
    });
  }

  // Došla nabídka → žádanka se posouvá z Poptávky na Nabídku.
  await prisma.request.updateMany({ where: { id: { in: requestIds }, status: "poptavka" }, data: { status: "nabidka" } });
  await prisma.docScan.update({ where: { id: scanId }, data: { status: "applied", projectId } });

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/doklady");
  return { offers: offerIds.length, requests: zadanky.map((r) => r.title) };
}
