import { SALE_STATUS } from '../../services/saleService';

const CONFIG = {
  [SALE_STATUS.PAID]:    { label: 'Paid',    classes: 'bg-green-100 text-green-800' },
  [SALE_STATUS.PARTIAL]: { label: 'Partial', classes: 'bg-amber-100 text-amber-800' },
  [SALE_STATUS.UNPAID]:  { label: 'Unpaid',  classes: 'bg-red-100 text-red-800' },
};

export default function PaymentStatusBadge({ status }) {
  const cfg = CONFIG[status] ?? { label: status ?? '—', classes: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cfg.classes}`}>
      {cfg.label}
    </span>
  );
}
