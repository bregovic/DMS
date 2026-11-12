import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const credentialsSchema = z.object({
  email: z.email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Google({ allowDangerousEmailAccountLinking: true }),
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        password: { label: "Heslo", type: "password" },
      },
      authorize: async (raw) => {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email },
        });
        if (!user?.passwordHash) return null;

        const valid = await bcrypt.compare(
          parsed.data.password,
          user.passwordHash,
        );
        if (!valid) return null;

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (user) token.id = user.id;
      const uid = typeof token.id === "string" ? token.id : null;
      if (uid && account?.provider === "google") {
        // Google e-mail ověřil. Kdyby si někdo dřív založil na tenhle e-mail
        // účet s heslem bez ověření, heslo se zruší – účet patří majiteli e-mailu.
        const u = await prisma.user.findUnique({ where: { id: uid }, select: { emailVerified: true } });
        await prisma.user.update({
          where: { id: uid },
          data: { emailVerified: u?.emailVerified ?? new Date(), ...(u?.emailVerified ? {} : { passwordHash: null }) },
        });
        token.ev = true;
      } else if (uid && !token.ev) {
        // Neověřený účet se kontroluje při každém požadavku – po kliknutí
        // na odkaz se přístupy zapnou bez nového přihlášení.
        const u = await prisma.user.findUnique({ where: { id: uid }, select: { emailVerified: true } });
        token.ev = !!u?.emailVerified;
      }
      return token;
    },
    session({ session, token }) {
      if (token.id && session.user) {
        session.user.id = token.id as string;
        if (!token.ev) {
          // Bez ověření se podle e-mailu nic nepáruje (projekty, složky, úkoly).
          session.user.unverifiedEmail = session.user.email ?? null;
          (session.user as { email: string | null }).email = null;
        }
      }
      return session;
    },
  },
});
