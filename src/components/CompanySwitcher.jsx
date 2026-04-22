import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function CompanySwitcher() {
  const { companies, activeCompany, switchCompany } = useApp();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function handleSelect(companyId) {
    if (companyId !== activeCompany?.companyId) {
      await switchCompany(companyId);
    }
    setOpen(false);
  }

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="font-medium">
          {activeCompany?.companyName ?? 'Select company'}
        </span>
        {activeCompany?.type === 'subsidiary' && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
            Sub
          </span>
        )}
        <svg className="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 z-10 mt-1 w-64 origin-top-right rounded-md border border-gray-200 bg-white shadow-lg"
        >
          <ul className="max-h-64 overflow-auto py-1">
            {companies.map((c) => {
              const isActive = c.companyId === activeCompany?.companyId;
              return (
                <li key={c.companyId}>
                  <button
                    type="button"
                    onClick={() => handleSelect(c.companyId)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                      isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                    }`}
                  >
                    <span className="truncate">{c.companyName}</span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                      {c.type}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-gray-100">
            <Link
              to="/create-company"
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm text-blue-600 hover:bg-gray-50"
            >
              + Add a company
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
