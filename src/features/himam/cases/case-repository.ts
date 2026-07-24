import type { AuditEvent } from "../audit/audit-types";
import type { InputSource, ReviewCase, ReviewScopeSnapshot } from "./case-types";

export interface HimamStore {
  cases: ReviewCase[];
  sources: InputSource[];
  scopeSnapshots: ReviewScopeSnapshot[];
  auditEvents: AuditEvent[];
}

export interface ReviewCaseRepository {
  load(): HimamStore;
  save(store: HimamStore): void;
  reset(): void;
}

const EMPTY: HimamStore = {
  cases: [],
  sources: [],
  scopeSnapshots: [],
  auditEvents: [],
};

const STORAGE_KEY = "himam.pkg1a.store.v1";

function inMemoryRepo(): ReviewCaseRepository {
  let state: HimamStore = structuredClone(EMPTY);
  return {
    load: () => structuredClone(state),
    save: (s) => {
      state = structuredClone(s);
    },
    reset: () => {
      state = structuredClone(EMPTY);
    },
  };
}

function localStorageRepo(): ReviewCaseRepository {
  return {
    load: () => {
      try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return structuredClone(EMPTY);
        const parsed = JSON.parse(raw) as HimamStore;
        return {
          cases: parsed.cases ?? [],
          sources: parsed.sources ?? [],
          scopeSnapshots: parsed.scopeSnapshots ?? [],
          auditEvents: parsed.auditEvents ?? [],
        };
      } catch {
        return structuredClone(EMPTY);
      }
    },
    save: (s) => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    },
    reset: () => {
      window.localStorage.removeItem(STORAGE_KEY);
    },
  };
}

let defaultRepo: ReviewCaseRepository | null = null;
export function getDefaultRepository(): ReviewCaseRepository {
  if (defaultRepo) return defaultRepo;
  if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
    defaultRepo = localStorageRepo();
  } else {
    defaultRepo = inMemoryRepo();
  }
  return defaultRepo;
}

export function createInMemoryRepository(): ReviewCaseRepository {
  return inMemoryRepo();
}
