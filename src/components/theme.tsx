export const card = "rounded-lg border border-[#D6D6D6] bg-white p-4 space-y-3";
export const input =
  "rounded-md border border-[#D6D6D6] bg-white px-3 py-1.5 text-sm text-[#1E293B] outline-none focus:ring-2 focus:ring-[#047857] disabled:opacity-50";
export const btn =
  "rounded-md border border-[#D6D6D6] bg-white px-3 py-1.5 text-sm font-medium text-[#1E293B] hover:bg-[#EDEDED] disabled:cursor-not-allowed disabled:opacity-50";
export const btnPrimary =
  "rounded-md bg-[#047857] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#065F46] active:bg-[#064E3B] disabled:cursor-not-allowed disabled:opacity-50";
export const btnDanger =
  "rounded-md border border-red-500 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50";
export const alertErr =
  "rounded-md border border-red-500 bg-red-50 px-3 py-2 text-sm text-red-700";
export const alertOk =
  "rounded-md border border-[#047857] bg-[#047857]/10 px-3 py-2 text-sm text-[#064E3B]";

export default function Pager({
  page,
  totalPages,
  total,
  disabled,
  onChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  disabled?: boolean;
  onChange: (page: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 text-sm text-[#64748B]">
      <span>
        Page {page} of {totalPages} · {total} total
      </span>
      <div className="flex gap-2">
        <button
          className={btn}
          disabled={disabled || page <= 1}
          onClick={() => onChange(1)}
        >
          First
        </button>
        <button
          className={btn}
          disabled={disabled || page <= 1}
          onClick={() => onChange(page - 1)}
        >
          Prev
        </button>
        <button
          className={btn}
          disabled={disabled || page >= totalPages}
          onClick={() => onChange(page + 1)}
        >
          Next
        </button>
        <button
          className={btn}
          disabled={disabled || page >= totalPages}
          onClick={() => onChange(totalPages)}
        >
          Last
        </button>
      </div>
    </div>
  );
}
