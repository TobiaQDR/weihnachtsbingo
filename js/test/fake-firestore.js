// Attrappe für firebase-firestore.js im lokalen Testmodus: Dokumente im localStorage.
// Deckt nur ab, was die Seite benutzt. Sicherheitsregeln (firestore.rules) werden NICHT geprüft.
import { getStore, commitStore, subscribe, tick, realNow } from "./fake-env.js";

// ---------- Referenzen ----------

const join = (segments) => segments.map(String).join("/");

function docRef(path) {
  const parts = path.split("/");
  return {
    type: "document",
    path,
    id: parts[parts.length - 1],
    parent: collRef(parts.slice(0, -1).join("/")),
  };
}

function collRef(path) {
  const parts = path.split("/");
  return { type: "collection", path, id: parts[parts.length - 1] };
}

export function getFirestore() {
  return { type: "firestore" };
}

export function doc(base, ...segments) {
  const prefix = base?.type === "collection" ? [base.path] : [];
  const path = join([...prefix, ...segments]);
  if (path.split("/").length % 2 !== 0) throw new Error(`Testmodus: ungültiger Dokumentpfad ${path}`);
  return docRef(path);
}

export function collection(base, ...segments) {
  const prefix = base?.type === "document" ? [base.path] : [];
  const path = join([...prefix, ...segments]);
  if (path.split("/").length % 2 !== 1) throw new Error(`Testmodus: ungültiger Sammlungspfad ${path}`);
  return collRef(path);
}

export function where(field, op, value) {
  return { field, op, value };
}

export function query(coll, ...filters) {
  return { type: "query", path: coll.path, filters };
}

// ---------- Sonderwerte ----------

class FieldValue {
  constructor(kind, values = []) {
    this.kind = kind;
    this.values = values;
  }
}

export const serverTimestamp = () => new FieldValue("serverTimestamp");
export const arrayUnion = (...values) => new FieldValue("arrayUnion", values);
export const arrayRemove = (...values) => new FieldValue("arrayRemove", values);
export const deleteField = () => new FieldValue("delete");

class Timestamp {
  constructor(ms) {
    this.seconds = Math.floor(ms / 1000);
    this.nanoseconds = (ms % 1000) * 1e6;
  }
  toMillis() { return this.seconds * 1000 + this.nanoseconds / 1e6; }
  toDate() { return new Date(this.toMillis()); }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Wert für die Ablage auflösen (Sonderwerte anwenden, Datum → { __ts }). */
function resolve(value, old) {
  if (value instanceof FieldValue) {
    const arr = Array.isArray(old) ? old : [];
    switch (value.kind) {
      case "serverTimestamp": return { __ts: realNow() };
      case "arrayUnion": {
        const add = value.values.map((v) => resolve(v));
        return [...arr, ...add.filter((v, i) => !arr.some((x) => same(x, v)) && add.findIndex((y) => same(y, v)) === i)];
      }
      case "arrayRemove": {
        const rm = value.values.map((v) => resolve(v));
        return arr.filter((x) => !rm.some((v) => same(x, v)));
      }
      default: return undefined;
    }
  }
  if (value instanceof Date) return { __ts: value.getTime() };
  if (value instanceof Timestamp) return { __ts: value.toMillis() };
  if (Array.isArray(value)) return value.map((v) => resolve(v));
  if (value && typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      const r = resolve(v, old?.[k]);
      if (r !== undefined) out[k] = r;
    }
    return out;
  }
  return value;
}

/** Abgelegten Wert für die Seite aufbereiten ({ __ts } → Timestamp). */
function hydrate(value) {
  if (Array.isArray(value)) return value.map(hydrate);
  if (value && typeof value === "object") {
    if (Object.keys(value).length === 1 && typeof value.__ts === "number") return new Timestamp(value.__ts);
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, hydrate(v)]));
  }
  return value;
}

// ---------- Schnappschüsse ----------

const META = Object.freeze({ fromCache: false, hasPendingWrites: false });

function docSnapshot(path, docs = getStore().docs) {
  const raw = docs[path];
  const ref = docRef(path);
  return {
    id: ref.id,
    ref,
    metadata: META,
    exists: () => raw !== undefined,
    data: () => (raw === undefined ? undefined : hydrate(raw)),
    get: (field) => (raw === undefined ? undefined : hydrate(raw[field])),
  };
}

