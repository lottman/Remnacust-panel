"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetSubscriptionTemplateRevisionsCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
const constants_1 = require("../../constants");
var GetSubscriptionTemplateRevisionsCommand;
(function (GetSubscriptionTemplateRevisionsCommand) {
    GetSubscriptionTemplateRevisionsCommand.url = api_1.REST_API.SUBSCRIPTION_TEMPLATE.GET_REVISIONS;
    GetSubscriptionTemplateRevisionsCommand.TSQ_url = GetSubscriptionTemplateRevisionsCommand.url(':uuid');
    GetSubscriptionTemplateRevisionsCommand.endpointDetails = (0, constants_1.getEndpointDetails)(api_1.SUBSCRIPTION_TEMPLATE_ROUTES.GET_REVISIONS(':uuid'), 'get', 'Get the latest 30 saved subscription template revisions', { scope: 'get-revisions', kind: 'read' });
    GetSubscriptionTemplateRevisionsCommand.RequestParamSchema = zod_1.z.object({ uuid: zod_1.z.uuid() });
    GetSubscriptionTemplateRevisionsCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.array(zod_1.z.object({
            uuid: zod_1.z.uuid(),
            name: zod_1.z.string(),
            templateJson: zod_1.z.unknown().nullable(),
            encodedTemplateYaml: zod_1.z.string().nullable(),
            draftContent: zod_1.z.string().nullable().optional(),
            createdAt: zod_1.z.iso.datetime(),
        })),
    });
})(GetSubscriptionTemplateRevisionsCommand || (exports.GetSubscriptionTemplateRevisionsCommand = GetSubscriptionTemplateRevisionsCommand = {}));
