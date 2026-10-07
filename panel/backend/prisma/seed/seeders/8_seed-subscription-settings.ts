import { PrismaClient } from '@prisma/client';
import consola from 'consola';

import { CustomRemarksSchema, TCustomRemarks } from '@libs/contracts/models';

import { getDefaultHwidSettings } from '../default';

export async function seedSubscriptionSettings(prisma: PrismaClient) {
    consola.start('Seeding subscription settings...');

    const customRemarks = {
        expiredUsers: ['⌛ Subscription expired', 'Contact support'],
        limitedUsers: ['🚧 Subscription limited', 'Contact support'],
        disabledUsers: ['🚫 Subscription disabled', 'Contact support'],
        emptyHosts: [
            '→ Remnacust',
            '→ No hosts found',
            '→ Check Hosts tab',
            '→ Check Internal Squads tab',
        ],
        HWIDMaxDevicesExceeded: ['Limit of devices reached'],
        HWIDNotSupported: ['App not supported'],
        HWIDRegistrationBlocked: ['Добавление новых устройств запрещено'],
        HWIDBlocked: ['Device is blocked'],
        hostTrafficLimit: ['Host traffic limit reached'],
        hostTrafficPaused: ['Трафик временно приостановлен'],
        combineSubscriptionAndHwidRemarks: true,
        subscriptionAndHwidRemarkOrder: ['EXPIRED', 'DISABLED', 'HWID_BLOCKED'],
    } satisfies TCustomRemarks;

    const existingConfig = await prisma.subscriptionSettings.findFirst();

    if (existingConfig) {
        if (existingConfig.hwidSettings === null) {
            await prisma.subscriptionSettings.update({
                where: { uuid: existingConfig.uuid },
                data: { hwidSettings: getDefaultHwidSettings() },
            });

            consola.success('Default HWID Settings have been seeded');
        }

        if (existingConfig.customRemarks) {
            const existingRemarks = existingConfig.customRemarks as Partial<TCustomRemarks>;

            const needsUpdate =
                !('HWIDMaxDevicesExceeded' in existingRemarks) ||
                !('HWIDNotSupported' in existingRemarks) ||
                !('HWIDRegistrationBlocked' in existingRemarks) ||
                !('HWIDBlocked' in existingRemarks) ||
                !('hostTrafficLimit' in existingRemarks) ||
                !('hostTrafficPaused' in existingRemarks) ||
                !('combineSubscriptionAndHwidRemarks' in existingRemarks) ||
                !('subscriptionAndHwidRemarkOrder' in existingRemarks);

            if (needsUpdate) {
                const mergedRemarks: TCustomRemarks = {
                    ...customRemarks,
                    ...existingRemarks,
                };

                await prisma.subscriptionSettings.update({
                    where: { uuid: existingConfig.uuid },
                    data: { customRemarks: mergedRemarks },
                });

                consola.success('Custom remarks updated with new fields');

                return;
            }

            const isValid = await CustomRemarksSchema.safeParseAsync(existingConfig.customRemarks);
            if (!isValid.success) {
                await prisma.subscriptionSettings.update({
                    where: { uuid: existingConfig.uuid },
                    data: { customRemarks: customRemarks },
                });

                consola.success('Custom remarks updated');
                return;
            }
        }

        consola.success('Custom remarks seeded');
        return;
    }

    await prisma.subscriptionSettings.create({
        data: {
            uuid: '00000000-0000-0000-0000-000000000000',
            serveJsonAtBaseSubscription: false,
            randomizeHosts: false,
            hwidSettings: getDefaultHwidSettings(),
            isShowCustomRemarks: true,
            customRemarks,
            customResponseHeaders: {
                'profile-title': 'rwEncodeBase64:Remnacust',
                'profile-update-interval': '12',
                'support-url': 'https://dummy.docs.rw',
                'profile-web-page-url': '{{SUBSCRIPTION_URL}}',
            },
        },
    });
}
