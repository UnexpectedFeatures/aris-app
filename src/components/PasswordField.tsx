import { useState } from "react";

export const isPasswordValid = (value: string) =>
  value.length >= 8 &&
  value.length <= 15 &&
  /[A-Z]/.test(value) &&
  /\d/.test(value) &&
  /[^A-Za-z0-9]/.test(value);

export default function PasswordField({
  value,
  onChange,
  label = "Password",
  id = "password",
  placeholder = "••••••••",
  required,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  id?: string;
  placeholder?: string;
  required?: boolean;
}) {
  const [visible, setVisible] = useState(false);
  const hasValue = value.length > 0;
  const valid = isPasswordValid(value);

  return (
    <div>
      {label && (
        <label htmlFor={id} className="text-[12.5px] font-medium block mb-1.5" style={{ color: "#3d4a41" }}>
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          aria-label={label || "Password"}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={15}
          placeholder={placeholder}
          autoComplete="new-password"
          className="w-full h-10 px-3.5 pr-11 rounded-xl border text-[13.5px] outline-none focus:border-[#3a7d4e] placeholder:text-[#8fa394]"
          style={{ borderColor: hasValue && !valid ? "#f1a5a5" : "#e2e8e4" }}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#8fa394] hover:text-[#5a6b5e] transition-colors"
          aria-label={visible ? "Hide password" : "Show password"}
        >
          {visible ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-4 h-4">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
      {hasValue && !valid && (
        <p className="mt-1 text-[11px] text-red-500">
          Must be 8–15 characters with at least one capital letter, one number, and one symbol.
        </p>
      )}
    </div>
  );
}

