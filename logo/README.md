# Логотип Iskra

Знак «Спалах» у зоряному стилі + напис шрифтом **Michroma**.
Підзаголовок набрано шрифтом **Manrope Bold**. Обидва шрифти безкоштовні (SIL Open Font License), їх можна завантажити з Google Fonts.
У всіх SVG текст переведено в криві, тож вони виглядають однаково на будь-якому пристрої, навіть без встановлених шрифтів.

## Файли

| Папка | Файл | Для чого |
|---|---|---|
| svg/ | iskra-logo.svg | основний логотип з підзаголовком, для світлого фону |
| svg/ | iskra-logo-white.svg | те саме для темного фону |
| svg/ | iskra-logo-short(-white).svg | без підзаголовка: шапка сайту, малі розміри |
| svg/ | iskra-mark(-white).svg | лише знак |
| png/ | ті самі варіанти в PNG | прозорий фон, висока роздільність (документи, презентації) |
| favicon/ | favicon.ico, favicon.svg, favicon-16/32/48.png | іконка вкладки браузера |
| favicon/ | apple-touch-icon.png, icon-192/512.png, site.webmanifest | іконки для телефонів |
| social/ | avatar.png | аватарка для соцмереж (1024×1024) |
| social/ | og-image.png | картинка-прев'ю посилання (1200×630) |
| ./ | colors.css | фірмові кольори як CSS-змінні |

## Підключення на сайті

```html
<link rel="icon" href="/logo/favicon/favicon.ico" sizes="any">
<link rel="icon" href="/logo/favicon/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/logo/favicon/apple-touch-icon.png">
<link rel="manifest" href="/logo/favicon/site.webmanifest">
<meta property="og:image" content="https://ВАШ-ДОМЕН/logo/social/og-image.png">

<img src="/logo/svg/iskra-logo-short.svg" alt="Iskra" height="40">
```

## Правила
- Навколо логотипа залишайте вільне поле, не менше за висоту літери «I».
- На темному або фотографічному фоні використовуйте `-white` версії.
- Не розтягуйте логотип, не міняйте кольори променів і не додавайте тіні.
- Мінімальна висота: 24 px для повної версії, 16 px для знака.
