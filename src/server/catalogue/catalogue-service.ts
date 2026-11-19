import "server-only";
import { and, eq, gte, lte, desc, asc, sql, count } from "drizzle-orm";
import { getDb, type DbClient } from "@/lib/db";
import {
  products,
  brands,
  categories,
  productImages,
  productVariants,
  productSpecifications,
  inventory,
} from "@/lib/db/schema/catalogue";
import {
  vehicleMakes,
  vehicleModels,
  vehicleVariants,
  productFitments,
} from "@/lib/db/schema/fitment";
import {
  productSearchQuerySchema,
  type RawProductSearchParams,
  type ValidatedProductSearchParams,
  type CatalogueSearchResponseDTO,
  type ProductCardDTO,
  type ProductDetailDTO,
  type VehicleFitmentDTO,
  type FilterFacetsDTO,
  type ProductCondition,
} from "@/features/catalogue/schemas";
import { DEMO_FEATURED_PRODUCTS, POPULAR_VEHICLE_MAKES } from "@/lib/constants/demo-catalog";

type ActiveDb = NonNullable<DbClient>;

interface ProductAttributes {
  fitmentHint?: string;
  oemReference?: string;
  isOem?: boolean;
  condition?: "new" | "used" | "unclassified";
  conditionGrade?: string;
  conditionNotes?: string;
  visibleWearOrDefects?: string;
  testedStatus?: string;
  warrantyDetails?: string;
}

export function parseProductCondition(raw?: unknown): ProductCondition {
  if (raw === "new") return "new";
  if (raw === "used") return "used";
  return "unclassified";
}

interface ProductDbRow {
  id: string;
  sku: string;
  slug: string;
  name: string;
  priceMinor: number;
  compareAtPriceMinor: number | null;
  attributes: unknown;
  brandName: string | null;
  brandSlug: string | null;
  categoryName: string | null;
  categorySlug: string | null;
  availableQuantity?: number | null;
}

interface FitmentDbRow {
  id: string;
  notes: string | null;
  verifiedStatus: string;
  makeName: string;
  makeSlug: string;
  modelName: string;
  modelSlug: string;
  variantGeneration: string | null;
  variantEngine: string | null;
  variantFuel: string | null;
  yearStart: number;
  yearEnd: number | null;
}

interface ImageDbRow {
  id: string;
  url: string;
  altText: string;
  isPrimary: boolean;
  sortOrder: number;
}

interface VariantDbRow {
  id: string;
  sku: string;
  attributes: Record<string, string | number | boolean> | null;
  priceOverrideMinor: number | null;
  status: string;
}

interface SpecDbRow {
  name: string;
  value: string;
  sortOrder: number;
}

interface FacetCountDbRow {
  name: string;
  slug: string;
  count: number | string;
}

interface MakeDbRow {
  name: string;
  slug: string;
}

/**
 * HS Spare Parts — Server-Side Catalogue & Search Service
 *
 * Implements server-side searching, multi-faceted filtering, sorting,
 * vehicle fitment verification, and pagination.
 *
 * All database operations utilize parameterized Drizzle queries.
 * In environments where DATABASE_URL is unconfigured, falls back
 * safely to transparently labeled demo catalogue structures.
 */

function isExplicitDevOrTest(): boolean {
  return (
    process.env.NODE_ENV === "development" ||
    process.env.NODE_ENV === "test" ||
    process.env.NEXT_PUBLIC_ENABLE_DEMO_CATALOG === "true"
  );
}

function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

/**
 * Searches and filters products based on validated query parameters.
 */
export async function searchProducts(
  rawParams: RawProductSearchParams
): Promise<CatalogueSearchResponseDTO> {
  const params: ValidatedProductSearchParams = productSearchQuerySchema.parse(rawParams);

  // When DATABASE_URL is configured, all operations MUST execute against PostgreSQL
  if (isDatabaseConfigured()) {
    const db = getDb();
    if (!db) {
      // Configuration is present but pool initialization failed
      return createDatabaseUnavailableResponse(params);
    }
    try {
      return await searchProductsFromDatabase(db, params);
    } catch (error) {
      console.error("[CatalogueService] Database query error, returning safe unavailable state:", error);
      // Fail closed with a safe database-unavailable state; NEVER fall back silently to demo products
      return createDatabaseUnavailableResponse(params);
    }
  }

  // DATABASE_URL is not configured: Demo fallback is strictly restricted to development/test environments
  if (isExplicitDevOrTest()) {
    return searchProductsFromDemoCatalog(params);
  }

  // In production or unknown environments without DATABASE_URL, fail closed
  return createDatabaseUnavailableResponse(params);
}

