"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { notifyExpenseAdded } from "@/server/notify";
import { deleteWithFiles } from "@/server/document-files";
import { getProjectRole, getProjectAccess, expandScope, isManager, canWrite, managedProjectIds } from "@/server/access";
import { assertUploadQuota } from "@/server/upload-quota";
import { storage } from "@/lib/storage";
import { EXPENSE_PAID_STAGE, EXPENSE_TOPAY_STAGE } from "@/lib/constants";
import { prepocetNaroku } from "@/server/expense-claim";

function num(v: FormDataEntryValue | null): number | null {
  if (v == null) return null;
  const n = parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
  return isNaN(n) ? null : n;
}

export async function createExpense(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));

  const access = await getProjectAccess(projectId, user);
  if (!access || !canWrite(access.role)) {
    throw new Error("Nemáš oprávnění přidávat do tohoto projektu.");
  }

  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("Zadej název.");

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { ownerId: true },
  });
  if (!project) throw new Error("Projekt nenalezen.");

  // Dodavatel (komu výdaj patří) – jen vlastníka projektu (izolace mezi účty).
  let vendorId = String(formData.get("vendorId") || "") || null;
  if (vendorId) {
    const v = await prisma.vendor.findFirst({
      where: { id: vendorId, ownerId: project.ownerId },
      select: { id: true },
    });
    if (!v) vendorId = null;
  }
  // Spolupracovník (ne vlastník/spolusprávce), který dodavatele nevybral, zadává
  // svoji práci/útratu → doplní se jeho karta podle e-mailu (kvůli účtu k platbě).
  if (!vendorId && !isManager(access.role) && user.email) {
    const mine = await prisma.vendor.findFirst({
      where: { ownerId: project.ownerId, email: { equals: user.email, mode: "insensitive" } },
      select: { id: true },
    });
    vendorId = mine?.id ?? null;
  }

  let subProjectId = String(formData.get("subProjectId") || "") || null;
  if (subProjectId) {
    const sub = await prisma.subProject.findFirst({
      where: { id: subProjectId, projectId },
      select: { id: true },
    });
    if (!sub) subProjectId = null;
  }

  // Denní strop nahrávání ohlídat dřív, než vznikne výdaj – jinak by výdaj
  // zůstal založený a akce spadla až na skenu.
  const scan = formData.get("file");
  if (scan instanceof File && scan.size > 0) await assertUploadQuota(user, projectId, scan.size);

  // Per-subprojekt přístup: smí přidávat jen do své složky (a jejích pod-složek)
  if (access.scopeSubIds) {
    const scope = await expandScope(projectId, access.scopeSubIds);
    if (!subProjectId || !scope.has(subProjectId)) {
      throw new Error("Do této složky nemáš oprávnění přidávat.");
    }
  }

  const amountMode = String(formData.get("amountMode") || "fixed");
  let amount: number | null;
  let hours: number | null = null;
  let rate: number | null = null;

  if (amountMode === "hourly") {
    hours = num(formData.get("hours"));
    rate = num(formData.get("rate"));
    if (!hours || hours <= 0 || !rate || rate <= 0) {
      throw new Error("Zadej počet hodin a hodinovou sazbu.");
    }
    amount = Math.round(hours * rate * 100) / 100;
    // Ulož sazbu k dodavateli (návrh pro příště)
    if (vendorId) {
      await prisma.vendor
        .update({ where: { id: vendorId }, data: { hourlyRate: rate } })
        .catch(() => {});
    }
  } else {
    amount = num(formData.get("amount"));
    if (!amount || amount <= 0) throw new Error("Zadej částku.");
  }

  /* Příjem se ukládá jako záporná částka. Díky tomu všechny existující
     součty (projekt, dashboard, reporty, platby) rovnou dávají saldo
     a nemusí se nikde upravovat. */
  if (String(formData.get("isIncome") || "") === "on") amount = -Math.abs(amount);

  const dateStr = String(formData.get("date") || "");
  const date = dateStr ? new Date(dateStr) : new Date();
  const status = "approved"; // schvalování zrušeno – vše rovnou platné

  const dueStr = String(formData.get("dueDate") || "");
  const due = dueStr ? new Date(dueStr) : null;
  const variableSymbol =
    String(formData.get("variableSymbol") || "").trim() || null;

  // Ochrana proti dvojímu odeslání: stejný název+částka v projektu od téhož
  // uživatele během posledních 20 s považuj za duplicitu a přeskoč.
  const dup = await prisma.expense.findFirst({
    where: {
      projectId,
      createdById: user.id,
      title,
      amount,
      createdAt: { gte: new Date(Date.now() - 20000) },
    },
    select: { id: true },
  });
  if (dup) {
    revalidatePath(`/projects/${projectId}`);
    return;
  }

  const expense = await prisma.expense.create({
    data: {
      projectId,
      title,
      kind: String(formData.get("kind") || "expense"),
      category: String(formData.get("category") || "other"),
      currency: String(formData.get("currency") || "CZK"),
      description: String(formData.get("description") || "").trim() || null,
      amount,
      hours,
      rate,
      date: isNaN(date.getTime()) ? new Date() : date,
      dueDate: due && !isNaN(due.getTime()) ? due : null,
      variableSymbol,
      stage: String(formData.get("stage") || "").trim() || null,
      vendorId,
      subProjectId,
      status,
      createdById: user.id,
    },
    select: { id: true },
  });

  // Volitelný sken přímo k položce
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    if (file.size > 8 * 1024 * 1024) {
      throw new Error("Sken je větší než 8 MB.");
    }
    const docType = String(formData.get("scanType") || "receipt");
    const buffer = Buffer.from(await file.arrayBuffer());
    const key = await storage.save(
      buffer,
      file.name,
      `${project.ownerId}/${projectId}/${docType}`,
    );
    await prisma.document.create({
      data: {
        projectId,
        expenseId: expense.id,
        fileName: key,
        originalName: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        type: docType,
        uploadedById: user.id,
      },
    });
  }

  await notifyExpenseAdded([expense.id], user.id);
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/vendors");
}

