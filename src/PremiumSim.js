// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: pink; icon-glyph: broadcast-tower;
// share-sheet-inputs: plain-text;

/*****************
Version 1.0.0

If you have problems or need help, please ask for support here:
https://github.com/BergenSoft/scriptable_premiumsim


credits:
https://github.com/chaeimg/battCircle/blob/main/battLevel.js
*/


// How many minutes should the cache be used
let m_CacheMinutes = 60;

// Styles
const m_CanvSize = 200;
const m_CanvTextSize = 16;

const m_CanvFillColorMonth = '#EDEDED';
const m_CanvFillColorDataGood = '#1AE01A';
const m_CanvFillColorDataOK = '#E0E01A';
const m_CanvFillColorDataBad = '#E01A1A';
const m_CanvStrokeColor = '#121212'; // Circles background color
const m_CanvBackColor = '#242424';   // Widget background color
const m_CanvTextColor = '#FFFFFF';   // Text color (use same color as above to hide text)

// Dimensions of the circles
const m_CanvWidth = 9;
const m_CanvRadiusMonth = 80;
const m_CanvRadiusData = 70;

// Used to draw the circles
const m_Canvas = new DrawContext();


// Used URLS
const m_LoginPageUrl = "https://service.premiumsim.de";
const m_LoginUrl = "https://service.premiumsim.de/public/login_check";
const m_StartUrl = "https://service.premiumsim.de/start";

// For processing the requests
let m_Cookies = { "isCookieAllowed": "true" };
let m_Sid = null;
let m_Csrf_token = null;

// Usage data
let m_Data = {
    bytes: 0,
    percent: 0,
    total: 0
};

// Used for comparing caching date and to calculate month progress
const m_Today = new Date();
const m_MonthStart = new Date(m_Today.getFullYear(), m_Today.getMonth(), 1);
const m_MonthEnd = new Date(m_Today.getFullYear(), m_Today.getMonth() + 1, 1);

// Set up the file manager.
const m_Filemanager = FileManager.local()

// Set up cache
const m_CachePath = m_Filemanager.joinPath(m_Filemanager.documentsDirectory(), Script.name() + "on"); // json file ("js" + "on")
const m_CacheExists = m_Filemanager.fileExists(m_CachePath)
const m_CacheDate = m_CacheExists ? m_Filemanager.modificationDate(m_CachePath) : 0


// Parse widget input
const widgetParameterRAW = args.widgetParameter;
let username, password;

if (widgetParameterRAW !== null)
{
    [username, password] = widgetParameterRAW.toString().split("|");

    if (!username || !password)
    {
        throw new Error("Invalid Widget parameter. Expected format: username|password")
    }
}
else if (config.runsInWidget)
{
    throw new Error("Widget parameter missing. Expected format: username|password")
}

try
{
    if (!m_CacheExists || (m_Today.getTime() - m_CacheDate.getTime()) > (m_CacheMinutes * 60 * 1000) || !loadDataFromCache())
    {
        // Load from website
        await prepareLoginData();
        await getDataUsage();
        saveDataToCache();
    }
}
catch (e)
{
    console.error(e);
    // Could not load from website, so load from cache
    loadDataFromCache();
}

await createWidget();
Script.complete();


async function getDataUsage()
{
    // Post login data
    let req = new Request(m_LoginUrl);
    req.method = 'POST';

    req.headers = {
        'Cookie': getCookiesString(),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:72.0) Gecko/20100101 Firefox/72.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Origin': m_LoginPageUrl,
        'Connection': 'keep-alive',
        'Referer': m_LoginPageUrl,
        'Upgrade-Insecure-Requests': '1',
        'TE': 'Trailers'
    };

    req.body = "_SID=" + m_Sid + "&UserLoginType%5Balias%5D=" + username + "&UserLoginType%5Bpassword%5D=" + password + "&UserLoginType%5Blogindata%5D=&UserLoginType%5Bcsrf_token%5D=" + m_Csrf_token;

    req.onRedirect = function (request)
    {
        return null;
    }

    var resp = await req.loadString();
    appendCookies(req.response.cookies);

    if (req.response.statusCode == 302 && req.response.headers["Location"] == "/start")
    {
        req = new Request(m_StartUrl);

        req.headers = {
            'Cookie': getCookiesString(),
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:72.0) Gecko/20100101 Firefox/72.0',
            'Origin': m_LoginPageUrl,
            'Connection': 'keep-alive',
            'Referer': m_LoginPageUrl,
            'Upgrade-Insecure-Requests': '1',
            'TE': 'Trailers'
        };
        resp = await req.loadString();

        let dataUsageBytes = getSubstring(resp, ['class="dataUsageOverlay"', '<div class="line">'], '</div>').trim();
        let dataUsagePercent = getSubstring(resp, ['class="dataUsageOverlay"', '<div class="line">', '<div class="line">'], '</div>').trim();

        dataUsageBytes = dataUsageBytes.replace(",", ".");
        dataUsagePercent = dataUsagePercent.replace(",", ".");

        if (dataUsageBytes.indexOf('GB') !== -1)
            dataUsageBytes = parseFloat(dataUsageBytes.substr(0, dataUsageBytes.length - 2)) * 1024 * 1024 * 1024;
        else if (dataUsageBytes.indexOf('MB') !== -1)
            dataUsageBytes = parseFloat(dataUsageBytes.substr(0, dataUsageBytes.length - 2)) * 1024 * 1024;
        else if (dataUsageBytes.indexOf('KB') !== -1)
            dataUsageBytes = parseFloat(dataUsageBytes.substr(0, dataUsageBytes.length - 2)) * 1024;
        else if (dataUsageBytes.indexOf('B') !== -1)
            dataUsageBytes = parseFloat(dataUsageBytes.substr(0, dataUsageBytes.length - 1));

        dataUsagePercent = parseFloat(dataUsagePercent.substr(0, dataUsagePercent.length - 1));
        dataUsageBytes = parseInt(dataUsageBytes);

        m_Data.bytes = dataUsageBytes;
        m_Data.percent = dataUsagePercent;
        m_Data.total = Math.round(m_Data.bytes / 1024 / 1024 / 1024 / m_Data.percent * 100);

        console.log(m_Data.total + " GB");
        console.log(dataUsageBytes);
        console.log(dataUsagePercent);
        return;
    }


    let view = new WebView();
    view.loadHTML(resp);
    await view.present();


}

