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

// Usage randomVal
//console.log(randomVal("int", 5, 1000 , length=1))
//console.log(randomVal("SNILS_F"))
//console.log(randomVal("SNILS"))
//console.log(randomVal("INT", 1, 100))
//console.log(randomVal("TEXT", null, null, 100))
//console.log(randomVal("DATE", '1950-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z'));
//console.log(randomVal("DATE", '1950-01-01', '2020-01-01'));
//console.log(randomVal("DATETIME", '1950-01-01T00:00:00.000Z', '2020-01-01T00:00:00.000Z'));
//console.log(randomVal("DATETIME", '1950-01-01', '2020-01-01'));
//console.log(randomVal("BOOLEAN"));

function randomVal(type, min=null, max=null, length=1) {
    text = "Flat Earth is an archaic and scientifically disproven conception of the Earth's shape as a plane or disk. Many ancient cultures subscribed to a flat-Earth cosmography, notably including ancient near eastern cosmology. The model has undergone a recent resurgence as a conspiracy theory. The idea of a spherical Earth appeared in ancient Greek philosophy with Pythagoras (6th century BC). However, most pre-Socratics (6th–5th century BC) retained the flat-Earth model. In the early 4th century BC, Plato wrote about a spherical Earth. By about 330 BC, his former student Aristotle had provided strong empirical evidence for a spherical Earth. Knowledge of the Earth's global shape gradually began to spread beyond the Hellenistic world. By the early period of the Christian Church, the spherical view was widely held, with some notable exceptions. In contrast, ancient Chinese scholars consistently describe the Earth as flat, and this perception remained unchanged until their encounters with Jesuit missionaries in the 17th century.[6] Traditionalist Muslim scholars have maintained that the earth is flat, though, since the 9th century, Muslim scholars tended to believe in a spherical Earth. It is a historical myth that medieval Europeans generally thought the Earth was flat.[9] This myth was created in the 17th century by Protestants to argue against Catholic teachings.[10] More recently, flat earth theory has seen an increase in popularity with modern flat Earth societies, and unaffiliated individuals using social media. Despite the scientific facts and obvious effects of Earth's sphericity, pseudoscientific[13] flat-Earth conspiracy theories persist. In a 2018 study reported on by Scientific American, only 82% of 18 to 24 year old respondents agreed with the statement I have always believed the world is round. However, a firm belief in a flat Earth is rare, with less than 2% acceptance in all age groups."
    // length = str length
    let randomString = "";
    switch (type.toUpperCase())
    {
        case ("INT"):
            randomString = Math.floor(Math.random() * (max - min + 1)) + min;
            break;
        case ("INN"):
            randomString = Math.floor(Math.random() * (999999999999 - 100000000000 + 1)) + 100000000000;
            break;
        case ("SNILS_F"):
            randomString = (Math.floor(Math.random() * (999 - 100 + 1)) + 100) + "-" + (Math.floor(Math.random() * (999 - 100 + 1)) + 100) + "-" + (Math.floor(Math.random() * (999 - 100 + 1)) + 100) + " " + (Math.floor(Math.random() * (99 - 10 + 1)) + 10) ;
            break;
        case ("SNILS"):
            randomString = (Math.floor(Math.random() * (99999999999 - 10000000000 + 1)) + 10000000000);
            break;
        case ("STRING"):
            for (let i = 0; i < length; i++)
            {
                randomString += pm.variables.replaceIn("{{$randomAlphaNumeric}}");
            }
            break;
        case ("DATE"):
            randomString = getRandomDateTime(new Date(min), new Date(max))
            randomString = randomString.toISOString()
            randomString = randomString.substring(0,10)
            break;
        case ("DATETIME"):
            randomString = getRandomDateTime(new Date(min), new Date(max))
            randomString = randomString.toISOString()
            break;
        case ("TEXT"):
            tStart = Math.floor(Math.random() * (text.length - length + 1) + length);
            //console.log(tStart)
            //console.log(length)
            //randomString = text.substring(tStart, length);
            randomString = text.substring(tStart, tStart + length);
            break;
        case ("BOOLEAN"):
            randomString = ( (Math.floor(Math.random() * (2)) ) > 0 ) ? true : false;
            break;
        default:
            randomString = "NoRandom";
    }
    return randomString;
}


// internal functions
function getRandomDateTime(from, to) {
    from = from.getTime();
    to = to.getTime();
    return new Date(from + Math.random() * (to - from));
}