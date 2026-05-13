export function noneClassifier() {
  return {
    name: "none",
    async classify() {
      return null;
    },
  };
}
