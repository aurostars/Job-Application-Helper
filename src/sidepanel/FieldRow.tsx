import React from 'react';

export type FieldRowProps = {
  fieldKey: string;
  label?: string;
  value: string;
  displayValue?: string;
  empty?: boolean;
  working?: boolean;
  disabled?: boolean;
  className?: string;
  onFieldClick: (key: string, value: string) => void;
};

function CopyIcon(): React.JSX.Element {
  return (
    <svg
      className="field-copy-icon"
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden={true}
    >
      <rect x="5.25" y="5.25" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.75 3.75V3A1.25 1.25 0 0 0 9.5 1.75H3A1.25 1.25 0 0 0 1.75 3v6.5A1.25 1.25 0 0 0 3 10.75h.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export function FieldRow({
  fieldKey,
  label,
  value,
  displayValue = value,
  empty = false,
  working = false,
  disabled = false,
  className = '',
  onFieldClick,
}: FieldRowProps): React.JSX.Element {
  const [copied, setCopied] = React.useState(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = React.useRef(true);
  const requestSequenceRef = React.useRef(0);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestSequenceRef.current += 1;
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const copy = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    const requestSequence = ++requestSequenceRef.current;
    try {
      await navigator.clipboard.writeText(value);
      if (!mountedRef.current || requestSequence !== requestSequenceRef.current) return;
      setCopied(true);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      const timer = setTimeout(() => {
        if (requestSequence === requestSequenceRef.current) setCopied(false);
        if (timerRef.current === timer) timerRef.current = null;
      }, 1000);
      timerRef.current = timer;
    } catch {
      if (!mountedRef.current || requestSequence !== requestSequenceRef.current) return;
      setCopied(false);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return (
    <div className={`field-row ${className}`.trim()}>
      <button
        type="button"
        className="field-button"
        disabled={empty || disabled}
        onClick={() => onFieldClick(fieldKey, value)}
        title={empty ? '该字段未填写' : working ? '正在填写当前字段' : '点击写入网页当前输入框'}
      >
        {label && <span className="field-label">{label}</span>}
        <span className={empty ? 'field-value empty-value' : 'field-value'}>
          {empty ? '未填写' : displayValue}
        </span>
        {working && <span className="field-working">写入中</span>}
      </button>
      {!empty && (
        <button
          type="button"
          className="field-copy-button"
          aria-label={`复制${label || '字段'}内容`}
          title="复制"
          onClick={copy}
        >
          {copied ? '✓' : <CopyIcon />}
        </button>
      )}
    </div>
  );
}
