export type TSortableEdge = "top" | "bottom" | "left" | "right";
export type TSortableOrientation = "vertical" | "horizontal";

export const getSortableEdges = (orientation: TSortableOrientation): TSortableEdge[] =>
  orientation === "horizontal" ? ["left", "right"] : ["top", "bottom"];

export const moveSortableItem = <T>(
  data: readonly T[],
  source: T,
  destination: T,
  edge: TSortableEdge,
  keyExtractor: (item: T, index: number) => string
): { data: T[]; movedItem: T | undefined } => {
  const sourceKey = keyExtractor(source, 0);
  const destinationKey = keyExtractor(destination, 0);
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
