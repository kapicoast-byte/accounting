import { useState } from 'react';
import Modal from './Modal';
import {
  DELETION_REASONS,
  createDeletionLog,
  deleteFirestoreRecord,
} from '../services/deletionLogService';
import { formatCurrency } from '../utils/format';
import { toJsDate } from '../utils/dateUtils';

function fmtDate(ts) {
  const d = toJsDate(ts);
  return d
    ? d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '—';
}

export default function DeleteRecordModal({
  open,
  onClose,
  onDeleted,
  companyId,
  record,
  recordType,
  user,
}) {
  const [reason,       setReason]       = useState('');
  const [notes,        setNotes]        = useState('');
  const [confirmInput, setConfirmInput] = useState('');
  const [deleting,     setDeleting]     = useState(false);
  const [error,        setError]        = useState(null);

  if (!record) return null;

  const isSale        = recordType === 'sale';
  const recordId      = isSale ? record.saleId    : record.purchaseId;
  const invoiceNumber = isSale ? record.invoiceNumber : record.billNumber;
  const amount        = Number(record.grandTotal) || 0;

  const notesRequired = reason === 'Other';
  const confirmMatch  = confirmInput.trim() === invoiceNumber;
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
      await createDeletionLog(companyId, {
        recordType,
        recordId,
        invoiceNumber,
        amount,
        date:         record.date,
        deletedBy: {
          uid:   user.uid,
          name:  user.displayName ?? user.email,
          email: user.email,
        },
        reason,
        notes:        notes.trim(),
        originalData: record,
      });
      await deleteFirestoreRecord(companyId, recordType, recordId);
      onDeleted(recordId);
      handleClose();
    } catch (err) {
      setError(err.message ?? 'Deletion failed. Please try again.');
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
    <Modal open={open} title="Delete Record" onClose={handleClose} size="md">
      <div className="space-y-4">

        {/* Warning banner */}
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-semibold text-red-700">This action cannot be undone.</p>
          <p className="mt-0.5 text-xs text-red-600">
            The record will be permanently deleted and stored in the Deletion Audit Trail.
          </p>
        </div>

        {/* Record summary */}
        <div className="grid grid-cols-2 gap-3 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
          <div>
            <p className="text-xs text-gray-500">Type</p>
            <p className="font-medium capitalize text-gray-800">{recordType}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">{isSale ? 'Invoice #' : 'Bill #'}</p>
            <p className="font-mono font-semibold text-gray-800">{invoiceNumber}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Date</p>
            <p className="font-medium text-gray-800">{fmtDate(record.date)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Amount</p>
            <p className="font-semibold text-gray-800">{formatCurrency(amount)}</p>
          </div>
        </div>

        {/* Deleted by (read-only) */}
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
            placeholder={notesRequired
              ? 'Required when reason is "Other"'
              : 'Any additional context…'}
            className="w-full resize-none rounded-md border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-400 focus:border-red-400"
          />
        </div>

        {/* Confirmation */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Type{' '}
            <span className="font-mono font-bold text-gray-900">{invoiceNumber}</span>
            {' '}to confirm deletion
          </label>
          <input
            type="text"
            value={confirmInput}
            onChange={(e) => setConfirmInput(e.target.value)}
            placeholder={invoiceNumber}
            className={`w-full rounded-md border px-3 py-2 text-sm outline-none transition focus:ring-2 ${
              confirmInput && !confirmMatch
                ? 'border-red-400 focus:ring-red-300'
                : 'border-gray-300 focus:ring-red-400'
            }`}
          />
        </div>

        {error && (
          <p className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
            {error}
          </p>
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
              : (
                <>
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  Delete Record
                </>
              )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
