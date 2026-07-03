/* =====================================================================
   Field (.field) — label + control + optional hint / inline error.
   Wraps native <input>/<select>/<textarea> so the prototype's form markup
   is reproduced exactly while keeping controls uncontrolled/controlled as
   each screen needs. Pass `error` to show a validation message and mark the
   control invalid.
   ===================================================================== */
import type { CSSProperties, ReactNode } from 'react';
import './Field.css';

export function Field({
  label,
  htmlFor,
  hint,
  children,
  className,
  style,
  span2,
  error,
}: {
  label?: ReactNode;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  span2?: boolean;
  error?: ReactNode;
}) {
  const cls = ['field'];
  if (span2) cls.push('span-2');
  if (error != null) cls.push('is-invalid');
  if (className) cls.push(className);
  return (
    <div className={cls.join(' ')} style={style}>
      {label != null && (
        <label htmlFor={htmlFor}>
          {label}
          {hint != null && <> <span className="hint">{hint}</span></>}
        </label>
      )}
      {children}
      {error != null && <span className="field-error">{error}</span>}
      {error == null && label == null && hint != null && <span className="hint">{hint}</span>}
    </div>
  );
}
