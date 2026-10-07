const text = {
    "ru": {
        "hosts": "Над списком выберите «Включённые», «Отключённые», «Видимые» или «Скрытые». «Видимые» оставляет хосты с isHidden = false, в том числе отключённые. «Включённые» оставляет хосты с isDisabled = false, в том числе скрытые. Фильтр работает вместе с выбранным тегом, в карточках и таблице. В карточках можно перетаскивать хосты внутри тега: остальные записи сохраняют свои места. Кнопки сохранения, копирования и удаления доступны внизу формы при прокрутке.",
        "nodes": "В режиме карточек ноды можно перетаскивать и при выбранном теге. Меняется порядок показанных нод; остальные остаются на своих местах. Кнопки формы закреплены внизу окна и доступны при прокрутке."
    },
    "en": {
        "hosts": "Above the list, choose Enabled, Disabled, Visible or Hidden. Visible includes hosts with isHidden = false, including disabled hosts. Enabled includes hosts with isDisabled = false, including hidden hosts. The filter combines with the selected tag in card and table views. In card view, drag hosts within a tag; other records keep their positions. Save, copy and delete actions remain available at the bottom of the form while scrolling.",
        "nodes": "In card view, nodes can be dragged with a tag selected. Only visible nodes are reordered; other records keep their positions. Form actions stay at the bottom of the window while scrolling."
    },
    "fa": {
        "hosts": "بالای فهرست، فعال، غیرفعال، قابل مشاهده یا پنهان را انتخاب کنید. قابل مشاهده، میزبان‌های با isHidden = false را شامل می‌شود، حتی اگر غیرفعال باشند. فعال، میزبان‌های با isDisabled = false را شامل می‌شود، حتی اگر پنهان باشند. فیلتر همراه با تگ انتخاب‌شده در نمای کارت و جدول کار می‌کند. در نمای کارت، میزبان‌های داخل تگ را بکشید؛ سایر رکوردها جای خود را حفظ می‌کنند. دکمه‌های ذخیره، کپی و حذف هنگام پیمایش در پایین فرم در دسترس‌اند.",
        "nodes": "در نمای کارت می‌توان گره‌ها را با تگ انتخاب‌شده جابه‌جا کرد. فقط ترتیب گره‌های قابل مشاهده تغییر می‌کند؛ سایر رکوردها جای خود را حفظ می‌کنند. دکمه‌های فرم هنگام پیمایش در پایین پنجره ثابت‌اند."
    },
    "zh": {
        "hosts": "在列表上方选择已启用、已禁用、可见或隐藏。可见显示 isHidden = false 的主机，包括已禁用的主机；已启用显示 isDisabled = false 的主机，包括隐藏的主机。此筛选与所选标签同时生效，支持卡片和表格视图。在卡片视图中可拖动标签内的主机，其他记录保留原位置。滚动表单时，保存、复制和删除按钮仍在底部可用。",
        "nodes": "卡片视图支持在选定标签后拖动节点。只调整可见节点的顺序，其他记录保留原位置。滚动时表单操作按钮固定在窗口底部。"
    }
}

export function explainListInteractions(articles) {
    for (const article of articles) {
        for (const lang of ['ru', 'en', 'fa', 'zh']) {
            const extra = text[lang][article.id]
            if (extra) article.sections[0][lang].body += '\n\n' + extra
        }
    }
}
