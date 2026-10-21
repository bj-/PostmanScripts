---
# Файлы для модели без доступа к репозиторию (пути от каталога репозиториев C:\Git).
# Архив: python Test-Library/Api/tools/export_for_llm.py --task PostmanScripts/docs/tasks/attempt-limit.md
files:
  - PostmanScripts/README.md
  - PostmanScripts/Before Responce (collection).js
  - PostmanScripts/After Responce (collection).js
  - PostmanScripts/Before Responce (usage).js
  - PostmanScripts/After Responce (usage).js
  - Test-Library/docs/decisions/0008-ai-restricted-isolation.md
  - Test-Library/docs/decisions/0009-test-data-by-reference.md
---

# Задание: проверка ограничения неудачных попыток входа — готовый блок фреймворка PostmanScripts

> Задание для LLM-исполнителя. Работает и с доступом к репозиторию, и в web-интерфейсе: тогда к заданию приложен
> архив с файлами из заголовка. Это постановка, а не жёсткий свод правил: отступление от предложенного API
> допустимо с объяснением.

## Контекст

- Команда тестирует **свой** API на **своём** тестовом стенде (dev/test/stage). Требование заказчика: после N
  неудачных попыток входа учётка блокируется или запросы ограничиваются. Это обычная защитная проверка из
  OWASP ASVS (V2.2.1) и NIST SP 800-63B (5.2.2).
- PostmanScripts — фреймворк для тестов Postman: скрипты уровня коллекции (`Before Responce (collection).js`,
  `After Responce (collection).js`), в запросе — `utils.bind(pm, console)` и короткие вызовы. Работает одинаково
  в Postman и newman. Описание и переменные окружения — `README.md`, примеры — `* (usage).js`.
- Уже есть: `failLogins(count, email, opts)` (N неудачных входов со случайным неверным паролем), `needEnv`,
  `needFlag`, учётка `LockoutAccount` (отдельная, её блокируют намеренно), `bruteForceLimit`, `accountLockoutLimit`,
  `accountLockoutSec`, `allowDestructive`, `isProduction`, Login guard (`safeFailedLogins` — защищает рабочие учётки
  `AdminAccounts` от случайной блокировки).
- Сейчас такие тесты ручные (`[DRAFT]`, ADR 0008): код сценария писался под каждый тест заново. Цель — написать
  сценарий **один раз во фреймворке** (его проверит человек), а генератор и ассистент будут только указывать
  параметры и читать вердикт.

## Что сделать

1. **Pre-request: `attemptLimit(opts)`** — подготовка: N неудачных попыток для `LockoutAccount`, затем основной
   запрос теста — вход с **верным** паролем этой учётки. Параметры (имена можно уточнить):
   - `attempts` — число неудачных попыток; по умолчанию `accountLockoutLimit`, иначе `bruteForceLimit`;
   - `endpoint` — по умолчанию вход фреймворка (`POST /api/auth/login`, тело `{email, password}`); можно задать
     `{ method, path, body }`, где в `body` поле секрета помечено `"{secret}"` (вход, проверка одноразового кода);
   - `secret` — `"password"` (случайная строка, как в `failLogins`) или `"code:<длина>"` (случайные цифры заданной
     длины);
   - `clientIp` — `"same"` (по умолчанию) или `"rotate"`: проверка, что блокировка не снимается сменой заголовка
     адреса клиента (`X-Forwarded-For`; запись Test-Library HARD-CLIENT-IP-TRUSTED-PROXIES);
   - основной запрос получает переменные `{{lock_login}}`, `{{lock_pass}}`.
2. **Post-response: `test("attemptLimit", opts)`** — вердикт:
   - вход с верным паролем после N неудачных **отклонён**; код — из `opts.codes` (по умолчанию 423, 429, 401, 403);
   - сессия не выдана (нет cookie сессии в ответе);
   - если `opts.retryAfter` — есть заголовок `Retry-After`;
   - сообщение проверки — короткое и нейтральное: «после N неудачных попыток вход отклонён: да/нет, код X».
3. **Снятие блокировки** — отдельный вызов `test("attemptLimit.recovered")` для долгого теста: после
   `accountLockoutSec` (ожидание `wait`) вход верным паролем успешен; без `accountLockoutSec` — пропуск с причиной.
4. Примеры в `Before Responce (usage).js` и `After Responce (usage).js`, строки в таблицу переменных `README.md`,
   строка в журнал `docs/STATUS.md`.

## Ограничения (обязательные)

- Только учётка `LockoutAccount`; `AdminAccounts` не трогать. Нет `LockoutAccount` или `allowDestructive !== "true"`
  или `isProduction === "true"` — запрос пропускается с причиной (как `needEnv` / `needFlag`).
- Неверные секреты — **случайные** (как `failLogins`): никаких словарей, списков распространённых паролей,
  последовательного перебора кодов. Попыток — не больше `attempts + 2`.
- Login guard не ломать: `LockoutAccount` им не охраняется, рабочие учётки — охраняются.
- Пароли и коды не выводить в консоль и в сообщения проверок.
- В коде скриптов не писать литералы `{{...}}` — Postman CLI подставляет их до выполнения скрипта; брать значения
  через `pm.variables.get` / `R()`.
- Стиль — как в соседнем коде (очередь шагов `enqueue`, `send`, `R`, `skip`, комментарии на русском).

## Результат

- **С доступом к репозиторию:** правки в файлах, `node -e` проверка синтаксиса обоих скриптов коллекции, коммит
  в ветку (не в main), сообщение на русском.
- **Без доступа (web):** для каждого файла — либо unified diff относительно приложенной версии, либо полный текст
  новых и изменённых функций с указанием места («вставить после функции `failLogins`»). Отдельно — пример запроса
  (Pre-request и Post-response) и список, что проверить человеку на стенде.

## Проверка человеком

- `node -e "new (require('vm').Script)(require('fs').readFileSync('Before Responce (collection).js','utf8'))"`
  (и для After);
- прогон одного теста на тестовом стенде с `LockoutAccount` и `allowDestructive=true` — в Postman и через newman
  (`autotest.py run`); блокировка рабочих учёток не наступила (`fw_failed_logins`).
