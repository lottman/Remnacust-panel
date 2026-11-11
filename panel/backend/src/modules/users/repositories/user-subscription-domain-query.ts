import type { UserEntity } from '../entities/user.entity';

import { sql } from 'kysely';

const publicDomainSource = sql`
            FROM subscription_domains assigned
            JOIN subscription_domains primary_domain ON primary_domain.uuid =
                CASE WHEN assigned.kind = 'PRIMARY' THEN assigned.uuid ELSE assigned.parent_uuid END
            LEFT JOIN LATERAL (
                SELECT candidate.uuid, candidate.name, candidate.domain, candidate.path,
                    candidate.kind, candidate.parent_uuid, candidate.is_default
                FROM subscription_domains candidate
                WHERE candidate.kind = 'CDN' AND candidate.parent_uuid = primary_domain.uuid
                    AND candidate.access_mode <> 'BLOCKED'
                ORDER BY CASE
                    WHEN candidate.uuid = assigned.uuid THEN 0
                    WHEN candidate.uuid = primary_domain.redirect_domain_uuid THEN 1
                    ELSE 2
                END, candidate.domain COLLATE "C", candidate.uuid
                LIMIT 1
            ) cdn ON true
            WHERE assigned.uuid = COALESCE(users.subscription_domain_uuid,
                (SELECT uuid FROM subscription_domains WHERE is_default LIMIT 1))
`;

export function userSubscriptionDomainSelection() {
    return [
        sql<UserEntity['subscriptionDomain']>`(
            SELECT CASE
                WHEN primary_domain.access_mode = 'BLOCKED' THEN NULL
                WHEN cdn.uuid IS NOT NULL THEN jsonb_build_object(
                    'uuid', cdn.uuid, 'name', cdn.name, 'domain', cdn.domain, 'path', cdn.path,
                    'kind', cdn.kind, 'parentUuid', cdn.parent_uuid, 'isDefault', cdn.is_default
                )
                WHEN primary_domain.access_mode = 'OPEN' THEN jsonb_build_object(
                    'uuid', primary_domain.uuid, 'name', primary_domain.name,
                    'domain', primary_domain.domain, 'path', primary_domain.path,
                    'kind', primary_domain.kind, 'parentUuid', primary_domain.parent_uuid,
                    'isDefault', primary_domain.is_default
                )
                ELSE NULL
            END
            ${publicDomainSource}
        )`.as('subscriptionDomain'),
        sql<string | null>`(
            SELECT CASE
                WHEN primary_domain.access_mode = 'BLOCKED' THEN ''
                WHEN cdn.domain IS NOT NULL THEN 'https://' || cdn.domain || cdn.path
                WHEN primary_domain.access_mode = 'OPEN'
                    THEN 'https://' || primary_domain.domain || primary_domain.path
                ELSE ''
            END
            ${publicDomainSource}
        )`.as('subscriptionUrlBase'),
    ];
}
