export const getHighlightState = (name: string, highlighted: string | null) => ({
  isHighlighted: highlighted === name,
  isDimmed: !!highlighted && highlighted !== name,
});
