"use server";

import bcrypt from "bcryptjs";
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
