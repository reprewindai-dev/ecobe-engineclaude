/**
 * Generates an Ed25519 key pair for VDB-C0 decision receipts.
 *
 * The private key goes in DECISION_RECEIPT_SIGNING_KEY (a secret store, never
 * the repo or a build arg). The public key and key id are safe to publish.
 */
import { generateKeyPairSync } from 'crypto'

import { deriveReceiptKeyId } from '../src/lib/proof/receipt-verifier'

const { privateKey, publicKey } = generateKeyPairSync('ed25519')
const privateDer = privateKey.export({ format: 'der', type: 'pkcs8' }) as Buffer

console.log(
  JSON.stringify(
    {
      keyId: deriveReceiptKeyId(publicKey),
      publicKeyPem: publicKey.export({ format: 'pem', type: 'spki' }).toString(),
      DECISION_RECEIPT_SIGNING_KEY: privateDer.toString('base64'),
    },
    null,
    2,
  ),
)
