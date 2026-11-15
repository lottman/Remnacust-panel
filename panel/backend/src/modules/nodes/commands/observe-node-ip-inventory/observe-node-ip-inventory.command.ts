import { Command } from '@nestjs/cqrs';

import { TResult } from '@common/types';

import { NodesEntity } from '../../entities';

export class ObserveNodeIpInventoryCommand extends Command<TResult<NodesEntity | null>> {
    constructor(
        public readonly uuid: string,
        public readonly controlRevision: string,
    ) {
        super();
    }
}