/**
 * Executes a parameterized Drizzle query against the PostgreSQL database.
 */
async function searchProductsFromDatabase(
  db: ActiveDb,
  params: ValidatedProductSearchParams
): Promise<CatalogueSearchResponseDTO> {
  const conditions = [eq(products.status, "active")];

  // 1. Text search (Name, SKU, Slug, Description, OEM attributes)
  const searchQuery = params.q || params.partNumber;
  if (searchQuery) {
    const pattern = `%${searchQuery}%`;
    conditions.push(
      sql`(${products.name} ILIKE ${pattern} OR ${products.sku} ILIKE ${pattern} OR ${products.slug} ILIKE ${pattern} OR ${products.description} ILIKE ${pattern} OR ${products.attributes}->>'oemReference' ILIKE ${pattern})`
    );
  }

  // 2. Category / Subcategory filter
  if (params.subcategory) {
    conditions.push(
      sql`${products.categoryId} IN (SELECT id FROM ${categories} WHERE slug = ${params.subcategory})`
    );
  } else if (params.category) {
    conditions.push(
      sql`${products.categoryId} IN (
        SELECT id FROM ${categories} WHERE slug = ${params.category}
        UNION
        SELECT id FROM ${categories} WHERE parent_id = (SELECT id FROM ${categories} WHERE slug = ${params.category})
      )`
    );
  }

  // 3. Brand filter
  if (params.brand && params.brand.length > 0) {
    conditions.push(
      sql`${products.brandId} IN (SELECT id FROM ${brands} WHERE slug IN ${params.brand} OR name IN ${params.brand})`
    );
  }

  // 4. Price range filters (in minor units / paise)
  if (params.minPrice !== undefined) {
    conditions.push(gte(products.priceMinor, params.minPrice * 100));
  }
  if (params.maxPrice !== undefined) {
    conditions.push(lte(products.priceMinor, params.maxPrice * 100));
  }

  // 5. Vehicle fitment filter
  if (params.make || params.model || params.year || params.variant) {
    conditions.push(
      sql`${products.id} IN (
        SELECT pf.product_id
        FROM ${productFitments} pf
        JOIN ${vehicleVariants} vv ON pf.vehicle_variant_id = vv.id
        JOIN ${vehicleModels} vm ON vv.model_id = vm.id
        JOIN ${vehicleMakes} vmk ON vm.make_id = vmk.id
        WHERE (${params.make ? sql`vmk.slug = ${params.make}` : sql`1=1`})
          AND (${params.model ? sql`vm.slug = ${params.model}` : sql`1=1`})
          AND (${params.year ? sql`vv.year_start <= ${params.year} AND (vv.year_end IS NULL OR vv.year_end >= ${params.year})` : sql`1=1`})
          AND (${params.variant ? sql`(vv.generation ILIKE ${'%' + params.variant + '%'} OR vv.id::text = ${params.variant})` : sql`1=1`})
      )`
    );
  }

  // 6. Stock availability filter (Only applied when actual inventory records exist)
  if (params.inStockOnly) {
    conditions.push(
      sql`${products.id} IN (
        SELECT inv.product_id
        FROM ${inventory} inv
        GROUP BY inv.product_id
        HAVING SUM(inv.quantity_on_hand - inv.quantity_reserved) > 0
      )`
    );
  }

  // 7. Product condition filter (New vs Pre-Owned/Used)
  // CRITICAL: Never silently classify unknown products as NEW.
  // Explicit condition = "new": include in New results.
  // Explicit condition = "used": include in Pre-Owned results.
  // Missing or invalid condition: classified as Unclassified, and excluded from New/Used results.
  if (params.condition === "new") {
    conditions.push(sql`${products.attributes}->>'condition' = 'new'`);
  } else if (params.condition === "used") {
    conditions.push(sql`${products.attributes}->>'condition' = 'used'`);
  }

  const whereClause = and(...conditions);

  // Sorting logic
  let orderByClause;
  switch (params.sort) {
    case "price_asc":
      orderByClause = [asc(products.priceMinor), asc(products.id)];
      break;
    case "price_desc":
      orderByClause = [desc(products.priceMinor), asc(products.id)];
      break;
    case "newest":
      orderByClause = [desc(products.createdAt), asc(products.id)];
      break;
    case "relevance":
    default:
      orderByClause = [desc(products.createdAt), asc(products.id)];
      break;
  }

  // Total count query
  const countResult = await db
    .select({ total: count() })
    .from(products)
    .where(whereClause);
  const totalCount = Number(countResult[0]?.total ?? 0);

  // Pagination calculation
  const offset = (params.page - 1) * params.pageSize;
  const totalPages = Math.ceil(totalCount / params.pageSize);

  // Fetch product page rows joined with brand and category
  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      slug: products.slug,
      name: products.name,
      priceMinor: products.priceMinor,
      compareAtPriceMinor: products.compareAtPriceMinor,
      attributes: products.attributes,
      brandName: brands.name,
      brandSlug: brands.slug,
      categoryName: categories.name,
      categorySlug: categories.slug,
      availableQuantity: sql<number>`COALESCE((SELECT SUM(inv.quantity_on_hand - inv.quantity_reserved) FROM ${inventory} inv WHERE inv.product_id = ${products.id}), 0)`,
    })
    .from(products)
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(whereClause)
    .orderBy(...orderByClause)
    .limit(params.pageSize)
    .offset(offset);

  // Map database rows to ProductCardDTOs
  const productDtos: ProductCardDTO[] = (rows as ProductDbRow[]).map((r) => {
    const attrs = r.attributes as ProductAttributes | null;
    const availableQty = Math.max(0, Number(r.availableQuantity ?? 0));
    const inStock = Number(r.availableQuantity ?? 0) > 0;
    return {
      id: r.id,
      sku: r.sku,
      slug: r.slug,
      name: r.name,
      brandName: r.brandName ?? "Unknown Brand",
      brandSlug: r.brandSlug ?? "unknown",
      categoryName: r.categoryName ?? "General",
      categorySlug: r.categorySlug ?? "general",
      priceMinor: r.priceMinor,
      compareAtPriceMinor: r.compareAtPriceMinor,
      primaryImageUrl: null,
      fitmentHint: attrs?.fitmentHint ?? null,
      oemReference: attrs?.oemReference ?? null,
      condition: parseProductCondition(attrs?.condition),
      isDemo: false,
      isOem: Boolean(attrs?.isOem),
      availableStock: availableQty,
      inStock,
    };
  });

  // Construct search facets (Categories, Brands, Makes)
  const facets = await buildDatabaseFacets(db);

  return {
    products: productDtos,
    totalCount,
    page: params.page,
    pageSize: params.pageSize,
    totalPages,
    hasNextPage: params.page < totalPages,
    hasPreviousPage: params.page > 1,
    activeFilters: {
      query: searchQuery,
      category: params.category,
      subcategory: params.subcategory,
      brand: params.brand,
      condition: params.condition,
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
      make: params.make,
      model: params.model,
      year: params.year,
      variant: params.variant,
      inStockOnly: params.inStockOnly,
      sort: params.sort,
    },
    facets,
    isDemoSource: false,
  };
}

