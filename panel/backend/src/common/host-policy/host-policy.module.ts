import { Global, Module } from '@nestjs/common';

import { DurableUsageService } from './durable-usage.service';
import { HostAccessService } from './host-access.service';
import { HostPolicyService } from './host-policy.service';
import { HostUsageService } from './host-usage.service';
import { LegacyBillingService } from './legacy-billing.service';
import { LegacyQueueRecoveryService } from './legacy-queue-recovery.service';
import { LegacyQuotaRecoveryService } from './legacy-quota-recovery.service';
import { LegacyUsageService } from './legacy-usage.service';
import { NativeQuotaRecoveryService } from './native-quota-recovery.service';
import { QuotaBankRecoveryService } from './quota-bank-recovery.service';
import { QuotaCoordinatorService } from './quota-coordinator.service';
import { QuotaCutoverService } from './quota-cutover.service';
import { QuotaExposureClosureService } from './quota-exposure-closure.service';
import { QuotaFinalizationDispatchService } from './quota-finalization-dispatch.service';
import { QuotaReceiptRecoveryService } from './quota-receipt-recovery.service';
import { QuotaRecoveryFinalizationService } from './quota-recovery-finalization.service';
import { QuotaRecoveryPolicyService } from './quota-recovery-policy.service';
import { QuotaRecoveryReceiptService } from './quota-recovery-receipt.service';
import { QuotaRecoveryReleaseService } from './quota-recovery-release.service';
import { QuotaRecoverySettlementService } from './quota-recovery-settlement.service';
import { QuotaRecoveryTailService } from './quota-recovery-tail.service';
import { QuotaRecoveryService } from './quota-recovery.service';
import { QuotaReleaseDeliveryService } from './quota-release-delivery.service';
import { QuotaSettlementService } from './quota-settlement.service';
import { QuotaTransitionService } from './quota-transition.service';
import { UsageEffectsService } from './usage-effects.service';
import { UsageJournalService } from './usage-journal.service';
@Global()
@Module({
    providers: [
        QuotaRecoveryService,
        QuotaRecoveryReleaseService,
        QuotaReleaseDeliveryService,
        QuotaRecoveryFinalizationService,
        QuotaFinalizationDispatchService,
        QuotaExposureClosureService,
        QuotaRecoveryPolicyService,
        QuotaRecoveryReceiptService,
        QuotaRecoveryTailService,
        NativeQuotaRecoveryService,
        QuotaRecoverySettlementService,
        QuotaBankRecoveryService,
        QuotaReceiptRecoveryService,
        HostPolicyService,
        HostAccessService,
        HostUsageService,
        QuotaSettlementService,
        DurableUsageService,
        LegacyUsageService,
        UsageEffectsService,
        QuotaCutoverService,
        UsageJournalService,
        LegacyBillingService,
        LegacyQuotaRecoveryService,
        LegacyQueueRecoveryService,
        QuotaCoordinatorService,
        QuotaTransitionService,
    ],
    exports: [
        QuotaRecoveryService,
        QuotaRecoveryReleaseService,
        QuotaReleaseDeliveryService,
        QuotaRecoveryFinalizationService,
        QuotaFinalizationDispatchService,
        QuotaExposureClosureService,
        QuotaRecoveryPolicyService,
        QuotaRecoveryReceiptService,
        QuotaRecoveryTailService,
        NativeQuotaRecoveryService,
        QuotaRecoverySettlementService,
        QuotaBankRecoveryService,
        QuotaReceiptRecoveryService,
        HostPolicyService,
        HostAccessService,
        HostUsageService,
        QuotaSettlementService,
        DurableUsageService,
        LegacyUsageService,
        UsageEffectsService,
        QuotaCutoverService,
        LegacyBillingService,
        LegacyQuotaRecoveryService,
        LegacyQueueRecoveryService,
        QuotaCoordinatorService,
        QuotaTransitionService,
    ],
})
export class HostPolicyModule {}
