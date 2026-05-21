import React from "react";

export function DashboardCard({ title, subtitle, actions, children, className = "" }) {
  return (
    <section className={`rounded-2xl border border-white/10 bg-white/[0.04] p-4 shadow-sm sm:p-5 ${className}`}>
      {(title || subtitle || actions) && (
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            {title && <h2 className="break-words text-base font-semibold text-white">{title}</h2>}
            {subtitle && <p className="mt-1 break-words text-sm text-slate-400">{subtitle}</p>}
          </div>

          {actions && (
            <div className="flex flex-wrap gap-2 sm:shrink-0">
              {actions}
            </div>
          )}
        </div>
      )}

      {children}
    </section>
  );
}

export function StatCard({ label, value, helper, icon, tone = "neutral" }) {
  const tones = {
    neutral: "border-white/10 bg-white/[0.04]",
    good: "border-emerald-400/20 bg-emerald-400/10",
    warn: "border-yellow-400/20 bg-yellow-400/10",
    danger: "border-red-400/20 bg-red-400/10",
    info: "border-blue-400/20 bg-blue-400/10",
  };

  return (
    <div className={`rounded-2xl border p-4 sm:p-5 ${tones[tone] || tones.neutral}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 break-words text-sm text-slate-400">{label}</p>
        {icon && <div className="shrink-0 text-slate-300">{icon}</div>}
      </div>

      <div className="mt-3 break-words text-2xl font-bold text-white sm:text-3xl">
        {value}
      </div>

      {helper && <p className="mt-2 break-words text-sm text-slate-400">{helper}</p>}
    </div>
  );
}

export function SectionHeader({ title, subtitle, actions }) {
  return (
    <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h2 className="break-words text-lg font-semibold text-white">{title}</h2>
        {subtitle && <p className="mt-1 break-words text-sm text-slate-400">{subtitle}</p>}
      </div>

      {actions && (
        <div className="flex flex-wrap gap-2 sm:shrink-0">
          {actions}
        </div>
      )}
    </div>
  );
}

export function StatusBadge({ children, tone = "neutral" }) {
  const tones = {
    neutral: "bg-slate-500/15 text-slate-300 border-slate-400/20",
    good: "bg-emerald-500/15 text-emerald-300 border-emerald-400/20",
    warn: "bg-yellow-500/15 text-yellow-300 border-yellow-400/20",
    danger: "bg-red-500/15 text-red-300 border-red-400/20",
    info: "bg-blue-500/15 text-blue-300 border-blue-400/20",
  };

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${tones[tone] || tones.neutral}`}>
      {children}
    </span>
  );
}

export function ActionButton({ children, onClick, type = "button", disabled = false, tone = "primary" }) {
  const tones = {
    primary: "bg-white text-slate-950 hover:bg-slate-200",
    secondary: "bg-white/10 text-white hover:bg-white/15 border border-white/10",
    danger: "bg-red-500 text-white hover:bg-red-400",
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`rounded-xl px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 ${tones[tone] || tones.primary}`}
    >
      {children}
    </button>
  );
}

export function LoadingState({ title = "Loading", message = "Fetching latest dashboard data..." }) {
  return (
    <DashboardCard>
      <div className="flex items-center gap-3 text-slate-300">
        <div className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/20 border-t-white" />
        <div className="min-w-0">
          <p className="break-words font-medium text-white">{title}</p>
          <p className="break-words text-sm text-slate-400">{message}</p>
        </div>
      </div>
    </DashboardCard>
  );
}

export function EmptyState({ title = "Nothing here yet", message = "There is no data to show right now." }) {
  return (
    <DashboardCard>
      <div className="py-6 text-center">
        <p className="break-words font-semibold text-white">{title}</p>
        <p className="mt-1 break-words text-sm text-slate-400">{message}</p>
      </div>
    </DashboardCard>
  );
}

export function ErrorState({ title = "Something went wrong", message = "Try refreshing the dashboard." }) {
  return (
    <DashboardCard className="border-red-400/20 bg-red-500/10">
      <p className="break-words font-semibold text-red-200">{title}</p>
      <p className="mt-1 break-words text-sm text-red-200/80">{message}</p>
    </DashboardCard>
  );
}

export function DataTable({ columns = [], rows = [], emptyMessage = "No records found." }) {
  if (!rows.length) {
    return <EmptyState title="No data" message={emptyMessage} />;
  }

  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-white/10">
      <table className="w-full min-w-[720px] border-collapse text-left text-sm">
        <thead className="bg-white/[0.04] text-slate-300">
          <tr>
            {columns.map((column) => (
              <th key={column.key} className="whitespace-nowrap px-4 py-3 font-semibold">
                {column.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody className="divide-y divide-white/10">
          {rows.map((row, index) => (
            <tr key={row.id || index} className="text-slate-300">
              {columns.map((column) => (
                <td key={column.key} className="px-4 py-3 align-top">
                  <div className="max-w-[320px] break-words">
                    {column.render ? column.render(row) : row[column.key]}
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}