/**
 * Domain → route prefix mapping for multi-domain hostname rewriting.
 *
 * Production: middleware reads `request.headers.host` and rewrites the
 * incoming path to `/<prefix>{pathname}` so the right route group renders.
 *
 * Dev: browsers resolve `*.localhost` to 127.0.0.1 automatically, so you can
 * visit `http://awknranch.localhost:3000`, `http://within.localhost:3000`, etc.
 * Plain `http://localhost:3000` falls through to the dev landing page.
 */
export type DomainKey = "awknranch" | "within" | "portal" | "team";

export interface DomainConfig {
  key: DomainKey;
  label: string;
  prodHosts: string[];
  devHostMatchers: (string | RegExp)[];
  authRequired: boolean;
  description: string;
}

export const DOMAINS: DomainConfig[] = [
  {
    key: "awknranch",
    label: "AWKN Ranch",
    prodHosts: ["awknranch.com", "www.awknranch.com"],
    devHostMatchers: [/^awknranch\.localhost(:\d+)?$/],
    authRequired: false,
    description: "Public marketing site for AWKN Ranch retreat property",
  },
  {
    key: "within",
    label: "Within Center",
    prodHosts: ["within.center", "www.within.center"],
    devHostMatchers: [/^within\.localhost(:\d+)?$/],
    authRequired: false,
    description: "Public marketing site for Within Center clinical brand",
  },
  {
    key: "portal",
    label: "Client Portal",
    prodHosts: ["portal.awknranch.com", "portal.within.center"],
    devHostMatchers: [/^portal\.localhost(:\d+)?$/],
    authRequired: true,
    description: "Authenticated client-facing portal (bookings, payments, documents)",
  },
  {
    key: "team",
    label: "Team",
    prodHosts: ["team.awknranch.com"],
    devHostMatchers: [/^team\.localhost(:\d+)?$/],
    authRequired: true,
    description: "Internal Business Operating System for AWKN + Within team (CRM, scheduling, accounting)",
  },
];

/**
 * Match a hostname to a known domain. Returns null if it's the bare `localhost`
 * dev landing page or an unknown host.
 */
export function resolveDomain(host: string | null): DomainConfig | null {
  if (!host) return null;
  const lowered = host.toLowerCase();
  for (const domain of DOMAINS) {
    if (domain.prodHosts.some((h) => h === lowered)) return domain;
    if (
      domain.devHostMatchers.some((m) =>
        typeof m === "string" ? m === lowered : m.test(lowered),
      )
    ) {
      return domain;
    }
  }
  return null;
}
