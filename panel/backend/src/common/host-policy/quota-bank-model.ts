import { z } from 'zod';

export const bankUuid = z.uuid().transform((value) => value.toLowerCase());
export const bankCapture = z.strictObject({ generation: bankUuid, requestId: bankUuid });
export const bankDigest = z.string().regex(/^[a-f0-9]{64}$/);
export class QuotaBankError extends Error {
    constructor(
        readonly code: 'NOT_PENDING' | 'MISSING' | 'CORRUPT' | 'REQUEST_CONFLICT' | 'CAPACITY',
    ) {
        super('QUOTA_BANK_' + code);
    }
}
