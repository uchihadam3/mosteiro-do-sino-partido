/**
 * Tabuleiro de Formação V2 (§5, §7, §8). Sectors + connections — NOT a grid.
 * Each side: 5 columns × 2 rows (Frente/Retaguarda). Max 2 figures per Sector.
 * Connections (same side): horizontal neighbours in the same row; Frente↔Retaguarda in the same column.
 * Between sides: opposing Frentes of the same column are connected for Engajamento/adjacency.
 */
import type { Col, Figure, Row, SectorKey, Side } from './types';

export const SECTOR_CAPACITY = 2;
export const COLS: Col[] = [1, 2, 3, 4, 5];
export const ROWS: Row[] = ['F', 'R'];

export function sk(side: Side, row: Row, col: number): SectorKey {
  return `${side}:${row}${col as Col}` as SectorKey;
}
export function parseSector(k: SectorKey): { side: Side; row: Row; col: Col } {
  return { side: k[0] as Side, row: k[2] as Row, col: Number(k[3]) as Col };
}
export function allSectors(side?: Side): SectorKey[] {
  const out: SectorKey[] = [];
  for (const s of side ? [side] : (['E', 'H'] as Side[])) for (const r of ROWS) for (const c of COLS) out.push(sk(s, r, c));
  return out;
}

/** Same-side connections (movement graph). Diagonal never. */
export function connections(k: SectorKey): SectorKey[] {
  const { side, row, col } = parseSector(k);
  const out: SectorKey[] = [];
  if (col > 1) out.push(sk(side, row, col - 1));
  if (col < 5) out.push(sk(side, row, col + 1));
  out.push(sk(side, row === 'F' ? 'R' : 'F', col));
  return out;
}

export function areConnectedSameSide(a: SectorKey, b: SectorKey): boolean {
  return connections(a).includes(b);
}

/** Two Sectors are "ortogonalmente conectados" for Área 2 Setores: same side connection. Never diagonal. */
export function isValidArea2(a: SectorKey, b: SectorKey): boolean {
  return a !== b && areConnectedSameSide(a, b);
}

export function oppositeFront(k: SectorKey): SectorKey | null {
  const { side, row, col } = parseSector(k);
  if (row !== 'F') return null;
  return sk(side === 'H' ? 'E' : 'H', 'F', col);
}

export function isActive(f: Figure): boolean {
  return f.status === 'active';
}

export function figuresIn(figs: Figure[], k: SectorKey, includeDown = true): Figure[] {
  return figs.filter((f) => f.sector === k && (f.status === 'active' || (includeDown && (f.status === 'caido' || f.status === 'derrotado'))));
}

/** Occupancy counts every figure physically occupying the Sector (Caído keeps occupying — §50.1). */
export function occupancy(figs: Figure[], k: SectorKey): number {
  return figs.filter((f) => f.sector === k && (f.status === 'active' || f.status === 'caido' || f.status === 'derrotado')).length;
}

export function hasRoom(figs: Figure[], k: SectorKey, ignoreId?: string): boolean {
  return figs.filter((f) => f.id !== ignoreId && f.sector === k && (f.status === 'active' || f.status === 'caido' || f.status === 'derrotado')).length < SECTOR_CAPACITY;
}

/**
 * Adjacência (Livro de Regras R03): same Sector; or connected Sectors of the same side; or opposing Frentes of the same column.
 * Only ACTIVE figures count for gameplay adjacency unless specified.
 */
export function sectorsAdjacent(a: SectorKey, b: SectorKey): boolean {
  if (a === b) return true;
  if (a[0] === b[0]) return areConnectedSameSide(a, b);
  return oppositeFront(a) === b;
}
export function adjacent(a: Figure, b: Figure): boolean {
  return a.id !== b.id && sectorsAdjacent(a.sector, b.sector);
}

/** Engajamento (§7): active figures in opposing Frentes of the same column. Caído/Derrotado don't engage. */
export function isEngaged(f: Figure, figs: Figure[]): boolean {
  if (!isActive(f)) return false;
  const opp = oppositeFront(f.sector);
  if (!opp) return false;
  return figs.some((o) => o.sector === opp && isActive(o) && o.side !== f.side);
}
export function engagedWith(f: Figure, figs: Figure[]): Figure[] {
  if (!isActive(f)) return [];
  const opp = oppositeFront(f.sector);
  if (!opp) return [];
  return figs.filter((o) => o.sector === opp && isActive(o) && o.side !== f.side);
}
/** Would a figure at sector k (on its side) be engaged given current figures? */
export function sectorEngaged(k: SectorKey, side: Side, figs: Figure[], ignoreId?: string): boolean {
  const opp = oppositeFront(k);
  if (!opp) return false;
  return figs.some((o) => o.id !== ignoreId && o.sector === opp && isActive(o) && o.side !== side);
}

