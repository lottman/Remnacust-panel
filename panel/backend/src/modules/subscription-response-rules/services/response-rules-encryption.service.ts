import { Injectable, Logger } from '@nestjs/common';

import { encryptResponseBody } from '@common/helpers/response-encryption';

import { TResponseRuleEncryption } from '../types/response-rules.types';

@Injectable()
export class ResponseRulesEncryptionService {
    private readonly logger = new Logger(ResponseRulesEncryptionService.name);

    public async encrypt(body: string, encryption: TResponseRuleEncryption): Promise<string> {
        try {
            return await encryptResponseBody(body, encryption);
        } catch (error) {
            this.logger.error(
                `Failed to encrypt response body with method "${encryption.method}": ${
                    error instanceof Error ? error.message : 'Unknown error'
                }`,
            );
            return '';
        }
    }
}
