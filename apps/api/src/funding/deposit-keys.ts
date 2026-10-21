import { secp256k1 } from '@noble/curves/secp256k1';
import { HDKey, publicKeyToAddress } from 'viem/accounts';
import { bytesToHex } from 'viem';

/**
 * Deposit addresses from an account-level extended public key (for example m/44'/60'/0'): address i is
 * <xpub>/0/i. Only public derivation is possible here; the matching private keys stay with the operator.
 */
export class DepositKeys {
  private readonly external: HDKey;

  constructor(xpub: string) {
    let root: HDKey;
    try { root = HDKey.fromExtendedKey(xpub); }
    catch { throw new Error('DEPOSIT_XPUB is not a valid extended public key.'); }
    if (root.privateKey) throw new Error('DEPOSIT_XPUB must be a public key (xpub), never a private one.');
    this.external = root.deriveChild(0);
  }

  address(index: number): string {
    if (!Number.isInteger(index) || index < 0 || index >= 2 ** 31) throw new Error('Invalid deposit address index.');
    const child = this.external.deriveChild(index);
    if (!child.publicKey) throw new Error('Deposit key derivation failed.');
    const uncompressed = secp256k1.ProjectivePoint.fromHex(child.publicKey).toRawBytes(false);
    return publicKeyToAddress(bytesToHex(uncompressed)).toLowerCase();
  }
}
