import { LogoMark } from "@/components/shell/logo";

export default function Loading() {
  return (
    <div className="grid min-h-[60dvh] place-items-center" aria-label="Loading">
      <div className="animate-pulse opacity-80">
        <LogoMark size={44} />
      </div>
    </div>
  );
}
