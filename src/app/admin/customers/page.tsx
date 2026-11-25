import React from "react";
import { getCurrentAdminUser } from "@/features/auth/service";
import { ROLES, hasRole, hasPermission, PERMISSIONS } from "@/lib/auth/rbac";
import { AdminAccessDenied } from "@/components/admin/admin-access-denied";
import { getDb } from "@/lib/db";
import { users, orders, userRoles, roles } from "@/lib/db/schema";
import { count, eq, desc } from "drizzle-orm";
import { getFromAdminCache, setAdminCache } from "@/features/admin/service";
import { AdminCustomersClient, type CustomerListItemDTO } from "@/components/admin/admin-customers-client";

export const metadata = {
  title: "Customer Management — HS Spare Parts Admin",
  description: "Manage registered customer accounts, view order histories, and inspect account statuses.",
};

export default async function AdminCustomersPage() {
  const currentUser = await getCurrentAdminUser();

  const isAuthorized =
    currentUser &&
    !currentUser.roles.includes(ROLES.CUSTOMER) &&
    (hasRole(currentUser.roles, [
      ROLES.ADMINISTRATOR,
      ROLES.SUPER_ADMINISTRATOR,
      ROLES.ORDER_MANAGER,
    ]) || hasPermission(currentUser.permissions, PERMISSIONS.ADMIN_ACCESS));

  if (!isAuthorized) {
    return <AdminAccessDenied />;
  }

  const db = getDb();
  let customerList: CustomerListItemDTO[] = [];

  const cachedCustomers = getFromAdminCache<CustomerListItemDTO[]>("admin:customers_list");
  if (cachedCustomers) {
    customerList = cachedCustomers;
  } else if (db) {
    try {
      const [allUsers, userRoleRows, orderCounts] = await Promise.all([
        db
          .select({
            id: users.id,
            name: users.name,
            email: users.emailNormalized,
            phone: users.phone,
            status: users.status,
            createdAt: users.createdAt,
          })
          .from(users)
          .orderBy(desc(users.createdAt)),

        db
          .select({
            userId: userRoles.userId,
            roleKey: roles.key,
          })
          .from(userRoles)
          .innerJoin(roles, eq(userRoles.roleId, roles.id)),

        db
          .select({
            userId: orders.userId,
            orderCount: count(),
          })
          .from(orders)
          .groupBy(orders.userId),
      ]);

      const rolesByUser = new Map<string, string[]>();
      for (const ur of userRoleRows) {
        const list = rolesByUser.get(ur.userId) || [];
        list.push(ur.roleKey);
        rolesByUser.set(ur.userId, list);
      }

      const ordersByUser = new Map<string, number>();
      for (const oc of orderCounts) {
        if (oc.userId) {
          ordersByUser.set(oc.userId, Number(oc.orderCount || 0));
        }
      }

      customerList = allUsers.map((u) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        status: u.status,
        rolesList: rolesByUser.get(u.id) || ["customer"],
        ordersCount: ordersByUser.get(u.id) || 0,
        createdAt: u.createdAt,
      }));

      setAdminCache("admin:customers_list", customerList);
    } catch (err) {
      console.error("[Admin Customers] Failed to load customers:", err);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2">
        <div>
          <h1 className="text-xl font-black text-gray-900 tracking-tight">Registered Accounts & Customers</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Directory of registered store accounts, customer profiles, role assignments, and order activity.
          </p>
        </div>
      </div>

      <AdminCustomersClient initialCustomers={customerList} />
    </div>
  );
}
