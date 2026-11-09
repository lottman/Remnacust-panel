"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetSubscriptionDomainCredentialsCommand = exports.DeleteSubscriptionDomainCommand = exports.UpdateSubscriptionDomainCommand = exports.CreateSubscriptionDomainCommand = exports.GetSubscriptionDomainCommand = exports.ListSubscriptionDomainsCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
const constants_1 = require("../../constants");
const subscription_domain_schema_1 = require("../../models/subscription-domain.schema");
var ListSubscriptionDomainsCommand;
(function (ListSubscriptionDomainsCommand) {
    ListSubscriptionDomainsCommand.url = api_1.REST_API.SUBSCRIPTION_DOMAINS.GET_ALL;
    ListSubscriptionDomainsCommand.TSQ_url = ListSubscriptionDomainsCommand.url;
    ListSubscriptionDomainsCommand.endpointDetails = (0, constants_1.getEndpointDetails)('', 'get', 'List subscription domains', {
        scope: 'list',
        kind: 'read',
    });
    ListSubscriptionDomainsCommand.RequestQuerySchema = zod_1.z
        .object({
        kind: zod_1.z.enum(['PRIMARY', 'CDN']).optional(),
        parentUuid: zod_1.z.uuid().optional(),
    })
        .strict()
        .refine((value) => !(value.kind === 'PRIMARY' && value.parentUuid), {
        message: 'A parent filter applies only to CDN domains',
        path: ['parentUuid'],
    });
    ListSubscriptionDomainsCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.array(subscription_domain_schema_1.SubscriptionDomainSchema),
        environment: zod_1.z.enum(['synced', 'unavailable', 'invalid', 'conflict']).optional(),
    });
})(ListSubscriptionDomainsCommand || (exports.ListSubscriptionDomainsCommand = ListSubscriptionDomainsCommand = {}));
var GetSubscriptionDomainCommand;
(function (GetSubscriptionDomainCommand) {
    GetSubscriptionDomainCommand.url = api_1.REST_API.SUBSCRIPTION_DOMAINS.GET(':uuid');
    GetSubscriptionDomainCommand.TSQ_url = GetSubscriptionDomainCommand.url;
    GetSubscriptionDomainCommand.endpointDetails = (0, constants_1.getEndpointDetails)(api_1.SUBSCRIPTION_DOMAINS_ROUTES.GET(':uuid'), 'get', 'Get a subscription domain by UUID', { scope: 'get', kind: 'read' });
    GetSubscriptionDomainCommand.ResponseSchema = zod_1.z.object({ response: subscription_domain_schema_1.SubscriptionDomainSchema });
})(GetSubscriptionDomainCommand || (exports.GetSubscriptionDomainCommand = GetSubscriptionDomainCommand = {}));
var CreateSubscriptionDomainCommand;
(function (CreateSubscriptionDomainCommand) {
    CreateSubscriptionDomainCommand.url = api_1.REST_API.SUBSCRIPTION_DOMAINS.CREATE;
    CreateSubscriptionDomainCommand.TSQ_url = CreateSubscriptionDomainCommand.url;
    CreateSubscriptionDomainCommand.endpointDetails = (0, constants_1.getEndpointDetails)('', 'post', 'Register a subscription domain', { scope: 'create', kind: 'write' });
    CreateSubscriptionDomainCommand.RequestBodySchema = subscription_domain_schema_1.SubscriptionDomainInputSchema;
    CreateSubscriptionDomainCommand.ResponseSchema = GetSubscriptionDomainCommand.ResponseSchema;
})(CreateSubscriptionDomainCommand || (exports.CreateSubscriptionDomainCommand = CreateSubscriptionDomainCommand = {}));
var UpdateSubscriptionDomainCommand;
(function (UpdateSubscriptionDomainCommand) {
    UpdateSubscriptionDomainCommand.url = api_1.REST_API.SUBSCRIPTION_DOMAINS.UPDATE(':uuid');
    UpdateSubscriptionDomainCommand.TSQ_url = UpdateSubscriptionDomainCommand.url;
    UpdateSubscriptionDomainCommand.endpointDetails = (0, constants_1.getEndpointDetails)(api_1.SUBSCRIPTION_DOMAINS_ROUTES.UPDATE(':uuid'), 'patch', 'Update a subscription domain', { scope: 'update', kind: 'write' });
    UpdateSubscriptionDomainCommand.RequestBodySchema = subscription_domain_schema_1.SubscriptionDomainInputSchema;
    UpdateSubscriptionDomainCommand.ResponseSchema = GetSubscriptionDomainCommand.ResponseSchema;
})(UpdateSubscriptionDomainCommand || (exports.UpdateSubscriptionDomainCommand = UpdateSubscriptionDomainCommand = {}));
var DeleteSubscriptionDomainCommand;
(function (DeleteSubscriptionDomainCommand) {
    DeleteSubscriptionDomainCommand.url = api_1.REST_API.SUBSCRIPTION_DOMAINS.DELETE(':uuid');
    DeleteSubscriptionDomainCommand.TSQ_url = DeleteSubscriptionDomainCommand.url;
    DeleteSubscriptionDomainCommand.endpointDetails = (0, constants_1.getEndpointDetails)(api_1.SUBSCRIPTION_DOMAINS_ROUTES.DELETE(':uuid'), 'delete', 'Delete a subscription domain with optional user reassignment', { scope: 'delete', kind: 'write' });
    DeleteSubscriptionDomainCommand.RequestQuerySchema = zod_1.z
        .object({
        reassignUsers: zod_1.z
            .enum(['true', 'false'])
            .transform((value) => value === 'true')
            .optional(),
    })
        .strict();
})(DeleteSubscriptionDomainCommand || (exports.DeleteSubscriptionDomainCommand = DeleteSubscriptionDomainCommand = {}));
var GetSubscriptionDomainCredentialsCommand;
(function (GetSubscriptionDomainCredentialsCommand) {
    GetSubscriptionDomainCredentialsCommand.url = '/api/subscription-domains/:uuid/credentials';
    GetSubscriptionDomainCredentialsCommand.TSQ_url = GetSubscriptionDomainCredentialsCommand.url;
    GetSubscriptionDomainCredentialsCommand.endpointDetails = (0, constants_1.getEndpointDetails)(':uuid/credentials', 'post', 'Get private CDN origin credentials', { scope: 'credentials', kind: 'write' });
    GetSubscriptionDomainCredentialsCommand.ResponseSchema = zod_1.z.object({
        response: zod_1.z.object({
            requestHeaderName: zod_1.z.string().regex(/^X-[a-f0-9]{24}$/),
            requestHeaderValue: zod_1.z.string().max(101),
        }),
    });
})(GetSubscriptionDomainCredentialsCommand || (exports.GetSubscriptionDomainCredentialsCommand = GetSubscriptionDomainCredentialsCommand = {}));
