// =====================================================================
// After Response — единый файл для скрипта уровня КОЛЛЕКЦИИ (Post-response)
// (объединены бывшие common + script: фасад utils сверху, реализация ниже)
//
// ПРАВИЛО: код здесь НЕ вызывает pm.test() и console.log() — Postman не
// показывает их вывод, если они вызваны из подключаемой функции.
// Каждая функция только считает и ВОЗВРАЩАЕТ объект результата:
//   { Msg: [], Result: "", Assert: null, Silent: false, Value: undefined, Var: null }
//     Result - заголовок pm.test
//     Assert - текст ошибки (null = тест пройден)
//     Silent - true: показывать тест только при падении
//     Msg    - строки для console.log (печатает запрос)
//     Value/Var - для setvar (переменную выставляет запрос)
// pm.test / console.log / pm.*.set выполняет функция report() внутри запроса
// (см. After Responce (usage).js).
// =====================================================================

// Фасад: именно его вызывают скрипты запросов (utils.test(...), utils.check(...) и т.д.)
utils = {
  statusCode:   function (code) { return statusCode(code); },
  test:         function (path, exp, type, silent) { return test(path, exp, type, silent); },
  check:        function (parameter, exp, type, silent) { return check(parameter, exp, type, silent); },
  header:       function (name, exp, type, silent) { return header(name, exp, type, silent); },
  schema:       function (schemaObj, silent) { return schema(schemaObj, silent); },
  basictests:   function (code) { return basictests(code); },
  setvar:       function (varName, path, space) { return setvar(varName, path, space); },
  getvar:       function (varName, space = "collection") { return getvar(varName, space); },
  randomString: function (length = 1) { return randomString(length); },
};


// ============== Constants ===============
var FW_GUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
var FW_CERT_RE = /^[0-9a-fA-F]{40}$/;
var FW_DATETIME_FORMATS = {
  "YYYY-MM-DDThh:mm:ss.tttZ": /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{1,3}Z$/,
  "YYYY-MM-DDThh:mm:ssZ":     /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/,
  "YYYY-MM-DD":               /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/,
};


// ============== Public API ===============

// Проверка значения в теле ответа по пути (a.b[0].c | [0].a | "" - корень)
function test(path, exp, type, silent = false)
{
    const r = newResult(silent);
    const pathF = String(path).replace(".", ": ") + ":";
    r.Result = (String(type).toUpperCase().substring(0, 5) === "ARRAY")
        ? "Array [" + pathF + "]"
        : "Property [" + pathF + "] has value: ";

    const body = readBody(r);
    if (!body.ok) return r;

    const g = getByPath(body.data, path);
    if (!g.found)
    {
        if (String(exp) === "KEY_NOT_EXIST")
        {
            r.Result = "Property [" + path + "] does not exist as expected";
            return r;
        }
        r.Result = "Variable [" + path + "] is undefined";
        r.Assert = "Please check Response Body";
        return r;
    }

    compare(r, g.value, exp, type);
    return r;
}

// Проверка служебных параметров ответа: statusCode | responseTime | contentLength
function check(parameter, exp, type, silent = false)
{
    const r = newResult(silent);
    let val;
    switch (parameter)
    {
        case "statusCode":
            val = pm.response.code;
            r.Result = "Status code is ";
            break;
        case "responseTime":
            val = pm.response.responseTime;
            r.Result = "Response Time is ";
            break;
        case "contentLength":
            val = pm.response.headers.get("Content-Length");
            r.Result = "Content Length is ";
            break;
        default:
            r.Result = "UNEXPECTED parameter [" + parameter + "]";
            r.Assert = "Supported: statusCode | responseTime | contentLength";
            r.Silent = false;
            return r;
    }
    compare(r, val, exp, type);
    return r;
}

