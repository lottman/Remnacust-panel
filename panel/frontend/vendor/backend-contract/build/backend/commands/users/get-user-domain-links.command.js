"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GetUserCdnDomainLinksCommand = exports.GetUserPrimaryDomainLinkCommand = exports.GetUserDomainLinksCommand = void 0;
const zod_1 = require("zod");
const api_1 = require("../../api");
const constants_1 = require("../../constants");
const models_1 = require("../../models");
const params = zod_1.z.object({ userId: models_1.numberParamSchema });
const domainQuery = zod_1.z.object({ domainUuid: zod_1.z.uuid().optional() }).strict();
const linksResponse = zod_1.z.object({
    response: zod_1.z.object({
        primaryDomainUuid: zod_1.z.uuid(),
        links: zod_1.z
            .array(zod_1.z.object({
            domainUuid: zod_1.z.uuid(),
            name: zod_1.z.string(),
            domain: zod_1.z.string(),
            kind: zod_1.z.enum(['PRIMARY', 'CDN']),
            url: zod_1.z.url(),
            isSelected: zod_1.z.boolean(),
        }))
            .max(128),
    }),
});
var GetUserDomainLinksCommand;
(function (GetUserDomainLinksCommand) {
    GetUserDomainLinksCommand.url = api_1.REST_API.USERS.SUBSCRIPTION_LINKS;
    GetUserDomainLinksCommand.TSQ_url = GetUserDomainLinksCommand.url(':userId');
    GetUserDomainLinksCommand.endpointDetails = (0, constants_1.getEndpointDetails)(api_1.USERS_ROUTES.SUBSCRIPTION_LINKS(':userId'), 'get', 'Get user subscription links for the primary domain and its CDNs', { scope: 'subscription-links', kind: 'read' });
    GetUserDomainLinksCommand.RequestParamSchema = params;
    GetUserDomainLinksCommand.RequestQuerySchema = domainQuery.extend({
        kind: zod_1.z.enum(['PRIMARY', 'CDN']).optional(),
    });
    GetUserDomainLinksCommand.ResponseSchema = linksResponse;
})(GetUserDomainLinksCommand || (exports.GetUserDomainLinksCommand = GetUserDomainLinksCommand = {}));
var GetUserPrimaryDomainLinkCommand;
(function (GetUserPrimaryDomainLinkCommand) {
    GetUserPrimaryDomainLinkCommand.url = api_1.REST_API.USERS.SUBSCRIPTION_LINKS_PRIMARY;
    GetUserPrimaryDomainLinkCommand.TSQ_url = GetUserPrimaryDomainLinkCommand.url(':userId');
    GetUserPrimaryDomainLinkCommand.endpointDetails = (0, constants_1.getEndpointDetails)(api_1.USERS_ROUTES.SUBSCRIPTION_LINKS_PRIMARY(':userId'), 'get', 'Get only the user primary subscription domain link', { scope: 'subscription-links-primary', kind: 'read' });
    GetUserPrimaryDomainLinkCommand.RequestParamSchema = params;
    GetUserPrimaryDomainLinkCommand.RequestQuerySchema = domainQuery;
    GetUserPrimaryDomainLinkCommand.ResponseSchema = linksResponse;
})(GetUserPrimaryDomainLinkCommand || (exports.GetUserPrimaryDomainLinkCommand = GetUserPrimaryDomainLinkCommand = {}));
var GetUserCdnDomainLinksCommand;
(function (GetUserCdnDomainLinksCommand) {
    GetUserCdnDomainLinksCommand.url = api_1.REST_API.USERS.SUBSCRIPTION_LINKS_CDN;
    GetUserCdnDomainLinksCommand.TSQ_url = GetUserCdnDomainLinksCommand.url(':userId');
    GetUserCdnDomainLinksCommand.endpointDetails = (0, constants_1.getEndpointDetails)(api_1.USERS_ROUTES.SUBSCRIPTION_LINKS_CDN(':userId'), 'get', 'Get only the user CDN subscription domain links', { scope: 'subscription-links-cdn', kind: 'read' });
    GetUserCdnDomainLinksCommand.RequestParamSchema = params;
    GetUserCdnDomainLinksCommand.RequestQuerySchema = domainQuery;
    GetUserCdnDomainLinksCommand.ResponseSchema = linksResponse;
})(GetUserCdnDomainLinksCommand || (exports.GetUserCdnDomainLinksCommand = GetUserCdnDomainLinksCommand = {}));
