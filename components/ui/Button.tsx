import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", fullWidth = false, className = "", children, ...props }, ref) => {
    const base =
      "inline-flex items-center justify-center px-5 py-3 font-semibold uppercase tracking-widest text-sm rounded-md transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-studyrank-purple/60";

    const variants = {
      primary:
        "bg-studyrank-purple text-studyrank-primary hover:bg-[#5a52c0] active:bg-[#4e47ae]",
      secondary:
        "bg-studyrank-card border border-studyrank-border text-studyrank-primary hover:bg-studyrank-surface active:bg-studyrank-base",
    };

    return (
      <button
        ref={ref}
        className={`${base} ${variants[variant]} ${fullWidth ? "w-full" : ""} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
