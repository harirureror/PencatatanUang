import { createElement } from "react";
import {
  BedDouble,
  Car,
  Coins,
  Landmark,
  Package,
  Tag,
  UtensilsCrossed,
  Wallet,
  Wrench,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

// Ikon kategori bawaan; kategori kustom (Fase 5) memakai ikon Tag.
const ICONS: Record<string, LucideIcon> = {
  "cat-transport": Car,
  "cat-penginapan": BedDouble,
  "cat-konsumsi": UtensilsCrossed,
  "cat-peralatan": Wrench,
  "cat-lain": Package,
  "cat-dana": Landmark,
  "cat-masuk-lain": Coins,
  "dana-awal": Wallet,
};

export function CategoryIcon({ categoryId, ...props }: LucideProps & { categoryId: string }) {
  return createElement(ICONS[categoryId] ?? Tag, props);
}
