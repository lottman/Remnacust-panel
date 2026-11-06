import { Global, Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { AxiosService } from './axios.service';
import { NodeRouteRegistry } from './node-control-route';
import { NodeRouteRegistryService } from './node-route-registry.service';

@Global()
@Module({
    imports: [CqrsModule],
    providers: [AxiosService, NodeRouteRegistryService, { provide: NodeRouteRegistry, useExisting: NodeRouteRegistryService }],
    exports: [AxiosService, NodeRouteRegistryService],
})
export class AxiosModule {}
