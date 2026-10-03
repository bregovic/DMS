import { prisma } from "@/lib/prisma";

export type PayeeVendor = { email: string | null; bankAccount: string | null };

/**
 * Účet pro platbu dodavateli. Vlastní záznam v evidenci má přednost; když
 * v něm účet není, vezme se z profilu uživatele se stejným e-mailem – tedy
 * spolupracujícího dodavatele, který si účet zadal u sebe ve fakturačních
 * údajích. Vrací funkci, aby šlo pro seznam výdajů doptat databázi jednou.
 */
export async function payeeAccounts(
  vendors: (PayeeVendor | null | undefined)[],
): Promise<(vendor: PayeeVendor | null | undefined) => string | null> {
  const emails = [
    ...new Set(
      vendors
        .filter((v) => !!v && !v.bankAccount && !!v.email)
        .map((v) => v!.email!.toLowerCase()),
    ),
  ];

  const users = emails.length
    ? await prisma.user.findMany({
        where: {
          billingAccount: { not: null },
          OR: emails.map((e) => ({
            email: { equals: e, mode: "insensitive" as const },
          })),
        },
        select: { email: true, billingAccount: true },
      })
    : [];

  const byEmail = new Map(
    users.map((u) => [(u.email ?? "").toLowerCase(), u.billingAccount!]),
  );

  return (vendor) => {
    if (!vendor) return null;
    // Dodavatel bez e-mailu je jen kontakt – účet může mít jen u sebe v evidenci.
    return vendor.bankAccount || (vendor.email ? byEmail.get(vendor.email.toLowerCase()) : null) || null;
  };
}

/** Účet jednoho dodavatele – viz payeeAccounts. */
export async function payeeAccount(
  vendor: PayeeVendor | null | undefined,
): Promise<string | null> {
  return (await payeeAccounts([vendor]))(vendor);
}