// Проверка заголовка ответа
function header(name, exp, type, silent = false)
{
    const r = newResult(silent);
    const val = pm.response.headers.get(name);
    if (val === undefined || val === null)
    {
        if (String(exp) === "KEY_NOT_EXIST")
        {
            r.Result = "Header [" + name + "] does not exist as expected";
            return r;
        }
        r.Result = "Header [" + name + "] is undefined";
        r.Assert = "Header is missing in response";
        r.Silent = false;
        return r;
    }
    r.Result = "Header [" + name + "] has value: ";
    compare(r, val, exp, type);
    return r;
}

// Статус-код: по умолчанию 200 (REST) или 0 (gRPC). Тихий, виден только при падении.
function statusCode(code = null)
{
    const r = newResult(true);
    const expected = (code !== null && code !== undefined) ? code : (getContentType() === "grpc" ? 0 : 200);
    r.Result = "Status code is [" + pm.response.code + "]";
    if (pm.response.code != expected) r.Assert = "Expected [" + expected + "]";
    return r;
}

// Базовые тесты: статус-код + Content-Type. Возвращает МАССИВ результатов.
function basictests(code = null)
{
    const sc = statusCode(code);
    sc.Silent = false;
    const ct = newResult(false);
    ct.Result = "Content-Type is ";
    compare(ct, pm.response.headers.get("Content-Type"), "/^application\\/(json|grpc)/", "regex");
    return [sc, ct];
}

// Валидация тела по JSON Schema (ajv есть в песочнице Postman; nullable из OpenAPI поддержан)
function schema(schemaObj, silent = false)
{
    const r = newResult(silent);
    r.Result = "Response body matches JSON schema";
    const body = readBody(r);
    if (!body.ok) return r;
    try
    {
        const Ajv = require("ajv");
        const ajv = new Ajv({ allErrors: true, nullable: true });
        const validate = ajv.compile(schemaObj);
        if (!validate(body.data))
        {
            r.Assert = validate.errors
                .map((e) => (e.dataPath || e.instancePath || "(root)") + " " + e.message)
                .join("; ");
        }
    }
    catch (e)
    {
        r.Assert = "Schema validation error: " + e.message;
    }
    return r;
}

// Читает значение из ответа. Переменную выставляет запрос (setVar в usage), а не библиотека.
function setvar(varName, path, space = "collection")
{
    const r = newResult(true);
    r.Result = "Variable [" + varName + "] is set from [" + path + "]";
    r.Var = { name: varName, space: space };

    const body = readBody(r);
    if (!body.ok) return r;

    const g = getByPath(body.data, path);
    if (!g.found)
    {
        r.Result = "Variable [" + path + "] is undefined";
        r.Assert = "Cannot set [" + varName + "]: path not found in response";
        return r;
    }
    r.Value = g.value;
    return r;
}

function getvar(varName, space = "collection")
{
    switch (String(space).toUpperCase())
    {
        case "ENV":   return pm.environment.get(varName);
        case "LOCAL": return pm.variables.get(varName);
        default:      return pm.collectionVariables.get(varName);
    }
}

