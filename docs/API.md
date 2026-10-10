# Remnacust API 1.1.7.20

Generated from the current OpenAPI. 231 operations; 210 accept scoped API tokens.

Full request/response schemas: [openapi.json](../panel/backend/openapi.json). The panel also exposes a separate API reference with searchable operations, schemas and events.

## Authentication and permissions

Send an API token using `Authorization: Bearer TOKEN`. An endpoint marked `api-token` still requires its scope and allowed resource selection. `admin` methods require an administrator session, `public` methods have their own public flow, and `special` methods use the authentication described by OpenAPI. A wildcard token does not bypass admin-only routes. Never put a token in a URL or in client subscription content.

## Panel-only migration operations

User export and import require an administrator session and do not accept API tokens, including wildcard tokens. These operations are excluded from the token catalog. See [user migration](USER-MIGRATION.md) for the request format, credential handling and result counts.

## Personal and bulk unlimited quota

`POST /api/limits/unlimited` needs scope `limits:unlimited` and resource access to `limits`. Set `kind` to `HOST` or `TAG`; `key` is a host UUID or tag. `selection` supports `SELECTED` (1–500 positive signed-64-bit user ID strings), `ALL` (all current entitled recipients), or `SQUAD` (`squadType` INTERNAL/EXTERNAL and `squadUuid`). Search and pagination do not constrain ALL or SQUAD. Every selected user must be entitled to that scope.

For one user, use SELECTED with exactly one ID:

```json
{
  "kind": "TAG",
  "key": "Premium",
  "selection": { "type": "SELECTED", "userIds": ["123"] },
  "enabled": true,
  "requestId": "f13d9d94-7db6-4dbb-901b-31cd8aef427e"
}
```

For all entitled recipients, replace selection with `{"type":"ALL"}`. For a squad, use `{"type":"SQUAD","squadType":"INTERNAL","squadUuid":"UUID"}`. Set enabled=false to revoke the exemption. Each new action needs a fresh UUID requestId; a retry must retain the same body and requestId. A changed body with the same requestId returns 409.

The exemption persists until revoked and only affects the selected scope. It does not override expired/disabled users, other host/tag quotas or other access restrictions. Check `saved`, `affectedUsers`, `replayed` and `enforcement` in the response; saving a policy is not proof that a disconnected node has applied it. Our custom core is required for enforcement.

## Operations

