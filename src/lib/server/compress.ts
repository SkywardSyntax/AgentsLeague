interface KeyMap {
  [fullKey: string]: string;
}

function buildKeyMap(obj: unknown, map: KeyMap, counter: { n: number }): void {
  if (obj === null || obj === undefined || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      buildKeyMap(item, map, counter);
    }
    return;
  }

  for (const key of Object.keys(obj as Record<string, unknown>)) {
    if (!(key in map) && key.length > 2) {
      map[key] = `~${counter.n.toString(36)}`;
      counter.n++;
    }
    buildKeyMap((obj as Record<string, unknown>)[key], map, counter);
  }
}

function applyKeyMap(obj: unknown, map: KeyMap): unknown {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => applyKeyMap(item, map));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const shortKey = map[key] ?? key;
    result[shortKey] = applyKeyMap(value, map);
  }
  return result;
}

function invertMap(map: KeyMap): KeyMap {
  const inv: KeyMap = {};
  for (const [full, short] of Object.entries(map)) {
    inv[short] = full;
  }
  return inv;
}

function restoreKeys(obj: unknown, invMap: KeyMap): unknown {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map((item) => restoreKeys(item, invMap));
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const fullKey = invMap[key] ?? key;
    result[fullKey] = restoreKeys(value, invMap);
  }
  return result;
}

function stripDefaults(obj: unknown): unknown {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(stripDefaults);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (value === undefined || value === null || value === '') continue;
    if (Array.isArray(value) && value.length === 0) continue;
    result[key] = stripDefaults(value);
  }
  return result;
}

export function compressPayload(value: unknown): string {
  const stripped = stripDefaults(value);
  const keyMap: KeyMap = {};
  buildKeyMap(stripped, keyMap, { n: 0 });

  const compressed = applyKeyMap(stripped, keyMap);

  return JSON.stringify({ _k: keyMap, _d: compressed });
}

export function decompressPayload(compressed: string): unknown {
  let parsed: { _k?: KeyMap; _d?: unknown };
  try {
    parsed = JSON.parse(compressed);
  } catch {
    throw new Error(`Invalid compressed payload: malformed JSON`);
  }

  if (!parsed || typeof parsed !== 'object' || !('_d' in parsed)) {
    throw new Error('Invalid compressed payload: missing _d field');
  }

  const keyMap = parsed._k ?? {};
  const invMap = invertMap(keyMap);

  return restoreKeys(parsed._d, invMap);
}

export function compressionRatio(original: string, compressed: string): number {
  if (original.length === 0) return 0;
  return compressed.length / original.length;
}
