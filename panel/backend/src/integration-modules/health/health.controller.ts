import { TransactionHost } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';

import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';

import { HEALTH_ROOT } from '@libs/contracts/api';

@Controller(HEALTH_ROOT)
export class HealthController {
    constructor(
        private health: HealthCheckService,
        private prismaHealth: PrismaHealthIndicator,
        private readonly prisma: TransactionHost<TransactionalAdapterPrisma>,
    ) {}

    @HealthCheck()
    @Get()
    readiness() {
        return this.health.check([
            async () => this.prismaHealth.pingCheck('database', this.prisma.tx),
        ]);
    }
}
