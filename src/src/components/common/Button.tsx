// ==============================================================================
// RASPANDO LA OLLA — BOTÓN REUTILIZABLE ACCESIBLE
// ==============================================================================

import type React from 'react';

export interface ButtonProps {
  id?: string;
  children?: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  className?: string;
  disabled?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  title?: string;
}

export function Button({
  id,
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  leftIcon,
  rightIcon,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-amber-500/50 disabled:opacity-50 disabled:cursor-not-allowed select-none whitespace-nowrap';

  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
    md: 'px-4 py-2 text-sm rounded-xl gap-2',
    lg: 'px-6 py-3 text-base rounded-xl gap-2.5',
  };

  const variantStyles = {
    primary: 'bg-amber-600 hover:bg-amber-500 active:bg-amber-700 text-slate-950 font-semibold shadow-md shadow-amber-950/40 border border-amber-400/30',
    secondary: 'bg-slate-800 hover:bg-slate-700 active:bg-slate-850 text-slate-100 border border-slate-700 shadow-sm',
    outline: 'bg-transparent hover:bg-slate-800/60 active:bg-slate-800 text-slate-200 border border-slate-700',
    danger: 'bg-red-600 hover:bg-red-500 active:bg-red-700 text-white shadow-sm',
    ghost: 'bg-transparent hover:bg-slate-800/40 text-slate-300 hover:text-white',
  };

  return (
    <button
      id={id}
      disabled={disabled || isLoading}
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {isLoading ? (
        <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        leftIcon
      )}
      <span>{children}</span>
      {!isLoading && rightIcon}
    </button>
  );
}
