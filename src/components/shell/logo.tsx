/* eslint-disable @next/next/no-img-element */

/**
 * The STRATA logo: three glass layers. On dark backgrounds the mark stands on
 * its own; on light backgrounds it sits on its dark tile (like the app icon).
 */
export function LogoMark({ size = 26 }: { size?: number }) {
  const big = size > 48;
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }} aria-hidden>
      <img src={big ? "/brand/mark.png" : "/brand/mark-96.png"} alt="" width={size} height={size} className="hidden h-full w-full object-contain dark:block" />
      <img src={big ? "/brand/icon-192.png" : "/brand/tile-64.png"} alt="" width={size} height={size} className="block h-full w-full rounded-[22%] object-contain dark:hidden" />
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
