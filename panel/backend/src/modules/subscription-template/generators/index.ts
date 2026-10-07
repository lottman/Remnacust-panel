import { ClashGeneratorService } from './clash.generator.service';
import { MihomoGeneratorService } from './mihomo.generator.service';
import { SingBoxGeneratorService } from './singbox.generator.service';
import { XrayJsonGeneratorService } from './xray-json.generator.service';
import { XrayGeneratorService } from './xray.generator.service';

export const TEMPLATE_RENDERERS = [
    MihomoGeneratorService,
    ClashGeneratorService,
    XrayGeneratorService,
    SingBoxGeneratorService,
    XrayJsonGeneratorService,
];
