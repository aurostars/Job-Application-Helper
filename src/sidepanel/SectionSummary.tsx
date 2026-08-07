import React from 'react';

type SectionSummaryProps = {
  title: string;
  count: number;
};

export function SectionSummary({ title, count }: SectionSummaryProps): React.JSX.Element {
  return (
    <summary>
      <span className="section-summary-title">{title}</span>
      <span className="section-summary-trailing">
        <span className="count">{count}</span>
        <span className="section-toggle-icon is-open" aria-hidden="true">
          <svg
            className="section-toggle-chevron"
            viewBox="0 0 16 16"
            fill="none"
          >
            <path
              d="M6 4.5L10 8L6 11.5"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </span>
    </summary>
  );
}
