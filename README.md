# PostmanScripts
tiny framework for postman's tests

# Usage
## REST
Файлы `Before Responce (collection).js` и `After Responce (collection).js` - скрипты уровня коллекции
(Pre-request и Post-response). Скопировать вручную или командой:

```
python tools/sync_collection.py ../Postman/postman/collections/BFF-Admin
```

В запросе - одна строка привязки, дальше только вызовы функций с параметрами:

```js
// Pre-request
const { login, pick } = utils.bind(pm, console);
login("sid");
pick("documentId", "/api/documents", "id", { status: "draft" });

// Post-response
const { test } = utils.bind(pm, console);
test("status", 200);
test("schema", "Layout");
test("session", "{{sid}}", "ALIVE");
```

Почему `utils.bind(pm, console)`: функции коллекции видят собственный `pm`, и их `pm.test` / `console.log`
в интерфейсе не отображаются. Запрос передаёт свой `pm` - и все проверки, логи и дополнительные запросы идут через него.

Примеры всех вызовов: `After Responce (usage).js`, `Before Responce (usage).js`.

Переменные окружения, которые использует фреймворк:

| Переменная | Назначение |
|---|---|
| `baseUrl` | адрес API |
| `AdminAccounts` | JSON `[{"login","password","role"?}]`; тестам с двумя учётками нужны 2 разных логина |
| `allowWrite` | `true` - разрешить no-op записи (отправка текущего значения обратно) |
| `allowDestructive` | `true` - разрешить смену пароля (с возвратом), публикацию, блокировку учётки |
| `LockoutAccount` | JSON `{"login","password"}` отдельной учётки для тестов блокировки |
| `bruteForceLimit` | порог блокировки (по умолчанию 10) |
| `RoleMatrix` | JSON `{"<METHOD> <path>": ["root"]}` для ролевой матрицы |
| `sessionIdleTimeoutSec` | тайм-аут бездействия сессии (долгий тест) |
| `enumTimingToleranceMs` | допуск разницы времени ответа (по умолчанию 150) |
| `isProduction` | `true` - проверять, что документация API скрыта |
| `safeFailedLogins` | безопасный лимит неудачных входов подряд на учётку из `AdminAccounts`; по достижении - тихий успешный вход (Login guard). Пусто или 0 - без защиты. **Строго меньше** лимита блокировки стенда (`accountLockoutLimit`) |
| `accountLockoutLimit`, `accountLockoutSec` | лимит неудачных входов стенда и время блокировки (для людей и `run.py`) |
| `accountUnlock` | описание пути разблокировки учёток стенда (для людей и `run.py`; фреймворк не использует) |
| `fw_failed_logins` | служебная: счётчики неудачных входов Login guard (JSON) |
| `TD-<КЛАСС>-NNNN`, `TDS-...` | тестовые значения по ссылке (Test-Library ADR 0009): в запросе `{{TD-SQLI-0001}}`, значения - окружение test-data (Postman - импорт `Test-Library/Api/test-data/build/test-data.postman_environment.json`, newman - подставляет движок). Ссылка без значения - запрос не отправляется, в консоли `TEST DATA MISSING` |
| `td_detect` | JSON `{ID: regexp}` - признаки срабатывания тестовых значений для `test("notExecuted")` (из того же окружения test-data / движка) |
| `fw_td_used` | служебная: какие значения `{{TD-...}}` ушли в запрос (для `test("notExecuted")`) |
| `mailApiBase` | адрес API почты стенда или перехватчика (Mailpit, MailHog), например `http://localhost:8025` - для `test("mail")` и шага `mail(...)`. Пусто - такие тесты падают «нет доступа: почта» (Test-Library `Process/collections.md` §4 «Тесты с доступом к инфраструктуре») |
| `mailApiKind` | `mailpit` (по умолчанию) или `mailhog` - формат API почты |
| `mailDomain` | домен тестовых адресов, письма на который попадают в почту `mailApiBase` (для адресов в тестах: `x@{{mailDomain}}`) |

Домен `baseUrl` нужно добавить в allowlist cookie jar (Cookies -> Domains Allowlist): тесты очищают jar,
чтобы запрос передавал только cookie из своего заголовка.

## Запуск без Postman (newman)

Фреймворк работает в newman без изменений (проверено 2026-10-12, newman 6.2.3): глобальный `utils` из скрипта
коллекции, `require("ajv" | "crypto-js" | "xml2js")`, `pm.sendRequest`, `pm.cookies.jar()` (allowlist доменов
в newman не нужен), `pm.execution.skipRequest`. Коллекции в формате YAML v3 перед запуском конвертируются в JSON v2.1 -
`postman/tools/run/` (там же драйвер newman и отчёт). Порядок запуска - `Test-Library/Process/running-tests.md`.

Ограничение: `test("session", ..., "ALIVE" | "DEAD")` проверяет сессию через `GET /api/auth/me`; если на стенде
этой ручки нет (старая версия), проверка падает во всех тестах, которые её используют.

## gRPC
Becouse grpc methods doesn't support common code - js code should be placed in each request : (

Примеры вызовов приведены в файле After Responce (usage). и на странице [[gRPC Usage]]
