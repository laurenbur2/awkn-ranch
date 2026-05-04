/**
 * Application-wide error handling utilities
 * Provides consistent error handling patterns across the app
 */

import { TRPCError } from "@trpc/server";
import { ZodError } from "zod";

/**
 * Base application error class
 */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 500
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Common error codes
 */
export const ErrorCodes = {
  // Authentication & Authorization
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  INVALID_TOKEN: "INVALID_TOKEN",

  // Data & Validation
  VALIDATION_FAILED: "VALIDATION_FAILED",
  NOT_FOUND: "NOT_FOUND",
  DUPLICATE_RESOURCE: "DUPLICATE_RESOURCE",

  // External Services
  DATABASE_ERROR: "DATABASE_ERROR",
  EXTERNAL_SERVICE_ERROR: "EXTERNAL_SERVICE_ERROR",

  // General
  INTERNAL_ERROR: "INTERNAL_ERROR",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
} as const;

/**
 * Convert various error types to consistent tRPC errors
 */
export function handleError(error: unknown): TRPCError {
  // Handle Zod validation errors
  if (error instanceof ZodError) {
    return new TRPCError({
      code: "BAD_REQUEST",
      message: "Validation failed",
      cause: error,
    });
  }

  // Handle custom app errors
  if (error instanceof AppError) {
    const trpcCode = mapStatusCodeToTRPCCode(error.statusCode);
    return new TRPCError({
      code: trpcCode,
      message: error.message,
      cause: error,
    });
  }

  // Handle tRPC errors (pass through)
  if (error instanceof TRPCError) {
    return error;
  }

  // Handle unknown errors
  console.error("Unhandled error:", error);
  return new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: "An unexpected error occurred",
    cause: error,
  });
}

/**
 * Map HTTP status codes to tRPC error codes
 */
function mapStatusCodeToTRPCCode(statusCode: number) {
  switch (statusCode) {
    case 400:
      return "BAD_REQUEST" as const;
    case 401:
      return "UNAUTHORIZED" as const;
    case 403:
      return "FORBIDDEN" as const;
    case 404:
      return "NOT_FOUND" as const;
    case 409:
      return "CONFLICT" as const;
    case 429:
      return "TOO_MANY_REQUESTS" as const;
    default:
      return "INTERNAL_SERVER_ERROR" as const;
  }
}

/**
 * Type-safe error factory functions
 */
export const createError = {
  unauthorized: (message = "Unauthorized") =>
    new AppError(message, ErrorCodes.UNAUTHORIZED, 401),

  forbidden: (message = "Forbidden") =>
    new AppError(message, ErrorCodes.FORBIDDEN, 403),

  notFound: (resource = "Resource", id?: string) =>
    new AppError(
      `${resource}${id ? ` with id "${id}"` : ""} not found`,
      ErrorCodes.NOT_FOUND,
      404
    ),

  validation: (message = "Validation failed") =>
    new AppError(message, ErrorCodes.VALIDATION_FAILED, 400),

  duplicate: (resource = "Resource") =>
    new AppError(
      `${resource} already exists`,
      ErrorCodes.DUPLICATE_RESOURCE,
      409
    ),

  database: (message = "Database operation failed") =>
    new AppError(message, ErrorCodes.DATABASE_ERROR, 500),

  internal: (message = "Internal server error") =>
    new AppError(message, ErrorCodes.INTERNAL_ERROR, 500),
};
