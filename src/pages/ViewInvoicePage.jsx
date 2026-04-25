import { useCallback, useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { getSale, SALE_STATUS } from '../services/saleService';
import LoadingSpinner from '../components/LoadingSpinner';
import PaymentStatusBadge from '../components/sales/PaymentStatusBadge';
import PaymentModal from '../components/sales/PaymentModal';
import InvoicePrintLayout from '../components/sales/InvoicePrintLayout';
import { generateInvoicePDF } from '../utils/invoicePdf';

export default function ViewInvoicePage() {
  const { saleId } = useParams();
  const { activeCompanyId, activeCompany } = useApp();
  const navigate = useNavigate();

  const [sale, setSale] = useState(null);
  const [loading, setLoading] = useState(true);
  const [payOpen, setPayOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const load = useCallback(async () => {
    if (!activeCompanyId || !saleId) return;
    setLoading(true);
    try {
      const data = await getSale(activeCompanyId, saleId);
      if (!data) { navigate('/sales', { replace: true }); return; }
      setSale(data);
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, saleId, navigate]);

  useEffect(() => { load(); }, [load]);

  function handlePaid(updated) {
    setSale((prev) => ({ ...prev, ...updated }));
    setPayOpen(false);
  }

  function handleDownloadPDF() {
    if (!sale || pdfBusy) return;
    setPdfBusy(true);
    try {
      generateInvoicePDF(sale, activeCompany);
    } finally {
      setPdfBusy(false);
    }
  }

  if (loading) return <div className="flex items-center justify-center py-20"><LoadingSpinner /></div>;
  if (!sale)   return null;

  return (
    <div className="flex flex-col gap-6">
      {/* Action bar — hidden on print */}
      <div className="print:hidden flex flex-wrap items-center justify-between gap-3">
        <Link to="/sales" className="text-sm text-gray-500 hover:text-gray-700">← Sales</Link>
        <div className="flex items-center gap-3">
          <PaymentStatusBadge status={sale.status} />
          {sale.status !== SALE_STATUS.PAID && (
            <button type="button" onClick={() => setPayOpen(true)}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700">
              Collect payment
            </button>
          )}
          <button type="button" onClick={() => window.print()}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
            Print
          </button>
          <button type="button" onClick={handleDownloadPDF} disabled={pdfBusy}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
            {pdfBusy ? 'Generating…' : 'Download PDF'}
          </button>
        </div>
      </div>

      <InvoicePrintLayout sale={sale} company={activeCompany} />

      <PaymentModal
        open={payOpen}
        companyId={activeCompanyId}
        sale={sale}
        onClose={() => setPayOpen(false)}
        onPaid={handlePaid}
      />
    </div>
  );
}
