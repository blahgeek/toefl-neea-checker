const puppeteer = require('puppeteer');
const captchaSolver = require('2captcha');
const sleep = require('await-sleep');
const Push = require('pushover-notifications');

captchaSolver.setApiKey(process.env.CAPTCHA_APIKEY);

function solve(url) {
    return new Promise((resolve, reject) => {
        try {
            captchaSolver.decodeUrl(url, {retries: 5, pollingInterval: 2000}, function(err, result /*, invalid */) {
                if (err || result === undefined) {
                    console.warn('Cannot solve captcha');
                    reject(err);
                } else {
                    console.info(`Solved captcha: ${result.text}`);
                    resolve(result.text);
                }
            });
        } catch (e) {
            reject("");
        }
    });
}

var pushover = new Push({
    user: process.env.PUSHOVER_USER,
    token: process.env.PUSHOVER_TOKEN,
});

const toefl_user = process.env.TOEFL_USER;
const toefl_passwd = process.env.TOEFL_PASSWD;

class Toefl {

    async init() {
        console.info(`Launching browser...`);

        const args = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            '--window-position=0,0',
            '--ignore-certifcate-errors',
            '--ignore-certifcate-errors-spki-list',
            '--user-agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_12_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/65.0.3312.0 Safari/537.36"'
        ];

        const options = {
            args,
            headless: false,
            ignoreHTTPSErrors: true,
            // userDataDir: './tmp'
        };

        this.browser = await puppeteer.launch(options);
        await this.reopen_page();
    }

    async reopen_page() {
        if (this.page)
            await this.page.close();
        this.page = await this.browser.newPage();
        // WTF!
        await this.page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => false,
            });
        });
        this.page.setDefaultNavigationTimeout(100000);
        this.page.setDefaultTimeout(5000);
        await this.page.goto('http://toefl.neea.cn/', {waitUntil: 'networkidle0'});
    }


    async destroy() {
        console.info('Destroying browser...');
        if (this.browser)
            await this.browser.close();
    }

    async ensure_login(username, password) {
        console.info(`Trying to log in as ${username}`);
        await this.page.goto('http://toefl.neea.cn/login', {waitUntil: 'networkidle0'});
        // await sleep(3000);
        if ((await this.page.content()).indexOf(username) !== -1) {
            console.info(`Already logged in as ${username}, continue`);
            return;
        }
        await this.page.type('#userName', username);
        await this.page.type('#textPassword', password);
        await this.page.click('#verifyCode');
        await this.page.waitForFunction(() => {
            return document.querySelector('#chkImg').src.indexOf(".jpg") !== -1;
        });
        // await this.page.waitFor('#chkImg[src]');
        const imgUrl = await this.page.evaluate(() => {
            return document.querySelector('#chkImg').src;
        });
        console.info(`Captcha: ${imgUrl}`);
        const captchaText = await solve(imgUrl);
        await this.page.type('#verifyCode', captchaText);
        await Promise.all([
            this.page.waitForNavigation(),
            this.page.click('#btnLogin'),
        ]);
    }

    async query_seat(city, date) {
        console.info(`Querying ${city} ${date}`);
        await this.page.goto(`https://toefl.neea.cn/myHome/${toefl_user}/index#!/testSeat`, {waitUntil: 'networkidle0'})
        await this.page.waitFor('#centerProvinceCity');
        await this.page.select('#centerProvinceCity', city);
        await this.page.select('#testDays', date);
        const oldContent = await this.page.evaluate(() => {
            return document.querySelector('#qrySeatResult').textContent.trim();
        });
        await this.page.click('#btnQuerySeat');
        await this.page.waitFor((oldContent) => {
            let newContent = document.querySelector('#qrySeatResult').textContent.trim();
            return newContent != oldContent;
        }, {}, oldContent);
        await sleep(200);
        const naCount = await this.page.evaluate(() => {
            let s = document.querySelector('#qrySeatResult').textContent.trim();
            return (s.match(/名额暂满/g) || []).length;
        });
        const allCnt = await this.page.evaluate(() => {
            return document.querySelector('#qrySeatResult').querySelectorAll('tbody tr').length;
        });
        console.info(`RESULT: ${allCnt}, ${naCount}`);
        return allCnt > naCount;
    }

}


(async () => {
    let DATE_CITIES = [
        ["2019-07-13", "BEIJING"], ["2019-07-13", "TIANJIN"], ["2019-07-13", "SHIJIAZHUANG"],
    ];

    while(true) {
        let toefl = new Toefl();
        try {
            await toefl.init();
            await toefl.ensure_login(toefl_user, toefl_passwd);
            await sleep(1000);
            while (true) {
                let errCnt = 0;
                for (let date_and_city of DATE_CITIES) {
                    let date = date_and_city[0];
                    let city = date_and_city[1];

                    let available = false;
                    try {
                        available = await toefl.query_seat(city, date);
                    } catch (e) {
                        console.error(e);
                        console.error('Query error');
                        errCnt += 1;
                    }
                    if (available) {
                        pushover.send({
                            message: `TOEFL ${city} ${date} AVAILABLE!`,
                            priority: 1,
                        }, function(err, result) {
                            if (err) {
                                console.error(err);
                            }
                            console.log(result);
                        });
                    }
                    await sleep(3000 + Math.random() * 2000);
                    // await toefl.reopen_page();
                    // await sleep(2000);
                }
                if (errCnt * 2 > DATE_CITIES.length) {
                    throw new Error("TOO MUCH ERROR");
                }
            }
        } catch (e) {
            console.error(e);
            console.error('FATAL ERROR, RESTART');
        } finally {
            await toefl.destroy();
        }
        await sleep(10000);
    }
})()