| Method | Path | Function | Access | Scope | Resource |
|---|---|---|---|---|---|
| GET | `/api/passkeys/registration/options` | Get registration options for passkey | admin | `—` | `—` |
| POST | `/api/passkeys/registration/verify` | Verify registration for passkey | admin | `—` | `—` |
| GET | `/api/passkeys` | Get passkeys | admin | `—` | `—` |
| PATCH | `/api/passkeys` | Update passkey | admin | `—` | `—` |
| DELETE | `/api/passkeys` | Delete a passkey by ID | admin | `—` | `—` |
| POST | `/api/auth/login` | Login as superadmin | public | `—` | `—` |
| POST | `/api/auth/register` | Register as superadmin | public | `—` | `—` |
| GET | `/api/auth/status` | Get the status of the authentication | public | `—` | `—` |
| POST | `/api/auth/oauth2/authorize` | Initiate OAuth2 authorization | public | `—` | `—` |
| POST | `/api/auth/oauth2/callback` | Callback from OAuth2 | public | `—` | `—` |
| GET | `/api/auth/passkey/authentication/options` | Get the authentication options for passkey | public | `—` | `—` |
| POST | `/api/auth/passkey/authentication/verify` | Verify the authentication for passkey | public | `—` | `—` |
| GET | `/api/subscription-page-configs/tags` | Get tags of Subpage Configs | api-token | `subscription-page-configs:list-tags` | `subscription-page-configs` |
| PATCH | `/api/subscription-page-configs/tags` | Set tags of Subpage Config | api-token | `subscription-page-configs:set-tags` | `subscription-page-configs` |
| GET | `/api/subscription-page-configs` | Get all subscription page configs | api-token | `subscription-page-configs:list` | `subscription-page-configs` |
| POST | `/api/subscription-page-configs` | Create subscription page config | api-token | `subscription-page-configs:create` | `subscription-page-configs` |
| PATCH | `/api/subscription-page-configs` | Update subscription page config | api-token | `subscription-page-configs:update` | `subscription-page-configs` |
| GET | `/api/subscription-page-configs/{uuid}` | Get subscription page config by uuid | api-token | `subscription-page-configs:get` | `subscription-page-configs` |
| DELETE | `/api/subscription-page-configs/{uuid}` | Delete subscription page config | api-token | `subscription-page-configs:delete` | `subscription-page-configs` |
| POST | `/api/subscription-page-configs/actions/reorder` | Reorder subscription page configs | api-token | `subscription-page-configs:reorder` | `subscription-page-configs` |
| POST | `/api/subscription-page-configs/actions/clone` | Clone subscription page config | api-token | `subscription-page-configs:clone` | `subscription-page-configs` |
| GET | `/api/users` | Get all users using offset-based pagination | api-token | `users:list` | `users` |
| POST | `/api/users` | Create a new user | api-token | `users:create` | `users` |
| PATCH | `/api/users` | Update a user | api-token | `users:update` | `users` |
| GET | `/api/users/{userId}` | Get user by ID | api-token | `users:by-id` | `users` |
| DELETE | `/api/users/{userId}` | Delete user | api-token | `users:delete` | `users` |
| GET | `/api/users/stream` | Get all users using cursor-based (keyset) pagination with filtering options | api-token | `users:stream` | `users` |
| GET | `/api/users/tags` | Get users tags | api-token | `users:list-tags` | `users` |
| GET | `/api/users/{userId}/accessible-nodes` | Get user accessible nodes | api-token | `users:accessible-nodes` | `users` |
| GET | `/api/users/{userId}/subscription-request-history` | Get user subscription request history, recent 24 records | api-token | `users:subscription-request-history` | `users` |
| GET | `/api/users/by-short-uuid/{shortUuid}` | Get user by Short UUID | api-token | `users:by-short-uuid` | `users` |
| GET | `/api/users/by-username/{username}` | Get user by username | api-token | `users:by-username` | `users` |
| POST | `/api/users/{userId}/actions/revoke` | Revoke user subscription | api-token | `users:revoke-subscription` | `users` |
| POST | `/api/users/{userId}/actions/disable` | Disable user | api-token | `users:disable` | `users` |
| POST | `/api/users/{userId}/actions/enable` | Enable user | api-token | `users:enable` | `users` |
| POST | `/api/users/{userId}/actions/reset-traffic` | Reset user traffic | api-token | `users:reset-traffic` | `users` |
| POST | `/api/users/{userId}/actions/extend` | Extend user expiration date | api-token | `users:extend` | `users` |
| POST | `/api/users/resolve` | Resolve a user | api-token | `users:resolve` | `users` |
| POST | `/api/users/bulk/delete-by-status` | Bulk delete users by status | api-token | `users:bulk-delete-by-status` | `users` |
| POST | `/api/users/bulk/delete` | Bulk delete users by User IDs | api-token | `users:bulk-delete` | `users` |
| POST | `/api/users/bulk/revoke-subscription` | Revoke users subscription by User IDs | api-token | `users:bulk-revoke-subscription` | `users` |
| POST | `/api/users/bulk/reset-traffic` | Bulk reset traffic users by User IDs | api-token | `users:bulk-reset-traffic` | `users` |
| POST | `/api/users/bulk/update` | Bulk update users by User IDs | api-token | `users:bulk-update-users` | `users` |
| POST | `/api/users/bulk/update-squads` | Bulk update users internal squads by User IDs | api-token | `users:bulk-update-squads` | `users` |
| POST | `/api/users/bulk/extend-expiration-date` | Extend expiration date for specified users by days | api-token | `users:bulk-extend-expiration-date` | `users` |
| POST | `/api/users/bulk/all/update` | Bulk update all users | api-token | `users:bulk-all-update-users` | `users` |
| POST | `/api/users/bulk/all/reset-traffic` | Reset user used traffic for all users | api-token | `users:bulk-all-reset-traffic` | `users` |
| POST | `/api/users/bulk/all/extend-expiration-date` | Extend expiration date for all users by days | api-token | `users:bulk-all-extend-expiration-date` | `users` |
| GET | `/api/hwid/devices/registration/{userId}` | Get new device registration policy | api-token | `hwid-user-devices:registration-get` | `hwid-user-devices` |
| PATCH | `/api/hwid/devices/registration/{userId}` | Allow or deny new device registration without changing the device limit | api-token | `hwid-user-devices:registration-update` | `hwid-user-devices` |
| GET | `/api/hwid/devices` | Get HWID devices | api-token | `hwid-user-devices:list` | `hwid-user-devices` |
| POST | `/api/hwid/devices` | Create a user HWID device | api-token | `hwid-user-devices:create` | `hwid-user-devices` |
| POST | `/api/hwid/devices/delete` | Delete a user HWID device | api-token | `hwid-user-devices:delete` | `hwid-user-devices` |
| POST | `/api/hwid/devices/delete-all` | Delete all unblocked user HWID devices (blocked devices are retained) | api-token | `hwid-user-devices:delete-all` | `hwid-user-devices` |
| POST | `/api/hwid/devices/block` | Block a user HWID device | api-token | `hwid-user-devices:block` | `hwid-user-devices` |
| POST | `/api/hwid/devices/unblock` | Unblock a user HWID device | api-token | `hwid-user-devices:unblock` | `hwid-user-devices` |
| GET | `/api/hwid/devices/stats` | Get HWID devices stats | api-token | `hwid-user-devices:stats` | `hwid-user-devices` |
| GET | `/api/hwid/devices/top-users` | Get top users by HWID devices | api-token | `hwid-user-devices:top-users` | `hwid-user-devices` |
| GET | `/api/hwid/devices/{userId}` | Get user HWID devices | api-token | `hwid-user-devices:list-by-user` | `hwid-user-devices` |
| GET | `/api/nodes/{uuid}/runtime` | Get node disk, CPU, memory, network, health and Xray runtime | api-token | `nodes:runtime` | `nodes` |
| GET | `/api/nodes/health/{uuid}/xray-logs` | Get node Xray logs | api-token | `nodes:xray-logs` | `nodes` |
| GET | `/api/nodes/health/{uuid}` | Get node health log | api-token | `nodes:health-log-list` | `nodes` |
| GET | `/api/nodes/tags` | Get nodes tags | api-token | `nodes:list-tags` | `nodes` |
| GET | `/api/nodes` | Get nodes | api-token | `nodes:list` | `nodes` |
| POST | `/api/nodes` | Create a new node | api-token | `nodes:create` | `nodes` |
| PATCH | `/api/nodes` | Update node | api-token | `nodes:update` | `nodes` |
| GET | `/api/nodes/{uuid}` | Get node by UUID | api-token | `nodes:get` | `nodes` |
| DELETE | `/api/nodes/{uuid}` | Delete a node | api-token | `nodes:delete` | `nodes` |
| POST | `/api/nodes/{uuid}/actions/enable` | Enable a node | api-token | `nodes:enable` | `nodes` |
| POST | `/api/nodes/{uuid}/actions/disable` | Disable a node | api-token | `nodes:disable` | `nodes` |
| POST | `/api/nodes/{uuid}/actions/restart` | Restart node | api-token | `nodes:restart` | `nodes` |
| POST | `/api/nodes/{uuid}/actions/reset-traffic` | Reset Node Traffic | api-token | `nodes:reset-traffic` | `nodes` |
| POST | `/api/nodes/actions/restart-all` | Restart all nodes | api-token | `nodes:restart-all` | `nodes` |
| POST | `/api/nodes/actions/reorder` | Reorder nodes | api-token | `nodes:reorder` | `nodes` |
| POST | `/api/nodes/bulk-actions/profile-modification` | Modify Inbounds & Profile for many nodes | api-token | `nodes:bulk-profile-modification` | `nodes` |
| POST | `/api/nodes/bulk-actions` | Perform actions for many nodes | api-token | `nodes:bulk-actions` | `nodes` |
| POST | `/api/nodes/bulk-actions/update` | Update many nodes | api-token | `nodes:bulk-update` | `nodes` |
| GET | `/api/sub/{shortUuid}/info` | Get Subscription Info by Short UUID | public | `—` | `—` |
| GET | `/api/sub/{shortUuid}` | SubscriptionController_getSubscription | public | `—` | `—` |
| GET | `/api/sub/{shortUuid}/{clientType}` | SubscriptionController_getSubscriptionByClientType | public | `—` | `—` |
| GET | `/api/sub/{shortUuid}/device/{token}` | SubscriptionController_getPersonalSubscription | public | `—` | `—` |
| GET | `/api/subscriptions` | Get all subscriptions | api-token | `subscriptions:list` | `subscriptions` |
| GET | `/api/subscriptions/by-username/{username}` | Get subscription by username | api-token | `subscriptions:by-username` | `subscriptions` |
| GET | `/api/subscriptions/by-short-uuid/{shortUuid}` | Get subscription by short uuid (protected route) | api-token | `subscriptions:by-short-uuid-protected` | `subscriptions` |
| GET | `/api/subscriptions/by-id/{userId}` | Get subscription by User ID | api-token | `subscriptions:by-id` | `subscriptions` |
| GET | `/api/subscriptions/by-short-uuid/{shortUuid}/raw` | Get Raw Subscription by Short UUID | api-token | `subscriptions:raw` | `subscriptions` |
| GET | `/api/subscriptions/subpage-config/{shortUuid}` | Get Subpage Config by Short UUID | api-token | `subscriptions:subpage-config` | `subscriptions` |
| GET | `/api/subscriptions/connection-keys/{userId}` | Get connection keys (base64 format) by user id | api-token | `subscriptions:connection-keys` | `subscriptions` |
| GET | `/api/subscription-templates/tags` | Get tags of Subscription Templates | api-token | `subscription-template:list-tags` | `subscription-template` |
| PATCH | `/api/subscription-templates/tags` | Set tags of Subscription Template | api-token | `subscription-template:set-tags` | `subscription-template` |
| GET | `/api/subscription-templates` | Get all subscription templates (wihout content) | api-token | `subscription-template:list` | `subscription-template` |
| POST | `/api/subscription-templates` | Create subscription template | api-token | `subscription-template:create` | `subscription-template` |
| PATCH | `/api/subscription-templates` | Update subscription template | api-token | `subscription-template:update` | `subscription-template` |
| GET | `/api/subscription-templates/{uuid}` | Get subscription template by uuid | api-token | `subscription-template:get` | `subscription-template` |
| DELETE | `/api/subscription-templates/{uuid}` | Delete subscription template | api-token | `subscription-template:delete` | `subscription-template` |
| POST | `/api/subscription-templates/actions/reorder` | Reorder subscription templates | api-token | `subscription-template:reorder` | `subscription-template` |
| PATCH | `/api/tokens/{uuid}` | Update API token name and permissions | admin | `—` | `—` |
| DELETE | `/api/tokens/{uuid}` | Delete API token | admin | `—` | `—` |
| GET | `/api/tokens` | Get all API tokens | admin | `—` | `—` |
| POST | `/api/tokens` | Create a new API token | admin | `—` | `—` |
| GET | `/api/tokens/scopes` | Get available API token scopes | admin | `—` | `—` |
| GET | `/api/config-profiles/tags` | Get tags of Config Profiles | api-token | `config-profiles:list-tags` | `config-profiles` |
| PATCH | `/api/config-profiles/tags` | Set tags of Config Profile | api-token | `config-profiles:set-tags` | `config-profiles` |
| GET | `/api/config-profiles` | Get config profiles | api-token | `config-profiles:list` | `config-profiles` |
| POST | `/api/config-profiles` | Create config profile | api-token | `config-profiles:create` | `config-profiles` |
| PATCH | `/api/config-profiles` | Update Core Config in specific config profile | api-token | `config-profiles:update` | `config-profiles` |
| GET | `/api/config-profiles/inbounds` | Get all inbounds from all config profiles | api-token | `config-profiles:list-inbounds` | `config-profiles` |
| GET | `/api/config-profiles/{uuid}/inbounds` | Get inbounds by profile uuid | api-token | `config-profiles:list-profile-inbounds` | `config-profiles` |
| GET | `/api/config-profiles/{uuid}` | Get config profile by uuid | api-token | `config-profiles:get` | `config-profiles` |
| DELETE | `/api/config-profiles/{uuid}` | Delete config profile | api-token | `config-profiles:delete` | `config-profiles` |
| GET | `/api/config-profiles/{uuid}/computed-config` | Get computed config profile by uuid | api-token | `config-profiles:get-computed` | `config-profiles` |
| POST | `/api/config-profiles/actions/reorder` | Reorder config profiles | api-token | `config-profiles:reorder` | `config-profiles` |
| GET | `/api/snippets` | Get snippets | api-token | `snippets:list` | `snippets` |
| POST | `/api/snippets` | Create snippet | api-token | `snippets:create` | `snippets` |
| PATCH | `/api/snippets` | Update snippet | api-token | `snippets:update` | `snippets` |
| DELETE | `/api/snippets` | Delete snippet | api-token | `snippets:delete` | `snippets` |
| POST | `/api/snippets/actions/sync` | Sync snippet to affected config profiles | api-token | `snippets:sync` | `snippets` |
| GET | `/api/internal-squads/tags` | Get tags of Internal Squads | api-token | `internal-squads:list-tags` | `internal-squads` |
| PATCH | `/api/internal-squads/tags` | Set tags of Internal Squad | api-token | `internal-squads:set-tags` | `internal-squads` |
| GET | `/api/internal-squads` | Get all internal squads | api-token | `internal-squads:list` | `internal-squads` |
| POST | `/api/internal-squads` | Create internal squad | api-token | `internal-squads:create` | `internal-squads` |
| PATCH | `/api/internal-squads` | Update internal squad | api-token | `internal-squads:update` | `internal-squads` |
| GET | `/api/internal-squads/{uuid}` | Get internal squad by uuid | api-token | `internal-squads:get` | `internal-squads` |
| DELETE | `/api/internal-squads/{uuid}` | Delete internal squad | api-token | `internal-squads:delete` | `internal-squads` |
| GET | `/api/internal-squads/{uuid}/accessible-nodes` | Get internal squad accessible nodes | api-token | `internal-squads:accessible-nodes` | `internal-squads` |
| GET | `/api/internal-squads/{uuid}/usage` | Get internal squad users traffic usage for a period | api-token | `internal-squads:internal-squad-usage` | `internal-squads` |
| POST | `/api/internal-squads/{uuid}/bulk-actions/add-users` | Add all users to internal squad | api-token | `internal-squads:add-users` | `internal-squads` |
| DELETE | `/api/internal-squads/{uuid}/bulk-actions/remove-users` | Delete users from internal squad | api-token | `internal-squads:remove-users` | `internal-squads` |
| POST | `/api/internal-squads/actions/reorder` | Reorder internal squads | api-token | `internal-squads:reorder` | `internal-squads` |
| POST | `/api/internal-squads/{uuid}/bulk-actions/add-many-users` | Add many users to internal squad | api-token | `internal-squads:add-many-users` | `internal-squads` |
| DELETE | `/api/internal-squads/{uuid}/bulk-actions/remove-many-users` | Delete many users from internal squad | api-token | `internal-squads:remove-many-users` | `internal-squads` |
| GET | `/api/bandwidth-stats/internal-squads/{uuid}/usage` | Get internal squad users traffic usage for a period | api-token | `bandwidth-stats:internal-squad-usage` | `bandwidth-stats` |
| GET | `/api/bandwidth-stats/internal-squads/{squadUuid}/users/{userId}/usage` | Get a single user daily traffic usage on the internal squad nodes for a period | api-token | `bandwidth-stats:internal-squad-user-usage` | `bandwidth-stats` |
| GET | `/api/external-squads/tags` | Get tags of External Squads | api-token | `external-squads:list-tags` | `external-squads` |
| PATCH | `/api/external-squads/tags` | Set tags of External Squad | api-token | `external-squads:set-tags` | `external-squads` |
| GET | `/api/external-squads` | Get all external squads | api-token | `external-squads:list` | `external-squads` |
| POST | `/api/external-squads` | Create external squad | api-token | `external-squads:create` | `external-squads` |
| PATCH | `/api/external-squads` | Update external squad | api-token | `external-squads:update` | `external-squads` |
| GET | `/api/external-squads/{uuid}` | Get external squad by uuid | api-token | `external-squads:get` | `external-squads` |
| DELETE | `/api/external-squads/{uuid}` | Delete external squad | api-token | `external-squads:delete` | `external-squads` |
| POST | `/api/external-squads/{uuid}/bulk-actions/add-users` | Add all users to external squad | api-token | `external-squads:add-users` | `external-squads` |
| DELETE | `/api/external-squads/{uuid}/bulk-actions/remove-users` | Delete users from external squad | api-token | `external-squads:remove-users` | `external-squads` |
| POST | `/api/external-squads/actions/reorder` | Reorder external squads | api-token | `external-squads:reorder` | `external-squads` |
| GET | `/api/keygen` | Get SECRET_KEY for Remnawave Node | api-token | `keygen:get` | `keygen` |
| GET | `/api/node-plugins/torrent-blocker` | Get Torrent Blocker Reports | api-token | `node-plugins:torrent-blocker-reports` | `node-plugins` |
| GET | `/api/node-plugins/torrent-blocker/stats` | Get Torrent Blocker Reports Stats | api-token | `node-plugins:torrent-blocker-stats` | `node-plugins` |
| DELETE | `/api/node-plugins/torrent-blocker/truncate` | Truncate Torrent Blocker Reports | api-token | `node-plugins:truncate` | `node-plugins` |
| GET | `/api/node-plugins/tags` | Get tags of Node Plugins | api-token | `node-plugins:list-tags` | `node-plugins` |
| PATCH | `/api/node-plugins/tags` | Set tags of Node Plugin | api-token | `node-plugins:set-tags` | `node-plugins` |
| GET | `/api/node-plugins/shared-lists` | Get Shared Lists (Preview) | api-token | `node-plugins:shared-lists-list` | `node-plugins` |
| POST | `/api/node-plugins/shared-lists` | Create Shared List | api-token | `node-plugins:shared-lists-create` | `node-plugins` |
| PATCH | `/api/node-plugins/shared-lists` | Update Shared List | api-token | `node-plugins:shared-lists-update` | `node-plugins` |
| DELETE | `/api/node-plugins/shared-lists` | Delete Shared List by name | api-token | `node-plugins:shared-lists-delete` | `node-plugins` |
| GET | `/api/node-plugins/shared-lists/by-name` | Get Shared List by name | api-token | `node-plugins:shared-lists-get` | `node-plugins` |
| POST | `/api/node-plugins/shared-lists/actions/sync` | Sync Shared List to nodes | api-token | `node-plugins:shared-lists-sync` | `node-plugins` |
| GET | `/api/node-plugins` | Get all Node Plugins | api-token | `node-plugins:list` | `node-plugins` |
| POST | `/api/node-plugins` | Create Node Plugin | api-token | `node-plugins:create` | `node-plugins` |
| PATCH | `/api/node-plugins` | Update Node Plugin | api-token | `node-plugins:update` | `node-plugins` |
| GET | `/api/node-plugins/{uuid}` | Get Node Plugin by uuid | api-token | `node-plugins:get` | `node-plugins` |
| DELETE | `/api/node-plugins/{uuid}` | Delete Node Plugin | api-token | `node-plugins:delete` | `node-plugins` |
| POST | `/api/node-plugins/actions/reorder` | Reorder Node Plugins | api-token | `node-plugins:reorder` | `node-plugins` |
| POST | `/api/node-plugins/actions/clone` | Clone Node Plugin | api-token | `node-plugins:clone` | `node-plugins` |
| POST | `/api/node-plugins/actions/sync` | Sync Node Plugin to nodes | api-token | `node-plugins:sync` | `node-plugins` |
| POST | `/api/node-plugins/executor` | Execute command on node plugins | api-token | `node-plugins:executor` | `node-plugins` |
| GET | `/api/node-integrations` | Get all Node Integrations | api-token | `node-integrations:list` | `node-integrations` |
| POST | `/api/node-integrations` | Create Node Integration | api-token | `node-integrations:create` | `node-integrations` |
| PATCH | `/api/node-integrations` | Update Node Integration | api-token | `node-integrations:update` | `node-integrations` |
| GET | `/api/node-integrations/{uuid}` | Get Node Integration by uuid | api-token | `node-integrations:get` | `node-integrations` |
| DELETE | `/api/node-integrations/{uuid}` | Delete Node Integration | api-token | `node-integrations:delete` | `node-integrations` |
| GET | `/api/limits` | List host and tag limit scopes | api-token | `limits:list` | `limits` |
| GET | `/api/limits/targets` | List squads for limit actions | api-token | `limits:targets` | `limits` |
| GET | `/api/limits/users` | List users and usage in a limit scope | api-token | `limits:users` | `limits` |
| POST | `/api/limits/selection-state` | Inspect recipients and pause state | api-token | `limits:selection-state` | `limits` |
| POST | `/api/limits/actions` | Grant, reset, pause or resume traffic | api-token | `limits:actions` | `limits` |
| POST | `/api/limits/unlimited` | Grant or revoke personal unlimited quota | api-token | `limits:unlimited` | `limits` |
| GET | `/api/hosts/tags` | Get tags of hosts | api-token | `hosts:list-tags` | `hosts` |
| GET | `/api/hosts` | Get hosts | api-token | `hosts:list` | `hosts` |
| POST | `/api/hosts` | Create a new host | api-token | `hosts:create` | `hosts` |
| PATCH | `/api/hosts` | Update a host | api-token | `hosts:update` | `hosts` |
| GET | `/api/hosts/{uuid}` | Get a host by UUID | api-token | `hosts:get` | `hosts` |
| DELETE | `/api/hosts/{uuid}` | Delete a host by UUID | api-token | `hosts:delete` | `hosts` |
| POST | `/api/hosts/actions/clone` | Clone host | api-token | `hosts:clone` | `hosts` |
| POST | `/api/hosts/actions/reorder` | Reorder hosts | api-token | `hosts:reorder` | `hosts` |
| POST | `/api/hosts/bulk/delete` | Delete hosts by UUIDs | api-token | `hosts:bulk-delete` | `hosts` |
| POST | `/api/hosts/bulk/disable` | Disable hosts by UUIDs | api-token | `hosts:bulk-disable` | `hosts` |
| POST | `/api/hosts/bulk/enable` | Enable hosts by UUIDs | api-token | `hosts:bulk-enable` | `hosts` |
| PATCH | `/api/hosts/bulk/update` | Update many hosts | api-token | `hosts:bulk-update` | `hosts` |
| POST | `/api/bandwidth-stats/nodes/usage` | Get users exceeding a traffic threshold on the given nodes for a period | api-token | `bandwidth-stats:node-usage` | `bandwidth-stats` |
| GET | `/api/bandwidth-stats/nodes/{uuid}/users` | Get Node Users Usage by Node UUID | api-token | `bandwidth-stats:node-users-usage` | `bandwidth-stats` |
| POST | `/api/bandwidth-stats/nodes/users` | Get Nodes Users Usage by Nodes UUIDs | api-token | `bandwidth-stats:nodes-users-usage` | `bandwidth-stats` |
| GET | `/api/bandwidth-stats/users/{userId}` | Get User Usage by Range | api-token | `bandwidth-stats:user-usage` | `bandwidth-stats` |
| GET | `/api/bandwidth-stats/nodes` | Get Nodes Usage by Range | api-token | `bandwidth-stats:nodes-usage` | `bandwidth-stats` |
| GET | `/api/infra-billing/providers` | Get all infra providers | api-token | `infra-billing:list-providers` | `infra-billing` |
| POST | `/api/infra-billing/providers` | Create infra provider | api-token | `infra-billing:create-provider` | `infra-billing` |
| PATCH | `/api/infra-billing/providers` | Update infra provider | api-token | `infra-billing:update-provider` | `infra-billing` |
| GET | `/api/infra-billing/providers/{uuid}` | Get infra provider by uuid | api-token | `infra-billing:get-provider` | `infra-billing` |
| DELETE | `/api/infra-billing/providers/{uuid}` | Delete infra provider by uuid | api-token | `infra-billing:delete-provider` | `infra-billing` |
| GET | `/api/infra-billing/history` | Get infra billing history | api-token | `infra-billing:list-bill-records` | `infra-billing` |
| POST | `/api/infra-billing/history` | Create infra billing history | api-token | `infra-billing:create-bill-record` | `infra-billing` |
| DELETE | `/api/infra-billing/history/{uuid}` | Delete infra billing history | api-token | `infra-billing:delete-bill-record` | `infra-billing` |
| GET | `/api/infra-billing/nodes` | Get infra billing nodes | api-token | `infra-billing:list-billing-nodes` | `infra-billing` |
| POST | `/api/infra-billing/nodes` | Create infra billing node | api-token | `infra-billing:create-billing-node` | `infra-billing` |
| PATCH | `/api/infra-billing/nodes` | Update infra billing nodes | api-token | `infra-billing:update-billing-node` | `infra-billing` |
| DELETE | `/api/infra-billing/nodes/{uuid}` | Delete infra billing node | api-token | `infra-billing:delete-billing-node` | `infra-billing` |
| GET | `/api/subscription-request-history` | Get all subscription request history | api-token | `subscription-request-history:list` | `subscription-request-history` |
| GET | `/api/subscription-request-history/stats` | Get subscription request history stats | api-token | `subscription-request-history:stats` | `subscription-request-history` |
| GET | `/api/system/metadata` | Get Remnawave Information | api-token | `system:metadata` | `system` |
| GET | `/api/system/configuration` | Get Remnawave Configuration | api-token | `system:configuration` | `system` |
| GET | `/api/system/stats` | Get Stats | api-token | `system:stats` | `system` |
| GET | `/api/system/stats/bandwidth` | Get Bandwidth Stats | api-token | `system:bandwidth-stats` | `system` |
| GET | `/api/system/stats/nodes` | Get Nodes Statistics | api-token | `system:nodes-statistics` | `system` |
| GET | `/api/system/health` | Get Remnawave Health | api-token | `system:remnawave-health` | `system` |
| GET | `/api/system/nodes/metrics` | Get Nodes Metrics | api-token | `system:nodes-metrics` | `system` |
| GET | `/api/system/tools/x25519/generate` | Generate 30 X25519 keypairs | api-token | `system:generate-x25519` | `system` |
| POST | `/api/system/testers/srr-matcher` | Test SRR Matcher | api-token | `system:test-srr-matcher` | `system` |
| GET | `/api/system/stats/recap` | Get Recap | api-token | `system:recap` | `system` |
| GET | `/api/system/stats/digest` | Get Stats Digest | api-token | `system:digest` | `system` |
| GET | `/api/system/stats/http` | Get HTTP Stats | api-token | `system:http` | `system` |
| GET | `/api/subscription-settings` | Get subscription settings | api-token | `subscription-settings:get` | `subscription-settings` |
| PATCH | `/api/subscription-settings` | Update subscription settings | api-token | `subscription-settings:update` | `subscription-settings` |
| POST | `/api/connections/by-user/{userId}` | Request Connections for User | api-token | `connections:by-user` | `connections` |
| GET | `/api/connections/by-user/{jobId}` | Get Connections for User by Job ID | api-token | `connections:by-user-result` | `connections` |
| POST | `/api/connections/drop` | Drop Connections for Users or IPs | api-token | `connections:drop` | `connections` |
| POST | `/api/connections/by-node/{nodeUuid}` | Request Connections for Node | api-token | `connections:by-node` | `connections` |
| GET | `/api/connections/by-node/{jobId}` | Get Connections for Node by Job ID | api-token | `connections:by-node-result` | `connections` |
| POST | `/api/connections/geocheck/{nodeUuid}` | Request Geocheck for Node | api-token | `connections:geocheck` | `connections` |
| GET | `/api/connections/geocheck/{jobId}` | Get Geocheck for Node by Job ID | api-token | `connections:geocheck-result` | `connections` |
| GET | `/api/metadata/user/{userId}` | Get user metadata | api-token | `metadata:get-user` | `metadata` |
| PUT | `/api/metadata/user/{userId}` | Update or create User Metadata | api-token | `metadata:upsert-user` | `metadata` |
| GET | `/api/metadata/node/{uuid}` | Get node metadata | api-token | `metadata:get-node` | `metadata` |
| PUT | `/api/metadata/node/{uuid}` | Update or create Node Metadata | api-token | `metadata:upsert-node` | `metadata` |