export async function updateExpense(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));

  if (!isManager(await getProjectRole(projectId, user))) {
    throw new Error("Upravit výdaj může jen vlastník projektu.");
  }

  const existing = await prisma.expense.findFirst({
    where: { id, projectId },
    select: { id: true, subProjectId: true, project: { select: { ownerId: true } } },
  });
  if (!existing) throw new Error("Výdaj nenalezen.");

  const title = String(formData.get("title") || "").trim();
  if (!title) throw new Error("Zadej název.");

  let vendorId = String(formData.get("vendorId") || "") || null;
  if (vendorId) {
    const v = await prisma.vendor.findFirst({
      where: { id: vendorId, ownerId: existing.project.ownerId },
      select: { id: true },
    });
    if (!v) vendorId = null;
  }

  let subProjectId = String(formData.get("subProjectId") || "") || null;

  /* Přesun do jiného projektu nebo složky. Hodnota je "projectId:subProjectId"
     (prázdná část za dvojtečkou = kořen projektu). Napříč projekty se musí
     přestěhovat i přílohy – dokument visí na projektu, ne na výdaji – a zahodit
     vazby na úkol, žádanku, nabídku a fakturu, protože ty zůstaly ve zdrojovém
     projektu. Klíče souborů v úložišti se nepřepisují: jsou to jen cesty a
     dokument si na ně dál ukazuje. */
  const moveTo = String(formData.get("moveTo") || "");
  let cilProjectId = projectId;
  if (moveTo) {
    const [mp, ms] = moveTo.split(":");
    if (mp && mp !== projectId) {
      if (!isManager(await getProjectRole(mp, user))) throw new Error("Do toho projektu nemáš přístup.");
      cilProjectId = mp;
    }
    subProjectId = ms || null;
  } else if (!formData.has("subProjectId")) {
    // Vyhledávání nikdo nedokončil (rozepsaný text bez výběru) – zařazení se
    // nemění. Jinak by výdaj tiše vypadl ze složky.
    subProjectId = existing.subProjectId;
  }
  if (subProjectId) {
    const sub = await prisma.subProject.findFirst({
      where: { id: subProjectId, projectId: cilProjectId },
      select: { id: true },
    });
    if (!sub) subProjectId = null;
  }
  const presun = cilProjectId !== projectId;

  const amountMode = String(formData.get("amountMode") || "fixed");
  let amount: number | null;
  let hours: number | null = null;
  let rate: number | null = null;

  if (amountMode === "hourly") {
    hours = num(formData.get("hours"));
    rate = num(formData.get("rate"));
    if (!hours || hours <= 0 || !rate || rate <= 0) {
      throw new Error("Zadej počet hodin a hodinovou sazbu.");
    }
    amount = Math.round(hours * rate * 100) / 100;
    if (vendorId) {
      await prisma.vendor
        .update({ where: { id: vendorId }, data: { hourlyRate: rate } })
        .catch(() => {});
    }
  } else {
    amount = num(formData.get("amount"));
    if (!amount || amount <= 0) throw new Error("Zadej částku.");
  }

  /* Příjem se ukládá jako záporná částka. Díky tomu všechny existující
     součty (projekt, dashboard, reporty, platby) rovnou dávají saldo
     a nemusí se nikde upravovat. */
  if (String(formData.get("isIncome") || "") === "on") amount = -Math.abs(amount);

  const dateStr = String(formData.get("date") || "");
  const date = dateStr ? new Date(dateStr) : new Date();
  const dueStr = String(formData.get("dueDate") || "");
  const due = dueStr ? new Date(dueStr) : null;
  const variableSymbol =
    String(formData.get("variableSymbol") || "").trim() || null;

  // Položky dokladu: kategorie a co jde do přiznání. Přepočet nároku je
  // sdílený s přehledem DPH (server/expense-claim.ts).
  const itemsRaw = String(formData.get("items") || "");
  const vat = itemsRaw
    ? await prepocetNaroku(
        id,
        JSON.parse(itemsRaw) as { id: string; category: string | null; deductible: boolean }[],
      )
    : null;

  await prisma.expense.update({
    where: { id },
    data: {
      ...(vat ?? {}),
      title,
      kind: String(formData.get("kind") || "expense"),
      category: String(formData.get("category") || "other"),
      currency: String(formData.get("currency") || "CZK"),
      description: String(formData.get("description") || "").trim() || null,
      amount,
      hours,
      rate,
      date: isNaN(date.getTime()) ? new Date() : date,
      dueDate: due && !isNaN(due.getTime()) ? due : null,
      variableSymbol,
      stage: String(formData.get("stage") || "").trim() || null,
      vendorId,
      subProjectId,
      ...(presun
        ? { projectId: cilProjectId, taskId: null, requestId: null, offerId: null, invoiceId: null }
        : {}),
      // Daňová pole jen u dokladu, který je má – jinak by se formulář bez nich
      // tvářil, že je uživatel vymazal.
      ...(formData.has("docNumber")
        ? {
            docNumber: String(formData.get("docNumber") || "").trim() || null,
            taxDate: (() => {
              const t = String(formData.get("taxDate") || "");
              const d = t ? new Date(t) : null;
              return d && !isNaN(d.getTime()) ? d : null;
            })(),
            deductible: formData.get("deductible") != null,
          }
        : {}),
    },
  });

  if (presun) {
    await prisma.document.updateMany({ where: { expenseId: id }, data: { projectId: cilProjectId } });
    await prisma.docScan.updateMany({ where: { expenseId: id }, data: { projectId: cilProjectId } });
    revalidatePath(`/projects/${cilProjectId}`);
  }

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/payments");
  revalidatePath("/vendors");
  revalidatePath("/dph");
  revalidatePath("/doklady");
}

