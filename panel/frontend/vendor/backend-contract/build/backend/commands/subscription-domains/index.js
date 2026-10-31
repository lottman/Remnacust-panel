"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeleteSubscriptionDomainCommand = exports.UpdateSubscriptionDomainCommand = exports.CreateSubscriptionDomainCommand = exports.GetSubscriptionDomainCommand = exports.ListSubscriptionDomainsCommand = void 0;
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
    ListSubscriptionDomainsCommand.ResponseSchema = zod_1.z.object({ response: zod_1.z.array(subscription_domain_schema_1.SubscriptionDomainSchema) });
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
    DeleteSubscriptionDomainCommand.endpointDetails = (0, constants_1.getEndpointDetails)(api_1.SUBSCRIPTION_DOMAINS_ROUTES.DELETE(':uuid'), 'delete', 'Delete an unused subscription domain', { scope: 'delete', kind: 'write' });
})(DeleteSubscriptionDomainCommand || (exports.DeleteSubscriptionDomainCommand = DeleteSubscriptionDomainCommand = {}));
