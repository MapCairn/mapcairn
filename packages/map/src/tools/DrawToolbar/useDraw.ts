// SPDX-License-Identifier: AGPL-3.0-only
// Copyright MapCairn contributors
import {
  announceDrawEvent,
  type Bounds,
  createDrawReducer,
  DRAW_ISSUE_MESSAGES,
  type DrawAction,
  type DrawIssue,
  type DrawKeyEvent,
  type DrawKind,
  type DrawSelection,
  type DrawShape,
  type DrawState,
  decodeShapes,
  describeAxisSuggestion,
  describeShapeImport,
  distanceMetres,
  draftOf,
  drawKeyCommand,
  editHandlesFor,
  encodeShapes,
  exportableShapes,
  FileOpenError,
  formatShapeMeasure,
  initialDrawState,
  type LatLng,
  MAX_DRAWING_SHAPES,
  MAX_IMPORT_BYTES,
  MAX_SHARE_SHAPES,
  type MapAdapter,
  type MapClickEvent,
  type MapEditHandle,
  type MapHandleDrag,
  type MapProjection,
  type Message,
  message,
  type ParsedHandleId,
  parseHandleId,
  parseShapeFile,
  pickShape,
  SHAPE_FILE_TYPES,
  selectedShape,
  shapeInputBounds,
  shapesToCsv,
  shapesToGeoJsonText,
  shapesToWkt,
  suggestWktAxisOrder,
  type UnitSystem,
  unsharableShapes,
  validateShape,
  type WktAxisOrder,
} from "@mapcairn/core";
import { useLatestRef } from "@mapcairn/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { overlayPlacement } from "../../host/overlays/geometry";
import {
  useClipboard,
  useFileOpener,
  useFileSaver,
  useFormatMessage,
  useMessages,
  useSettings,
  useUrlState,
} from "../../services";
import { useAnnounce } from "../../ui/LiveRegion";

/** How long a moved vertex must stay still before the new measure is announced, in milliseconds. */
export const DRAW_ANNOUNCE_DELAY_MS = 800;

/** How near, in CSS pixels, a tap must be to a shape's edge, line or point to select it. */
export const SHAPE_PICK_TOLERANCE_PX = 12;

/** The name of the GeoJSON file. */
export const GEOJSON_FILENAME = "mapcairn-shapes.geojson";

/** The name of the CSV file. */
export const CSV_FILENAME = "mapcairn-shapes.csv";

/** The name of the WKT file. */
export const WKT_FILENAME = "mapcairn-shapes.wkt";

/** What to say when no file could be opened. A cancelled picker says nothing. */
const FILE_OPEN_MESSAGES: Readonly<
  Record<Exclude<FileOpenError["kind"], "cancelled">, Message>
> = {
  "too-large": describeShapeImport({ ok: false, refusal: "too-large" }),
  unreadable: message("tools.draw.file.unreadable", {}),
  unsupported: message("tools.draw.file.unsupported", {}),
};

/** Added to an import's result when the shapes are more than a link can carry. */
const LINK_LIMIT_NOTE = message("tools.draw.linkLimitNote", {
  max: MAX_SHARE_SHAPES,
});

/** The outcome of an export or a copy, shown beside the buttons and announced. */
export interface DrawFeedback {
  readonly kind: "success" | "error";
  readonly text: string;
  /**
   * Set on an import that read nothing because the file fits only this
   * other WKT axis order: the order that {@link UseDraw.rereadImport} reads
   * the same file in.
   */
  readonly readAs?: WktAxisOrder;
}

/** Options for {@link useDraw}. */
export interface UseDrawOptions {
  /** The unit system for the readout and the announcements. */
  readonly units: UnitSystem;
  /** Whether the Draw tool is open. Handles, clicks and keys only work then. */
  readonly active: boolean;
  /** Returns the mounted adapter, or null. Read when a position or the map centre is needed. */
  readonly getAdapter: () => MapAdapter | null;
}

