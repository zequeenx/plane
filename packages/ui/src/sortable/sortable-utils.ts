export type TSortableEdge = "top" | "bottom" | "left" | "right";
export type TSortableOrientation = "vertical" | "horizontal";

export type TSortablePayload = {
  __uuid__: string;
  __sortableKey__: string;
};

export const getSortableEdges = (orientation: TSortableOrientation): TSortableEdge[] =>
  orientation === "horizontal" ? ["left", "right"] : ["top", "bottom"];

export const createSortablePayload = <T>(
  item: T,
  index: number,
  sortableId: string,
  keyExtractor: (item: T, index: number) => string
): TSortablePayload => ({
  __uuid__: sortableId,
  __sortableKey__: keyExtractor(item, index),
});

export const isSortablePayloadForId = (
  data: Record<string | symbol, unknown>,
  sortableId: string
): data is Record<string | symbol, unknown> & TSortablePayload =>
  data.__uuid__ === sortableId && typeof data.__sortableKey__ === "string";

export const moveSortableItem = <T>(
  data: readonly T[],
  sourceKey: string,
  destinationKey: string,
  edge: TSortableEdge,
  keyExtractor: (item: T, index: number) => string
): { data: T[]; movedItem: T | undefined } => {
  const sourceIndex = data.findIndex((item, index) => keyExtractor(item, index) === sourceKey);
  const destinationIndex = data.findIndex((item, index) => keyExtractor(item, index) === destinationKey);

  if (sourceIndex < 0 || destinationIndex < 0) return { data: [...data], movedItem: undefined };

  const insertAfter = edge === "bottom" || edge === "right";
  const rawDestinationIndex = destinationIndex + (insertAfter ? 1 : 0);
  const adjustedDestinationIndex = rawDestinationIndex > sourceIndex ? rawDestinationIndex - 1 : rawDestinationIndex;
  const nextData = [...data];
  const [movedItem] = nextData.splice(sourceIndex, 1);

  nextData.splice(adjustedDestinationIndex, 0, movedItem);

  return { data: nextData, movedItem };
};

export const resolveSortableDrop = <T>(
  data: readonly T[],
  source: Record<string | symbol, unknown>,
  destination: Record<string | symbol, unknown>,
  edge: TSortableEdge,
  sortableId: string,
  keyExtractor: (item: T, index: number) => string
): { data: T[]; movedItem: T } | undefined => {
  if (!isSortablePayloadForId(source, sortableId) || !isSortablePayloadForId(destination, sortableId)) return;

  const result = moveSortableItem(data, source.__sortableKey__, destination.__sortableKey__, edge, keyExtractor);
  if (result.movedItem === undefined) return;

  return { data: result.data, movedItem: result.movedItem };
};
