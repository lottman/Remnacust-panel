import { PrismaClient } from '@prisma/client';

import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { postgresAdapter } from './postgres-adapter';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
    constructor() {
        super({
            adapter: postgresAdapter(),
        });
    }
    async onModuleInit() {
        await this.$connect();
    }

    async onModuleDestroy() {
        await this.$disconnect();
    }

    /**
     * @see https://github.com/eoin-obrien/prisma-extension-kysely
     * @see https://github.com/eoin-obrien/prisma-extension-kysely/issues/71
     */
    // static withKysely(config: ConfigService) {
    //     return new PrismaService(config).$extends(
    //         kyselyExtension({
    //             kysely: () => {
    //                 return new Kysely<DB>({
    //                     log: ['query'],
    //                     dialect: {
    //                         createDriver: () => new DummyDriver(),
    //                         createAdapter: () => new PostgresAdapter(),
    //                         createIntrospector: (db) => new PostgresIntrospector(db),
    //                         createQueryCompiler: () => new PostgresQueryCompiler(),
    //                     },
    //                     plugins: [new CamelCasePlugin()],
    //                 });
    //             },
    //         }),
    //     ) as unknown as PrismaService;
    // }

    /** Don't forget it */
    // declare $kysely: Kysely<DB>;
}
