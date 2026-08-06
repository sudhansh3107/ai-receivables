export interface CompactNumber {
  value: number;
  suffix: string;
  decimals: number;
}

export function formatCompactNumber(amount: number): CompactNumber {
  const abs = Math.abs(amount);

  if (abs >= 10000000) {
    return {
      value: Number((amount / 10000000).toFixed(1)),
      suffix: "Cr",
      decimals: 2,
    };
  }

  if (abs >= 100000) {
    return {
      value: Number((amount / 100000).toFixed(1)),
      suffix: "L",
      decimals: 2,
    };
  }

  if (abs >= 1000) {
    return {
      value: Number((amount / 1000).toFixed(1)),
      suffix: "K",
      decimals: 2,
    };
  }

  return {
    value: amount,
    suffix: "",
    decimals: 0,
  };
}