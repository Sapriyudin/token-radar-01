// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board ranks EVERY protocol that records no token (342 in this snapshot), watchlist included:
// the watchlist is the floor, never the ceiling. A protocol is pre-token when its index entry records
// no token (no market cap, no CoinGecko id, no symbol); the snapshot's live-token protocols are kept
// apart and shown as the market's own values, never mixed into the ranked board.
//
// Implied value is a log-log comps regression, fitted on the snapshot's own tokenized protocols:
//
//   log(mcap) = intercept + slope * log(TVL) + adjustment[category]
//
// fitted by ordinary least squares on the 128 protocols with a market cap and a TVL above zero, with
// one dummy per category that rests on at least 3 comps (the most common category, Lending, is the
// reference). A category with fewer than 3 tokenized protocols gets no intercept of its own: one
// protocol cannot set a category's multiple (an unregularized dummy once priced a prediction market
// at $32B), so those rows fall back to the snapshot's overall upper-median mcap/TVL. The band is one
// residual standard deviation either way:
//
//   base  = exp(prediction)            (or TVL x fallback_median for a category with no comps)
//   low   = base x exp(-sigma)         high = base x exp(+sigma)
//
// The band is wide on purpose: comps are a rough guide, not a price. The regression is then scored
// for honesty before it is trusted: the comps are split in half by slug, the model is fitted on the
// first half and tested on the second, and the typical miss is reported. No protocol name is ever
// special-cased: the same function scores every row.
//
// Ranking multiplies the base by three transparent quality factors, all readable from the snapshot:
//
//   growth   = clamp(1 + change_7d / 100, 0.8, 1.25)          (no growth figure: 1)
//   breadth  = min(1 + 0.02 x (chains - 1), 1.2)
//   age      = 0.9 when listed less than 90 days ago, else 1   (unknown age: 1)
//   implied  = round(base x growth x breadth x age)
//
// The farm verdict nets the expected airdrop against the cost of farming, in dollars, with every
// assumption stated: the airdrop pool is 5% of the implied value; an active farmer's points capture
// 20x their pro-rata TVL share (most TVL is passive and does not farm); the cost is the gas on the
// protocol's cheapest chain plus 2% opportunity cost on the capital. farm when the expected value is
// at least 3x the cost, thin when it covers the cost, skip when it does not.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The fitted comps regression, with its own honesty check. */
export interface RegressionFit {
  slope: number;
  intercept: number;
  sigma: number;
  r2: number;
  ref_category: string;
  /** Log-points added per category; the reference category is 0 and absent here. */
  category_adjustment: Record<string, number>;
  /** Tokenized protocols per category (the comps each adjustment rests on). */
  category_n: Record<string, number>;
  comps_n: number;
  /** Upper-median mcap/TVL over the comps: the fallback multiple for a category with no comps. */
  fallback_median: number;
  /** Blind test: fit on the first half of the comps by slug, predict the second half. */
  blind_typical_miss: number;
  blind_median_miss: number;
  blind_train_n: number;
  blind_test_n: number;
}

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'radar-2';

/** The airdrop pool as a share of implied value, and the farmer's capture multiple over pro-rata. */
export const AIRDROP_SHARE = 0.05;
export const FARMER_CAPTURE = 20;
/** Verdict cutoffs on expected value divided by farming cost. */
export const FARM_MIN_RATIO = 3;
export const THIN_MIN_RATIO = 1;
/** Opportunity cost on the capital held through the farm. */
export const OPPORTUNITY_RATE = 0.02;

