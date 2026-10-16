import { assertCents, type Bps, BPS_100, type Cents } from "./cents";

/**
 * Split `total` cents across parts in proportion to `weights` using the
 * largest-remainder method. The result always sums exactly to `total`.
 * Ties on the remainder go to the earlier index, so results are deterministic.
 * If every weight is zero, the total is split evenly.
 */
export function allocate(total: Cents, weights: readonly number[]): Cents[] {
  assertCents(total, "total");
  if (weights.length === 0) {
    if (total !== 0) throw new Error("Cannot allocate a non-zero amount across zero parts");
    return [];
  }
  for (const w of weights) {
    if (!Number.isSafeInteger(w) || w < 0) {
      throw new Error(`Weights must be non-negative whole numbers (got ${w})`);
    }
  }
  const effective = weights.every((w) => w === 0) ? weights.map(() => 1) : weights;
  const sign = total < 0 ? BigInt(-1) : BigInt(1);
  const abs = BigInt(Math.abs(total));
  const weightSum = effective.reduce((acc, w) => acc + BigInt(w), BigInt(0));

  const floors: bigint[] = [];
  const remainders: { index: number; rem: bigint }[] = [];
  let allocated = BigInt(0);
  effective.forEach((w, index) => {
    const product = abs * BigInt(w);
    const floor = product / weightSum;
    floors.push(floor);
    remainders.push({ index, rem: product % weightSum });
    allocated += floor;
  });

  let leftover = Number(abs - allocated);
  remainders.sort((a, b) => (a.rem === b.rem ? a.index - b.index : a.rem > b.rem ? -1 : 1));
  for (let i = 0; leftover > 0; i++, leftover--) {
    floors[remainders[i % remainders.length].index] += BigInt(1);
  }
  return floors.map((f) => Number(f * sign));
}

/** Split evenly into `parts` pieces (earlier parts get the extra cents). */
export function allocateEvenly(total: Cents, parts: number): Cents[] {
  return allocate(total, Array.from({ length: parts }, () => 1));
}

/** Split by percentages given in basis points. They must add to exactly 100%. */
export function allocateByBps(total: Cents, bps: readonly Bps[]): Cents[] {
  const totalBps = bps.reduce((a, b) => a + b, 0);
  if (totalBps !== BPS_100) {
    throw new Error(`Percentages must add up to 100% (got ${totalBps / 100}%)`);
  }
  return allocate(total, bps);
}
