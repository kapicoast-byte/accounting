import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';

function CompanyAvatar({ company, size = 'sm' }) {
  const dim = size === 'sm' ? 24 : 28;
  if (company?.logoUrl) {
    return (
      <img
        src={company.logoUrl}
        alt=""
        style={{ width: dim, height: dim, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }}
      />
    );
  }
  const letter = (company?.companyName ?? '?')[0].toUpperCase();
  return (
    <span style={{
      width: dim, height: dim, borderRadius: 6, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--pos-soft)', color: 'var(--pos)',
      fontSize: size === 'sm' ? 11 : 13, fontWeight: 700,
    }}>
      {letter}
    </span>
  );
}

export default function CompanySwitcher() {
  const { companies, activeCompany, switchCompany } = useApp();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    function onClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  async function handleSelect(companyId) {
    if (companyId !== activeCompany?.companyId) await switchCompany(companyId);
    setOpen(false);
  }

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      {/* Pill trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 10px 5px 6px', borderRadius: 999,
          background: 'var(--card-2)', border: '1px solid var(--border)',
          cursor: 'pointer', transition: 'background 0.15s',
          maxWidth: 220,
        }}
      >
        <CompanyAvatar company={activeCompany} size="sm" />
        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--fg)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeCompany?.companyName ?? 'Select company'}
        </span>
        {activeCompany?.type === 'subsidiary' && (
          <span style={{
            fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
            padding: '1px 5px', borderRadius: 4, flexShrink: 0,
            background: 'var(--border)', color: 'var(--fg-3)', textTransform: 'uppercase',
          }}>
            Sub
          </span>
        )}
        <svg viewBox="0 0 20 20" fill="currentColor"
          style={{ width: 14, height: 14, color: 'var(--fg-3)', flexShrink: 0, transform: open ? 'rotate(180deg)' : '', transition: 'transform 0.2s' }}>
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.06l3.71-3.83a.75.75 0 111.08 1.04l-4.25 4.39a.75.75 0 01-1.08 0L5.21 8.27a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          role="listbox"
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 50,
            width: 260, background: 'var(--card-2)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius)', padding: '6px',
            boxShadow: '0 16px 40px oklch(0 0 0 / 0.5)',
          }}
        >
          <ul style={{ maxHeight: 240, overflowY: 'auto', margin: 0, padding: 0, listStyle: 'none' }}>
            {companies.map((c) => {
              const isActive = c.companyId === activeCompany?.companyId;
              return (
                <li key={c.companyId}>
                  <button
                    type="button"
                    onClick={() => handleSelect(c.companyId)}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      background: isActive ? 'var(--pos-soft)' : 'transparent',
                      transition: 'background 0.1s', textAlign: 'left',
                    }}
                  >
                    <CompanyAvatar company={c} size="sm" />
                    <span style={{ flex: 1, fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? 'var(--pos)' : 'var(--fg-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.companyName}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', padding: '1px 5px', borderRadius: 4, flexShrink: 0, background: 'var(--border)', color: 'var(--fg-3)', textTransform: 'uppercase' }}>
                      {c.type}
                    </span>
                    {isActive && (
                      <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 14, height: 14, color: 'var(--pos)', flexShrink: 0 }}>
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
            <Link
              to="/company/profile"
              onClick={() => setOpen(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 8,
                fontSize: 13, color: 'var(--fg-2)', textDecoration: 'none',
              }}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 14, height: 14, color: 'var(--fg-3)' }}>
                <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
              Company Profile
            </Link>
            <Link
              to="/create-company"
              onClick={() => setOpen(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', borderRadius: 8,
                fontSize: 13, color: 'var(--pos)', textDecoration: 'none',
              }}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" style={{ width: 14, height: 14 }}>
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