/** Approximate gas per transaction in USD, November 2026 medians, by chain (lowercase). */
export const GAS_USD: Record<string, number> = {
  ethereum: 6, arbitrum: 0.5, optimism: 0.5, base: 0.3, solana: 0.05, bsc: 0.3,
  polygon: 0.1, avalanche: 0.5, 'zksync era': 0.5, linea: 0.3, scroll: 0.3, blast: 0.3,
  mantle: 0.2, starknet: 0.5, berachain: 0.3, sonic: 0.2, sui: 0.05, aptos: 0.05,
  near: 0.05, tron: 0.5, cronos: 0.1, fantom: 0.1, gnosis: 0.1, celo: 0.1,
  moonbeam: 0.2, kava: 0.1, injective: 0.05, sei: 0.05, osmosis: 0.05, cosmos: 0.05,
  mode: 0.3, taiko: 0.3, zora: 0.2, fraxtal: 0.3, merlin: 0.3, bob: 0.3, gravity: 0.2,
};
export const GAS_DEFAULT_USD = 1;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  regression_base_usd: number;
  quality_factor: number;
  growth_factor: number;
  breadth_factor: number;
  age_factor: number;
  watchlist: boolean;
  /** Tokenized protocols in this row's category: 0 means the value fell back to the overall median. */
  comps_n: number;
  farm_cost_usd: number;
  expected_airdrop_usd: number;
  verdict: 'farm' | 'thin' | 'skip';
  model: {
    regression_base_usd: number;
    band_low_usd: number;
    band_high_usd: number;
    growth_factor: number;
    breadth_factor: number;
    age_factor: number;
    quality_factor: number;
    category_adjustment: number | null;
    comps_n: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  regression_base_usd: number;
  quality_factor: number;
  growth_factor: number;
  breadth_factor: number;
  age_factor: number;
  watchlist: boolean;
  comps_n: number;
  farm_cost_usd: number;
  expected_airdrop_usd: number;
  verdict: 'farm' | 'thin' | 'skip';
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: RegressionFit;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  verdict_counts: { farm: number; thin: number; skip: number };
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The upper median: the middle value, or the higher of the two middle values for an even count. */
export function medianHigh(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
}

/** The ordinary median (the average of the two middle values for an even count). */
export function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 === 1 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Solve A x = b by Gaussian elimination with partial pivoting. A is n x n, b length n. */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    const tmp = M[c]!;
    M[c] = M[piv]!;
    M[piv] = tmp;
    const d = M[c]![c]!;
    for (let r = c + 1; r < n; r++) {
      const f = M[r]![c]! / d;
      for (let k = c; k <= n; k++) M[r]![k]! -= f * M[c]![k]!;
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r]![n]!;
    for (let k = r + 1; k < n; k++) s -= M[r]![k]! * x[k]!;
    x[r] = s / M[r]![r]!;
  }
  return x;
}

interface OlsResult {
  slope: number;
  intercept: number;
  sigma: number;
  r2: number;
  ref: string;
  dummyCats: string[];
  beta: number[];
  k: number;
}

/** The category label the regression uses for a protocol (null becomes 'Unknown'). */
function catOf(p: SnapshotProtocol): string {
  return p.category ?? 'Unknown';
}

/** A category earns its own intercept only with this many tokenized comps behind it. */
export const MIN_CATEGORY_COMPS = 3;

/** OLS of log(mcap) on log(TVL) with one dummy per category with at least MIN_CATEGORY_COMPS comps
 * (the most common category is the reference); smaller categories pool into the reference. */
function olsFit(rows: SnapshotProtocol[]): OlsResult {
  const counts: Record<string, number> = {};
  for (const p of rows) counts[catOf(p)] = (counts[catOf(p)] ?? 0) + 1;
  const cats = Object.keys(counts).sort((a, b) => counts[b]! - counts[a]!);
  const ref = cats[0]!;
  const dummyCats = cats.slice(1).filter((c) => (counts[c] ?? 0) >= MIN_CATEGORY_COMPS);
  const k = 2 + dummyCats.length;
  const XTX: number[][] = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const XTy: number[] = new Array<number>(k).fill(0);
  const ys: number[] = [];
  for (const p of rows) {
    const x = [1, Math.log(p.tvl_usd)];
    for (const c of dummyCats) x.push(catOf(p) === c ? 1 : 0);
    const y = Math.log(p.mcap_usd!);
    ys.push(y);
    for (let i = 0; i < k; i++) {
      XTy[i]! += x[i]! * y;
      for (let j = 0; j < k; j++) XTX[i]![j]! += x[i]! * x[j]!;
    }
  }
  const beta = solveLinear(XTX, XTy);
  const pred = rows.map((p) => {
    const x = [1, Math.log(p.tvl_usd)];
    for (const c of dummyCats) x.push(catOf(p) === c ? 1 : 0);
    return x.reduce((s, v, i) => s + v * beta[i]!, 0);
  });
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
  const ssTot = ys.reduce((a, y) => a + (y - meanY) ** 2, 0);
  const ssRes = ys.reduce((a, y, i) => a + (y - pred[i]!) ** 2, 0);
  return {
    slope: beta[1]!,
    intercept: beta[0]!,
    sigma: Math.sqrt(ssRes / Math.max(1, rows.length - k)),
    r2: 1 - ssRes / ssTot,
    ref,
    dummyCats,
    beta,
    k,
  };
}

/** The log-mcap a fitted model predicts for one protocol (null when its category has no comps). */
function predictLog(fit: OlsResult, p: SnapshotProtocol): number | null {
  const cat = catOf(p);
  if (cat === fit.ref) return fit.intercept + fit.slope * Math.log(p.tvl_usd);
  const idx = fit.dummyCats.indexOf(cat);
  if (idx < 0) return null;
  return fit.intercept + fit.slope * Math.log(p.tvl_usd) + fit.beta[2 + idx]!;
}

/** The comps: tokenized protocols with a market cap and a TVL above zero. */
export function compsOf(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0);
}

