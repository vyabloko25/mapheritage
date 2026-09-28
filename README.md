# MapHeritage

Страницы: главная (`/`), создание карты (`/create`), готовая карта (`/m/<id>`), планы (`/plans`).
Интерфейс по умолчанию на английском, кнопка RU/EN рядом с названием. Бот отвечает на языке пользователя.

## Обновление с прошлой версии: 3 шага

### 1. База (один раз)
Cloudflare → Storage & Databases → D1 → `mapheritage` → вкладка Console. Выполни по очереди **каждую строку** из файла `migrate-2.sql` (там 7 строк).
Строки `ALTER TABLE` выполняются только один раз. Если консоль ответит «duplicate column», значит, колонка уже есть, это нормально.

### 2. Файлы на GitHub
**Не трогай `wrangler.toml`.** Удали старые папки `public`, `functions`, `lib`, затем загрузи эти папки из архива вместе с `README.md`, `SCENARIOS.md`, `schema.sql` и `migrate-2.sql`. Нажми Commit.

### 3. Проверка подложки
После деплоя открой `https://ТВОЙ-ДОМЕН/api/tile/voyager/3/4/2.png`.
- Видна картинка — всё работает.
- Виден текст `all tile sources failed: ...` — пришли его мне. Карта в браузере при этом всё равно загрузится напрямую из CARTO.

## Вход через Google (по желанию)
1. https://console.cloud.google.com → создай проект → APIs & Services → OAuth consent screen: тип External, название MapHeritage, твоя почта.
2. Credentials → Create credentials → OAuth client ID → Web application.
   Authorized redirect URI: `https://ТВОЙ-ДОМЕН/api/auth/google/callback` (добавь и `https://mapheritage.pages.dev/api/auth/google/callback`, если пользуешься этим адресом).
3. Cloudflare → Pages → mapheritage → Settings → Variables and Secrets → добавь секреты `GOOGLE_CLIENT_ID` и `GOOGLE_CLIENT_SECRET` → Retry deployment.
Кнопка «Войти через Google» появится сама.

## Планы
Лимиты задаются в `lib/plans.js`. Сейчас:
- **Lite**: стили Discovery и Admiralty, базовые настройки, 5 PNG в месяц.
- **Pro**: всё без ограничений.

Ограничения Lite проверяет сервер, поэтому обойти их из браузера нельзя. Оплата пока не подключена. Кто нажал «Хочу Pro», виден в D1: `SELECT email FROM users WHERE pro_requested = 1;`
Выдать Pro: `UPDATE users SET plan = 'pro' WHERE email = 'почта@пример';`
Следующий шаг — подключить Stripe или Paddle.

## Конфиденциальность: как это устроено
- Карта закрыта по умолчанию. `/m/<id>` открывается другим людям только после включения доступа в меню «Поделиться». Выключить доступ можно в любой момент.
- Пароли хранятся как PBKDF2-хэш. Сессия хранится в HttpOnly-cookie, в базе лежит только её хэш.
- Для поиска на карте в OpenStreetMap уходит только название места.
- Удаление карты и аккаунта стирает всё, включая историю разговора и снимки для отката.
- ИИ: Workers AI (Cloudflare) или Claude API, если задан `ANTHROPIC_API_KEY`. Оба провайдера по умолчанию не обучают модели на запросах через API.

## Что где
- `lib/scenarios.js` — сценарии интервью (описаны в `SCENARIOS.md`).
- `lib/auth.js`, `functions/api/auth/*` — регистрация, вход, Google, удаление аккаунта.
- `functions/api/tile/[[path]].js` — прокси подложек (CARTO → зеркало CARTO → Esri).
- `public/assets/poster.js` — композиция и экспорт PNG.
