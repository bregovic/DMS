import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { mailTemplate, sendMail } from "@/lib/mailer";

/**
 * Ověření e-mailu (registrace heslem). Přístupy k projektům, složkám
 * a úkolům se párují podle e-mailu – bez ověření by si kdokoli mohl založit
 * účet na cizí adresu (třeba dodavatele z faktury) a dostat jeho přístup.
 * Dokud účet ověřený není, session e-mail nenese a nic se nepáruje.
 */
export async function sendVerification(email: string) {
  const identifier = email.toLowerCase();
  const token = randomBytes(24).toString("hex");
  await prisma.verificationToken.deleteMany({ where: { identifier } });
  await prisma.verificationToken.create({
    data: { identifier, token, expires: new Date(Date.now() + 3 * 24 * 3600_000) },
  });
  const base = (process.env.APP_URL || "https://dokumenty.up.railway.app").replace(/\/$/, "");
  const link = `${base}/overit/${token}`;
  const { html, text } = mailTemplate({
    title: "Ověření e-mailu",
    lines: ["Účet v DMS je založený. Ověřte prosím, že e-mail patří vám."],
    action: { label: "Ověřit e-mail", href: link },
    footer: "Pokud jste si účet nezakládali, zprávu ignorujte.",
  });
  return sendMail({ to: identifier, subject: "DMS – ověření e-mailu", html, text });
}

/** Potvrdí e-mail podle odkazu. Vrací e-mail, nebo null u neplatného odkazu. */
export async function confirmVerification(token: string) {
  const row = await prisma.verificationToken.findFirst({ where: { token } });
  if (!row) return null;
  await prisma.verificationToken.deleteMany({ where: { identifier: row.identifier } });
  if (row.expires < new Date()) return null;
  const user = await prisma.user.findFirst({
    where: { email: { equals: row.identifier, mode: "insensitive" } },
    select: { id: true },
  });
  if (!user) return null;
  await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
  return row.identifier;
}
