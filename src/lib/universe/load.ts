// Getting the universe's data into typed arrays: star positions (6 bytes each), the library of each star, a lemma-name hash table, and a few recorded runs.

import type { ReplayRun, UniverseMeta } from './types';
import { NameIndex } from './names';
import type { UniverseData } from './engine';

export async function gunzip(buf: ArrayBuffer): Promise<ArrayBuffer> {
  const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

/** stars.bin: n x int16 x,y,z, then n x uint16 (library index, top bit set when the theorem is trusted). */
export async function buildUniverseData(starsGz: ArrayBuffer, meta: UniverseMeta, namesGz: ArrayBuffer | null, replays: ReplayRun[]): Promise<UniverseData> {
  const stars = await gunzip(starsGz);
  const names = namesGz ? NameIndex.fromBuffer(await gunzip(namesGz)) : null;
  return { meta, pos: new Int16Array(stars, 0, meta.n * 3), lib: new Uint16Array(stars, meta.n * 6, meta.n), names, replays };
}

/** Fetches the four assets from `base` (default /universe) and reports progress. */
export async function loadUniverse(base = '/universe', onProgress?: (message: string, fraction: number) => void): Promise<UniverseData> {
  const get = async (name: string): Promise<Response> => {
    const r = await fetch(`${base}/${name}`);
    if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
    return r;
  };
  onProgress?.('Reading the map', 0.05);
  const meta = (await (await get('meta.json')).json()) as UniverseMeta;
  onProgress?.('Gathering 800,000 stars', 0.15);
  const starsGz = await (await get('stars.bin.gz')).arrayBuffer();
  onProgress?.('Indexing lemma names', 0.65);
  const namesGz = await (await get('names.bin.gz')).arrayBuffer();
  const replays = (await (await get('replays.json')).json()) as ReplayRun[];
  onProgress?.('Unpacking', 0.9);
  return buildUniverseData(starsGz, meta, namesGz, replays);
}
