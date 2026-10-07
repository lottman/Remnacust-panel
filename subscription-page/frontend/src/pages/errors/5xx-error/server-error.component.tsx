import { Button, Container, Group, Text, Title } from '@mantine/core'
import { useNavigate } from 'react-router'

import classes from './ServerError.module.css'

export function ErrorPageComponent() {
    const navigate = useNavigate()
    const messages = {
        en: ['Unable to load the subscription', 'Check your connection and try again.', 'Reload'],
        ru: ['Не удалось загрузить подписку', 'Проверьте соединение и попробуйте ещё раз.', 'Обновить'],
        fa: ['بارگیری اشتراک ممکن نشد', 'اتصال خود را بررسی کنید و دوباره تلاش کنید.', 'بارگیری مجدد'],
        zh: ['无法加载订阅', '请检查网络连接并重试。', '重新加载']
    }
    const lang = navigator.language.toLowerCase().split('-')[0] as keyof typeof messages
    const [title, description, reload] = messages[lang] ?? messages.en

    const handleRefresh = () => {
        navigate(0)
    }

    return (
        <div className={classes.root}>
            <Container>
                <div className={classes.label}>500</div>
                <Title className={classes.title}>{title}</Title>
                <Text className={classes.description} size="lg" ta="center">
                    {description}
                </Text>
                <Group justify="center">
                    <Button onClick={handleRefresh} size="md" variant="outline">
                        {reload}
                    </Button>
                </Group>
            </Container>
        </div>
    )
}
