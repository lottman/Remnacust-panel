import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { AxiosModule } from '@common/axios/axios.module';

import { NodesModule } from '@modules/nodes/nodes.module';

import { HostsBulkActionsController, HostsController } from './controllers';
import { HostsConverter } from './hosts.converter';
import { HostsService } from './hosts.service';
import { LegacyQuotaRecoveryController } from './legacy-quota-recovery.controller';
import { LimitsController } from './limits.controller';
import { LimitsService } from './limits.service';
import { NativeQuotaRecoveryController } from './native-quota-recovery.controller';
import { QUERIES } from './queries';
import { QuotaBankRecoveryController } from './quota-bank-recovery.controller';
import { QuotaExposureClosureController } from './quota-exposure-closure.controller';
import { QuotaReceiptRecoveryController } from './quota-receipt-recovery.controller';
import { QuotaRecoveryPolicyController } from './quota-recovery-policy.controller';
import { QuotaRecoveryReceiptController } from './quota-recovery-receipt.controller';
import { QuotaRecoveryReleaseController } from './quota-recovery-release.controller';
import { QuotaRecoverySettlementController } from './quota-recovery-settlement.controller';
import { QuotaRecoveryTailController } from './quota-recovery-tail.controller';
import { QuotaRecoveryController } from './quota-recovery.controller';
import { HostTagLimitsRepository } from './repositories/host-tag-limits.repository';
import { HostsRepository } from './repositories/hosts.repository';

@Module({
    imports: [CqrsModule, NodesModule, AxiosModule],
    controllers: [
        LimitsController,
        QuotaRecoveryController,
        QuotaRecoveryReleaseController,
        QuotaExposureClosureController,
        QuotaRecoverySettlementController,
        NativeQuotaRecoveryController,
        QuotaBankRecoveryController,
        QuotaReceiptRecoveryController,
        QuotaRecoveryPolicyController,
        QuotaRecoveryReceiptController,
        QuotaRecoveryTailController,
        LegacyQuotaRecoveryController,
        HostsController,
        HostsBulkActionsController,
    ],
    providers: [
        LimitsService,
        HostsRepository,
        HostTagLimitsRepository,
        HostsConverter,
        HostsService,
        ...QUERIES,
    ],
    exports: [HostsService, HostsRepository, HostTagLimitsRepository],
})
export class HostsModule {}
