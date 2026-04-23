import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

function CompanyAvatar({ company, size = 'sm' }) {
  const dim = size === 'sm' ? 'h-6 w-6 text-xs' : 'h-8 w-8 text-sm';
  if (company?.logoUrl) {
    return (
      <img
        src={company.logoUrl}
        alt=""
        className={`${dim} rounded-md object-cover flex-shrink-0`}
      />
    );
  }
  return (
    <span className={`${dim} flex flex-shrink-0 items-center justify-center rounded-md bg-blue-100 font-bold uppercase text-blue-700`}>
      {(company?.companyName ?? '?')[0]}
    </span>
  );
}

export default function CompanySwitcher() {
  const { companies, activeCompany, switchCompany } = useApp();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const navigate = useNavigate();

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
        className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <CompanyAvatar company={activeCompany} size="sm" />
        <span className="font-medium max-w-[140px] truncate">
          {activeCompany?.companyName ?? 'Select company'}
        </span>
        {activeCompany?.type === 'subsidiary' && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
            Sub
          </span>
        )}
        <svg className="h-4 w-4 text-gray-400 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
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
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${
                      isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
                    }`}
                  >
                    <CompanyAvatar company={c} size="sm" />
                    <span className="flex-1 truncate">{c.companyName}</span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-gray-500">
                      {c.type}
                    </span>
                    {isActive && (
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-blue-600 flex-shrink-0">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="border-t border-gray-100 py-1">
            <Link
              to="/company/profile"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-gray-400">
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
              Company Profile
            </Link>
            <Link
              to="/create-company"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-gray-50"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Add a company
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
