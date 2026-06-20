import type { Group } from "./types";

const DB_NAME = "settly";
const DB_VERSION = 1;

let _db: IDBDatabase | null = null;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore("groups", { keyPath: "id" });
      req.result.createObjectStore("outbox", { keyPath: "groupId" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getDB(): Promise<IDBDatabase> {
  if (!_db) _db = await open();
  return _db;
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function idbPutGroup(group: Group): Promise<void> {
  const db = await getDB();
  await req(db.transaction("groups", "readwrite").objectStore("groups").put(group));
}

export async function idbGetAllGroups(): Promise<Group[]> {
  const db = await getDB();
  return req<Group[]>(db.transaction("groups", "readonly").objectStore("groups").getAll());
}

export async function idbDeleteGroup(id: string): Promise<void> {
  const db = await getDB();
  await req(db.transaction("groups", "readwrite").objectStore("groups").delete(id));
}

export async function idbAddToOutbox(groupId: string): Promise<void> {
  const db = await getDB();
  await req(db.transaction("outbox", "readwrite").objectStore("outbox").put({ groupId }));
}

export async function idbGetOutbox(): Promise<string[]> {
  const db = await getDB();
  const entries = await req<{ groupId: string }[]>(
    db.transaction("outbox", "readonly").objectStore("outbox").getAll()
  );
  return entries.map((e) => e.groupId);
}

export async function idbClearFromOutbox(groupIds: string[]): Promise<void> {
  if (!groupIds.length) return;
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction("outbox", "readwrite");
    groupIds.forEach((id) => t.objectStore("outbox").delete(id));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function idbClearAll(): Promise<void> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(["groups", "outbox"], "readwrite");
    t.objectStore("groups").clear();
    t.objectStore("outbox").clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