/**
 * Searches and filters the demo catalogue when no database connection is active.
 * Guarantees every product is labeled with isDemo: true.
 */
function searchProductsFromDemoCatalog(
  params: ValidatedProductSearchParams
): CatalogueSearchResponseDTO {
  let list = [...DEMO_FEATURED_PRODUCTS];

  const query = params.q || params.partNumber;
  if (query) {
    const qLower = query.toLowerCase();
    list = list.filter(
      (p) =>
        p.name.toLowerCase().includes(qLower) ||
        p.brand.toLowerCase().includes(qLower) ||
        p.sku.toLowerCase().includes(qLower) ||
        p.oemReference.toLowerCase().includes(qLower) ||
        p.categoryName.toLowerCase().includes(qLower) ||
        p.description.toLowerCase().includes(qLower)
    );
  }

  // Category filter
  if (params.category) {
    const cat = params.category.toLowerCase();
    list = list.filter((p) => {
      const pCat = p.categorySlug.toLowerCase();
      return pCat === cat || cat.includes(pCat) || pCat.includes(cat);
    });
  }

  // Brand filter
  if (params.brand && params.brand.length > 0) {
    const selectedBrands = params.brand.map((b) => b.toLowerCase());
    list = list.filter((p) => selectedBrands.includes(p.brand.toLowerCase()));
  }

  // Product condition filter (New vs Pre-Owned/Used)
  // CRITICAL: Unclassified or missing conditions must NOT appear in New or Pre-Owned filtered results
  if (params.condition === "new") {
    list = list.filter((p) => p.condition === "new");
  } else if (params.condition === "used") {
    list = list.filter((p) => p.condition === "used");
  }

  // Price range filters
  if (params.minPrice !== undefined) {
    const minMinor = params.minPrice * 100;
    list = list.filter((p) => p.priceMinor >= minMinor);
  }
  if (params.maxPrice !== undefined) {
    const maxMinor = params.maxPrice * 100;
    list = list.filter((p) => p.priceMinor <= maxMinor);
  }

  // Vehicle filter matching on fitmentHint and vehicle catalog models
  if (params.make) {
    const makeSlug = params.make.toLowerCase();
    const makeObj = POPULAR_VEHICLE_MAKES.find(
      (m) => m.slug.toLowerCase() === makeSlug || m.id.toLowerCase() === makeSlug
    );
    const makeTerms = [makeSlug, makeSlug.replace(/-/g, " ")];
    if (makeObj) {
      makeTerms.push(makeObj.name.toLowerCase());
      makeObj.models.forEach((m) => {
        makeTerms.push(m.name.toLowerCase());
        makeTerms.push(m.slug.toLowerCase());
      });
    }
    list = list.filter((p) => {
      const hint = p.fitmentHint.toLowerCase();
      return makeTerms.some((term) => hint.includes(term));
    });
  }
  if (params.model) {
    const modelLower = params.model.toLowerCase();
    list = list.filter((p) => p.fitmentHint.toLowerCase().includes(modelLower));
  }

  // Sorting with stable secondary sort key
  switch (params.sort) {
    case "price_asc":
      list.sort((a, b) => a.priceMinor - b.priceMinor || a.id.localeCompare(b.id));
      break;
    case "price_desc":
      list.sort((a, b) => b.priceMinor - a.priceMinor || a.id.localeCompare(b.id));
      break;
    case "newest":
      list.sort((a, b) => b.id.localeCompare(a.id));
      break;
    case "relevance":
    default:
      list.sort((a, b) => a.id.localeCompare(b.id));
      break;
  }

  const totalCount = list.length;
  const totalPages = Math.ceil(totalCount / params.pageSize) || 1;
  const offset = (params.page - 1) * params.pageSize;
  const pagedItems = list.slice(offset, offset + params.pageSize);

  const productDtos: ProductCardDTO[] = pagedItems.map((p) => ({
    id: p.id,
    sku: p.sku,
    slug: p.sku.toLowerCase(),
    name: p.name,
    brandName: p.brand,
    brandSlug: p.brand.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    categoryName: p.categoryName,
    categorySlug: p.categorySlug,
    priceMinor: p.priceMinor,
    compareAtPriceMinor: p.originalPriceMinor ?? null,
    primaryImageUrl: null,
    fitmentHint: p.fitmentHint,
    oemReference: p.oemReference,
    condition: parseProductCondition(p.condition),
    isDemo: true, // Explicitly marked as demo
    isOem: p.sku.startsWith("BOSCH") || p.sku.startsWith("VALEO"),
    availableStock: undefined,
    inStock: undefined,
  }));

  // Build facets from the demo data
  const facets = buildDemoFacets(DEMO_FEATURED_PRODUCTS);

  return {
    products: productDtos,
    totalCount,
    page: params.page,
    pageSize: params.pageSize,
    totalPages,
    hasNextPage: params.page < totalPages,
    hasPreviousPage: params.page > 1,
    activeFilters: {
      query,
      category: params.category,
      subcategory: params.subcategory,
      brand: params.brand,
      condition: params.condition,
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
      make: params.make,
      model: params.model,
      year: params.year,
      variant: params.variant,
      inStockOnly: params.inStockOnly,
      sort: params.sort,
    },
    facets,
    isDemoSource: true,
  };
}

