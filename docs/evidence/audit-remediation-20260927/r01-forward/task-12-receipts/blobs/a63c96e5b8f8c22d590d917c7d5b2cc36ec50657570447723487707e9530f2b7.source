import { isDeepStrictEqual } from "node:util";
type Vector = Record<string, unknown>;
export function unknownMixedVectors(native: Vector, hosted: Vector, modern: Vector, admitted: Vector[]) {
  const mixed = [
    { label: "native-vector-modern-helpers", vector: { ...native, helpers: modern.helpers } },
    { label: "hosted-catalog-native-rest", vector: { ...native, catalog: hosted.catalog } },
  ];
  if (mixed.some(m => admitted.some(v => isDeepStrictEqual(v, m.vector))))
    throw Error("Mixed negative equals an actually observed profile");
  return mixed;
}
