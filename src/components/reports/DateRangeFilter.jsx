import { startOfMonth, endOfDay } from '../../utils/dateUtils';

function iso(date) {
  return date.toISOString().slice(0, 10);
}

const PRESETS = [
  {
    label: 'This Month',
    get() {
      return { from: iso(startOfMonth()), to: iso(new Date()) };
    },
  },
  {
    label: 'Last Month',
    get() {
      const now  = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const to   = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: iso(from), to: iso(to) };
    },
  },
  {
    label: 'Last 3 Months',
    get() {
      const now  = new Date();
      const from = new Date(now.getFullYear(), now.getMonth() - 3, 1);
      return { from: iso(from), to: iso(now) };
    },
  },
  {
    label: 'This Year',
    get() {
      const now  = new Date();
      const from = new Date(now.getFullYear(), 0, 1);
      return { from: iso(from), to: iso(now) };
    },
  },
];

export default function DateRangeFilter({ from, to, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <label className="text-sm text-gray-600">From</label>
      <input
        type="date"
        value={from}
        onChange={(e) => onChange({ from: e.target.value, to })}
        className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
      />
      <label className="text-sm text-gray-600">To</label>
      <input
        type="date"
        value={to}
        onChange={(e) => onChange({ from, to: e.target.value })}
        className="rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-blue-400 focus:outline-none"
      />
      <span className="text-gray-300">|</span>
      {PRESETS.map((p) => (
        <button
          key={p.label}
          type="button"
          onClick={() => onChange(p.get())}
          className="rounded-md border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-600 hover:bg-gray-50 transition"
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

export function defaultRange() {
  return { from: iso(startOfMonth()), to: iso(endOfDay()) };
}

export function toDateRange(from, to) {
  return {
    fromDate: new Date(from + 'T00:00:00'),
    toDate:   new Date(to   + 'T23:59:59'),
  };
}
