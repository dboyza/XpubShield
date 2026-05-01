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
        <path
          className="brand-mark-x"
          d="M22.8 21.4 41.2 42.6M41.2 21.4 22.8 42.6"
        />
        <path
          className="brand-mark-pubkey"
          d="M23 32h18M32 19v26"
        />
        <circle className="brand-mark-node brand-mark-node-top" cx="32" cy="19" r="2.7" />
        <circle className="brand-mark-node brand-mark-node-right" cx="41" cy="32" r="2.7" />
        <circle className="brand-mark-node brand-mark-node-bottom" cx="32" cy="45" r="2.7" />
        <circle className="brand-mark-node brand-mark-node-left" cx="23" cy="32" r="2.7" />
      </svg>
    </span>
  );
}