/** Fit the regression on the comps and run its blind test. */
export function fitRegression(snapshot: Snapshot): RegressionFit {
  const comps = compsOf(snapshot);
  if (comps.length < 10) throw new SnapshotError(`only ${comps.length} tokenized protocols with a market cap: the regression has nothing to learn from`);
  const fit = olsFit(comps);
  const counts: Record<string, number> = {};
  for (const p of comps) counts[catOf(p)] = (counts[catOf(p)] ?? 0) + 1;
  const adjustment: Record<string, number> = {};
  for (const c of fit.dummyCats) adjustment[c] = fit.beta[2 + fit.dummyCats.indexOf(c)]!;
  const fallback = medianHigh(comps.map((p) => p.mcap_usd! / p.tvl_usd));
  // Blind test: split the comps in half by slug, fit the first half, predict the second.
  const bySlug = [...comps].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const half = Math.floor(bySlug.length / 2);
  const train = bySlug.slice(0, half);
  const test = bySlug.slice(half);
  const trainFit = olsFit(train);
  const trainFallback = medianHigh(train.map((p) => p.mcap_usd! / p.tvl_usd));
  const misses = test.map((p) => {
    const pred = predictLog(trainFit, p);
    const base = pred === null ? p.tvl_usd * trainFallback : Math.exp(pred);
    return Math.abs(Math.log(base / p.mcap_usd!));
  });
  const typical = Math.exp(misses.reduce((a, b) => a + b, 0) / misses.length);
  return {
    slope: fit.slope,
    intercept: fit.intercept,
    sigma: fit.sigma,
    r2: fit.r2,
    ref_category: fit.ref,
    category_adjustment: adjustment,
    category_n: counts,
    comps_n: comps.length,
    fallback_median: fallback,
    blind_typical_miss: typical,
    blind_median_miss: Math.exp(median(misses)),
    blind_train_n: train.length,
    blind_test_n: test.length,
  };
}

/** The regression base for one protocol: exp(prediction), or TVL x the fallback median. */
export function regressionBase(p: SnapshotProtocol, fit: RegressionFit): { base: number; adjustment: number | null; compsN: number } {
  const cat = catOf(p);
  const compsN = fit.category_n[cat] ?? 0;
  if (cat === fit.ref_category) {
    return { base: Math.exp(fit.intercept + fit.slope * Math.log(p.tvl_usd)), adjustment: 0, compsN };
  }
  const adj = fit.category_adjustment[cat];
  if (adj !== undefined) {
    return { base: Math.exp(fit.intercept + fit.slope * Math.log(p.tvl_usd) + adj), adjustment: adj, compsN };
  }
  return { base: p.tvl_usd * fit.fallback_median, adjustment: null, compsN: 0 };
}

/** The three quality factors and their product for one protocol. */
export function qualityFactors(p: SnapshotProtocol, age: number | null): { growth: number; breadth: number; ageF: number; quality: number } {
  const growth = p.change_7d === null ? 1 : Math.min(1.25, Math.max(0.8, 1 + p.change_7d / 100));
  const breadth = Math.min(1 + 0.02 * (Math.max(1, p.chains.length) - 1), 1.2);
  const ageF = age !== null && age < 90 ? 0.9 : 1;
  return { growth, breadth, ageF, quality: growth * breadth * ageF };
}

