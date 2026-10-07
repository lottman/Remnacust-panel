import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { NodeMetadataConverter, UserMetadataConverter } from './converters';
import { MetadataController } from './metadata.controller';
import { MetadataService } from './metadata.service';
import { NodeMetadataRepository } from './repositories/node-metadata.repository';
import { UserMetadataRepository } from './repositories/user-metadata.repository';

@Module({
    imports: [CqrsModule],
    controllers: [MetadataController],
    providers: [
        UserMetadataRepository,
        NodeMetadataRepository,
        UserMetadataConverter,
        NodeMetadataConverter,
        MetadataService,
    ],
})
export class MetadataModule {}
