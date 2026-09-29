import {
  Activity, BellRing, Bell, Bookmark, BookOpen, Building2, Code2, History, Coins, Compass, CreditCard, Eye, Globe, Home, Images, Landmark, LayoutGrid,
  MessagesSquare, Newspaper, PanelsTopLeft, PieChart, Puzzle, ReceiptText, Rss, ScanSearch, Search, Settings, ShieldCheck,
  Sparkles, Star, Target, TrendingUp, UserRound, Wallet, Waves, Flame, type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  Activity, BellRing, Bell, Bookmark, BookOpen, Building2, Code2, History, Coins, Compass, CreditCard, Eye, Globe, Home, Images, Landmark, LayoutGrid,
  MessagesSquare, Newspaper, PanelsTopLeft, PieChart, Puzzle, ReceiptText, Rss, ScanSearch, Search, Settings, ShieldCheck,
  Sparkles, Star, Target, TrendingUp, UserRound, Wallet, Waves, Flame,
};

export function Icon({ name, className, size = 18, strokeWidth = 1.75 }: { name: string; className?: string; size?: number; strokeWidth?: number }) {
  const C = ICONS[name] ?? Sparkles;
  return <C className={className} size={size} strokeWidth={strokeWidth} />;
}
