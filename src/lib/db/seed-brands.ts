import { Pool } from "@neondatabase/serverless";
import { APPROVED_BRANDS } from "@/lib/constants/approved-catalogue";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

export async function seedBrands() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set");
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    console.log(`[SeedBrands] Seeding ${APPROVED_BRANDS.length} approved brands into database...`);

    for (const b of APPROVED_BRANDS) {
      await pool.query(
        `INSERT INTO brands (name, slug, status, created_at, updated_at)
         VALUES ($1, $2, 'active', NOW(), NOW())
         ON CONFLICT (slug) DO UPDATE 
         SET name = EXCLUDED.name, updated_at = NOW();`,
        [b.name, b.slug]
      );
    }

    const { rows } = await pool.query(`SELECT count(*) as cnt FROM brands;`);
    console.log(`[SeedBrands] Completed successfully! Total brands in DB: ${rows[0]?.cnt}`);
  } catch (error) {
    console.error("[SeedBrands] Error seeding brands:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && process.argv[1].includes("seed-brands")) {
  seedBrands()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