export async function setExpenseStage(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));
  const stage = String(formData.get("stage") || "").trim() || null;

  if (!isManager(await getProjectRole(projectId, user))) {
    throw new Error("Stav výdaje mění jen vlastník projektu.");
  }
  await prisma.expense.updateMany({ where: { id, projectId }, data: { stage } });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/payments");
}

// Hromadná akce nad vybranými výdaji (vlastník). op: stage | paid | unpaid | delete
export async function bulkUpdateExpenses(formData: FormData) {
  const user = await requireUser();
  const projectId = String(formData.get("projectId"));
  const op = String(formData.get("op") || "");
  const ids = String(formData.get("ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  // Modul Platby pracuje napříč projekty – bez projectId se omezíme na ty,
  // které spravuju, a mazat hromadně tam nejde.
  const cross = !projectId;
  if (cross) {
    if (op === "delete") throw new Error("Hromadné mazání jde jen v projektu.");
  } else if (!isManager(await getProjectRole(projectId, user))) {
    throw new Error("Hromadnou změnu může provést jen vlastník projektu.");
  }
  if (ids.length === 0) return;

  const where = cross
    ? { id: { in: ids }, projectId: { in: await managedProjectIds(user) } }
    : { id: { in: ids }, projectId };
  if (op === "delete") {
    // Přílohy i z úložiště (R2) – jen výdajů TOHOTO projektu (dřív se
    // přílohy hledaly jen podle id a šlo tak smazat přílohy cizího výdaje).
    await deleteWithFiles({ projectId, expenseId: { in: ids } }, () =>
      prisma.$transaction([
        prisma.document.deleteMany({ where: { projectId, expenseId: { in: ids } } }),
        prisma.expense.deleteMany({ where }),
      ]),
    );
  } else if (op === "paid") {
    await prisma.expense.updateMany({ where, data: { stage: EXPENSE_PAID_STAGE } });
  } else if (op === "unpaid") {
    await prisma.expense.updateMany({ where, data: { stage: EXPENSE_TOPAY_STAGE } });
  } else if (op === "stage") {
    const stage = String(formData.get("stage") || "").trim() || null;
    await prisma.expense.updateMany({ where, data: { stage } });
  } else {
    throw new Error("Neznámá operace.");
  }

  if (projectId) revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/payments");
}

export async function approveExpense(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));

  if (!isManager(await getProjectRole(projectId, user))) {
    throw new Error("Schvalovat může jen vlastník projektu.");
  }
  await prisma.expense.updateMany({
    where: { id, projectId },
    data: { status: "approved" },
  });
  revalidatePath(`/projects/${projectId}`);
}