/** The cheapest chain's gas in USD per transaction, and that chain's name. */
export function cheapestGas(p: SnapshotProtocol): { gas: number; chain: string } {
  if (p.chains.length === 0) return { gas: GAS_DEFAULT_USD, chain: 'its main chain' };
  let best = { gas: GAS_DEFAULT_USD, chain: p.chains[0]! };
  for (const chain of p.chains) {
    const g = GAS_USD[chain.toLowerCase()] ?? GAS_DEFAULT_USD;
    if (g < best.gas) best = { gas: g, chain };
  }
  return best;
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('curator') || c.includes('allocator')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The farming cost in dollars: gas on the cheapest chain plus 2% opportunity on the capital. */
export function farmCost(p: SnapshotProtocol, age: number | null): { cost: number; capital: number; gasTotal: number; holdDays: number; cheapChain: string } {
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const { gas, chain } = cheapestGas(p);
  const weeks = Math.ceil(hold / 7);
  const gasTotal = gas * 2 + gas * weeks;
  const cost = gasTotal + capital * OPPORTUNITY_RATE;
  return { cost, capital, gasTotal, holdDays: hold, cheapChain: chain };
}

/** The expected airdrop in dollars under the stated assumptions, and the verdict it earns. */
export function farmVerdict(p: SnapshotProtocol, base: number, age: number | null): { expected: number; cost: number; ratio: number; verdict: 'farm' | 'thin' | 'skip'; capital: number; gasTotal: number; holdDays: number; cheapChain: string } {
  const { cost, capital, gasTotal, holdDays, cheapChain } = farmCost(p, age);
  const expected = base * AIRDROP_SHARE * (capital / Math.max(p.tvl_usd, capital)) * FARMER_CAPTURE;
  const ratio = expected / Math.max(cost, 0.01);
  const verdict = ratio >= FARM_MIN_RATIO ? 'farm' : ratio >= THIN_MIN_RATIO ? 'thin' : 'skip';
  return { expected, cost, ratio, verdict, capital, gasTotal, holdDays, cheapChain };
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived from
 * the protocol's own record (category, chains, TVL, age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const { gas, chain: cheap } = cheapestGas(p);
  const weeks = Math.ceil(hold / 7);
  const setupGas = gas * 2;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      // The action happens on the cheapest chain, the same chain the gas is quoted on:
      // a farmer does the deposit where it costs the least.
      text: actionFor(p, capital, cheap),
      cost: `$${capital} of capital and about $${roundMoney(setupGas)} of gas on ${cheap}`,
      time: '15 minutes to set up',
    },
    {
      text: `Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.`,
      cost: `about $${roundMoney(gas)} of gas a week on ${cheap}`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

const roundMoney = (n: number): string => {
  const v = Math.round(n * 100) / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
};

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** Score one pre-token protocol: regression base, band, quality factors, farm economics, verdict. */
export function scoreProtocol(p: SnapshotProtocol, snapshot: Snapshot, fit: RegressionFit): Omit<BoardRow, 'rank'> {
  const age = ageDays(snapshot.as_of, p.listed_at);
  const { base, adjustment, compsN } = regressionBase(p, fit);
  const low = base * Math.exp(-fit.sigma);
  const high = base * Math.exp(fit.sigma);
  const { growth, breadth, ageF, quality } = qualityFactors(p, age);
  const implied = Math.max(1, Math.round(base * quality));
  const verdict = farmVerdict(p, base, age);
  const watchlist = snapshot.watchlist.includes(p.slug);
  return {
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    listed_at: p.listed_at,
    gecko_id: p.gecko_id,
    symbol: p.symbol,
    token_status: 'pre-token',
    age_days: age,
    implied_value_usd: implied,
    implied_low_usd: Math.max(1, Math.round(low)),
    implied_high_usd: Math.round(high),
    regression_base_usd: Math.max(1, Math.round(base)),
    quality_factor: round4(quality),
    growth_factor: round4(growth),
    breadth_factor: round4(breadth),
    age_factor: ageF,
    watchlist,
    comps_n: compsN,
    farm_cost_usd: Math.round(verdict.cost * 100) / 100,
    expected_airdrop_usd: Math.round(verdict.expected * 100) / 100,
    verdict: verdict.verdict,
    model: {
      regression_base_usd: Math.max(1, Math.round(base)),
      band_low_usd: Math.max(1, Math.round(low)),
      band_high_usd: Math.round(high),
      growth_factor: round4(growth),
      breadth_factor: round4(breadth),
      age_factor: ageF,
      quality_factor: round4(quality),
      category_adjustment: adjustment === null ? null : round4(adjustment),
      comps_n: compsN,
      age_days: age,
    },
    farm_steps: farmSteps(p, age).map(stepText),
  };
}

/** The protocols the board ranks, strongest first, with ranks 1..n: every pre-token protocol. */
export function buildBoard(snapshot: Snapshot, fit?: RegressionFit): BoardRow[] {
  const model = fit ?? fitRegression(snapshot);
  const scored = snapshot.protocols.filter(isPreToken).map((p) => scoreProtocol(p, snapshot, model));
  scored.sort((a, b) => b.implied_value_usd - a.implied_value_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  return scored.map((s, i) => ({ rank: i + 1, ...s }));
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    implied_low_usd: row.implied_low_usd,
    implied_high_usd: row.implied_high_usd,
    regression_base_usd: row.regression_base_usd,
    quality_factor: row.quality_factor,
    growth_factor: row.growth_factor,
    breadth_factor: row.breadth_factor,
    age_factor: row.age_factor,
    watchlist: row.watchlist,
    comps_n: row.comps_n,
    farm_cost_usd: row.farm_cost_usd,
    expected_airdrop_usd: row.expected_airdrop_usd,
    verdict: row.verdict,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData; fit: RegressionFit } {
  const fit = fitRegression(snapshot);
  const board = buildBoard(snapshot, fit);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !r.watchlist).length;
  const verdict_counts = { farm: 0, thin: 0, skip: 0 };
  for (const r of board) verdict_counts[r.verdict]++;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: fit,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    verdict_counts,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar, fit };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
