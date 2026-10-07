import { Module } from '@nestjs/common';

import { ResponseRulesEncryptionService } from './services/response-rules-encryption.service';
import { ResponseRulesMatcherService } from './services/response-rules-matcher.service';
import { ResponseRulesParserService } from './services/response-rules-parser.service';

@Module({
    providers: [
        ResponseRulesParserService,
        ResponseRulesMatcherService,
        ResponseRulesEncryptionService,
    ],
    exports: [
        ResponseRulesParserService,
        ResponseRulesMatcherService,
        ResponseRulesEncryptionService,
    ],
})
export class SubscriptionResponseRulesModule {}
