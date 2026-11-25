import React from "react";
import { getCurrentAdminUser } from "@/features/auth/service";
import { ROLES, hasRole, hasPermission, PERMISSIONS } from "@/lib/auth/rbac";
import { AdminAccessDenied } from "@/components/admin/admin-access-denied";
import { getDb } from "@/lib/db";
import { adminAuditLogs, users } from "@/lib/db/schema";
import { eq, desc, count } from "drizzle-orm";
import {
  FileText,
  Shield,
  Activity,
  Tag,
} from "lucide-react";

export const metadata = {
  title: "Admin Activity & Audit Logs — HS Spare Parts Admin",
  description: "Cryptographic, immutable audit trail of privileged administrative operations.",
};

interface AuditLogItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: unknown;
  actorName: string;
  actorEmail: string;
  createdAt: Date;
}

export default async function AdminLogsPage() {
  const currentUser = await getCurrentAdminUser();

  const isAuthorized =
    currentUser &&
    !currentUser.roles.includes(ROLES.CUSTOMER) &&
    (hasRole(currentUser.roles, [
      ROLES.ADMINISTRATOR,
      ROLES.SUPER_ADMINISTRATOR,
    ]) || hasPermission(currentUser.permissions, PERMISSIONS.CATALOGUE_WRITE));

  if (!isAuthorized) {
    return <AdminAccessDenied />;
  }

  const db = getDb();
  let logs: AuditLogItem[] = [];
  let totalLogs = 0;

  if (db) {
    try {
      const [countRes, rows] = await Promise.all([
        db.select({ val: count() }).from(adminAuditLogs),
        db
          .select({
            id: adminAuditLogs.id,
            action: adminAuditLogs.action,
            entityType: adminAuditLogs.entityType,
            entityId: adminAuditLogs.entityId,
            metadata: adminAuditLogs.metadata,
            createdAt: adminAuditLogs.createdAt,
            actorName: users.name,
            actorEmail: users.emailNormalized,
          })
          .from(adminAuditLogs)
          .leftJoin(users, eq(adminAuditLogs.actorUserId, users.id))
          .orderBy(desc(adminAuditLogs.createdAt))
          .limit(50),
      ]);

      totalLogs = Number(countRes[0]?.val || 0);

      logs = rows.map((r) => ({
        id: r.id,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        metadata: r.metadata,
        actorName: r.actorName || "System / Operator",
        actorEmail: r.actorEmail || "automated@system",
        createdAt: r.createdAt,
      }));
    } catch (err) {
      console.error("[Admin Logs] Query error:", err);
    }
  }

  const securityEventsCount = logs.filter(
    (l) => l.action.includes("password") || l.action.includes("auth") || l.action.includes("role")
  ).length;

  const catalogueEventsCount = logs.filter(
    (l) => l.entityType === "product" || l.entityType === "category" || l.entityType === "brand"
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2">
        <div>
          <h1 className="text-xl font-black text-gray-900">Activity & Audit Trail</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Immutable, server-recorded ledger of administrative actions, catalogue changes, and security events.
          </p>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Total Log Entries
            </span>
            <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-ember">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-gray-900 mt-2">{totalLogs}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">Recorded operations</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-purple-600 uppercase tracking-wider">
              Security Events
            </span>
            <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-600">
              <Shield className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-gray-900 mt-2">{securityEventsCount}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">Credential & authorization updates</div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
              Catalogue Operations
            </span>
            <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
              <Tag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-gray-900 mt-2">{catalogueEventsCount}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">Products, brands & categories</div>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-bold text-gray-900">Recorded Operations Ledger</h3>
          <span className="text-xs text-gray-400">Showing last 50 entries</span>
        </div>

        {logs.length === 0 ? (
          <div className="py-16 text-center text-gray-400">
            <FileText className="w-10 h-10 mx-auto text-gray-300 stroke-1 mb-2" />
            <p className="text-sm font-semibold text-gray-700">No activity logs recorded yet</p>
            <p className="text-xs text-gray-400 mt-1">
              Actions performed by administrators in the portal will be immutably recorded here.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F8F9FA] text-gray-500 font-semibold uppercase tracking-wider text-[10px] border-b border-gray-200">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">Operator / Actor</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Target Entity</th>
                  <th className="py-3 px-4">Metadata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono text-[11px] text-gray-500 whitespace-nowrap">
                      {new Date(log.createdAt).toLocaleString("en-IN", {
                        dateStyle: "short",
                        timeStyle: "medium",
                      })}
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-bold text-gray-900">{log.actorName}</div>
                      <div className="text-[11px] text-gray-400 font-mono">{log.actorEmail}</div>
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                          log.action.includes("password")
                            ? "bg-purple-50 text-purple-700 border border-purple-200"
                            : log.action.includes("delete")
                            ? "bg-red-50 text-red-700 border border-red-200"
                            : log.action.includes("create")
                            ? "bg-green-50 text-green-700 border border-green-200"
                            : "bg-blue-50 text-blue-700 border border-blue-200"
                        }`}
                      >
                        {log.action}
                      </span>
                    </td>

                    <td className="py-3 px-4">
                      <div className="text-gray-900 font-medium capitalize">{log.entityType}</div>
                      <div className="text-[10px] text-gray-400 font-mono max-w-[140px] truncate">
                        {log.entityId}
                      </div>
                    </td>

                    <td className="py-3 px-4 font-mono text-[11px] text-gray-500 max-w-xs truncate">
                      {log.metadata ? JSON.stringify(log.metadata) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
