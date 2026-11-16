import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

// Load local environment for Drizzle Kit CLI migrations
dotenv.config({ path: ".env.local" });

export default defineConfig({
  schema: "./src/lib/db/schema/index.ts",
  out: "./src/lib/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL || "",
  },
  strict: true,
  verbose: true,
});
