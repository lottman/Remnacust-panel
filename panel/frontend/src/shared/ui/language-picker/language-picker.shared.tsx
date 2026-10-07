import { Menu, Text } from '@mantine/core'
import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { TbLanguage } from 'react-icons/tb'

import { useUiText } from '@shared/i18n/interface-text'
import { HeaderControl } from '@shared/ui/header-buttons/HeaderControl'

const data = [
    { label: 'English', emoji: '🇬🇧', value: 'en' },
    { label: 'Русский', emoji: '🇷🇺', value: 'ru' },
    { label: 'فارسی', emoji: '🇮🇷', value: 'fa' },
    { label: '简体中文', emoji: '🇨🇳', value: 'zh' }
]

export function LanguagePicker() {
    const uiText = useUiText()

    const { i18n } = useTranslation()

    useEffect(() => {
        const savedLanguage = localStorage.getItem('i18nextLng')
        if (savedLanguage) {
            i18n.changeLanguage(savedLanguage)
        }
    }, [i18n])

    const changeLanguage = (value: string) => {
        i18n.changeLanguage(value)
    }

    const items = data.map((item) => (
        <Menu.Item
            key={item.value}
            leftSection={<Text>{item.emoji}</Text>}
            onClick={() => changeLanguage(item.value)}
        >
            {item.label}
        </Menu.Item>
    ))

    return (
        <Menu position="bottom-end" width={150} withinPortal>
            <Menu.Target>
                <HeaderControl aria-label={uiText('language-a4fe652')}>
                    <TbLanguage size={22} />
                </HeaderControl>
            </Menu.Target>
            <Menu.Dropdown>{items}</Menu.Dropdown>
        </Menu>
    )
}
