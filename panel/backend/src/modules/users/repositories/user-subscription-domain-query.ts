import type { UserEntity } from '../entities/user.entity';

import { sql } from 'kysely';

export function userSubscriptionDomainSelection() {
    return [
        sql<UserEntity['subscriptionDomain']>`(
            SELECT jsonb_build_object(
                'uuid', d.uuid, 'name', d.name, 'domain', d.domain, 'path', d.path,
                'kind', d.kind, 'parentUuid', d.parent_uuid, 'isDefault', d.is_default
            ) FROM subscription_domains d
            WHERE d.uuid = COALESCE(users.subscription_domain_uuid,
                (SELECT uuid FROM subscription_domains WHERE is_default LIMIT 1))
        )`.as('subscriptionDomain'),
        sql<string | null>`(
            SELECT CASE
                WHEN primary_domain.access_mode = 'BLOCKED' THEN ''
                WHEN cdn.domain IS NOT NULL THEN 'https://' || cdn.domain || cdn.path
                WHEN primary_domain.access_mode = 'OPEN'
                    THEN 'https://' || primary_domain.domain || primary_domain.path
                ELSE ''
            END
            FROM subscription_domains assigned
            JOIN subscription_domains primary_domain ON primary_domain.uuid =
                CASE WHEN assigned.kind = 'PRIMARY' THEN assigned.uuid ELSE assigned.parent_uuid END
            LEFT JOIN LATERAL (
                SELECT candidate.domain, candidate.path
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
        )`.as('subscriptionUrlBase'),
    ];
}
