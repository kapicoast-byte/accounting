export default function ReportLayout({ title, subtitle, actions, dateFilter, children, loading }) {
  return (
    <div className="flex flex-col gap-5">
      {/* Screen header — hidden on print */}
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a1 1 0 001 1h8a1 1 0 001-1v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9h8v4H6v-4zm8-4a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd" />
            </svg>
            Print
          </button>
          {actions}
        </div>
      </div>

      {/* Date filter row */}
      {dateFilter && <div>{dateFilter}</div>}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-gray-500 print:hidden">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading…
        </div>
      )}

      {/* Print title — only shown on print */}
      <div className="hidden print:block print:mb-4">
        <h1 className="text-xl font-bold">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>

      {children}
    </div>
  );
}
