import { z } from "zod";
import { eq } from "drizzle-orm";

import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import { items } from "~/server/db/schema";

/**
 * Example router demonstrating basic CRUD patterns.
 * Replace "item" with your actual entity name.
 */
export const exampleRouter = createTRPCRouter({
  /**
   * Simple hello query for testing
   */
  hello: publicProcedure
    .input(z.object({ text: z.string() }))
    .query(({ input }) => {
      return {
        greeting: `Hello ${input.text}`,
      };
    }),

  /**
   * Get all items
   */
  getAll: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(items);
  }),

  /**
   * Get a single item by ID
   */
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const result = await ctx.db
        .select()
        .from(items)
        .where(eq(items.id, input.id));
      return result[0] ?? null;
    }),

  /**
   * Create a new item
   */
  create: publicProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const id = crypto.randomUUID();
      await ctx.db.insert(items).values({
        id,
        name: input.name,
        description: input.description ?? null,
      });
      return { id };
    }),

  /**
   * Update an existing item
   */
  update: publicProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await ctx.db
        .update(items)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(items.id, id));
      return { success: true };
    }),

  /**
   * Delete an item
   */
  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(items).where(eq(items.id, input.id));
      return { success: true };
    }),
});
