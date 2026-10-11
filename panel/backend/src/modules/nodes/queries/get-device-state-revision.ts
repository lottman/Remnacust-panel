import { IQueryHandler, Query, QueryHandler } from '@nestjs/cqrs';

import { NodesRepository } from '../repositories/nodes.repository';

export class GetDeviceStateRevisionQuery extends Query<string> {}

@QueryHandler(GetDeviceStateRevisionQuery)
export class GetDeviceStateRevisionHandler implements IQueryHandler<GetDeviceStateRevisionQuery> {
    constructor(private readonly nodes: NodesRepository) {}
    async execute(): Promise<string> {
        return this.nodes.deviceStateRevision();
    }
}
