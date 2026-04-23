// Escapes a single CSV cell value.
function cell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

// columns: [{ key, header }]
// rows: array of objects
export function buildCSV(columns, rows) {
  const header = columns.map((c) => cell(c.header)).join(',');
  const body = rows.map((row) =>
    columns.map((c) => cell(typeof c.format === 'function' ? c.format(row[c.key], row) : row[c.key])).join(','),
  );
  return [header, ...body].join('\r\n');
}

export function downloadCSV(filename, csv) {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportCSV(filename, columns, rows) {
  downloadCSV(filename, buildCSV(columns, rows));
}