/** What {@link useDraw} returns. */
export interface UseDraw {
  readonly state: DrawState;
  readonly shapes: readonly DrawShape[];
  readonly mode: DrawKind;
  readonly selection: DrawSelection | null;
  /** The shape being drawn, or null. */
  readonly draft: DrawShape | null;
  /** The selected shape, or null. */
  readonly selected: DrawShape | null;
  /** A line for the toolbar, such as "Polygon 1, 3 points", or "Nothing drawn yet". */
  readonly status: string;
  /** The measures of the shape being drawn or selected, such as "1.2 ha · 480 m". Empty when none. */
  readonly measure: string;
  /** Why the selected shape is not valid after an edit, or null. */
  readonly issue: DrawIssue | null;
  /** What to do about {@link UseDraw.issue}, or an empty string. */
  readonly issueMessage: string;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** The handles to give the map adapter: those of the selected shape while the tool is open. */
  readonly handles: readonly MapEditHandle[];
  /** The handle a mouse is over, or null. */
  readonly hoveredHandle: string | null;
  /** The outcome of the last export or copy, until the shapes change. */
  readonly feedback: DrawFeedback | null;
  /** What the last import added or why it added nothing, until the shapes change again. */
  readonly importFeedback: DrawFeedback | null;

  readonly setMode: (kind: DrawKind) => void;
  /** Adds a point, or starts a shape, at a position. */
  readonly addPoint: (at: LatLng) => void;
  /** Adds a point at the map centre, or moves the selected vertex there. */
  readonly placeAtCentre: () => void;
  /** Moves the selected vertex to a position. */
  readonly moveSelectedTo: (at: LatLng) => void;
  /** Moves the selected vertex by screen pixels (positive x is right, positive y is down). */
  readonly nudge: (dx: number, dy: number) => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly finish: () => void;
  readonly cancel: () => void;
  /** Removes the shape being drawn without a word, when Done closes the tool. */
  readonly discardDraft: () => void;
  /**
   * Selects a shape, and a vertex of it when `vertex` is a number. Without
   * `vertex`, a point or a circle selects its one vertex, so the arrow keys
   * and Move to map centre work on it; any other shape selects as a whole.
   */
  readonly select: (shapeId: string, vertex?: number | null) => void;
  readonly deselect: () => void;
  readonly stepVertex: (delta: 1 | -1) => void;
  /** Removes the selected vertex. */
  readonly removeVertex: () => void;
  /** Adds a vertex at the map centre after the selected one. */
  readonly insertAtCentre: () => void;
  readonly deleteSelected: () => void;
  readonly deleteShape: (shapeId: string) => void;
  readonly clear: () => void;
  /** Sets the selected circle's radius to its distance from the map centre. */
  readonly setRadiusToCentre: () => void;
  /** Multiplies the selected circle's radius. */
  readonly scaleRadius: (factor: number) => void;
  /** A click or tap on the map. Starts, extends or selects a shape. */
  readonly onMapClick: (event: Pick<MapClickEvent, "latlng" | "point">) => void;
  /** A step of a press on an edit handle, from the adapter. */
  readonly onHandleDrag: (drag: MapHandleDrag) => void;
  readonly onHandleHover: (id: string | null) => void;
  /** Runs a key press as a draw command. Returns true when it was one, so the caller can stop the key. */
  readonly keyCommand: (event: DrawKeyEvent) => boolean;
  readonly exportGeoJson: () => Promise<void>;
  readonly exportCsv: () => Promise<void>;
  readonly exportWkt: () => Promise<void>;
  /** Copies a link with the shapes in it, built from the current address. */
  readonly copyLink: () => Promise<void>;
  /**
   * Asks the person for a GeoJSON, CSV or WKT file and adds its shapes as one undo
   * step. Call it straight from a press, so the browser shows the picker.
   * @returns The box holding the shapes it added, for the map to fit, or
   *   null when it added none, including when the host has no file opener.
   */
  readonly importFile: () => Promise<Bounds | null>;
  /** The order of the two numbers in a WKT position that an import reads: longitude first until changed. Kept for the session only. */
  readonly wktAxisOrder: WktAxisOrder;
  /** Chooses the order by hand. An offer to read the last file the other way, and the file it kept, are dropped. */
  readonly setWktAxisOrder: (order: WktAxisOrder) => void;
  /**
   * Reads the file whose import offered {@link DrawFeedback.readAs} again in
   * `order`, and keeps `order` as the WKT axis order.
   * @returns The box holding the shapes it added, as {@link UseDraw.importFile}
   *   does, or null when it added none or there is no such file.
   */
  readonly rereadImport: (order: WktAxisOrder) => Bounds | null;
}