async function prepareLoginData()
{
    // Get login page
    let req;
    req = new Request(m_LoginPageUrl);
    req.method = 'GET';
    req.headers = {
        'Cookie': getCookiesString(),
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:72.0) Gecko/20100101 Firefox/72.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'TE': 'Trailers'
    };

    var resp = await req.loadString();

    appendCookies(req.response.cookies);

    m_Csrf_token = getSubstring(resp, ['UserLoginType_csrf_token', 'value="'], "\"");

    // Get sid
    m_Sid = m_Cookies["_SID"];
}

function getCookiesString()
{
    let CookieValues = Object.entries(m_Cookies).map(function (v)
    {
        return v[0] + "=" + v[1];
    });

    result = CookieValues.join('; ');

    return result;
}

function appendCookies(newCookies)
{
    newCookies.map(function (v)
    {
        m_Cookies[v.name] = v.value;
        return null;
    });
}

function getSubstring(input, lookfor, lookUntil)
{
    lookfor.forEach(look =>
    {
        input = input.substr(input.indexOf(look) + look.length);
    });

    return input.substr(0, input.indexOf(lookUntil));
}

function saveDataToCache()
{
    try
    {
        m_Filemanager.writeString(m_CachePath, JSON.stringify(m_Data))
        return true;
    }
    catch (e)
    {
        console.warn("Could not create the cache file.")
        console.warn(e)
        return false;
    }
}

function loadDataFromCache()
{
    try
    {
        m_Data = JSON.parse(m_Filemanager.readString(m_CachePath));
        return true;
    }
    catch (e)
    {
        console.warn("Could not load the cache file.")
        console.warn(e)
        return false;
    }
}

async function createWidget()
{
    const wig = new ListWidget();

    m_Canvas.size = new Size(m_CanvSize, m_CanvSize);
    m_Canvas.respectScreenScale = true;

    let bgc = new Rect(0, 0, m_CanvSize, m_CanvSize);
    m_Canvas.setFillColor(new Color(m_CanvBackColor));
    m_Canvas.fill(bgc);

    const percentMonth = 0.9;//(m_Today.getTime() - m_MonthStart.getTime()) / (m_MonthEnd.getTime() - m_MonthStart.getTime());
    const fillColorData = (m_Data.percent / 100 <= percentMonth) ? m_CanvFillColorDataGood : ((m_Data.percent / 100 / 1.1 <= percentMonth) ? m_CanvFillColorDataOK : m_CanvFillColorDataBad);


    drawArc(
        new Point(m_CanvSize / 2, m_CanvSize / 2),
        m_CanvRadiusMonth,
        m_CanvWidth,
        percentMonth * 100 * 3.6,
        m_CanvFillColorMonth
    );
    drawArc(
        new Point(m_CanvSize / 2, m_CanvSize / 2),
        m_CanvRadiusData,
        m_CanvWidth,
        m_Data.percent * 3.6,
        fillColorData
    );

    const canvTextRectBytes = new Rect(
        0,
        m_CanvSize / 2 - m_CanvTextSize,
        m_CanvSize,
        m_CanvTextSize * 2
    );
    const canvTextRectPercent = new Rect(
        0,
        m_CanvSize / 2,
        m_CanvSize,
        m_CanvTextSize * 2
    );
    m_Canvas.setTextAlignedCenter();
    m_Canvas.setTextColor(new Color(m_CanvTextColor));
    m_Canvas.setFont(Font.boldSystemFont(m_CanvTextSize));
    m_Canvas.drawTextInRect(`${Math.round(m_Data.bytes / 1024 / 1024 / 1024 * 10) / 10} / ${m_Data.total} GB`, canvTextRectBytes);
    m_Canvas.drawTextInRect(`${m_Data.percent} %`, canvTextRectPercent);

    const canvImage = m_Canvas.getImage();
    wig.backgroundImage = canvImage;
    Script.setWidget(wig);
    Script.complete();
    await wig.presentSmall();
}


function sinDeg(deg)
{
    return Math.sin((deg * Math.PI) / 180);
}

function cosDeg(deg)
{
    return Math.cos((deg * Math.PI) / 180);
}

function drawArc(ctr, rad, w, deg, fillColor)
{
    let bgx = ctr.x - rad;
    let bgy = ctr.y - rad;
    let bgd = 2 * rad;
    let bgr = new Rect(bgx, bgy, bgd, bgd);

    m_Canvas.setFillColor(new Color(fillColor));
    m_Canvas.setStrokeColor(new Color(m_CanvStrokeColor));
    m_Canvas.setLineWidth(w);
    m_Canvas.strokeEllipse(bgr);

    for (t = 0; t < deg; t++)
    {
        rect_x = ctr.x + rad * sinDeg(t) - w / 2;
        rect_y = ctr.y - rad * cosDeg(t) - w / 2;
        rect_r = new Rect(rect_x, rect_y, w, w);
        m_Canvas.fillEllipse(rect_r);
    }
}