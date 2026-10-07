import { InjectKysely } from '@kastov/nestjs-prisma-kysely';
import { Kysely } from 'kysely';
import { DB } from 'prisma/generated/types';

import { Injectable } from '@nestjs/common';

@Injectable()
export class TxKyselyService {
    constructor(@InjectKysely() public readonly kysely: Kysely<DB>) {}
}
