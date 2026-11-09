import { Layers, LocateFixed, Minus, Plus, Ruler } from "lucide-react";
import { ControlGroup, IconButton } from "../../ui";
import * as styles from "./EndStack.css";

/**
 * The end stack as a decorative stand-in for the server-rendered
 * `ChromeSkeleton`: the same column, groups and buttons as {@link EndStack},
 * with the Map options, Measure and Locate me group and, on a device with a
 * fine pointer, the zoom group. No compass, because the map starts facing
 * north.
 *
 * @remarks Only ever rendered inside an `aria-hidden`, `inert` container. It
 *   uses no hooks and needs no provider.
 */
export function EndStackSkeleton() {
  return (
    <div className={styles.skeletonStack} data-skeleton="end-stack">
      <ControlGroup
        label="Map controls"
        className={styles.group}
        data-skeleton="controls"
      >
        <IconButton label="Map options" icon={Layers} tabIndex={-1} />
        <IconButton
          label="Measure distance and area"
          icon={Ruler}
          tabIndex={-1}
        />
        <IconButton label="Locate me" icon={LocateFixed} tabIndex={-1} />
      </ControlGroup>
      <div className={styles.skeletonZoom}>
        <ControlGroup
          label="Zoom controls"
          className={styles.group}
          data-skeleton="zoom"
        >
          <IconButton label="Zoom in" icon={Plus} tabIndex={-1} />
          <IconButton label="Zoom out" icon={Minus} tabIndex={-1} />
        </ControlGroup>
      </div>
    </div>
  );
}
