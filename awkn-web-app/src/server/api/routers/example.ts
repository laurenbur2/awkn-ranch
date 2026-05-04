import { z } from "zod";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

/**
 * Placeholder router. The seed's example router queried a stub `items`
 * table that doesn't exist in AWKN's prod schema; that example was removed
 * in Phase 2.3. Real domain routers (spaces, crm-leads, etc.) land per
 * phase as each surface gets ported.
 */
export const exampleRouter = createTRPCRouter({
  hello: publicProcedure
    .input(z.object({ text: z.string() }))
    .query(({ input }) => ({ greeting: `Hello ${input.text}` })),
});