/** Coluna Fechada (§8): an active figure in the defender's Frente of that column protects its Retaguarda. */
export function columnClosed(defenderSide: Side, col: number, figs: Figure[]): boolean {
  return figs.some((f) => f.side === defenderSide && isActive(f) && f.sector === sk(defenderSide, 'F', col));
}

export interface ReachSpec {
  cat: 'cac' | 'alcance' | 'distancia' | 'global';
  /** Special: attack may target the enemy Frente at Distância (e.g. Machado de Mão). */
  frontOnly?: boolean;
}

/**
 * Can attacker at sector `from` legally target a figure at `target` with category `cat`?
 * §8: Corpo a Corpo — attacker in Frente, same column; Frente blocks Retaguarda; open column allows Retaguarda.
 *     Alcance — attacker Frente or Retaguarda, same column; own Frente doesn't block; opposing Frente blocks Retaguarda.
 *     Distância — any column/row; protection doesn't block; Cobertura may reduce Dano.
 *     Global — ignores Formation restrictions.
 */
export function canTarget(from: SectorKey, target: Figure, cat: ReachSpec['cat'], figs: Figure[], attackerSide: Side): boolean {
  if (!isActive(target)) return false;
  if (target.side === attackerSide) return false;
  const a = parseSector(from);
  const t = parseSector(target.sector);
  if (cat === 'global' || cat === 'distancia') return true;
  if (a.col !== t.col) return false;
  if (cat === 'cac' && a.row !== 'F') return false;
  if (t.row === 'F') return true;
  // target in Retaguarda: blocked if its Frente is closed
  return !columnClosed(target.side, t.col, figs);
}

/** BFS over same-side connections. Can pass through full ally Sectors but must END in a sector with room (§5.1). */
export function shortestPaths(
  start: SectorKey,
  figs: Figure[],
  moverId: string,
  opts: { maxSteps?: number; blockEnemyOccupied?: boolean } = {},
): Map<SectorKey, SectorKey[]> {
  const res = new Map<SectorKey, SectorKey[]>();
  res.set(start, [start]);
  const q: SectorKey[] = [start];
  const max = opts.maxSteps ?? 99;
  while (q.length) {
    const cur = q.shift()!;
    const path = res.get(cur)!;
    if (path.length - 1 >= max) continue;
    for (const n of connections(cur)) {
      if (res.has(n)) continue;
      res.set(n, [...path, n]);
      q.push(n);
    }
  }
  // drop destinations without room (except start)
  for (const [k] of res) if (k !== start && !hasRoom(figs, k, moverId)) res.delete(k);
  return res;
}

export function sectorDistance(a: SectorKey, b: SectorKey): number {
  if (a[0] !== b[0]) return Infinity;
  const pa = parseSector(a);
  const pb = parseSector(b);
  return Math.abs(pa.col - pb.col) + (pa.row === pb.row ? 0 : 1);
}

/** Destinations reachable with exactly up to n connections, ending with room. */
export function reachable(start: SectorKey, n: number, figs: Figure[], moverId: string): SectorKey[] {
  return [...shortestPaths(start, figs, moverId, { maxSteps: n }).keys()].filter((k) => k !== start);
}

/** Faixas do Arqueiro (§18.5): category of Formation, not distance. */
export type Faixa = 'proxima' | 'media' | 'longa';
export function faixaOf(attacker: SectorKey, target: SectorKey): Faixa {
  const a = parseSector(attacker).row;
  const t = parseSector(target).row;
  if (a === 'F' && t === 'F') return 'proxima';
  if (a === 'R' && t === 'R') return 'longa';
  return 'media';
}

/** Human readable sector label (PT-BR). */
export function sectorLabel(k: SectorKey): string {
  const { side, row, col } = parseSector(k);
  return `${side === 'H' ? 'Heróis' : 'Inimigos'} · ${row === 'F' ? 'Frente' : 'Retaguarda'} ${col}`;
}
