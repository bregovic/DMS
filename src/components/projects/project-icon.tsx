import {
  Building2,
  Car,
  House,
  Package,
  Trees,
  Wrench,
  type LucideProps,
} from "lucide-react";

const ICONS: Record<string, React.ComponentType<LucideProps>> = {
  house: House,
  apartment: Building2,
  car: Car,
  garage: Wrench,
  garden: Trees,
  other: Package,
};

export function ProjectIcon({
  type,
  className,
}: {
  type: string;
  className?: string;
}) {
  const Icon = ICONS[type] ?? Package;
  return <Icon className={className} strokeWidth={1.5} />;
}
