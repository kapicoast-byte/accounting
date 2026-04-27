import { useState } from 'react';
import Modal from './Modal';
import {
  DELETION_REASONS,
  createBulkDeletionLog,
  bulkDeleteFirestoreRecords,
} from '../services/deletionLogService';
import { formatCurrency } from '../utils/format';

export default function BulkDeleteModal({
  open,
  onClose,
  onDeleted,
  companyId,
  records,
  recordType,
  user,
}) {
  const [reason,       setReason]       = useState('');
  const [notes,        setNotes]        = useState('');
  const [confirmInput, setConfirmInput] = useState('');
  const [deleting,     setDeleting]     = useState(false);
  const [error,        setError]        = useState(null);

  if (!open || !records?.length) return null;

  const isSale         = recordType === 'sale';
  const recordIds      = records.map((r) => (isSale ? r.saleId    : r.purchaseId));
  const invoiceNumbers = records.map((r) => (isSale ? r.invoiceNumber : r.billNumber));
  const totalAmount    = records.reduce((s, r) => s + (Number(r.grandTotal) || 0), 0);

  const notesRequired = reason === 'Other';
  const confirmMatch  = confirmInput.trim() === 'DELETE';
  const canDelete     =
    !!reason &&
    confirmMatch &&
    (!notesRequired || notes.trim().length > 0) &&
    !deleting;

  async function handleDelete() {
    if (!canDelete) return;
    setDeleting(true);
    setError(null);
    try {
      await createBulkDeletionLog(companyId, {
        recordType,
        recordIds,
        invoiceNumbers,
        totalAmount,
        deletedBy: {
          uid:   user.uid,
          name:  user.displayName ?? user.email,
          email: user.email,
        },
        reason,
        notes:   notes.trim(),
        records,
      });
      await bulkDeleteFirestoreRecords(companyId, recordType, recordIds);
      onDeleted(recordIds);
      handleClose();
    } catch (err) {
      setError(err.message ?? 'Bulk deletion failed. Please try again.');
      setDeleting(false);
    }
  }

  function handleClose() {
    setReason('');
    setNotes('');
    setConfirmInput('');
    setError(null);
    setDeleting(false);
    onClose();
  }

  return (
    <Modal open={open} title="Bulk Delete Records" onClose={handleClose} size="md">
      <div className="space-y-4">

        {/* Warning */}
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-700">This action cannot be undone.</p>
          <p className="mt-0.5 text-xs text-red-600">
            You are about to permanently delete {records.length}{' '}
            {recordType} {records.length === 1 ? 'record' : 'records'}.
            A single bulk deletion log will be saved in the Audit Trail.
          </p>
        </div>

        {/* Summary */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Records selected</span>
            <span className="font-semibold text-gray-900">{records.length}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Total amount</span>
            <span className="font-semibold text-gray-900">{formatCurrency(totalAmount)}</span>
          </div>
          <div className="mt-1">
            <p className="mb-1 text-xs text-gray-500">{isSale ? 'Invoice numbers' : 'Bill numbers'}</p>
            <div className="max-h-28 overflow-y-auto rounded border border-gray-200 bg-white p-2 space-y-0.5">
              {invoiceNumbers.map((inv, i) => (
                <p key={i} className="font-mono text-xs text-gray-700">{inv}</p>
              ))}
            </div>
          </div>
        </div>

        {/* Deleted by */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Deleted by</label>
          <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
            {user?.displayName ?? user?.email}
          </p>
        </div>

        {/* Reason */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Reason for deletion <span className="text-red-500">*</span>
          </label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400 focus:border-red-400"
          >
            <option value="">— Select a reason —</option>
            {DELETION_REASONS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Additional notes{' '}
            {notesRequired
              ? <span className="text-red-500">*</span>
              : <span className="font-normal text-gray-400">(optional)</span>}
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={notesRequired ? 'Required when reason is "Other"' : 'Any additional context…'}
            className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400 focus:border-red-400"
          />
        </div>

        {/* Confirmation */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Type <span className="font-mono font-bold text-gray-900">DELETE</span> to confirm
          </label>
          <input
            type="text"
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            placeholder="DELETE"
            className={`w-full rounded-md border px-3 py-2 text-sm outline-none transition focus:ring-2 ${
              confirmInput && !confirmMatch
                ? 'border-red-400 focus:ring-red-300'
                : 'border-gray-300 focus:ring-red-400'
            }`}
          />
        </div>

        {error && (
          <p className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-3 pt-1">
          <button
            type="button"
            onClick={handleClose}
            disabled={deleting}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canDelete}
            onClick={handleDelete}
            className="flex items-center gap-1.5 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition"
          >
            {deleting
              ? 'Deleting…'
              : `Delete All ${records.length} Records`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
