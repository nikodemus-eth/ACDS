import React from 'react';

interface FormFieldProps {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  helper?: string;
  children?: React.ReactNode;
  /** Render a standard input when no children are provided */
  type?: string;
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  placeholder?: string;
  as?: 'input' | 'textarea' | 'select';
  options?: Array<{ value: string; label: string }>;
  autoComplete?: string;
}

export function FormField({
  id,
  label,
  required,
  error,
  helper,
  children,
  type = 'text',
  value,
  onChange,
  placeholder,
  as = 'input',
  options,
  autoComplete,
}: FormFieldProps) {
  const errorId = error ? `${id}-error` : undefined;
  const helperId = helper ? `${id}-helper` : undefined;
  const describedBy = [errorId, helperId].filter(Boolean).join(' ') || undefined;

  return (
    <div className="form-field">
      <label className="form-field__label" htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {children ? (
        children
      ) : as === 'textarea' ? (
        <textarea
          id={id}
          className={`form-field__input ${error ? 'form-field__input--invalid' : ''}`}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          rows={4}
        />
      ) : as === 'select' ? (
        <select
          id={id}
          className={`form-field__input ${error ? 'form-field__input--invalid' : ''}`}
          value={value}
          onChange={onChange}
          required={required}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        >
          <option value="">{placeholder || 'Select...'}</option>
          {options?.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          type={type}
          className={`form-field__input ${error ? 'form-field__input--invalid' : ''}`}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          required={required}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          autoComplete={autoComplete}
        />
      )}
      {error && (
        <div id={errorId} className="form-field__error" role="alert">
          {error}
        </div>
      )}
      {helper && !error && (
        <div id={helperId} className="form-field__helper">
          {helper}
        </div>
      )}
    </div>
  );
}
