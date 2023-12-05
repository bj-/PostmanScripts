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

function randomString(length=1) {
    // length = str length
    let randomString = "";
    for (let i = 0; i < length; i++){
        randomString += pm.variables.replaceIn("{{$randomAlphaNumeric}}");
    }
    return randomString;
}