function randomString(length = 1)
{
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let s = "";
    for (let i = 0; i < length; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
}


// ============== Comparison ===============

function compare(r, val, exp, type)
{
    const T = String(type).toUpperCase();

    // ---- scalar
    if (T === "EQL" && val == exp)
        return pass(r, "[" + show(val) + "] as expected");
    if (T === "BELOW" && val < exp)
        return pass(r, "[" + show(val) + "] below than [" + exp + "] as expected");
    if (T === "ABOVE" && val > exp)
        return pass(r, "[" + show(val) + "] above than [" + exp + "] as expected");

    if (T === "REGEX")
    {
        try
        {
            if (toRegExp(exp).test(String(val)))
                return pass(r, "[" + show(val) + "] by regex [" + exp + "] as expected");
        }
        catch (e)
        {
            return fail(r, "[" + show(val) + "]", "Invalid regex [" + exp + "]: " + e.message);
        }
        return fail(r, "[" + show(val) + "]", "Does not match regex [" + exp + "]");
    }

    // ---- arrays
    if (T.substring(0, 5) === "ARRAY" || T.slice(-12) === "_COUNT_ARRAY")
    {
        if (!Array.isArray(val))
            return fail(r, " is not an array: [" + show(val) + "]", "Expected array");
        const len = val.length;
        const n = parseInt(exp, 10);

        switch (T)
        {
            case "ARRAY_COUNT":
                return (len === n)
                    ? pass(r, " count is [" + exp + "] as expected")
                    : fail(r, " count is [" + len + "]", "Array length is [" + len + "], expected [" + exp + "]");

            case "ARRAY_COUNT_ABOVE":
            case "ABOVE_COUNT_ARRAY":
                return (len > n)
                    ? pass(r, " above than [" + exp + "] as expected")
                    : fail(r, " count is [" + len + "]", "Array length [" + len + "] is not above [" + exp + "]");

            case "ARRAY_COUNT_BELOW":
            case "BELOW_COUNT_ARRAY":
                return (len < n)
                    ? pass(r, " below than [" + exp + "] as expected")
                    : fail(r, " count is [" + len + "]", "Array length [" + len + "] is not below [" + exp + "]");

            case "ARRAY":
            {
                // exp = ["path.in.element", expectedValue]
                const idx = val.findIndex((el) => { const g = getByPath(el, exp[0]); return g.found && g.value == exp[1]; });
                if (idx >= 0)
                    return pass(r, " has value: [" + exp[1] + "] in property [" + exp[0] + "] as expected");
                const values = val.map((el) => getByPath(el, exp[0]).value);
                return fail(r, " has not value in elem [" + exp[0] + "]",
                    "Expected [" + exp[1] + "], to be one of [" + show(values, 200) + "]");
            }

            case "ARRAY_COMPARE_KEYSINEXP":
            case "ARRAY_COMPARE_EXPINKEYS":
            {
                if (!Array.isArray(exp)) return fail(r, "", "Expected value must be an array of keys");
                const respKeys = Array.from(new Set(val.flatMap((el) => (el && typeof el === "object") ? Object.keys(el) : [])));
                const keysInExp = (T === "ARRAY_COMPARE_KEYSINEXP");
                const from = keysInExp ? respKeys : exp;
                const into = keysInExp ? exp : respKeys;
                const where = keysInExp ? "exp list" : "response";
                const missing = from.filter((k) => !into.includes(k));
                return missing.length === 0
                    ? pass(r, " has keys [" + from.join(", ") + "] in " + where + " as expected")
                    : fail(r, " keys [" + from.join(", ") + "]", "Keys [" + missing.join(", ") + "] do not exist in " + where);
            }

            default:
                return fail(r, "", "Unknown array comparison type [" + type + "]");
        }
    }

    // ---- special expected tokens
    if (exp === "(RANDOM_GUID)")
        return FW_GUID_RE.test(String(val))
            ? pass(r, "(random guid) [" + show(val) + "] as expected")
            : fail(r, "[" + show(val) + "]", "Expected GUID format");

    if (exp === "(RANDOM_CERT)")
        return FW_CERT_RE.test(String(val))
            ? pass(r, "(random certificate) [" + show(val) + "] as expected")
            : fail(r, "[" + show(val) + "]", "Expected certificate thumbprint (40 hex chars)");

    if (exp === "(RANDOM_PROPERTY)")
        return pass(r, "[" + show(val) + "] as expected");

    if (exp === "(RANDOM_XML)")
    {
        let ok = false;
        try { require("xml2js").parseString(String(val), (err, res) => { ok = !err && !!res; }); } catch (e) { ok = false; }
        return ok
            ? pass(r, "(random XML) [" + show(val) + "] as expected")
            : fail(r, "(random XML)", "Value is not valid XML");
    }

    if (T === "DATETIME")
    {
        const re = FW_DATETIME_FORMATS[exp];
        if (!re) return fail(r, "[" + show(val) + "]", "Unsupported datetime format [" + exp + "]. Supported: " + Object.keys(FW_DATETIME_FORMATS).join(" | "));
        return re.test(String(val))
            ? pass(r, "[" + show(val) + "] and has format as expected [" + exp + "]")
            : fail(r, "[" + show(val) + "]", "Expected format [" + exp + "]");
    }

    if (exp === "NULL")
        return (val === null)
            ? pass(r, "[null] as expected")
            : fail(r, "[" + show(val) + "]", "Expected [null]");

    if (exp === "EMPTY")
    {
        const empty = (val === "") || (val !== null && typeof val === "object" && Object.keys(val).length === 0);
        return empty
            ? pass(r, "[EMPTY] as expected")
            : fail(r, "[" + show(val) + "]", "Expected empty value ('', {} or [])");
    }

    if (exp === "KEY_EXIST")
        return pass(r, "[" + show(val) + "] it is \"Not Empty or Does Exist\" as expected");

    if (exp === "KEY_NOT_EXIST")
        return fail(r, "[" + show(val) + "]", "Property must not exist, but it is in the response");

    // ---- mismatch
    switch (T)
    {
        case "ABOVE": return fail(r, "[" + show(val) + "]", "[" + show(val) + "] is not above expected [" + exp + "]");
        case "BELOW": return fail(r, "[" + show(val) + "]", "[" + show(val) + "] is not below expected [" + exp + "]");
        default:      return fail(r, "[" + show(val) + "]", "Expected [" + show(exp) + "]");
    }
}


// ============== Internal helpers ===============

function newResult(silent = false)
{
    return { Msg: [], Result: "", Assert: null, Silent: Boolean(silent), Value: undefined, Var: null };
}

function pass(r, text) { r.Result += text; r.Assert = null; return r; }
function fail(r, text, assert) { r.Result += text; r.Assert = assert; return r; }

// Короткое представление значения для заголовка теста
function show(v, max = 50)
{
    let s;
    if (typeof v === "string") s = v;
    else { try { s = JSON.stringify(v); } catch (e) { s = String(v); } }
    s = String(s);
    return s.length > max ? s.substring(0, max) + "..." : s;
}

// "/^abc$/i" | "abc" | RegExp -> RegExp
function toRegExp(exp)
{
    if (exp instanceof RegExp) return exp;
    const s = String(exp);
    const m = s.match(/^\/([\s\S]*)\/([a-z]*)$/);
    return m ? new RegExp(m[1], m[2]) : new RegExp(s);
}

// Безопасный (без eval) доступ по пути: a.b[0].c | [0].a | ["key.with.dot"] | ""
// found=false, если ключа нет (отличает "нет ключа" от "значение undefined/null")
function getByPath(obj, path)
{
    if (path === "" || path === null || path === undefined) return { found: true, value: obj };
    const tokens = [];
    String(path).replace(/\[(\d+)\]|\[["']([^"']+)["']\]|([^.\[\]]+)/g, (m, idx, quoted, name) => {
        tokens.push(idx !== undefined ? Number(idx) : (quoted !== undefined ? quoted : name));
        return m;
    });
    let cur = obj;
    for (const t of tokens)
    {
        if (cur === null || cur === undefined || typeof cur !== "object" || !(t in cur))
            return { found: false, value: undefined };
        cur = cur[t];
    }
    return { found: true, value: cur };
}

function getContentType()
{
    const h = pm.response.headers.get("Content-Type") || "";
    if (/^application\/([\w.+-]*\+)?json/i.test(h)) return "json";
    if (/^application\/grpc/i.test(h)) return "grpc";
    return h || "(none)";
}

// Читает тело ответа. При ошибке заполняет r и возвращает ok=false.
function readBody(r)
{
    const ct = getContentType();
    try
    {
        if (ct === "json") return { ok: true, data: pm.response.json() };
        if (ct === "grpc") return { ok: true, data: pm.response.messages.all()[0].data };
    }
    catch (e)
    {
        r.Result = "Cannot read response body";
        r.Assert = e.message;
        r.Silent = false;
        return { ok: false };
    }
    r.Result = "Unsupported Content-Type [" + ct + "]";
    r.Assert = "Expect JSON or gRPC";
    r.Silent = false;
    return { ok: false };
}


// ============== Obsolete (backward compatibility) ===============
function test_grpc(path, exp, type, silent)
{
    return test(path, exp, type, silent);
}