/**
 * Fetches a single product by its UUID or unique slug.
 */
export async function getProductByIdOrSlug(
  idOrSlug: string
): Promise<ProductDetailDTO | null> {
  if (isDatabaseConfigured()) {
    const db = getDb();
    if (!db) {
      return null;
    }
    try {
      return await getProductFromDatabase(db, idOrSlug);
    } catch (error) {
      console.error("[CatalogueService] Error fetching product from database:", error);
      return null;
    }
  }

  // Demo fallback is strictly restricted to explicit development/test environments
  if (isExplicitDevOrTest()) {
    return getProductFromDemoCatalog(idOrSlug);
  }

  return null;
}

async function getProductFromDatabase(
  db: ActiveDb,
  idOrSlug: string
): Promise<ProductDetailDTO | null> {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    idOrSlug
  );

  const condition = isUuid
    ? eq(products.id, idOrSlug)
    : eq(products.slug, idOrSlug);

  const rows = await db
    .select({
      id: products.id,
      sku: products.sku,
      slug: products.slug,
      name: products.name,
      shortDescription: products.shortDescription,
      description: products.description,
      priceMinor: products.priceMinor,
      compareAtPriceMinor: products.compareAtPriceMinor,
      weightGrams: products.weightGrams,
      attributes: products.attributes,
      brandName: brands.name,
      brandSlug: brands.slug,
      categoryName: categories.name,
      categorySlug: categories.slug,
    })
    .from(products)
    .leftJoin(brands, eq(products.brandId, brands.id))
    .leftJoin(categories, eq(products.categoryId, categories.id))
    .where(and(condition, eq(products.status, "active")))
    .limit(1);

  const p = rows[0];
  if (!p) {
    return null;
  }

  // Fetch images
  const images = await db
    .select()
    .from(productImages)
    .where(eq(productImages.productId, p.id))
    .orderBy(desc(productImages.isPrimary), asc(productImages.sortOrder));

  // Fetch variants
  const variants = await db
    .select()
    .from(productVariants)
    .where(eq(productVariants.productId, p.id));

  // Fetch specifications
  const specs = await db
    .select()
    .from(productSpecifications)
    .where(eq(productSpecifications.productId, p.id))
    .orderBy(asc(productSpecifications.sortOrder));

  // Fetch fitments with make & model joins
  const fitmentRows = await db
    .select({
      id: productFitments.id,
      notes: productFitments.notes,
      verifiedStatus: productFitments.verifiedStatus,
      makeName: vehicleMakes.name,
      makeSlug: vehicleMakes.slug,
      modelName: vehicleModels.name,
      modelSlug: vehicleModels.slug,
      variantGeneration: vehicleVariants.generation,
      variantEngine: vehicleVariants.engine,
      variantFuel: vehicleVariants.fuel,
      yearStart: vehicleVariants.yearStart,
      yearEnd: vehicleVariants.yearEnd,
    })
    .from(productFitments)
    .innerJoin(vehicleVariants, eq(productFitments.vehicleVariantId, vehicleVariants.id))
    .innerJoin(vehicleModels, eq(vehicleVariants.modelId, vehicleModels.id))
    .innerJoin(vehicleMakes, eq(vehicleModels.makeId, vehicleMakes.id))
    .where(eq(productFitments.productId, p.id));

  const fitmentsDto: VehicleFitmentDTO[] = (fitmentRows as FitmentDbRow[]).map((f) => ({
    id: f.id,
    makeName: f.makeName,
    makeSlug: f.makeSlug,
    modelName: f.modelName,
    modelSlug: f.modelSlug,
    variantGeneration: f.variantGeneration,
    variantEngine: f.variantEngine,
    variantFuel: f.variantFuel,
    yearStart: f.yearStart,
    yearEnd: f.yearEnd,
    notes: f.notes,
    verifiedStatus: f.verifiedStatus as "verified" | "unverified" | "oem_cross_ref",
  }));

  const pAttrs = p.attributes as ProductAttributes | null;

  return {
    id: p.id,
    sku: p.sku,
    slug: p.slug,
    name: p.name,
    brandName: p.brandName ?? "Unknown Brand",
    brandSlug: p.brandSlug ?? "unknown",
    categoryName: p.categoryName ?? "General",
    categorySlug: p.categorySlug ?? "general",
    priceMinor: p.priceMinor,
    compareAtPriceMinor: p.compareAtPriceMinor,
    shortDescription: p.shortDescription,
    description: p.description,
    weightGrams: p.weightGrams,
    primaryImageUrl: images[0]?.url ?? null,
    fitmentHint: pAttrs?.fitmentHint ?? null,
    oemReference: pAttrs?.oemReference ?? null,
    condition: parseProductCondition(pAttrs?.condition),
    conditionGrade: pAttrs?.conditionGrade ?? null,
    conditionNotes: pAttrs?.conditionNotes ?? null,
    visibleWearOrDefects: pAttrs?.visibleWearOrDefects ?? null,
    testedStatus: pAttrs?.testedStatus ?? null,
    warrantyDetails: pAttrs?.warrantyDetails ?? null,
    isDemo: false,
    isOem: Boolean(pAttrs?.isOem),
    images: (images as ImageDbRow[]).map((img) => ({
      id: img.id,
      url: img.url,
      altText: img.altText,
      isPrimary: img.isPrimary,
      sortOrder: img.sortOrder,
    })),
    variants: (variants as VariantDbRow[]).map((v) => ({
      id: v.id,
      sku: v.sku,
      attributes: v.attributes ?? {},
      priceOverrideMinor: v.priceOverrideMinor,
      status: v.status,
    })),
    specifications: (specs as SpecDbRow[]).map((s) => ({
      name: s.name,
      value: s.value,
      sortOrder: s.sortOrder,
    })),
    fitments: fitmentsDto,
  };
}

