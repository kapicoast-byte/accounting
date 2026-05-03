import { useRef, useState } from 'react';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

const PROMPT = `This is a supplier/vendor bill or invoice image.
Extract the following information and return ONLY a JSON object:
{
  "vendorName": "supplier company name",
  "billNumber": "invoice or bill number",
  "billDate": "date in YYYY-MM-DD format",
  "items": [
    {
      "itemName": "product name",
      "quantity": number,
      "unit": "kg/litre/piece/etc",
      "costPrice": number,
      "gstPercent": number or 0,
      "total": number
    }
  ],
  "subtotal": number,
  "totalGST": number,
  "grandTotal": number,
  "notes": "any other relevant info"
}
Return ONLY the JSON, no markdown, no explanation.`;

async function callGemini(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async () => {
      try {
        const base64 = reader.result.split(',')[1];
        const res = await fetch(
          `${GEMINI_URL}?key=${import.meta.env.VITE_GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { inline_data: { mime_type: file.type, data: base64 } },
                  { text: PROMPT },
                ],
              }],
            }),
          },
        );
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
        const match = text.match(/\{[\s\S]*\}/);
        resolve(match ? JSON.parse(match[0]) : null);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
  });
}

export default function BillScanModal({ open, onClose, onExtracted }) {
  const [file, setFile]       = useState(null);
  const [preview, setPreview] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [error, setError]     = useState('');
  const [result, setResult]   = useState(null);
  const inputRef = useRef();

  if (!open) return null;

  function pickFile(f) {
    if (!f) return;
    setFile(f);
    setResult(null);
    setError('');
    setPreview(f.type.startsWith('image/') ? URL.createObjectURL(f) : null);
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  async function handleExtract() {
    if (!file) return;
    setScanning(true);
    setError('');
    try {
      const data = await callGemini(file);
      if (!data) throw new Error('empty');
      setResult(data);
    } catch {
      setError('Could not read bill clearly. Please fill manually or try a clearer photo.');
    } finally {
      setScanning(false);
    }
  }

  function handleUse() {
    onExtracted({ data: result, file });
    reset();
    onClose();
  }

  const card  = { background: 'var(--card)',   border: '1px solid var(--border)' };
  const bg2   = { background: 'var(--bg-2)',   border: '1px solid var(--border)' };
  const posBtn = { background: 'var(--pos)', color: '#000' };
  const secBtn = { background: 'var(--bg-2)', border: '1px solid var(--border)', color: 'var(--fg)' };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div className="w-full max-w-lg rounded-xl shadow-2xl flex flex-col" style={{ ...card, maxHeight: '90vh' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--pos)' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
            <h2 className="text-base font-semibold" style={{ color: 'var(--fg)' }}>Scan Bill with AI</h2>
          </div>
          <button onClick={handleClose} className="rounded-md p-1 transition hover:opacity-70" style={{ color: 'var(--fg-3)' }}>
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.28 4.22a.75.75 0 011.06 0L10 8.94l4.66-4.72a.75.75 0 111.06 1.06L11.06 10l4.66 4.72a.75.75 0 11-1.06 1.06L10 11.06l-4.66 4.72a.75.75 0 11-1.06-1.06L8.94 10 4.28 5.28a.75.75 0 010-1.06z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {!file ? (
            <div
              onDrop={(e) => { e.preventDefault(); pickFile(e.dataTransfer.files?.[0]); }}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => inputRef.current?.click()}
              className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer py-14 transition"
              style={{ borderColor: 'var(--border-2)', background: 'var(--bg-2)' }}
            >
              <svg className="h-12 w-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--fg-4)' }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <div className="text-center">
                <p className="text-sm font-medium" style={{ color: 'var(--fg-2)' }}>Drop bill image or click to upload</p>
                <p className="text-xs mt-1" style={{ color: 'var(--fg-4)' }}>JPG · PNG · WEBP · PDF</p>
              </div>
              <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                className="hidden" onChange={(e) => pickFile(e.target.files?.[0])} />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {preview ? (
                <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-2)' }}>
                  <img src={preview} alt="Bill preview" className="w-full max-h-56 object-contain" />
                </div>
              ) : (
                <div className="flex items-center gap-3 rounded-lg p-3" style={bg2}>
                  <svg className="h-8 w-8 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ color: 'var(--info)' }}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--fg)' }}>{file.name}</p>
                    <p className="text-xs" style={{ color: 'var(--fg-3)' }}>PDF document</p>
                  </div>
                </div>
              )}
              <button type="button" onClick={reset} className="text-xs self-start" style={{ color: 'var(--fg-4)' }}>
                ✕ Remove file
              </button>
            </div>
          )}

          {error && (
            <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'var(--neg-soft)', border: '1px solid var(--neg)', color: 'var(--neg)' }}>
              {error}
            </div>
          )}

          {result && (
            <div className="rounded-lg p-4 flex flex-col gap-2" style={{ background: 'var(--pos-soft)', border: '1px solid var(--pos)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--pos)' }}>✓ Bill extracted successfully</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                {result.vendorName  && <><span style={{ color: 'var(--fg-3)' }}>Vendor</span>      <span style={{ color: 'var(--fg)' }}>{result.vendorName}</span></>}
                {result.billNumber  && <><span style={{ color: 'var(--fg-3)' }}>Bill #</span>      <span style={{ color: 'var(--fg)' }}>{result.billNumber}</span></>}
                {result.billDate    && <><span style={{ color: 'var(--fg-3)' }}>Date</span>        <span style={{ color: 'var(--fg)' }}>{result.billDate}</span></>}
                {result.grandTotal  && <><span style={{ color: 'var(--fg-3)' }}>Grand Total</span><span className="font-bold" style={{ color: 'var(--fg)' }}>₹{result.grandTotal}</span></>}
                {result.items?.length > 0 && <><span style={{ color: 'var(--fg-3)' }}>Items</span><span style={{ color: 'var(--fg)' }}>{result.items.length} line item{result.items.length !== 1 ? 's' : ''}</span></>}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 py-3" style={{ borderTop: '1px solid var(--border)' }}>
          <button type="button" onClick={handleClose} className="rounded-md px-4 py-2 text-sm transition" style={secBtn}>
            Cancel
          </button>
          {result ? (
            <button type="button" onClick={handleUse} className="rounded-md px-4 py-2 text-sm font-semibold transition" style={posBtn}>
              Fill Form →
            </button>
          ) : (
            <button type="button" onClick={handleExtract} disabled={!file || scanning}
              className="flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition disabled:opacity-50" style={posBtn}>
              {scanning && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {scanning ? 'Extracting…' : 'Extract with AI'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