/** A drag in progress: which handle it began on and which vertex it moves now. */
interface DragSession {
  readonly shapeId: string;
  kind: "vertex" | "midpoint" | "radius";
  index: number;
  readonly key: string;
}

/** What pressing a handle selects: a vertex, or the shape for a radius handle. A midpoint selects nothing until it is used. */
function pressAction(parsed: ParsedHandleId): DrawAction | null {
  if (parsed.kind === "midpoint") {
    return null;
  }
  return {
    type: "select",
    shapeId: parsed.shapeId,
    vertex: parsed.kind === "vertex" ? parsed.index : null,
  };
}

/** A tap on a midpoint adds a vertex there; a tap on anything else is already handled by the press. */
function tapAction(
  current: DragSession,
  drag: MapHandleDrag,
  state: DrawState,
  projection: MapProjection,
): DrawAction | null {
  if (drag.moved || current.kind !== "midpoint") {
    return null;
  }
  const handle = editHandlesFor(state.shapes, state.selection, projection).find(
    (candidate) => candidate.id === drag.id,
  );
  return handle
    ? {
        type: "insertVertex",
        shapeId: current.shapeId,
        index: current.index,
        at: handle.position,
      }
    : null;
}

/**
 * What a drag step does. A midpoint becomes a new vertex under the pointer,
 * which the rest of the drag then moves, so one drag is one undo step.
 */
function moveAction(
  current: DragSession,
  drag: MapHandleDrag,
  state: DrawState,
): DrawAction | null {
  if (current.kind === "midpoint") {
    current.kind = "vertex";
    return {
      type: "insertVertex",
      shapeId: current.shapeId,
      index: current.index,
      at: drag.latlng,
      coalesceKey: current.key,
    };
  }
  if (current.kind === "vertex") {
    return {
      type: "moveVertex",
      shapeId: current.shapeId,
      index: current.index,
      to: drag.latlng,
      coalesceKey: current.key,
    };
  }
  const middle = state.shapes.find(
    (candidate) => candidate.id === current.shapeId,
  )?.vertices[0];
  return middle
    ? {
        type: "setRadius",
        shapeId: current.shapeId,
        metres: distanceMetres(middle, drag.latlng),
        coalesceKey: current.key,
      }
    : null;
}

function initialState(
  encoded: string | undefined,
  reducer: (state: DrawState, action: DrawAction) => DrawState,
): DrawState {
  const shapes = encoded ? decodeShapes(encoded) : null;
  return shapes
    ? reducer(initialDrawState, { type: "load", shapes })
    : initialDrawState;
}

/** The line for the toolbar: what is drawn or selected, or how many shapes there are. */
function statusText(
  format: (message: Message) => string,
  draft: DrawShape | null,
  selected: DrawShape | null,
  count: number,
): string {
  if (draft) {
    return format(
      message("tools.draw.status.drawing", {
        label: draft.label,
        count: draft.vertices.length,
      }),
    );
  }
  if (selected) {
    return selected.label;
  }
  return format(
    count > 0
      ? message("tools.draw.status.shapes", { count })
      : message("tools.draw.status.empty", {}),
  );
}

/**
 * The state of the Draw tool: the shapes, what is selected, undo, and every
 * way to change them, by pointer and by keyboard.
 *
 * @remarks The pure rules live in core (`drawReducer` and friends). This hook
 *   adds what needs the map and the ports: the map centre and projection for
 *   "at map centre", nudges and shape picking; the announcer; the file saver
 *   and the clipboard for export; and the address for a link with shapes.
 *
 *   Shapes belong to the app, not to the toolbar, so they stay on the map when
 *   the tool closes. Nothing is stored, and nothing reaches the address bar:
 *   shapes are read once, from a link that carries them, and written only into
 *   the link {@link UseDraw.copyLink} builds.
 *
 *   Announcements follow the reducer's `lastEvent`, so a drag that moves a
 *   vertex many times is announced once, {@link DRAW_ANNOUNCE_DELAY_MS} after
 *   it settles, and a refusal is announced assertively.
 */
