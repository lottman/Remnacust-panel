import { Encrypter, armor } from 'age-encryption';
import z from 'zod';

import { ResponseRuleEncryptionSchema } from '@libs/contracts/models';

type TResponseRuleEncryption = z.infer<typeof ResponseRuleEncryptionSchema>;

function buildEncrypter({ method, key }: TResponseRuleEncryption): Encrypter {
    const recipient = key.trim();
    const encrypter = new Encrypter();

    switch (method) {
        case 'age1':
        case 'age1pq1':
            encrypter.addRecipient(recipient);
            break;

        default: {
            const exhaustiveCheck: never = method;
            throw new Error(`Unsupported age encryption method: ${exhaustiveCheck}`);
        }
    }

    return encrypter;
}

export async function encryptResponseBody(
    body: string | Uint8Array,
    encryption: TResponseRuleEncryption,
): Promise<string> {
    const encrypter = buildEncrypter(encryption);

    const ciphertext = await encrypter.encrypt(body);

    return armor.encode(ciphertext);
}
