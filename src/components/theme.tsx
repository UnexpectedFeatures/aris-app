export const card =
  "rounded-3xl bg-white p-5 space-y-3 shadow-[0_1px_2px_rgba(16,32,20,0.05)]";
export const input =
  "h-10 rounded-xl border border-[#E2E8E4] bg-[#FAFBFA] px-3.5 text-[13px] text-[#111C14] outline-none focus:border-[#2F7043] focus:ring-2 focus:ring-[#2F7043]/10 disabled:cursor-not-allowed disabled:opacity-50";
export const btn =
  "h-9 rounded-xl border border-[#E2E8E4] bg-white px-3.5 text-[13px] font-medium text-[#3D4A41] transition-colors hover:bg-[#F7F9F8] disabled:cursor-not-allowed disabled:opacity-50";
export const btnPrimary =
  "h-9 rounded-xl bg-[#2F7043] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#276039] active:bg-[#214F30] disabled:cursor-not-allowed disabled:opacity-50";
export const btnDanger =
  "h-9 rounded-xl border border-[#E2E8E4] bg-white px-3.5 text-[13px] font-medium text-[#C0392B] transition-colors hover:bg-[#FBECEC] disabled:cursor-not-allowed disabled:opacity-50";
export const alertErr =
  "rounded-2xl border border-[#F2CACA] bg-[#FBECEC] px-3.5 py-2.5 text-[13px] text-[#C0392B]";
export const alertOk =
  "rounded-2xl border border-[#D7EBDD] bg-[#EAF4EE] px-3.5 py-2.5 text-[13px] text-[#2F7043]";

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
