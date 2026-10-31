"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUBSCRIPTION_DOMAINS_ROUTES = exports.SUBSCRIPTION_DOMAINS_CONTROLLER = void 0;
exports.SUBSCRIPTION_DOMAINS_CONTROLLER = 'subscription-domains';
exports.SUBSCRIPTION_DOMAINS_ROUTES = {
    GET_ALL: '', // get
    GET: (uuid) => `${uuid}`, // get
    CREATE: '', // post
    UPDATE: (uuid) => `${uuid}`, // patch
    DELETE: (uuid) => `${uuid}`, // delete
};