export async function setExpensePaid(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));
  const paid = String(formData.get("paid")) === "true";

  if (!isManager(await getProjectRole(projectId, user))) {
    throw new Error("Stav úhrady mění jen vlastník projektu.");
  }
  // Úhrada = stav "uhrazeno" (jinak "k úhradě").
  await prisma.expense.updateMany({
    where: { id, projectId },
    data: { stage: paid ? EXPENSE_PAID_STAGE : EXPENSE_TOPAY_STAGE },
  });
  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/payments");
}

export async function deleteExpense(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id"));
  const projectId = String(formData.get("projectId"));

  if (!isManager(await getProjectRole(projectId, user))) {
    throw new Error("Mazat může jen vlastník projektu.");
  }
  // Skeny i z úložiště (R2) – jen výdaje tohoto projektu; nejdřív záznamy, pak soubory.
  await deleteWithFiles({ projectId, expenseId: id }, () =>
    prisma.$transaction([
      prisma.document.deleteMany({ where: { projectId, expenseId: id } }),
      prisma.expense.deleteMany({ where: { id, projectId } }),
    ]),
  );

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/dashboard");
  revalidatePath("/reports");
  revalidatePath("/vendors");
}

/**
 * Položky dokladu k úpravě: u každé kategorie a jestli jde do přiznání.
 * Načítá se až při otevření úprav – stránka projektu je i bez toho dost velká.
 */
