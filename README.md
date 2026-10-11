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
pick("layoutId", "/api/layouts", "id", { status: "draft" });

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

Домен `baseUrl` нужно добавить в allowlist cookie jar (Cookies -> Domains Allowlist): тесты очищают jar,
чтобы запрос передавал только cookie из своего заголовка.

## gRPC
Becouse grpc methods doesn't support common code - js code should be placed in each request : (

Примеры вызовов приведены в файле After Responce (usage). и на странице [[gRPC Usage]]
