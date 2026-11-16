import { z } from "zod";

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required for database operations").optional(),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters").optional(),
  PAYMENT_PROVIDER: z.enum(["mock", "razorpay", "stripe", "cashfree", "phonepe"]).default("mock"),
  PAYMENT_SECRET_KEY: z.string().optional(),
  PAYMENT_WEBHOOK_SECRET: z.string().optional(),
});

const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  NEXT_PUBLIC_DEFAULT_CURRENCY: z.string().default("INR"),
  NEXT_PUBLIC_DEFAULT_LOCALE: z.string().default("en-IN"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export type ClientEnv = z.infer<typeof clientEnvSchema>;

function validateEnv(): ServerEnv & ClientEnv {
  // Validate client variables
  const parsedClient = clientEnvSchema.safeParse({
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_DEFAULT_CURRENCY: process.env.NEXT_PUBLIC_DEFAULT_CURRENCY,
    NEXT_PUBLIC_DEFAULT_LOCALE: process.env.NEXT_PUBLIC_DEFAULT_LOCALE,
  });

  if (!parsedClient.success) {
    console.error("Invalid client environment variables:", parsedClient.error.flatten().fieldErrors);
    throw new Error("Invalid client environment configuration");
  }

  // Validate server variables only on the server
  if (typeof window === "undefined") {
    const parsedServer = serverEnvSchema.safeParse(process.env);
    if (!parsedServer.success) {
      console.error("Invalid server environment variables:", parsedServer.error.flatten().fieldErrors);
      // In production, missing critical secrets must fail fast
      if (process.env.NODE_ENV === "production") {
        throw new Error("Invalid server environment configuration in production");
      }
    }
    return {
      ...parsedClient.data,
      ...(parsedServer.success ? parsedServer.data : (process.env as unknown as ServerEnv)),
    };
  }

  return {
    ...parsedClient.data,
  } as ServerEnv & ClientEnv;
}

export const env = validateEnv();
