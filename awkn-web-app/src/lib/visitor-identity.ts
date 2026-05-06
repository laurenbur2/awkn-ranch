/**
 * Persists visitor name/email/phone in localStorage so contact + follow-up
 * forms can pre-fill across visits. Ported from legacy
 * `shared/visitor-identity.js` (90-day TTL, same storage key).
 */

const STORAGE_KEY = "property_visitor";
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export interface VisitorIdentity {
  name?: string;
  email?: string;
  phone?: string;
  savedAt?: number;
}

export function saveVisitor(input: {
  name?: string;
  email?: string;
  phone?: string;
}): void {
  if (typeof window === "undefined") return;
  const data = getVisitor();
  if (input.name) data.name = input.name;
  if (input.email) data.email = input.email;
  if (input.phone) data.phone = input.phone;
  data.savedAt = Date.now();
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // localStorage may be disabled (private mode, quota, etc.). Fail silent —
    // visitor identity is a UX nicety, not a correctness requirement.
  }
}

export function getVisitor(): VisitorIdentity {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const data = JSON.parse(raw) as VisitorIdentity;
    if (data.savedAt && Date.now() - data.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return {};
    }
    return data;
  } catch {
    return {};
  }
}