function getProductFromDemoCatalog(idOrSlug: string): ProductDetailDTO | null {
  const demoProduct = DEMO_FEATURED_PRODUCTS.find(
    (p) => p.id === idOrSlug || p.sku.toLowerCase() === idOrSlug.toLowerCase()
  );

  if (!demoProduct) {
    return null;
  }

  return {
    id: demoProduct.id,
    sku: demoProduct.sku,
    slug: demoProduct.sku.toLowerCase(),
    name: demoProduct.name,
    brandName: demoProduct.brand,
    brandSlug: demoProduct.brand.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    categoryName: demoProduct.categoryName,
    categorySlug: demoProduct.categorySlug,
    priceMinor: demoProduct.priceMinor,
    compareAtPriceMinor: demoProduct.originalPriceMinor ?? null,
    shortDescription: demoProduct.description,
    description: demoProduct.description,
    weightGrams: 1200,
    primaryImageUrl: null,
    fitmentHint: demoProduct.fitmentHint,
    oemReference: demoProduct.oemReference,
    condition: parseProductCondition(demoProduct.condition),
    conditionGrade: demoProduct.conditionGrade ?? null,
    conditionNotes: demoProduct.conditionNotes ?? null,
    visibleWearOrDefects: demoProduct.visibleWearOrDefects ?? null,
    testedStatus: demoProduct.testedStatus ?? null,
    warrantyDetails: demoProduct.warrantyDetails ?? null,
    isDemo: true,
    isOem: true,
    images: [],
    variants: [
      {
        id: `${demoProduct.id}-var-std`,
        sku: `${demoProduct.sku}-STD`,
        attributes: { Position: "Front Axle", Package: "Set of 4" },
        priceOverrideMinor: null,
        status: "active",
      },
    ],
    specifications: [
      { name: "Brand", value: demoProduct.brand, sortOrder: 1 },
      { name: "Part Number / SKU", value: demoProduct.sku, sortOrder: 2 },
      { name: "OEM Reference", value: demoProduct.oemReference, sortOrder: 3 },
      { name: "Compatibility Scope", value: demoProduct.fitmentHint, sortOrder: 4 },
      { name: "Warranty Standard", value: "Manufacturer Standard OES Warranty", sortOrder: 5 },
    ],
    fitments: [
      {
        id: `fit-${demoProduct.id}-1`,
        makeName: "Maruti Suzuki",
        makeSlug: "maruti-suzuki",
        modelName: "Swift",
        modelSlug: "swift",
        variantGeneration: "Gen 3 (2018-2023)",
        variantEngine: "1.2L K12M Petrol",
        variantFuel: "Petrol",
        yearStart: 2018,
        yearEnd: 2023,
        notes: "OEM match confirmed for front axle brake callipers.",
        verifiedStatus: "verified",
      },
      {
        id: `fit-${demoProduct.id}-2`,
        makeName: "Hyundai",
        makeSlug: "hyundai",
        modelName: "i20",
        modelSlug: "i20",
        variantGeneration: "Gen 2 / Elite i20",
        variantEngine: "1.2L Kappa Petrol",
        variantFuel: "Petrol",
        yearStart: 2014,
        yearEnd: 2020,
        notes: "Direct cross-reference specification.",
        verifiedStatus: "oem_cross_ref",
      },
    ],
  };
}