export function useDraw({
  units,
  active,
  getAdapter,
}: UseDrawOptions): UseDraw {
  const announce = useAnnounce();
  const announceRef = useLatestRef(announce);
  const messages = useMessages();
  const format = useFormatMessage();
  const formatRef = useLatestRef(format);
  const fileSaver = useFileSaver();
  const clipboard = useClipboard();
  const url = useUrlState();
  const reducer = useMemo(() => createDrawReducer(messages), [messages]);
  const [state, dispatch] = useReducer(reducer, undefined, () =>
    initialState(url.read().shapes, reducer),
  );
  const stateRef = useLatestRef(state);
  const getAdapterRef = useLatestRef(getAdapter);
  const { projection } = useSettings().settings;
  const projectionRef = useLatestRef(projection);
  const activeRef = useLatestRef(active);
  const [hoveredHandle, setHoveredHandle] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<DrawFeedback | null>(null);
  const [importFeedback, setImportFeedback] = useState<DrawFeedback | null>(
    null,
  );
  const fileOpener = useFileOpener();
  const importAbort = useRef<AbortController | null>(null);
  const [wktAxisOrder, setWktAxisOrder] = useState<WktAxisOrder>("lng-lat");
  const wktAxisOrderRef = useLatestRef(wktAxisOrder);
  const offeredText = useRef<string | null>(null);
  const session = useRef<DragSession | null>(null);
  const dragCount = useRef(0);

  const { shapes, selection, lastEvent } = state;
  const draft = draftOf(state);
  const selected = selectedShape(state);

  // Only a new event is announced: a change of units or of the shapes alone is not.
  const unitsRef = useLatestRef(units);
  useEffect(() => {
    const text = announceDrawEvent(
      lastEvent,
      stateRef.current.shapes,
      unitsRef.current,
    );
    if (!text) {
      return;
    }
    const delay =
      lastEvent?.type === "vertex-moved" ? DRAW_ANNOUNCE_DELAY_MS : 0;
    const timer = setTimeout(() => {
      announceRef.current(text, {
        priority: lastEvent?.type === "rejected" ? "assertive" : "polite",
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [lastEvent, stateRef, unitsRef, announceRef]);

  // What was exported or copied no longer describes the shapes once they
  // change, and an import's result lasts only through the change it made.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the shapes are the trigger
  useEffect(() => {
    setFeedback(null);
    if (lastEvent?.type !== "imported") {
      setImportFeedback(null);
      offeredText.current = null;
    }
  }, [shapes]);

  useEffect(() => () => importAbort.current?.abort(), []);

  const act = useCallback((action: DrawAction) => dispatch(action), []);
  const setMode = useCallback(
    (kind: DrawKind) => act({ type: "setMode", kind }),
    [act],
  );
  const undo = useCallback(() => act({ type: "undo" }), [act]);
  const redo = useCallback(() => act({ type: "redo" }), [act]);
  const finish = useCallback(() => act({ type: "finish" }), [act]);
  const cancel = useCallback(() => act({ type: "cancel" }), [act]);
  const clear = useCallback(() => act({ type: "clear" }), [act]);
  const deselect = useCallback(() => act({ type: "deselect" }), [act]);
  const select = useCallback(
    (shapeId: string, vertex?: number | null) => {
      const shape = stateRef.current.shapes.find(
        (candidate) => candidate.id === shapeId,
      );
      // A point or a circle has one vertex that matters: its centre.
      const single = shape?.kind === "point" || shape?.kind === "circle";
      const centre = single ? 0 : null;
      act({
        type: "select",
        shapeId,
        vertex: vertex === undefined ? centre : vertex,
      });
    },
    [act, stateRef],
  );
  const stepVertex = useCallback(
    (delta: 1 | -1) => act({ type: "stepVertex", delta }),
    [act],
  );
  const deleteShape = useCallback(
    (shapeId: string) => act({ type: "deleteShape", shapeId }),
    [act],
  );
  const discardDraft = useCallback(() => {
    if (draftOf(stateRef.current)) {
      dispatch({ type: "cancel" });
    }
  }, [stateRef]);

  const centre = useCallback(
    () => getAdapterRef.current()?.getView().center ?? null,
    [getAdapterRef],
  );

  const moveSelectedTo = useCallback(
    (at: LatLng) => {
      const { selection: current } = stateRef.current;
      if (current && current.vertex !== null) {
        dispatch({
          type: "moveVertex",
          shapeId: current.shapeId,
          index: current.vertex,
          to: at,
        });
      }
    },
    [stateRef],
  );

  const addPoint = useCallback(
    (at: LatLng) => dispatch({ type: "addVertex", at }),
    [],
  );

  const placeAtCentre = useCallback(() => {
    const at = centre();
    if (!at) {
      return;
    }
    if (stateRef.current.selection?.vertex != null) {
      moveSelectedTo(at);
    } else {
      addPoint(at);
    }
  }, [centre, stateRef, moveSelectedTo, addPoint]);

  const nudge = useCallback(
    (dx: number, dy: number) => {
      const adapter = getAdapterRef.current();
      const current = stateRef.current;
      const shape = selectedShape(current);
      const vertex = current.selection?.vertex ?? null;
      const from =
        shape && vertex !== null ? shape.vertices[vertex] : undefined;
      if (!adapter || !shape || vertex === null || !from) {
        return;
      }
      const point = adapter.project(from);
      dispatch({
        type: "moveVertex",
        shapeId: shape.id,
        index: vertex,
        to: adapter.unproject({ x: point.x + dx, y: point.y + dy }),
        coalesceKey: `nudge:${shape.id}:${vertex}`,
      });
    },
    [getAdapterRef, stateRef],
  );

  const removeVertex = useCallback(() => {
    const current = stateRef.current.selection;
    if (current && current.vertex !== null) {
      dispatch({
        type: "removeVertex",
        shapeId: current.shapeId,
        index: current.vertex,
      });
    }
  }, [stateRef]);

  const insertAtCentre = useCallback(() => {
    const at = centre();
    const current = stateRef.current.selection;
    if (at && current && current.vertex !== null) {
      dispatch({
        type: "insertVertex",
        shapeId: current.shapeId,
        index: current.vertex + 1,
        at,
      });
    }
  }, [centre, stateRef]);

  const deleteSelected = useCallback(() => {
    const current = stateRef.current.selection;
    if (current) {
      dispatch({ type: "deleteShape", shapeId: current.shapeId });
    }
  }, [stateRef]);

  const setRadius = useCallback(
    (metres: number, key?: string) => {
      const shape = selectedShape(stateRef.current);
      if (shape?.kind === "circle") {
        dispatch({
          type: "setRadius",
          shapeId: shape.id,
          metres,
          ...(key === undefined ? {} : { coalesceKey: key }),
        });
      }
    },
    [stateRef],
  );

  const setRadiusToCentre = useCallback(() => {
    const shape = selectedShape(stateRef.current);
    const at = centre();
    const middle = shape?.vertices[0];
    if (shape?.kind === "circle" && at && middle) {
      setRadius(distanceMetres(middle, at));
    }
  }, [centre, setRadius, stateRef]);

  const scaleRadius = useCallback(
    (factor: number) => {
      const shape = selectedShape(stateRef.current);
      if (shape?.kind === "circle" && shape.radiusMetres !== undefined) {
        setRadius(shape.radiusMetres * factor, "radius-scale");
      }
    },
    [setRadius, stateRef],
  );

  const onMapClick = useCallback(
    (event: Pick<MapClickEvent, "latlng" | "point">) => {
      if (!activeRef.current) {
        return;
      }
      const adapter = getAdapterRef.current();
      const current = stateRef.current;
      if (adapter && !draftOf(current)) {
        const hit = pickShape(
          current.shapes,
          event.point,
          overlayPlacement(adapter, adapter.getView(), projectionRef.current),
          SHAPE_PICK_TOLERANCE_PX,
          false,
        );
        if (hit) {
          select(hit);
          return;
        }
      }
      dispatch({ type: "addVertex", at: event.latlng });
    },
    [activeRef, getAdapterRef, stateRef, select, projectionRef],
  );

  const onHandleDrag = useCallback(
    (drag: MapHandleDrag) => {
      if (drag.phase === "start") {
        const parsed = parseHandleId(drag.id);
        session.current = parsed
          ? {
              shapeId: parsed.shapeId,
              kind: parsed.kind,
              index: parsed.index,
              key: `drag:${++dragCount.current}`,
            }
          : null;
        const action = parsed ? pressAction(parsed) : null;
        if (action) {
          dispatch(action);
        }
        return;
      }
      const current = session.current;
      if (!current) {
        return;
      }
      if (drag.phase === "end") {
        session.current = null;
      }
      const action =
        drag.phase === "end"
          ? tapAction(current, drag, stateRef.current, projectionRef.current)
          : moveAction(current, drag, stateRef.current);
      if (action) {
        dispatch(action);
      }
    },
    [stateRef, projectionRef],
  );

  const keyCommand = useCallback(
    (event: DrawKeyEvent): boolean => {
      if (!activeRef.current) {
        return false;
      }
      const command = drawKeyCommand(stateRef.current, event);
      if (!command) {
        return false;
      }
      if (command.type === "dispatch") {
        dispatch(command.action);
      } else if (command.type === "nudge") {
        nudge(command.dx, command.dy);
      } else {
        placeAtCentre();
      }
      return true;
    },
    [activeRef, stateRef, nudge, placeAtCentre],
  );

  const report = useCallback(
    (kind: DrawFeedback["kind"], said: Message) => {
      setFeedback({ kind, text: formatRef.current(said) });
      announceRef.current(said, {
        priority: kind === "error" ? "assertive" : "polite",
      });
    },
    [announceRef, formatRef],
  );

  const exportFile = useCallback(
    async (
      filename: string,
      mimeType: string,
      build: (shapes: readonly DrawShape[]) => string,
    ) => {
      const ready = exportableShapes(stateRef.current.shapes);
      if (ready.length === 0) {
        report("error", message("tools.draw.nothingToExport", {}));
        return;
      }
      const result = await fileSaver.save({
        filename,
        mimeType,
        content: build(ready),
      });
      if (result.ok) {
        report(
          "success",
          message("tools.draw.saved", { count: ready.length, filename }),
        );
      } else {
        report("error", message("tools.draw.saveFailed", {}));
      }
    },
    [fileSaver, report, stateRef],
  );

  const exportGeoJson = useCallback(
    () =>
      exportFile(GEOJSON_FILENAME, "application/geo+json", shapesToGeoJsonText),
    [exportFile],
  );

  const exportCsv = useCallback(
    () => exportFile(CSV_FILENAME, "text/csv;charset=utf-8", shapesToCsv),
    [exportFile],
  );

  const exportWkt = useCallback(
    () => exportFile(WKT_FILENAME, "text/plain;charset=utf-8", shapesToWkt),
    [exportFile],
  );

  const copyLink = useCallback(async () => {
    const current = stateRef.current.shapes;
    const encoded = encodeShapes(current);
    const leftOut = unsharableShapes(current).length;
    if (encoded === null) {
      report("error", message("tools.draw.tooManyToShare", {}));
      return;
    }
    if (encoded === "") {
      report(
        "error",
        leftOut === 0
          ? message("tools.draw.nothingToShare", {})
          : message("tools.draw.nothingToCopy", { count: leftOut }),
      );
      return;
    }
    const result = await clipboard.writeText(
      url.link({ ...url.read(), shapes: encoded }),
    );
    if (!result.ok) {
      report("error", message("tools.draw.linkCopyFailed", {}));
      return;
    }
    report(
      "success",
      leftOut === 0
        ? message("tools.draw.linkCopied", {})
        : message("tools.draw.linkCopiedLeftOut", { count: leftOut }),
    );
  }, [clipboard, report, stateRef, url]);

  const reportImport = useCallback(
    (kind: DrawFeedback["kind"], said: Message, readAs?: WktAxisOrder) => {
      setImportFeedback({
        kind,
        text: formatRef.current(said),
        ...(readAs ? { readAs } : {}),
      });
      announceRef.current(said, {
        priority: kind === "error" ? "assertive" : "polite",
      });
    },
    [announceRef, formatRef],
  );

  /** Adds what the text holds, read in `order`, or says why not; the box of the shapes it added. */
  const importText = useCallback(
    (text: string, order: WktAxisOrder): Bounds | null => {
      const suggested = suggestWktAxisOrder(text, order);
      if (suggested) {
        offeredText.current = text;
        reportImport("error", describeAxisSuggestion(suggested), suggested);
        return null;
      }
      offeredText.current = null;
      const result = parseShapeFile(text, { wktAxisOrder: order });
      const words = describeShapeImport(result);
      if (!result.ok || result.shapes.length === 0) {
        reportImport("error", words);
        return null;
      }
      if (
        stateRef.current.shapes.length + result.shapes.length >
        MAX_DRAWING_SHAPES
      ) {
        reportImport(
          "error",
          describeShapeImport({ ok: false, refusal: "drawing-full" }),
        );
        return null;
      }
      const total =
        exportableShapes(stateRef.current.shapes).length + result.shapes.length;
      dispatch({ type: "import", shapes: result.shapes });
      reportImport(
        "success",
        total > MAX_SHARE_SHAPES
          ? message("common.followedBy", {
              first: words,
              second: LINK_LIMIT_NOTE,
            })
          : words,
      );
      return shapeInputBounds(result.shapes) ?? null;
    },
    [reportImport, stateRef],
  );

  /** A choice made by hand: the offer to read a file the other way no longer applies, so it and the file it kept are dropped. */
  const chooseWktAxisOrder = useCallback((order: WktAxisOrder) => {
    setWktAxisOrder(order);
    offeredText.current = null;
    setImportFeedback((current) => (current?.readAs ? null : current));
  }, []);

  const rereadImport = useCallback(
    (order: WktAxisOrder): Bounds | null => {
      setWktAxisOrder(order);
      return offeredText.current === null
        ? null
        : importText(offeredText.current, order);
    },
    [importText],
  );

  const importFile = useCallback(async (): Promise<Bounds | null> => {
    if (!fileOpener) {
      return null;
    }
    importAbort.current?.abort();
    const controller = new AbortController();
    importAbort.current = controller;
    let text: string;
    try {
      // Opened before any await, so the browser still sees the press.
      ({ text } = await fileOpener.open({
        accept: SHAPE_FILE_TYPES,
        maxBytes: MAX_IMPORT_BYTES,
        signal: controller.signal,
      }));
    } catch (error) {
      const kind = error instanceof FileOpenError ? error.kind : "unreadable";
      if (kind !== "cancelled") {
        offeredText.current = null;
        reportImport("error", FILE_OPEN_MESSAGES[kind]);
      }
      return null;
    }
    return importText(text, wktAxisOrderRef.current);
  }, [fileOpener, importText, reportImport, wktAxisOrderRef]);

  const handles = useMemo(
    () => (active ? editHandlesFor(shapes, selection, projection) : []),
    [active, shapes, selection, projection],
  );

  const issue = useMemo(
    () => (selected?.done ? validateShape(selected) : null),
    [selected],
  );

  const focus = draft ?? selected;
  const status = statusText(format, draft, selected, shapes.length);

  return {
    state,
    shapes,
    mode: state.mode,
    selection,
    draft,
    selected,
    status,
    measure: focus ? formatShapeMeasure(focus, units, messages) : "",
    issue,
    issueMessage: issue ? formatRef.current(DRAW_ISSUE_MESSAGES[issue]) : "",
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    handles,
    hoveredHandle,
    feedback,
    importFeedback,
    setMode,
    addPoint,
    placeAtCentre,
    moveSelectedTo,
    nudge,
    undo,
    redo,
    finish,
    cancel,
    discardDraft,
    select,
    deselect,
    stepVertex,
    removeVertex,
    insertAtCentre,
    deleteSelected,
    deleteShape,
    clear,
    setRadiusToCentre,
    scaleRadius,
    onMapClick,
    onHandleDrag,
    onHandleHover: setHoveredHandle,
    keyCommand,
    exportGeoJson,
    exportCsv,
    exportWkt,
    copyLink,
    importFile,
    wktAxisOrder,
    setWktAxisOrder: chooseWktAxisOrder,
    rereadImport,
  };
}
