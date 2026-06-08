import {
  Briefcase,
  Car,
  Gamepad2,
  House,
  Laptop,
  Sofa,
  Tag,
  Trees,
  type LucideProps,
} from "lucide-react";

// Mapování vestavěných typů na ikony. Vlastní (DB) typy mají obecnou ikonu.
const ICONS: Record<string, React.ComponentType<LucideProps>> = {
  realEstate: House,
  vehicles: Car,
  electronics: Laptop,
  household: Sofa,
  garden: Trees,
  business: Briefcase,
  leisure: Gamepad2,
  other: Tag,
};

export function ProjectIcon({
  type,
  className,
}: {
  type: string;
  className?: string;
}) {
  const Icon = ICONS[type] ?? Tag;
  return <Icon className={className} strokeWidth={1.5} />;
}
