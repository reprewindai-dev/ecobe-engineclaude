import type { AuthenticatedOperator } from "../middleware/auth";

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedOperator;
    }
  }
}

export {};
