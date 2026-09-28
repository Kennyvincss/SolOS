import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { deleteKey, readJson, writeJson } from "../sync-store";

/**
 * STRATA developer platform: a developer's profile, their projects
 * (extensions, mini apps, AI agents, wallet tools, data widgets), API keys and
 * store submissions. Stored per account in the sync store.
 */

export const PROJECT_KINDS = ["extension", "mini-app", "agent", "wallet-tool", "widget"] as const;
export type ProjectKind = (typeof PROJECT_KINDS)[number];
export type ProjectStatus = "draft" | "in-review" | "changes-requested" | "published";

export interface DevProject {
  id: string;
  kind: ProjectKind;
  name: string;
  description: string;
  category: string;
  version: string;
  permissions: string[];
  matches: string[];
  /** AI agents: what the agent does (its instructions). */
  instructions?: string;
  homepage?: string;
  status: ProjectStatus;
  createdAt: number;
  updatedAt: number;
}

export interface DevSubmission {
  id: string;
  projectId: string;
  name: string;
  kind: ProjectKind;
  version: string;
  notes: string;
  sourceUrl?: string;
  storeId?: string;
  status: "in-review" | "changes-requested" | "published";
  at: number;
}

export interface DevKeyMeta {
  id: string;
  name: string;
  prefix: string;
  createdAt: number;
}

export interface DevProfile {
  name: string;
  handle: string;
  bio: string;
  website: string;
  github: string;
  x: string;
}

export interface DevRecord {
  profile: DevProfile;
  projects: DevProject[];
  submissions: DevSubmission[];
  keys: DevKeyMeta[];
}

const recordKey = (uid: string) => `devx:v1:${uid}`;
const keyHashKey = (hash: string) => `devkey:v1:${hash}`;
export const usageKey = (keyId: string, day: string) => `devuse:v1:${keyId}:${day}`;
export const dayOf = (t = Date.now()) => new Date(t).toISOString().slice(0, 10).replace(/-/g, "");

export const EMPTY_PROFILE: DevProfile = { name: "", handle: "", bio: "", website: "", github: "", x: "" };

export async function getRecord(uid: string): Promise<DevRecord> {
  const r = await readJson<DevRecord>(recordKey(uid));
  return { profile: { ...EMPTY_PROFILE, ...(r?.profile ?? {}) }, projects: r?.projects ?? [], submissions: r?.submissions ?? [], keys: r?.keys ?? [] };
}

export async function saveRecord(uid: string, r: DevRecord): Promise<void> {
  await writeJson(recordKey(uid), r);
}

const id = () => randomBytes(6).toString("hex");

export async function createProject(uid: string, p: Omit<DevProject, "id" | "status" | "createdAt" | "updatedAt">): Promise<DevProject> {
  const r = await getRecord(uid);
  if (r.projects.length >= 50) throw new Error("You can have up to 50 projects.");
  const now = Date.now();
  const project: DevProject = { ...p, id: id(), status: "draft", createdAt: now, updatedAt: now };
  r.projects.unshift(project);
  await saveRecord(uid, r);
  return project;
}

export async function updateProject(uid: string, projectId: string, patch: Partial<Omit<DevProject, "id" | "createdAt" | "status">>): Promise<DevProject | null> {
  const r = await getRecord(uid);
  const i = r.projects.findIndex((p) => p.id === projectId);
  if (i === -1) return null;
  r.projects[i] = { ...r.projects[i], ...patch, id: projectId, updatedAt: Date.now() };
  await saveRecord(uid, r);
  return r.projects[i];
}

export async function deleteProject(uid: string, projectId: string): Promise<void> {
  const r = await getRecord(uid);
  r.projects = r.projects.filter((p) => p.id !== projectId);
  await saveRecord(uid, r);
}

export async function submitProject(uid: string, projectId: string, extra: { notes: string; sourceUrl?: string; storeId?: string }): Promise<DevSubmission | null> {
  const r = await getRecord(uid);
  const p = r.projects.find((x) => x.id === projectId);
  if (!p) return null;
  const sub: DevSubmission = { id: id(), projectId, name: p.name, kind: p.kind, version: p.version, notes: extra.notes, sourceUrl: extra.sourceUrl, storeId: extra.storeId, status: "in-review", at: Date.now() };
  r.submissions.unshift(sub);
  r.submissions = r.submissions.slice(0, 100);
  p.status = "in-review";
  p.updatedAt = Date.now();
  await saveRecord(uid, r);
  return sub;
}

/* ------------------------------------------------------------ API keys */

export const hashKey = (secret: string) => createHash("sha256").update(secret).digest("hex");

/** Create a key. The secret is returned once; only its hash is stored. */
export async function createKey(uid: string, name: string): Promise<{ meta: DevKeyMeta; secret: string }> {
  const r = await getRecord(uid);
  if (r.keys.length >= 10) throw new Error("You can have up to 10 API keys.");
  const secret = `strata_live_${randomBytes(24).toString("base64url")}`;
  const meta: DevKeyMeta = { id: id(), name: name.slice(0, 40) || "API key", prefix: secret.slice(0, 16), createdAt: Date.now() };
  await writeJson(keyHashKey(hashKey(secret)), { uid, keyId: meta.id });
  r.keys.push({ ...meta, hash: hashKey(secret) } as DevKeyMeta & { hash: string });
  await saveRecord(uid, r);
  return { meta, secret };
}

export async function revokeKey(uid: string, keyId: string): Promise<void> {
  const r = await getRecord(uid);
  const k = r.keys.find((x) => x.id === keyId) as (DevKeyMeta & { hash?: string }) | undefined;
  if (k?.hash) await deleteKey(keyHashKey(k.hash));
  r.keys = r.keys.filter((x) => x.id !== keyId);
  await saveRecord(uid, r);
}

/** Public view of a record (key hashes stay on the server). */
export function publicRecord(r: DevRecord): DevRecord {
  return { ...r, keys: r.keys.map(({ id: kid, name, prefix, createdAt }) => ({ id: kid, name, prefix, createdAt })) };
}
