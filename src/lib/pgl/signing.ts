import { createHmac } from "crypto";

import { env } from "../../config/env";
import { canonicalizeJson, normalizeIsoTimestamp } from "./canonical";

export type PglAttestationPayload = {
  event_hash: string;
  decision_context_hash: string;
  correlation_id: string;
  timestamp: string;
};

export interface PglAttestationSigner {
  readonly alg: string;
  readonly keyId: string;
  sign(payload: PglAttestationPayload): string;
}

class HmacPglAttestationSigner implements PglAttestationSigner {
  readonly alg = "HS256";

  constructor(
    readonly keyId: string,
    private readonly secret: string,
  ) {}

  sign(payload: PglAttestationPayload): string {
    return createHmac("sha256", this.secret)
      .update(
        canonicalizeJson({
          ...payload,
          timestamp: normalizeIsoTimestamp(payload.timestamp),
        }),
      )
      .digest("hex");
  }
}

export function getPglAttestationSigner(): PglAttestationSigner {
  if (!env.PGL_SIGNING_KEY) {
    throw new Error("PGL signing key is not configured");
  }

  if (env.PGL_SIGNING_ALG !== "HS256") {
    throw new Error(
      `Unsupported PGL signing algorithm: ${env.PGL_SIGNING_ALG}`,
    );
  }

  return new HmacPglAttestationSigner(
    env.PGL_SIGNING_KEY_ID,
    env.PGL_SIGNING_KEY,
  );
}
