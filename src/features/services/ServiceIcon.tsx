import {
  BarChart3,
  ClipboardCheck,
  Droplets,
  FileText,
  Flame,
  Fuel,
  Gauge,
  HardHat,
  Landmark,
  Layers,
  PackageCheck,
  Power,
  Scale,
  ShieldCheck,
  Truck,
  Warehouse,
  Wrench,
  Zap,
  type LucideIcon,
} from 'lucide-react';

import { useLargeText } from '@/lib/useLargeText';

import { KAVACH_ROW } from './serviceMap';

/** One glyph per service, so a row is told apart by its picture as well as its name. A shape, never the meaning. */
const ICONS: Record<string, LucideIcon> = {
  [KAVACH_ROW]: ShieldCheck,
  'dsr-report': BarChart3,
  'credit-dod-monitoring': Landmark,
  'water-ingress-testing': Droplets,
  'load-planner': Truck,
  'tt-density': Gauge,
  'tanker-documents': FileText,
  'dealer-declarations': ClipboardCheck,
  'du-otp-acknowledgement': ShieldCheck,
  'tt-acknowledgement': PackageCheck,
  'mock-drill': Flame,
  'electrical-audit': Zap,
  'calibration-claim': Scale,
  'fuel-indent': Fuel,
  'maintenance-complaints': Wrench,
  'work-permits': HardHat,
  'stock-check': Warehouse,
  'ro-supply-status': Power,
};

/**
 * The service's icon in a soft square, hidden from a screen reader (the name beside it says it all).
 * At large text it is not drawn: the square grows with the text (it is in rem), and at 200% it took
 * a third of the row, so a name like "Inspection" broke in the middle of the word. The name carries
 * the row without it.
 */
export function ServiceIcon({ serviceId }: { serviceId: string }) {
  const large = useLargeText();
  if (large) return null;
  const Icon = ICONS[serviceId] ?? Layers;
  return (
    <span
      aria-hidden
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-text"
    >
      <Icon className="h-5 w-5" strokeWidth={1.75} />
    </span>
  );
}