export async function getExpenseEditData(expenseId: string) {
  const user = await requireUser();
  const e = await prisma.expense.findUnique({
    where: { id: expenseId },
    select: {
      projectId: true,
      currency: true,
      vatBase: true,
      vatAmount: true,
      vatBaseDoc: true,
      vatAmountDoc: true,
      vatBreakdown: true,
      vatBreakdownDoc: true,
      items: { orderBy: { line: "asc" } },
    },
  });
  if (!e) throw new Error("Výdaj nenalezen.");
  if (!isManager(await getProjectRole(e.projectId, user))) throw new Error("Nemáš oprávnění.");
  // Kam jde výdaj přesunout: projekty, které uživatel spravuje, i s jejich
  // složkami. Cesta se skládá, ať je v jednom seznamu poznat vnoření.
  const ids = await managedProjectIds(user);
  const projekty = await prisma.project.findMany({
    where: { id: { in: ids } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, subProjects: { select: { id: true, name: true, parentId: true } } },
  });
  const targets: { value: string; label: string }[] = [];
  for (const p of projekty) {
    targets.push({ value: `${p.id}:`, label: p.name });
    const cesta = (sid: string): string => {
      const sub = p.subProjects.find((x) => x.id === sid);
      if (!sub) return p.name;
      return sub.parentId ? `${cesta(sub.parentId)} › ${sub.name}` : `${p.name} › ${sub.name}`;
    };
    for (const sub of [...p.subProjects].sort((a, b) => cesta(a.id).localeCompare(cesta(b.id), "cs")))
      targets.push({ value: `${p.id}:${sub.id}`, label: cesta(sub.id) });
  }

  const rows = (e.vatBreakdownDoc ?? e.vatBreakdown ?? []) as { rate: number; base: number; vat: number }[];
  return {
    targets,
    currency: e.currency,
    docRows: rows,
    docBase: e.vatBaseDoc != null ? Number(e.vatBaseDoc) : e.vatBase != null ? Number(e.vatBase) : null,
    docVat: e.vatAmountDoc != null ? Number(e.vatAmountDoc) : e.vatAmount != null ? Number(e.vatAmount) : null,
    items: e.items.map((i) => ({
      id: i.id,
      description: i.description,
      quantity: i.quantity != null ? Number(i.quantity) : null,
      unit: i.unit,
      amount: Number(i.amount),
      vatRate: i.vatRate != null ? Number(i.vatRate) : null,
      category: i.category,
      deductible: i.deductible,
    })),
  };
}

/**
 * Zaškrtnutí nároku u jedné položky dokladu – z přehledu DPH, bez otevírání
 * dokladu. Nárok dokladu se přepočítá stejně jako v úpravě výdaje.
 */
export async function setItemClaim(formData: FormData) {
  const user = await requireUser();
  const itemId = String(formData.get("itemId"));
  const deductible = formData.get("deductible") === "1";

  const item = await prisma.expenseItem.findUnique({
    where: { id: itemId },
    select: { id: true, expense: { select: { id: true, projectId: true } } },
  });
  if (!item) throw new Error("Položka nenalezena.");
  // Nárok je věc evidence vlastníka – mění ho jen vlastník a spolusprávce.
  const ids = await managedProjectIds(user);
  if (!ids.includes(item.expense.projectId)) throw new Error("Nemáš oprávnění.");

  const patch = await prepocetNaroku(item.expense.id, [{ id: itemId, deductible }]);
  if (patch) await prisma.expense.update({ where: { id: item.expense.id }, data: patch });

  revalidatePath("/dph");
  revalidatePath("/doklady");
  revalidatePath(`/projects/${item.expense.projectId}`);
}
