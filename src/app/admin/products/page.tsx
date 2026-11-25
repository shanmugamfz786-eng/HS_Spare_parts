import { redirect } from "next/navigation";

export const metadata = {
  title: "Admin Catalogue Management — HS Spare Parts",
  description: "Administrator console for managing brands, categories, and spare parts.",
};

export default function AdminProductsPage() {
  redirect("/admin/brands");
}
