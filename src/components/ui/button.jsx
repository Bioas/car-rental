import React from 'react'

const variants = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  success: 'btn-success',
  danger: 'btn-danger',
  ghost: 'btn-ghost',
}

const sizes = {
  sm: 'btn-sm',
  lg: 'btn-lg',
}

export function Button({ children, variant = 'primary', size, className = '', disabled, loading, onClick, type = 'button', ...props }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      onClick={onClick}
      className={`${variants[variant] || variants.primary} ${size ? sizes[size] || '' : ''} ${className}`}
      {...props}
    >
      {loading && (
        <i className="bx bx-loader-alt text-base animate-spin"></i>
      )}
      {children}
    </button>
  )
}
