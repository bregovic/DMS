"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/dal";
import { prisma } from "@/lib/prisma";

export type PasswordState = { error?: string; ok?: boolean } | undefined;

export async function changePassword(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const user = await requireUser();
  const current = String(formData.get("current") || "");
  const next = String(formData.get("next") || "");
  const confirm = String(formData.get("confirm") || "");

  if (next.length < 8) {
    return { error: "Nové heslo musí mít alespoň 8 znaků." };
  }
  if (next !== confirm) {
    return { error: "Nová hesla se neshodují." };
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true },
  });
  if (!dbUser) return { error: "Uživatel nenalezen." };

  // Pokud už heslo má, ověř stávající; pokud ne (např. jen Google), nastaví se nové.
  if (dbUser.passwordHash) {
    const valid = await bcrypt.compare(current, dbUser.passwordHash);
    if (!valid) return { error: "Stávající heslo nesouhlasí." };
  }

  const hash = await bcrypt.hash(next, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hash },
  });

  return { ok: true };
}

/** Fakturační údaje (pro faktury za vykázanou práci). */
export async function updateBilling(formData: FormData) {
  const user = await requireUser();
  const t = (k: string) => String(formData.get(k) || "").trim().slice(0, 300) || null;
  await prisma.user.update({
    where: { id: user.id },
    data: {
      billingName: t("billingName"),
      billingIco: t("billingIco"),
      billingDic: t("billingDic"),
      billingAddress: t("billingAddress"),
      billingAccount: t("billingAccount"),
      vatPayer: formData.get("vatPayer") === "1",
      // údaje pro daňová podání (kontrolní hlášení)
      taxSubjectType: formData.get("taxSubjectType") === "PO" ? "PO" : "FO",
      firstName: t("firstName"),
      lastName: t("lastName"),
      street: t("street"),
      houseNo: t("houseNo"),
      orientNo: t("orientNo"),
      city: t("city"),
      zip: t("zip"),
      country: t("country") ?? "ČESKÁ REPUBLIKA",
      phone: t("phone"),
      dataBoxId: t("dataBoxId"),
      taxOfficeCode: t("taxOfficeCode"),
      taxOfficeBranch: t("taxOfficeBranch"),
    },
  });
  revalidatePath("/settings");
  revalidatePath("/settings/fakturace");
}

/** Zveřejněné bankovní účty a spolehlivost plátce z registru DPH. */
export async function lookupVatAccounts(dic: string) {
  await requireUser();
  const { vatRegistry } = await import("@/server/vat-registry");
  return vatRegistry(dic);
}
