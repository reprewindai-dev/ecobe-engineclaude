import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { OperatorRole } from "@prisma/client";

import { env } from "../config/env";
import { prisma } from "../lib/db";

type JwtClaims = {
  sub: string;
  orgId: string;
  role: OperatorRole | string;
  email: string;
  iat?: number;
  exp?: number;
};

export type AuthenticatedOperator = {
  operatorId: string;
  externalId: string;
  orgId: string;
  email: string;
  role: OperatorRole;
  tokenClaims: JwtClaims;
};

function getBearerToken(req: Request) {
  const authorization = req.header("authorization");
  if (!authorization || !authorization.startsWith("Bearer ")) {
    return null;
  }
  return authorization.slice("Bearer ".length).trim();
}

function validateClaims(payload: unknown): JwtClaims | null {
  if (!payload || typeof payload !== "object") return null;
  const claims = payload as Record<string, unknown>;
  if (
    typeof claims.sub !== "string" ||
    typeof claims.orgId !== "string" ||
    typeof claims.role !== "string" ||
    typeof claims.email !== "string"
  ) {
    return null;
  }
  return {
    sub: claims.sub,
    orgId: claims.orgId,
    role: claims.role,
    email: claims.email,
    iat: typeof claims.iat === "number" ? claims.iat : undefined,
    exp: typeof claims.exp === "number" ? claims.exp : undefined,
  };
}

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (!env.JWT_SECRET) {
    return res.status(503).json({
      error: "JWT authentication is not configured.",
      code: "JWT_AUTH_NOT_CONFIGURED",
    });
  }

  const token = getBearerToken(req);
  if (!token) {
    return res.status(401).json({
      error: "Missing bearer token.",
      code: "MISSING_BEARER_TOKEN",
    });
  }

  let payload: unknown;
  try {
    payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ["HS256"],
    });
  } catch {
    return res.status(401).json({
      error: "Invalid bearer token.",
      code: "INVALID_BEARER_TOKEN",
    });
  }

  const claims = validateClaims(payload);
  if (!claims) {
    return res.status(401).json({
      error: "Invalid JWT claims. Required: sub, orgId, role, email.",
      code: "INVALID_JWT_CLAIMS",
    });
  }

  const operator = await prisma.operator.findFirst({
    where: {
      id: claims.sub,
      orgId: claims.orgId,
    },
  });

  if (!operator || !operator.active) {
    return res.status(403).json({
      error: "Operator is not active for this organization.",
      code: "OPERATOR_NOT_ACTIVE",
    });
  }

  req.auth = {
    operatorId: operator.id,
    externalId: operator.externalId,
    orgId: operator.orgId,
    email: operator.email,
    role: operator.role,
    tokenClaims: claims,
  };

  return next();
}

export function requireRole(...roles: OperatorRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.auth) {
      return res.status(401).json({
        error: "Authentication required.",
        code: "AUTH_REQUIRED",
      });
    }

    if (!roles.includes(req.auth.role)) {
      return res.status(403).json({
        error: "Insufficient role for this action.",
        code: "INSUFFICIENT_ROLE",
        requiredRoles: roles,
        actualRole: req.auth.role,
      });
    }

    return next();
  };
}
