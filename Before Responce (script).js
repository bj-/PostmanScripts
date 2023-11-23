// ============== Functions ===============
function convert(dest, var_space, src_var, target_var)
{
    switch (var_space)
    {
        case "collection":
            src_val = plainText = pm.collectionVariables.get(src_var)
    }
 
    if (dest == "base64")
    {
        const CryptoJS = require('crypto-js');
        var encoded = CryptoJS.enc.Base64.stringify(CryptoJS.enc.Utf8.parse(src_val))
    }
 
    switch (var_space)
    {
        case "collection":
            pm.collectionVariables.set(target_var, encoded);
    }
}