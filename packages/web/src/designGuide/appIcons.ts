import type { IconComponent } from "@karta/map";
import {
  Check,
  ChevronRight,
  CircleCheck,
  Copy,
  Crosshair,
  Info,
  Layers,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Minus,
  Navigation2,
  Plus,
  RotateCw,
  Ruler,
  Search,
  Trash2,
  TriangleAlert,
  Undo2,
  X,
} from "lucide-react";

/**
 * Every Lucide icon the app imports, keyed by its Lucide name. A unit test
 * scans `packages/map/src` and `packages/web/src` for `lucide-react` imports
 * and fails when this list and the code disagree.
 */
export const APP_ICONS: Readonly<Record<string, IconComponent>> = {
  Check,
  ChevronRight,
  CircleCheck,
  Copy,
  Crosshair,
  Info,
  Layers,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Minus,
  Navigation2,
  Plus,
  RotateCw,
  Ruler,
  Search,
  Trash2,
  TriangleAlert,
  Undo2,
  X,
};
