const isBrowser = typeof window !== "undefined";
const STORAGE_KEY = "seaneb:auth:refresh:budget";

const toPositiveNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const MAX_ATTEMPTS = toPositiveNumber(
  process.env.NEXT_PUBLIC_AUTH_REFRESH_MAX_ATTEMPTS,
  3
);
const WINDOW_MS = toPositiveNumber(
  process.env.NEXT_PUBLIC_AUTH_REFRESH_WINDOW_MS,
  30000
);

let inMemoryAttempts = [];

const readStoredAttempts = () => {
  if (!isBrowser) return inMemoryAttempts;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeStoredAttempts = (attempts) => {
  if (!isBrowser) {
    inMemoryAttempts = attempts;
    return;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(attempts));
  } catch {
    inMemoryAttempts = attempts;
  }
};

const pruneAttempts = (attempts, now) => {
  const windowMs = WINDOW_MS;
  if (!windowMs) return attempts;
  return (attempts || []).filter((entry) => {
    const at = Number(entry?.at || 0);
    return at && now - at < windowMs;
  });
};

export const getRefreshBudgetState = () => {
  const now = Date.now();
  const attempts = pruneAttempts(readStoredAttempts(), now);
  const used = attempts.length;
  return {
    maxAttempts: MAX_ATTEMPTS,
    windowMs: WINDOW_MS,
    used,
    remaining: Math.max(MAX_ATTEMPTS - used, 0),
    lastAttemptAt: used ? Number(attempts[used - 1]?.at || 0) : 0,
  };
};

export const clearRefreshBudget = () => {
  if (!isBrowser) {
    inMemoryAttempts = [];
    return;
  }

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    inMemoryAttempts = [];
  }
};

export const tryUseRefreshBudget = ({ source = "", cooldownMs = 0 } = {}) => {
  if (!isBrowser) {
    return { allowed: true, remaining: MAX_ATTEMPTS, used: 0, deferred: false, limited: false };
  }

  const now = Date.now();
  const attempts = pruneAttempts(readStoredAttempts(), now);
  const used = attempts.length;
  const lastAttemptAt = used ? Number(attempts[used - 1]?.at || 0) : 0;

  if (cooldownMs && lastAttemptAt && now - lastAttemptAt < cooldownMs) {
    return {
      allowed: false,
      remaining: Math.max(MAX_ATTEMPTS - used, 0),
      used,
      deferred: true,
      limited: false,
    };
  }

  if (used >= MAX_ATTEMPTS) {
    writeStoredAttempts(attempts);
    return {
      allowed: false,
      remaining: 0,
      used,
      deferred: false,
      limited: true,
    };
  }

  const nextAttempts = [
    ...attempts,
    {
      at: now,
      source: String(source || "").trim(),
    },
  ];

  writeStoredAttempts(nextAttempts);

  return {
    allowed: true,
    remaining: Math.max(MAX_ATTEMPTS - nextAttempts.length, 0),
    used: nextAttempts.length,
    deferred: false,
    limited: false,
  };
};
