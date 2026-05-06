const INPUT = {
  borderRadius: 7,
  border: '1px solid var(--border)',
  background: 'var(--bg-2)',
  color: 'var(--fg)',
  padding: '5px 8px',
  fontSize: 13,
  outline: 'none',
};

/**
 * Consistent horizontal filter bar used across all list pages.
 *
 * Props:
 *  fromDate / onFromDate   – controlled date-range start
 *  toDate   / onToDate     – controlled date-range end
 *  search   / onSearch     – text search value + setter
 *  searchPlaceholder       – placeholder for search input (default "Search…")
 *  selects  []             – [{value, onChange, options:[{value,label}]}]
 *  extra                   – any extra JSX inserted before the refresh button
 *  label                   – small left label (e.g. "Period:")
 *  onRefresh               – refresh/generate callback; omit to hide button
 *  refreshLabel            – button text (default "Refresh")
 *  count                   – right-aligned count string (e.g. "5 bills")
 */
export default function FilterBar({
  fromDate, onFromDate,
  toDate,   onToDate,
  search,   onSearch,  searchPlaceholder = 'Search…',
  selects   = [],
  extra,
  label,
  onRefresh,
  refreshLabel = 'Refresh',
  count,
}) {
  return (
    <div style={{
      display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
      padding: '10px 14px',
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius)',
    }}>
      {label && (
        <span style={{ fontSize: 12, color: 'var(--fg-4)', flexShrink: 0, whiteSpace: 'nowrap' }}>
          {label}
        </span>
      )}

      {/* Date range */}
      {(fromDate !== undefined || toDate !== undefined) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          {fromDate !== undefined && (
            <input type="date" value={fromDate} onChange={(e) => onFromDate(e.target.value)}
              style={{ ...INPUT, width: 140 }} />
          )}
          {fromDate !== undefined && toDate !== undefined && (
            <span style={{ fontSize: 12, color: 'var(--fg-4)', userSelect: 'none' }}>to</span>
          )}
          {toDate !== undefined && (
            <input type="date" value={toDate} onChange={(e) => onToDate(e.target.value)}
              style={{ ...INPUT, width: 140 }} />
          )}
        </div>
      )}

      {/* Text search */}
      {search !== undefined && (
        <input
          type="search"
          value={search}
          placeholder={searchPlaceholder}
          onChange={(e) => onSearch(e.target.value)}
          style={{ ...INPUT, flex: '1 1 150px', minWidth: 150, padding: '5px 10px' }}
        />
      )}

      {/* Select filters */}
      {selects.map((sel, i) => (
        <select
          key={i}
          value={sel.value}
          onChange={(e) => sel.onChange(e.target.value)}
          style={{ ...INPUT, flex: '1 1 120px', minWidth: 120, maxWidth: 160, padding: '5px 10px' }}
        >
          {sel.options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      ))}

      {/* Slot for extra controls (e.g. checkbox, custom button) */}
      {extra}

      {/* Refresh / action button */}
      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          style={{
            flexShrink: 0, whiteSpace: 'nowrap',
            borderRadius: 7, border: '1px solid var(--border)',
            background: 'transparent', color: 'var(--fg-3)',
            padding: '5px 14px', fontSize: 13,
            cursor: 'pointer', transition: 'all 0.15s', fontWeight: 500,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--hover)'; e.currentTarget.style.color = 'var(--fg)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--fg-3)'; }}
        >
          {refreshLabel}
        </button>
      )}

      {/* Right-aligned count */}
      {count !== undefined && (
        <span style={{ marginLeft: 'auto', flexShrink: 0, fontSize: 12, color: 'var(--fg-4)', whiteSpace: 'nowrap' }}>
          {count}
        </span>
      )}
    </div>
  );
}
