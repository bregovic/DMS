import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

/**
 * Šifrování citlivých údajů v databázi (heslo do datové schránky).
 *
 * Klíč se odvozuje z AUTH_SECRET, takže se nikam neukládá. V databázi je
 * jen šifrovaný text, který bez znalosti klíče nikdo nepřečte – ani při
 * úniku zálohy. Formát: v1:<iv>:<tag>:<data> (base64url).
 */

const PREFIX = "v1";

function key(): Buffer {
  const secret = process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Chybí AUTH_SECRET – heslo nelze bezpečně uložit.");
  return scryptSync(secret, "dms-secret-box", 32);
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [PREFIX, iv.toString("base64url"), c.getAuthTag().toString("base64url"), data.toString("base64url")].join(":");
}

export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const [v, iv, tag, data] = stored.split(":");
  if (v !== PREFIX || !iv || !tag || !data) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
