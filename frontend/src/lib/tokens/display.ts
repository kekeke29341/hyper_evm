/** User-facing token labels (on-chain symbol may differ from internal types). */
export function displayTokenSymbol(symbol: string): string {
  if (symbol === "kHYPE") return "HYPE";
  return symbol;
}
