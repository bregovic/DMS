import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      /** E-mail čekající na ověření – session.user.email je do té doby null. */
      unverifiedEmail?: string | null;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    /** E-mail ověřený (registrace odkazem, Google sám). */
    ev?: boolean;
  }
}
