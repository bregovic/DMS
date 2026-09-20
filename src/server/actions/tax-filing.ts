"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";
import { buildDp3 } from "@/server/dp3-xml";
import { buildKhXml } from "@/server/kh-xml";
import { isdsConfigured, isdsMode, sendDataMessage } from "@/server/isds";
import { decryptSecret } from "@/lib/secret-box";

/**
 * Podání přiznání k DPH a kontrolního hlášení datovou schránkou.
 *
 * Nikdy se neodesílá samo: nejdřív se vrátí náhled (čísla, která by odešla,
 * a co chybí), odeslat jde až druhým krokem s potvrzením. Každé odeslání se
 * zapíše, ať je vidět, co a kdy odešlo a pod jakým číslem zprávy.
 */

type Kind = "dp3" | "kh";

const LABEL: Record<Kind, string> = { dp3: "Přiznání k DPH", kh: "Kontrolní hlášení DPH" };

function periodArg(period: string, year: number) {
  return period.startsWith("q")
    ? { year, quarter: Number(period.slice(1)) }
    : { year, month: Number(period.replace("m", "")) };
}

function periodLabel(period: string, year: number) {
  return period.startsWith("q") ? `${period.slice(1)}. čtvrtletí ${year}` : `${period.replace("m", "")}/${year}`;
}

async function build(kind: Kind, period: string, year: number, projectId: string | null, userId: string) {
  if (kind === "dp3") {
    const { xml, summary } = await buildDp3(userId, periodArg(period, year), projectId);
    return {
      xml,
      missing: summary.missing,
      lines: [
        `Daň na výstupu ${Math.round(summary.taxOut).toLocaleString("cs-CZ")} Kč`,
        `Odpočet ${Math.round(summary.deduction).toLocaleString("cs-CZ")} Kč`,
        `${summary.result >= 0 ? "Vlastní daň" : "Nadměrný odpočet"} ${Math.abs(Math.round(summary.result)).toLocaleString("cs-CZ")} Kč`,
      ],
    };
  }
  const kh = await buildKhXml(userId, periodArg(period, year), projectId);
  return {
    xml: kh.xml,
    missing: kh.missing,
    lines: [
      `Vystavené doklady: A.4 jednotlivě ${kh.a4Count}${kh.hasA5 ? " + A.5 souhrnně" : ""}`,
      `Přijaté doklady: B.2 jednotlivě ${kh.b2Count}${kh.hasB3 ? " + B.3 souhrnně" : ""}`,
      `Základ ${Math.round(kh.sumBase).toLocaleString("cs-CZ")} Kč · daň ${Math.round(kh.sumVat).toLocaleString("cs-CZ")} Kč`,
    ],
  };
}

/** Náhled podání: co odejde, komu a co ještě chybí. */
export async function previewFiling(kind: Kind, period: string, year: number, projectId: string | null) {
  const user = await requireUser();
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { taxOfficeDataBox: true, billingDic: true, billingName: true, isdsLogin: true, isdsPassword: true, isdsTest: true },
  });
  const cred = { login: me?.isdsLogin, password: decryptSecret(me?.isdsPassword), test: me?.isdsTest ?? false };
  const sent = await prisma.taxFiling.findFirst({
    where: { userId: user.id, kind, year, period, projectId },
    orderBy: { sentAt: "desc" },
    select: { messageId: true, sentAt: true },
  });
  try {
    const { missing, lines } = await build(kind, period, year, projectId, user.id);
    return {
      label: LABEL[kind],
      periodLabel: periodLabel(period, year),
      recipient: me?.taxOfficeDataBox ?? null,
      dic: me?.billingDic ?? null,
      configured: isdsConfigured(cred),
      mode: isdsMode(cred),
      missing,
      lines,
      sent: sent ? { messageId: sent.messageId, sentAt: sent.sentAt.toISOString() } : null,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Podání se nepodařilo připravit." };
  }
}

/** Odeslání podání do datové schránky finančního úřadu (po potvrzení). */
export async function sendFiling(kind: Kind, period: string, year: number, projectId: string | null) {
  const user = await requireUser();
  const me = await prisma.user.findUnique({
    where: { id: user.id },
    select: { taxOfficeDataBox: true, isdsLogin: true, isdsPassword: true, isdsTest: true },
  });
  const cred = { login: me?.isdsLogin, password: decryptSecret(me?.isdsPassword), test: me?.isdsTest ?? false };
  const recipient = (me?.taxOfficeDataBox ?? "").trim();
  if (!recipient)
    return { error: "Doplň ID datové schránky finančního úřadu v Nastavení → Fakturace a daně." };
  if (!isdsConfigured(cred))
    return { error: "Doplň přihlášení do datové schránky v Nastavení → Fakturace a daně." };

  let built;
  try {
    built = await build(kind, period, year, projectId, user.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Podání se nepodařilo připravit." };
  }

  const res = await sendDataMessage({
    recipient,
    annotation: `${LABEL[kind]} za ${periodLabel(period, year)}`,
    fileName: `${kind === "dp3" ? "priznani-dph" : "kontrolni-hlaseni"}-${year}-${period}.xml`,
    xml: built.xml,
    credentials: cred,
  });
  if ("error" in res) return { error: res.error };

  await prisma.taxFiling.create({
    data: {
      userId: user.id,
      kind,
      year,
      period,
      projectId,
      recipient,
      messageId: res.messageId,
      summary: built.lines.join(" · ").slice(0, 500),
    },
  });
  revalidatePath("/dph");
  return { messageId: res.messageId };
}
