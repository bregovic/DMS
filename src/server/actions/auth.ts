"use server";

import { AuthError } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { signIn, signOut } from "@/auth";
import { prisma } from "@/lib/prisma";

export type AuthFormState = { error?: string } | undefined;

const registerSchema = z.object({
  name: z.string().min(2, "Jméno musí mít alespoň 2 znaky."),
  email: z.email("Zadej platný e-mail."),
  password: z.string().min(8, "Heslo musí mít alespoň 8 znaků."),
});

export async function registerAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = registerSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Neplatné údaje." };
  }

  const { name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return { error: "Uživatel s tímto e-mailem už existuje." };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({ data: { name, email, passwordHash } });

  // signIn provede přesměrování (vyhodí redirect) – nechytat.
  await signIn("credentials", { email, password, redirectTo: "/dashboard" });
  return undefined;
}

export async function loginAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/dashboard",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Neplatný e-mail nebo heslo." };
    }
    throw error; // redirect – musí probublat dál
  }
  return undefined;
}

export async function googleSignInAction() {
  await signIn("google", { redirectTo: "/dashboard" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}