/**
 * Checks vehicle fitment compatibility for a given product and vehicle variant.
 * Enforces the invariant: Never claims a product fits without a matching record.
 */
export async function checkProductFitment(
  productId: string,
  vehicleVariantId: string
): Promise<{
  isCompatible: boolean;
  status: "verified" | "unverified" | "oem_cross_ref" | "incompatible";
  notes: string | null;
}> {
  const db = getDb();
  if (!db) {
    return {
      isCompatible: false,
      status: "incompatible",
      notes: "Database fitment records are unavailable in demo mode.",
    };
  }

  const result = await db
    .select({
      status: productFitments.verifiedStatus,
      notes: productFitments.notes,
    })
    .from(productFitments)
    .where(
      and(
        eq(productFitments.productId, productId),
        eq(productFitments.vehicleVariantId, vehicleVariantId)
      )
    )
    .limit(1);

  const first = result[0];
  if (!first) {
    return {
      isCompatible: false,
      status: "incompatible",
      notes: "No verified fitment record found for this vehicle variant.",
    };
  }

  return {
    isCompatible: true,
    status: first.status as "verified" | "unverified" | "oem_cross_ref",
    notes: first.notes,
  };
}

/**
 * Returns available vehicle makes for cascading selection.
 */
export async function getVehicleMakes() {
  if (isDatabaseConfigured()) {
    const db = getDb();
    if (db) {
      try {
        return await db.select().from(vehicleMakes).orderBy(asc(vehicleMakes.name));
      } catch (error) {
        console.error("[CatalogueService] Error fetching vehicle makes from database:", error);
        return [];
      }
    }
    return [];
  }

  if (isExplicitDevOrTest()) {
    return POPULAR_VEHICLE_MAKES.map((m) => ({
      id: m.id,
      name: m.name,
      slug: m.slug,
    }));
  }

  return [];
}

