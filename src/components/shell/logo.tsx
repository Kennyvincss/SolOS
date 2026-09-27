export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="sos-g" x1="0" y1="32" x2="32" y2="0">
          <stop offset="0" stopColor="#9945ff" />
          <stop offset="1" stopColor="#14f195" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#sos-g)" />
      <rect x="1.75" y="1.75" width="28.5" height="28.5" rx="8.25" fill="#07080a" />
      <path d="M9 11.5h11.5l2.5-2.5H11.5zM9 17.25h14l-2.5 2.5H9zM11.5 23H23l-2.5 2.5H9z" fill="url(#sos-g)" transform="translate(0 -1.5)" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="text-[13px] font-semibold tracking-[0.16em]">SOLANA OS</span>
    </span>
  );
}
