// =====================================================================
// Before Request - единый файл для скрипта уровня КОЛЛЕКЦИИ (Pre-request)
// (объединены бывшие common + script: фасад utils сверху, реализация ниже)
// Функции ничего не пишут в консоль (она не показывается из подключаемого кода).
// Ошибки настройки - через throw: исключение видно в интерфейсе Postman.
// =====================================================================

// Фасад: именно его вызывают скрипты запросов (utils.convert(...), utils.getAdminAccountCreds() и т.д.)
utils = {
  convert: function (dest, var_space, src_var, target_var) { return convert(dest, var_space, src_var, target_var); },
  randomVal: function (type, min = null, max = null, length = 1) { return randomVal(type, min, max, length); },
  randomString: function (length = 1) { return randomString(length); },
  getAdminAccountCreds: function () { return getAdminAccountCreds(); }
};

// ============== Functions ===============

// Кодирует переменную и кладёт результат в целевую; возвращает закодированное значение
function convert(dest, var_space, src_var, target_var)
{
    let src_val;
    switch (var_space)
    {
        case "collection": src_val = pm.collectionVariables.get(src_var); break;
        case "env":        src_val = pm.environment.get(src_var); break;
        default: throw new Error("convert: unsupported variable space [" + var_space + "]");
    }
    if (src_val === undefined || src_val === null)
        throw new Error("convert: variable [" + src_var + "] is not set in [" + var_space + "]");

    let encoded;
    if (String(dest).toLowerCase() === "base64")
    {
        const CryptoJS = require("crypto-js");
        encoded = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(String(src_val)));
    }
    else
    {
        throw new Error("convert: unsupported destination [" + dest + "]");
    }

    if (var_space === "env") pm.environment.set(target_var, encoded);
    else pm.collectionVariables.set(target_var, encoded);
    return encoded;
}

function randomString(length = 1)
{
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let s = "";
    for (let i = 0; i < length; i++) s += chars.charAt(Math.floor(Math.random() * chars.length));
    return s;
}

// Usage: см. "Before Responce (usage).js"
var FW_RANDOM_TEXT = "Flat Earth is an archaic and scientifically disproven conception of the Earth's shape as a plane or disk. Many ancient cultures subscribed to a flat-Earth cosmography, notably including ancient near eastern cosmology. The model has undergone a recent resurgence as a conspiracy theory. The idea of a spherical Earth appeared in ancient Greek philosophy with Pythagoras (6th century BC). However, most pre-Socratics (6thľ5th century BC) retained the flat-Earth model. In the early 4th century BC, Plato wrote about a spherical Earth. By about 330 BC, his former student Aristotle had provided strong empirical evidence for a spherical Earth. Knowledge of the Earth's global shape gradually began to spread beyond the Hellenistic world. By the early period of the Christian Church, the spherical view was widely held, with some notable exceptions. In contrast, ancient Chinese scholars consistently describe the Earth as flat, and this perception remained unchanged until their encounters with Jesuit missionaries in the 17th century.[6] Traditionalist Muslim scholars have maintained that the earth is flat, though, since the 9th century, Muslim scholars tended to believe in a spherical Earth. It is a historical myth that medieval Europeans generally thought the Earth was flat.[9] This myth was created in the 17th century by Protestants to argue against Catholic teachings.[10] More recently, flat earth theory has seen an increase in popularity with modern flat Earth societies, and unaffiliated individuals using social media. Despite the scientific facts and obvious effects of Earth's sphericity, pseudoscientific[13] flat-Earth conspiracy theories persist. In a 2018 study reported on by Scientific American, only 82% of 18 to 24 year old respondents agreed with the statement I have always believed the world is round. However, a firm belief in a flat Earth is rare, with less than 2% acceptance in all age groups.";

function randomVal(type, min = null, max = null, length = 1)
{
    const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
    switch (String(type).toUpperCase())
    {
        case "INT":
            return rnd(min === null ? 0 : min, max === null ? 100 : max);
        case "INN":
            return rnd(100000000000, 999999999999);
        case "SNILS_F":
            return rnd(100, 999) + "-" + rnd(100, 999) + "-" + rnd(100, 999) + " " + rnd(10, 99);
        case "SNILS":
            return rnd(10000000000, 99999999999);
        case "STRING":
            return randomString(length);
        case "DATE":
            return getRandomDateTime(new Date(min), new Date(max)).toISOString().substring(0, 10);
        case "DATETIME":
            return getRandomDateTime(new Date(min), new Date(max)).toISOString();
        case "TEXT":
        {
            const start = rnd(0, Math.max(0, FW_RANDOM_TEXT.length - length));
            return FW_RANDOM_TEXT.substring(start, start + length);
        }
        case "BOOLEAN":
            return Math.random() >= 0.5;
        default:
            return "NoRandom";
    }
}

// internal functions
function getRandomDateTime(from, to)
{
    from = from.getTime();
    to = to.getTime();
    return new Date(from + Math.random() * (to - from));
}

// Учётка администратора из env-переменной AdminAccounts (JSON-массив [{login, password}]) - случайная
function getAdminAccountCreds()
{
    const raw = pm.environment.get("AdminAccounts");
    if (!raw) throw new Error("Environment variable [AdminAccounts] is not set");

    let accounts;
    try { accounts = JSON.parse(raw); }
    catch (e) { throw new Error("[AdminAccounts] is not valid JSON: " + e.message); }
    if (!Array.isArray(accounts) || accounts.length === 0)
        throw new Error("[AdminAccounts] must be a non-empty array of {login, password}");

    const acc = accounts[Math.floor(Math.random() * accounts.length)];
    if (!acc.login || !acc.password)
        throw new Error("[AdminAccounts] item must have [login] and [password]");
    return { login: acc.login, password: acc.password };
}