// -----------------------------------------------------------------------------
// Helper functions
// -----------------------------------------------------------------------------

function createEmptyResponse(params: ValidatedProductSearchParams): CatalogueSearchResponseDTO {
  return {
    products: [],
    totalCount: 0,
    page: params.page,
    pageSize: params.pageSize,
    totalPages: 0,
    hasNextPage: false,
    hasPreviousPage: false,
    activeFilters: {
      query: params.q || params.partNumber,
      category: params.category,
      subcategory: params.subcategory,
      brand: params.brand,
      condition: params.condition,
      minPrice: params.minPrice,
      maxPrice: params.maxPrice,
      make: params.make,
      model: params.model,
      year: params.year,
      variant: params.variant,
      inStockOnly: params.inStockOnly,
      sort: params.sort,
    },
    facets: {
      categories: [],
      brands: [],
      vehicleMakes: [],
      conditions: [],
      priceRange: { min: 0, max: 0 },
    },
    isDemoSource: false,
  };
}

function createDatabaseUnavailableResponse(
  params: ValidatedProductSearchParams
): CatalogueSearchResponseDTO {
  return {
    ...createEmptyResponse(params),
    isDatabaseUnavailable: true,
  };
}

function buildDemoFacets(demoProducts: typeof DEMO_FEATURED_PRODUCTS): FilterFacetsDTO {
  const brandCountMap = new Map<string, number>();
  const categoryCountMap = new Map<string, number>();
  let newCount = 0;
  let usedCount = 0;
  let minPrice = Infinity;
  let maxPrice = -Infinity;

  for (const p of demoProducts) {
    brandCountMap.set(p.brand, (brandCountMap.get(p.brand) ?? 0) + 1);
    categoryCountMap.set(p.categoryName, (categoryCountMap.get(p.categoryName) ?? 0) + 1);
    if (p.condition === "new") {
      newCount++;
    } else if (p.condition === "used") {
      usedCount++;
    }
    if (p.priceMinor < minPrice) minPrice = p.priceMinor;
    if (p.priceMinor > maxPrice) maxPrice = p.priceMinor;
  }

  const brandsFacet = Array.from(brandCountMap.entries()).map(([name, count]) => ({
    label: name,
    value: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    count,
  }));

  const categoriesFacet = Array.from(categoryCountMap.entries()).map(([name, count]) => ({
    label: name,
    value: name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    count,
  }));

  const vehicleMakesFacet = POPULAR_VEHICLE_MAKES.map((m) => ({
    label: m.name,
    value: m.slug,
    count: 4,
  }));

  const conditionsFacet = [
    { label: "New Spare Parts", value: "new", count: newCount },
    { label: "Pre-Owned Spare Parts", value: "used", count: usedCount },
  ];

  return {
    categories: categoriesFacet,
    brands: brandsFacet,
    vehicleMakes: vehicleMakesFacet,
    conditions: conditionsFacet,
    priceRange: {
      min: Math.floor(minPrice / 100),
      max: Math.ceil(maxPrice / 100),
    },
  };
}

