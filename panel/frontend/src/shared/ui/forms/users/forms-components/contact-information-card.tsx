import { NumberInput, Stack, TextInput } from '@mantine/core'
import { UseFormReturnType } from '@mantine/form'
import { CreateUserCommand, UpdateUserCommand } from '@remnawave/backend-contract'
import { ForwardRefComponent, HTMLMotionProps, Variants } from 'motion/react'
import { useTranslation } from 'react-i18next'
import { PiEnvelopeDuotone, PiTelegramLogoDuotone } from 'react-icons/pi'
import { TbMail } from 'react-icons/tb'

import { useUiText } from '@shared/i18n/interface-text'
import { BaseOverlayHeader } from '@shared/ui/overlays/base-overlay-header'
import { SectionCard } from '@shared/ui/section-card'

interface IProps<T extends CreateUserCommand.RequestBody | UpdateUserCommand.RequestBody> {
    cardVariants: Variants
    form: UseFormReturnType<T>
    motionWrapper: ForwardRefComponent<HTMLDivElement, HTMLMotionProps<'div'>>
}

export function ContactInformationCard<
    T extends CreateUserCommand.RequestBody | UpdateUserCommand.RequestBody
>(props: IProps<T>) {
    const uiText = useUiText()

    const { t } = useTranslation()

    const { cardVariants, motionWrapper, form } = props

    const MotionWrapper = motionWrapper

    return (
        <MotionWrapper variants={cardVariants}>
            <SectionCard.Root>
                <SectionCard.Section>
                    <BaseOverlayHeader
                        iconColor="teal"
                        IconComponent={TbMail}
                        iconSize={20}
                        iconVariant="soft"
                        title={t('contact-information-card.contact-information')}
                        titleOrder={5}
                    />
                </SectionCard.Section>

                <SectionCard.Section>
                    <Stack gap="md">
                        <NumberInput
                            allowDecimal={false}
                            allowNegative={false}
                            hideControls
                            key={form.key('telegramId')}
                            label={uiText('telegram-id-68559c8')}
                            leftSection={<PiTelegramLogoDuotone size="16px" />}
                            placeholder={uiText('enter-user-s-telegram-id-optional-a4f21c4')}
                            {...form.getInputProps('telegramId')}
                            styles={{
                                label: { fontWeight: 500 }
                            }}
                        />

                        <TextInput
                            key={form.key('email')}
                            label={uiText('email-969ccbd')}
                            leftSection={<PiEnvelopeDuotone size="16px" />}
                            placeholder={uiText('enter-user-s-email-optional-f372bfa')}
                            {...form.getInputProps('email')}
                            styles={{
                                label: { fontWeight: 500 }
                            }}
                        />
                    </Stack>
                </SectionCard.Section>
            </SectionCard.Root>
        </MotionWrapper>
    )
}
