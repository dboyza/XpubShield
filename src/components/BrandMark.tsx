interface BrandMarkProps {
  className?: string;
}

export function BrandMark({ className = "" }: BrandMarkProps) {
  return (
    <span className={`brand-mark ${className}`} aria-hidden="true">
      <svg className="brand-mark-shield" viewBox="0 0 64 64" focusable="false">
        <path
          className="brand-mark-shield-shadow"
          d="M32 5.8c8.4 5.8 16.4 6.4 21.4 6.8 1.1 17.2-4.7 32.2-21.4 43.4C15.3 44.8 9.5 29.8 10.6 12.6c5-.4 13-1 21.4-6.8Z"
        />
        <path
          className="brand-mark-shield-main"
          d="M32 4.5c8.8 6 16.9 6.6 22.2 7 1 17.8-5 33.1-22.2 44.9C14.8 44.6 8.8 29.3 9.8 11.5c5.3-.4 13.4-1 22.2-7Z"
        />
        <path
          className="brand-mark-shield-shine"
          d="M20.1 17.4c3.7-.7 7.8-2.2 11.9-4.9 4.1 2.7 8.2 4.2 11.9 4.9-.6 10.9-4.4 20.5-11.9 28.5-7.5-8-11.3-17.6-11.9-28.5Z"
        />
      </svg>
      <svg className="brand-mark-bitcoin" viewBox="0 0 64 64" focusable="false">
        <circle className="brand-mark-bitcoin-coin" cx="32" cy="32" r="20" />
        <circle className="brand-mark-bitcoin-ring" cx="32" cy="32" r="16.8" />
        <text className="brand-mark-bitcoin-symbol" x="32" y="34">
          ₿
        </text>
      </svg>
    </span>
  );
}
