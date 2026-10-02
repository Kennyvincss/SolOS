/* eslint-disable @next/next/no-img-element */

/**
 * The STRATA logo: three layers. Dark mode shows the glass mark, light mode
 * the bright blue-to-purple one.
 */
export function LogoMark({ size = 26 }: { size?: number }) {
  const big = size > 48;
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }} aria-hidden>
      <img src={big ? "/brand/mark.webp" : "/brand/mark-96.webp"} alt="" width={size} height={size} className="hidden h-full w-full object-contain dark:block" />
      <img src="/brand/mark-light.svg" alt="" width={size} height={size} className="block h-full w-full object-contain dark:hidden" />
    </span>
  );
}

/** The STRATA wordmark, drawn in the current text color. */
export function WordmarkText({ height = 11, className }: { height?: number; className?: string }) {
  return (
    <span
      role="img"
      aria-label="STRATA"
      className={className}
      style={{
        display: "inline-block",
        height,
        width: Math.round((height * 656) / 98),
        backgroundColor: "currentColor",
        WebkitMask: "url(/brand/wordmark.png) center / contain no-repeat",
        mask: "url(/brand/wordmark.png) center / contain no-repeat",
      }}
    />
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={28} />
      <WordmarkText height={12} />
    </span>
  );
}
