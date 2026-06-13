"use server";

import { randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@watool/db";
import { signIn } from "@/auth";
import { uniqueSlug } from "@/lib/slug";
import { getPlatformSettings } from "@/lib/platform-settings";

export type ActionState = { error?: string } | undefined;

const signupSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  orgName: z.string().min(1, "Workspace name is required").max(100),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/**
 * Sign up: create the user, their first org, and an OWNER membership in one
 * transaction, then sign them in. This nails the Phase 0 flow: account + workspace.
 */
export async function signupAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  if (!(await getPlatformSettings()).signupsEnabled) {
    return { error: "New signups are currently disabled. Please contact support." };
  }
  const parsed = signupSchema.safeParse({
    name: formData.get("name"),
    orgName: formData.get("orgName"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }
  const { name, orgName, email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });
  if (existing) return { error: "An account with this email already exists." };

  const passwordHash = await bcrypt.hash(password, 10);
  const slug = uniqueSlug(orgName, randomBytes(8).toString("hex"));

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name, email: normalizedEmail, passwordHash },
    });
    const org = await tx.org.create({ data: { name: orgName, slug } });
    await tx.membership.create({
      data: { orgId: org.id, userId: user.id, role: "OWNER" },
    });
  });

  // signIn throws a redirect on success — let it propagate.
  await signIn("credentials", {
    email: normalizedEmail,
    password,
    redirectTo: "/dashboard",
  });
}

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export async function loginAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email.toLowerCase(),
      password: parsed.data.password,
      redirectTo: "/dashboard",
    });
  } catch (err) {
    // next-auth throws a special redirect error on success; re-throw it.
    if (err instanceof Error && err.message === "NEXT_REDIRECT") throw err;
    if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    return { error: "Invalid email or password." };
  }
}
