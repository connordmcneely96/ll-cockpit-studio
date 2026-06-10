import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cookies } from "next/headers";
import { validateToken, type AuthContext } from "@/lib/auth";

type D1Statement = {
  bind: (...values: unknown[]) => D1Statement;
  all: <T = unknown>() => Promise<{ results: T[] }>;
  run: () => Promise<{ success: boolean }>;
  first: <T = unknown>() => Promise<T | null>;
};

type R2BucketLike = {
  put: (key: string, value: ArrayBuffer | ReadableStream | string) => Promise<void>;
  get: (key: string) => Promise<{ arrayBuffer: () => Promise<ArrayBuffer> } | null>;
  delete: (key: string) => Promise<void>;
};

export type Env = {
  DB: { prepare: (sql: string) => D1Statement };
  R2: R2BucketLike;
};

export function getEnv(): Env {
  const { env } = getCloudflareContext();
  return env as unknown as Env;
}

export async function authFromCookie(): Promise<AuthContext | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("sb-access-token")?.value;
  if (!token) return null;
  return validateToken(token);
}