async function buildDatabaseFacets(db: ActiveDb): Promise<FilterFacetsDTO> {
  try {
    const brandRows = await db
      .select({
        name: brands.name,
        slug: brands.slug,
        count: count(products.id),
      })
      .from(brands)
      .leftJoin(products, eq(brands.id, products.brandId))
      .groupBy(brands.id, brands.name, brands.slug)
      .limit(20);

    const categoryRows = await db
      .select({
        name: categories.name,
        slug: categories.slug,
        count: count(products.id),
      })
      .from(categories)
      .leftJoin(products, eq(categories.id, products.categoryId))
      .groupBy(categories.id, categories.name, categories.slug)
      .limit(20);

    const makeRows = await db
      .select({
        name: vehicleMakes.name,
        slug: vehicleMakes.slug,
      })
      .from(vehicleMakes)
      .limit(10);

    const conditionRows = await db
      .select({
        condition: sql<string>`${products.attributes}->>'condition'`,
        count: count(products.id),
      })
      .from(products)
      .groupBy(sql`${products.attributes}->>'condition'`);

    const conditionCountMap = new Map<string, number>();
    for (const row of conditionRows) {
      if (row.condition) {
        conditionCountMap.set(row.condition, Number(row.count));
      }
    }

    return {
      brands: (brandRows as FacetCountDbRow[]).map((b) => ({
        label: b.name,
        value: b.slug,
        count: Number(b.count),
      })),
      categories: (categoryRows as FacetCountDbRow[]).map((c) => ({
        label: c.name,
        value: c.slug,
        count: Number(c.count),
      })),
      vehicleMakes: (makeRows as MakeDbRow[]).map((m) => ({
        label: m.name,
        value: m.slug,
        count: 0,
      })),
      conditions: [
        {
          label: "New Spare Parts",
          value: "new",
          count: conditionCountMap.get("new") ?? 0,
        },
        {
          label: "Pre-Owned Spare Parts",
          value: "used",
          count: conditionCountMap.get("used") ?? 0,
        },
      ],
      priceRange: { min: 100, max: 50000 },
    };
  } catch {
    return {
      categories: [],
      brands: [],
      vehicleMakes: [],
      conditions: [
        { label: "New Spare Parts", value: "new", count: 0 },
        { label: "Pre-Owned Spare Parts", value: "used", count: 0 },
      ],
      priceRange: { min: 0, max: 0 },
    };
  }
}
