'use client';
import { useState, forwardRef } from 'react';
import { Eye, EyeOff } from 'lucide-react';

const PasswordInput = forwardRef(function PasswordInput(
  { className = '', autoComplete = 'current-password', ...props },
  ref,
) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        ref={ref}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        suppressHydrationWarning
        {...props}
        className={
          'w-full bg-white/5 border border-white/10 rounded-xl pl-4 pr-11 py-3 outline-none focus:border-pink-400/50 ' +
          className
        }
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        suppressHydrationWarning
        className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 grid place-items-center rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition"
      >
        {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
});

export default PasswordInput;
