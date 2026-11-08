import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import './index.css';

const FormInput = ({
  label,
  id,
  name,
  type = 'text',
  value,
  onChange,
  placeholder,
  required = false,
  disabled = false,
  error,
  helperText,
  prefix,
  showPasswordToggle = false,
  options, // for select
  rows = 3,
  className = '',
  ...props
}) => {
  const inputId = id || name;
  const isPassword = type === 'password';
  const shouldEnableToggle = isPassword || showPasswordToggle;
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);

  const effectiveType = shouldEnableToggle && isPassword
    ? (isPasswordVisible ? 'text' : 'password')
    : type;

  return (
    <div className={`form-group ${className}`}>
      {label && (
        <label htmlFor={inputId} className="form-label">
          <span>
            {label}
            {required && <span className="form-required">*</span>}
          </span>
        </label>
      )}

      <div className="form-input-container">
        {prefix && <span className="form-prefix">{prefix}</span>}

        {type === 'select' ? (
          <select
            id={inputId}
            name={name}
            value={value}
            onChange={onChange}
            disabled={disabled}
            className={`form-select ${error ? 'form-input-error' : ''} ${
              disabled ? 'form-input-disabled' : ''
            }`}
            required={required}
            {...props}
          >
            {options?.map((opt, idx) => (
              <option key={idx} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))}
          </select>
        ) : type === 'textarea' ? (
          <textarea
            id={inputId}
            name={name}
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            disabled={disabled}
            rows={rows}
            className={`form-textarea ${error ? 'form-input-error' : ''} ${
              disabled ? 'form-input-disabled' : ''
            }`}
            required={required}
            {...props}
          />
        ) : (
          <>
            <input
              id={inputId}
              name={name}
              type={effectiveType}
              value={value}
              onChange={onChange}
              placeholder={placeholder}
              disabled={disabled}
              className={`form-input ${prefix ? 'form-input-with-prefix' : ''} ${
                shouldEnableToggle && isPassword ? 'form-input-with-toggle' : ''
              } ${error ? 'form-input-error' : ''} ${disabled ? 'form-input-disabled' : ''}`}
              required={required}
              {...props}
            />
            {shouldEnableToggle && isPassword && (
              <button
                type="button"
                className="form-password-toggle"
                onClick={() => setIsPasswordVisible((prev) => !prev)}
                aria-label={isPasswordVisible ? 'Hide password' : 'Show password'}
                aria-pressed={isPasswordVisible}
                tabIndex={0}
              >
                {isPasswordVisible ? (
                  <EyeOff size={18} aria-hidden="true" />
                ) : (
                  <Eye size={18} aria-hidden="true" />
                )}
              </button>
            )}
          </>
        )}
      </div>

      {error ? (
        <span className="form-error-text">{error}</span>
      ) : helperText ? (
        <span className="form-helper-text">{helperText}</span>
      ) : null}
    </div>
  );
};

export default FormInput;
