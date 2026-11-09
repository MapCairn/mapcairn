/**
 * Why a geometry operation refused its input: the input is not valid GeoJSON
 * or WKT (`invalid`), it holds no coordinates where the operation needs some
 * (`empty`), or it is a kind of shape the operation does not handle
 * (`unsupported`).
 */
export type GeometryErrorKind = "invalid" | "empty" | "unsupported";

/** The only error the geometry helpers throw. */
export class GeometryError extends Error {
  readonly kind: GeometryErrorKind;

  constructor(kind: GeometryErrorKind, message?: string) {
    super(message ?? `The geometry was refused: ${kind}.`);
    this.name = "GeometryError";
    this.kind = kind;
  }
}
