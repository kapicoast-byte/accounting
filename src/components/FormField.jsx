export default function FormField({ label, id, error, ...inputProps }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-gray-700">
        {label}
      </label>
      <input
        id={id}
        className={`rounded-md border px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
          error ? 'border-red-500 bg-red-50' : 'border-gray-300 bg-white'
        }`}
        {...inputProps}
      />
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