function matches(data, { field, op, value }) {
  const v = data[field];
  switch (op) {
    case "==": return same(v, value);
    case "!=": return !same(v, value);
    case "in": return value.some((x) => same(v, x));
    case "array-contains": return Array.isArray(v) && v.some((x) => same(x, value));
    case "<": return v < value;
    case "<=": return v <= value;
    case ">": return v > value;
    case ">=": return v >= value;
    default: throw new Error(`Testmodus: Operator ${op} nicht unterstützt`);
  }
}

function querySnapshot(target) {
  const docs = getStore().docs;
  const prefix = target.path + "/";
  const filters = target.filters ?? [];
  const list = Object.keys(docs)
    .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"))
    .filter((p) => filters.every((f) => matches(docs[p], f)))
    .sort()
    .map((p) => docSnapshot(p, docs));
  return {
    docs: list,
    size: list.length,
    empty: list.length === 0,
    metadata: META,
    forEach: (fn) => list.forEach(fn),
  };
}

// ---------- Schreiben ----------

function applyWrite(docs, op) {
  const old = docs[op.path];
  if (op.kind === "delete") {
    delete docs[op.path];
  } else if (op.kind === "set") {
    const base = op.merge && old ? old : {};
    docs[op.path] = { ...base, ...resolve(op.data, base) };
    for (const [k, v] of Object.entries(op.data)) if (v instanceof FieldValue && v.kind === "delete") delete docs[op.path][k];
  } else if (op.kind === "update") {
    if (old === undefined) {
      throw Object.assign(new Error(`No document to update: ${op.path}`), { code: "not-found" });
    }
    const next = { ...old };
    for (const [k, v] of Object.entries(op.data)) {
      if (k.includes(".")) throw new Error("Testmodus: Feldpfade mit Punkt werden nicht unterstützt");
      if (v instanceof FieldValue && v.kind === "delete") delete next[k];
      else next[k] = resolve(v, old[k]);
    }
    docs[op.path] = next;
  }
}

/** Mehrere Schreibvorgänge: alle oder keiner (wie ein echter Batch). */
function commitOps(ops) {
  const store = getStore();
  const docs = structuredClone(store.docs);
  for (const op of ops) applyWrite(docs, op);
  commitStore({ ...store, docs });
}

export async function getDoc(ref) {
  await tick();
  return docSnapshot(ref.path);
}

export async function getDocs(target) {
  await tick();
  return querySnapshot(target);
}

export async function setDoc(ref, data, options = {}) {
  await tick();
  commitOps([{ kind: "set", path: ref.path, data, merge: Boolean(options.merge) }]);
}

export async function updateDoc(ref, data) {
  await tick();
  commitOps([{ kind: "update", path: ref.path, data }]);
}

export async function deleteDoc(ref) {
  await tick();
  commitOps([{ kind: "delete", path: ref.path }]);
}

export function writeBatch() {
  const ops = [];
  const batch = {
    set(ref, data, options = {}) { ops.push({ kind: "set", path: ref.path, data, merge: Boolean(options.merge) }); return batch; },
    update(ref, data) { ops.push({ kind: "update", path: ref.path, data }); return batch; },
    delete(ref) { ops.push({ kind: "delete", path: ref.path }); return batch; },
    async commit() {
      await tick();
      commitOps(ops);
    },
  };
  return batch;
}

export async function runTransaction(db, fn) {
  await tick();
  const ops = [];
  const tx = {
    get: async (ref) => docSnapshot(ref.path),
    set(ref, data, options = {}) { ops.push({ kind: "set", path: ref.path, data, merge: Boolean(options.merge) }); return tx; },
    update(ref, data) { ops.push({ kind: "update", path: ref.path, data }); return tx; },
    delete(ref) { ops.push({ kind: "delete", path: ref.path }); return tx; },
  };
  const result = await fn(tx);
  commitOps(ops);
  return result;
}

// ---------- Abos ----------

export function onSnapshot(target, next, onError) {
  const snapshot = () => (target.type === "document" ? docSnapshot(target.path) : querySnapshot(target));
  const keyOf = (s) => JSON.stringify(target.type === "document"
    ? s.exists() ? getStore().docs[target.path] : null
    : s.docs.map((d) => [d.id, getStore().docs[d.ref.path]]));
  let lastKey = null;
  let active = true;
  const emit = () => {
    if (!active) return;
    try {
      const s = snapshot();
      const key = keyOf(s);
      if (key === lastKey) return;
      lastKey = key;
      next(s);
    } catch (err) {
      if (onError) onError(err);
      else console.error(err);
    }
  };
  setTimeout(emit, 0);
  const off = subscribe(() => setTimeout(emit, 0));
  return () => {
    active = false;
    off();
  };
}
