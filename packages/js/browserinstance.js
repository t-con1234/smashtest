const {Builder, By, Key, until} = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');
const firefox = require('selenium-webdriver/firefox');
const safari = require('selenium-webdriver/safari');
const ie = require('selenium-webdriver/ie');
const edge = require('selenium-webdriver/edge');
const fs = require('fs');
const path = require('path');
const readFiles = require('read-files-promise');
const sharp = require('sharp');
const request = require('request-promise-native');
const utils = require('../../utils.js');
const ElementFinder = require('./elementfinder.js');

class BrowserInstance {
    // ***************************************
    //  Static functions
    // ***************************************

    /**
     * Creates a new BrowserInstance and initializes global vars in runInstance
     * @return {BrowserInstance} The newly created BrowserInstance
     */
    static create(runInstance) {
        let browser = runInstance.g('browser', new BrowserInstance(runInstance));

        // Register this browser in the persistent array browsers
        // Used to kill all open browsers if the runner is stopped
        let browsers = runInstance.p("browsers");
        if(!browsers) {
            browsers = runInstance.p("browsers", []);
        }
        browsers.push(browser);
        runInstance.p("browsers", browsers);

        // Set commonly-used global vars
        runInstance.g('$', browser.$);
        runInstance.g('$$', browser.$$);
        runInstance.g('not$', browser.not$);

        runInstance.g('executeScript', browser.executeScript);
        runInstance.g('executeAsyncScript', browser.executeAsyncScript);

        runInstance.g('props', browser.props);
        runInstance.g('propsAdd', browser.propsAdd);
        runInstance.g('propsClear', browser.propsClear);
        runInstance.g('str', browser.str);

        runInstance.g('injectSinon', browser.injectSinon);
        runInstance.g('mockTime', browser.mockTime);
        runInstance.g('mockHttp', browser.mockHttp);
        runInstance.g('mockHttpConfigure', browser.mockHttpConfigure);
        runInstance.g('mockTimeStop', browser.mockTimeStop);
        runInstance.g('mockHttpStop', browser.mockHttpStop);
        runInstance.g('mockStop', browser.mockStop);

        return browser;
    }

    /**
     * Kills all open browsers
     */
    static async killAllBrowsers(runner) {
        let browsers = runner.p("browsers");
        if(browsers) {
            for(let i = 0; i < browsers.length; i++) {
                let browser = browsers[i];
                if(browser.driver) {
                    try {
                        await browser.driver.quit();
                    }
                    catch(e) {} // ignore errors

                    browser.driver = null;
                }
            }
        }
    }

    // ***************************************
    //  Browser actions
    // ***************************************

    constructor(runInstance) {
        this.driver = null;
        this.runInstance = runInstance;

        this.props = ElementFinder.defaultProps();  // ElementFinder props
    }

    /**
     * Opens the browser
     * See https://w3c.github.io/webdriver/#capabilities
     * @param {Object} [params] - Object containing parameters for this browser
     * @param {String} [params.name] - The name of the browser (e.g., chrome|firefox|safari|internet explorer|MicrosoftEdge)
     * @param {String} [params.version] - The version of the browser
     * @param {String} [params.platform] - The platform (e.g., linux|mac|windows)
     * @param {Number} [params.width] - The initial browser width, in pixels
     * @param {Number} [params.height] - The initial browser height, in pixels
     * @param {String} [params.deviceEmulation] - What mobile device to emulate, if any (overrides params.width and params.height, only works with Chrome)
     * @param {Boolean} [params.isHeadless] - If true, run the browser headlessly, if false do not run the browser headlessly, if not set, use headless unless we're debugging with ~
     * @param {String} [params.serverUrl] - The absolute url of the standalone selenium server, if we are to use one (e.g., http://localhost:4444/wd/hub)
     */
    async open(params) {
        if(!params) {
            params = {};
        }

        let options = {
            chrome: new chrome.Options(),
            firefox: new firefox.Options(),
            safari: new safari.Options(),
            ie: new ie.Options(),
            edge: new edge.Options()
        };

        // Browser name

        if(!params.name) {
            try {
                this.runInstance.findVarValue("browser name", false, true); // look for {browser name}, above or below
            }
            catch(e) {
                params.name = "chrome"; // defaults to chrome
            }
        }

        // Browser version

        if(!params.version) {
            try {
                this.runInstance.findVarValue("browser version", false, true); // look for {browser version}, above or below
            }
            catch(e) {}  // it's ok if the variable isn't found (simply don't set browser version)
        }

        // Browser platform

        if(!params.platform) {
            try {
                this.runInstance.findVarValue("browser platform", false, true); // look for {browser platform}, above or below
            }
            catch(e) {}
        }

        // Mobile device emulation (Chrome only)

        if(!params.deviceEmulation) {
            try {
                params.deviceEmulation = this.runInstance.findVarValue("device", false, true);
            }
            catch(e) {}
        }

        if(params.deviceEmulation) {
            options.chrome.setMobileEmulation({deviceName: params.deviceEmulation});
        }

        // Dimensions

        if(!params.width) {
            try {
                params.width = parseInt(this.runInstance.findVarValue("browser width", false, true)); // look for {browser width}, above or below
            }
            catch(e) {}
        }

        if(!params.height) {
            try {
                params.height = parseInt(this.runInstance.findVarValue("browser height", false, true)); // look for {browser height}, above or below
            }
            catch(e) {}
        }

        // Headless

        if(typeof params.isHeadless == 'undefined') {
            // Set isHeadless to true, unless we're debugging with ~
            params.isHeadless = (!this.runInstance.tree.isDebug || this.runInstance.tree.isExpressDebug) && !this.runInstance.runner.isRepl;

            // Override if --headless flag is set
            if(this.runInstance.runner.flags.hasOwnProperty("headless")) {
                let headlessFlag = this.runInstance.runner.flags.headless;
                if(headlessFlag === "true" || headlessFlag === "" || headlessFlag === undefined) {
                    params.isHeadless = true;
                }
                else if(headlessFlag === "false") {
                    params.isHeadless = false;
                }
                else {
                    throw new Error("Invalid --headless flag value. Must be true or false.");
                }
            }
        }

        if(params.isHeadless) {
            options.chrome.headless();
            options.firefox.headless();

            // NOTE: safari, ie, and edge don't support headless, so they will always run normally
        }

        // Server url

        if(!params.serverUrl) {
            // If serverUrl isn't set, look to the -selenium-server flag
            if(this.runInstance.runner.flags['selenium-server']) {
                params.serverUrl = this.runInstance.runner.flags['selenium-server'];
            }
        }

        // Log

        let logStr = `Starting browser '${params.name}'`;
        params.version && (logStr += `, version '${params.version}'`);
        params.platform && (logStr += `, platform '${params.platform}'`);
        params.deviceEmulation && (logStr += `, device '${params.deviceEmulation}'`);
        params.width && (logStr += `, width '${params.width}'`);
        params.height && (logStr += `, height '${params.height}'`);
        params.isHeadless && !['safari', 'internet explorer', 'MicrosoftEdge'].includes(params.name) && (logStr += `, headless mode`);
        params.serverUrl && (logStr += `, server url '${params.serverUrl}'`);

        this.runInstance.log(logStr);

        // Build the driver

        let builder = new Builder()
            .forBrowser(params.name, params.version, params.platform)
            .setChromeOptions(options.chrome)
            .setFirefoxOptions(options.firefox)
            .setSafariOptions(options.safari)
            .setIeOptions(options.ie)
            .setEdgeOptions(options.edge);

        if(params.serverUrl) {
            builder = builder.usingServer(params.serverUrl);
        }

        this.driver = await builder.build();

        // Resize to dimensions
        // NOTE: Options.windowSize() wasn't working properly
        if(params.width && params.height && !(params.name == 'chrome' && params.deviceEmulation)) {
            this.driver.manage().window().setRect({width: params.width, height: params.height});
        }
    }

    /**
     * Closes this browser
     */
    async close() {
        try {
            if(this.driver) {
                await this.driver.quit();
                this.driver = null;
            }
        }
        catch(e) {}

        let browsers = this.runInstance.p("browsers");
        for(let i = 0; i < browsers.length; i++) {
            if(browsers[i] === this) {
                browsers.splice(i, 1);
            }
        }
    }

    /**
     * Navigates the browser to the given url
     * @param {String} url - The absolute or relative url to navigate to. If relative, uses the browser's current domain. If http(s) is omitted, uses http://
     */
    async nav(url) {
        const URL_REGEX = /^(https?:\/\/)?([^\/]*\.[^\/]*(:[0-9]+)?)?(.*)/;
        let matches = url.match(URL_REGEX);

        let protocol = matches[1] || 'http://';
        let domain = matches[2];
        let path = matches[4];

        if(!domain) {
            let currUrl = await this.driver.getCurrentUrl();
            matches = currUrl.match(URL_REGEX);
            domain = matches[2];
            if(!domain) {
                throw new Error(`Cannot determine domain to navigate to. Either include a domain or have the browser already be at a page with a domain.`)
            }
        }

        url = protocol + domain + (path || '');

        await this.takeScreenshot(false);
        await this.driver.get(url);
        await this.takeScreenshot(true);
    }

    /**
     * Executes a script inside the browser
     * See executeScript() at https://seleniumhq.github.io/selenium/docs/api/javascript/module/selenium-webdriver/lib/webdriver_exports_WebDriver.html
     * @return {Promise} Promise that resolves to the script's return value
     */
    executeScript(script, ...args) {
        return this.driver.executeScript(script, ...args);
    }

    /**
     * Executes a script inside the browser
     * See executeAsyncScript() at https://seleniumhq.github.io/selenium/docs/api/javascript/module/selenium-webdriver/lib/webdriver_exports_WebDriver.html
     * @return {Promise} Promise that resolves to the script's return value
     */
    executeAsyncScript(script, ...args) {
        return this.driver.executeAsyncScript(script, ...args);
    }

    // ***************************************
    //  Screenshots
    // ***************************************

    /**
     * Takes a screenshot, stores it on disk, and attaches it to the report for the current step
     * @param {Boolean} [isAfter] If true, this screenshot occurs after the step's main action, false if it occurs before. You must have called this function with isAfter set to false prior to calling it with isAfter set to true.
     * param {Object} [targetCoords] - Object in form { x: <number>, y: <number> } representing the x,y coords of the target of the action
     */
    async takeScreenshot(isAfter, targetCoords) {
        // See if screenshot is allowed
        if(!this.runInstance.runner.reporter) {
            return;
        }
        if(!this.runInstance.runner.screenshots) {
            return;
        }
        if(this.runInstance.tree.stepDataMode == 'none') {
            return;
        }
        if(this.runInstance.runner.screenshotCount >= this.runInstance.runner.maxScreenshots && this.runInstance.runner.maxScreenshots != -1) {
            return;
        }
        if(!this.runInstance.currStep || !this.runInstance.currBranch) {
            return;
        }

        // Create smashtest/screenshots if it doesn't already exist
        const dir = 'smashtest/screenshots';
        if(!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }

        // Take screenshot
        let data = null;
        try {
            data = await this.driver.takeScreenshot();
        }
        catch(e) {} // fail silently

        if(!data) {
            return;
        }

        // Write screenshot to file
        let filename = `screenshots/${this.runInstance.currBranch.hash}_${this.runInstance.currBranch.steps.indexOf(this.runInstance.currStep) || `0`}_${isAfter ? `after` : `before`}.jpg`;
        await sharp(Buffer.from(data, 'base64'))
            .resize(1000)
            .jpeg({
                quality: 50
            })
            .toFile(`smashtest/${filename}`);

        // Include crosshairs in report
        if(targetCoords) {
            this.runInstance.currStep.targetCoords = targetCoords;
        }

        this.runInstance.runner.screenshotCount++;
    }

    /**
     * Clears the current branch's screenshots if the --step-data mode requires it
     */
    async clearUnneededScreenshots() {
        if(this.runInstance.tree.stepDataMode == 'fail' && !this.runInstance.currBranch.isFailed) { // NOTE: for stepDataMode of 'none', a screenshot wasn't created in the first place
            // Delete all screenshots with a filename that begins with the currBranch's hash
            const SMASHTEST_SS_DIR = 'smashtest/screenshots';
            let files = fs.readdirSync(SMASHTEST_SS_DIR);
            for(let file of files) {
                if(file.startsWith(this.runInstance.currBranch.hash)) {
                    fs.unlinkSync(path.join(SMASHTEST_SS_DIR, file));
                    this.runInstance.runner.screenshotCount--; // decrement screenshotCount for every screenshot deleted
                }
            }
        }
    }

    // ***************************************
    //  Elements
    // ***************************************

    /**
     * Finds the first element matching EF represented by efText. Waits up to timeout ms.
     * @param {String} efText - A string representing the EF to use
     * @param {Number} [timeout] - How many ms to wait before giving up (2000 ms if omitted)
     * @param {Boolean} [isContinue] - If true, and if an error is thrown, that error's continue will be set to true
     * @return {Promise} Promise that resolves to first WebDriver WebElement that was found
     * @throws {Error} If a matching element wasn't found in time, or if an element array wasn't properly matched in time
     */
    async $(efText, timeout, isContinue) {
        let ef = new ElementFinder(efText, this.props);
        let results = await ef.find(this.driver, undefined, false, isContinue, timeout || 2000);
        return results[0];
    }

    /**
     * Finds the elements matching EF represented by efText. Waits up to timeout ms.
     * Same params as in $()
     * If counter isn't set on efText, sets it to 1+
     * @return {Promise} Promise that resolves to Array of WebDriver WebElements that were found
     * @throws {Error} If matching elements weren't found in time, or if an element array wasn't properly matched in time
     */
    async $$(efText, timeout, isContinue) {
        let ef = new ElementFinder(efText, this.props);
        if(ef.counter.default) {
            ef.counter = { min: 1 };
        }

        let results = await ef.find(this.driver, undefined, false, isContinue, timeout || 2000);
        return results;
    }

    /**
     * Throws an error if the given element(s) don't disappear before the timeout
     * Same params as in $()
     * @return {Promise} Promise that resolves if the given element(s) disappear before the timeout
     * @throws {Error} If matching elements still found after timeout
     */
    async not$(efText, timeout, isContinue) {
        let ef = new ElementFinder(efText, this.props);
        await ef.find(this.driver, undefined, true, isContinue, timeout || 2000);
    }

    /**
     * Sets the definition of the given EF props
     * @param {Object} props - Object with format { 'name of prop': <String EF or function to add to the prop's defintion>, etc. }
     * @param {Boolean} [isAdd] - If true, does not override existing defintions, but adds to them
     */
    props(props, isAdd) {
        for(let prop in props) {
            if(props.hasOwnProperty(prop)) {
                if(typeof props[prop] == 'string') {
                    // parse it as an EF
                    props[prop] = new ElementFinder(props[prop], this.props, undefined, runInstance.log);
                }
                else if(typeof props[prop] == 'function') {
                }
                else {
                    throw new Error(`Invalid value of prop '${prop}'. Must be either a string ElementFinder or a function.`);
                }

                let [canonProp, canonInput] = ElementFinder.canonicalizePropStr(prop);
                if(isAdd) {
                    this.props[canonProp].push(props[prop]);
                }
                else {
                    this.props[canonProp] = [ props[prop] ];
                }
            }
        }
    }

    /**
     * Adds definitions for the given EF props. Keeps existing definitions.
     * A prop matches an element if at least one of its definitions matches.
     * @param {Object} props - Object with format { 'name of prop': <String EF or function to add to the prop's defintion>, etc. }
     */
    propsAdd(props) {
        props(props, true);
    }

    /**
     * Clears all definitions of the given EF props
     */
    propsClear(names) {
        names.forEach(name => delete this.props[name]);
    }

    /**
     * Escapes the given string for use in an EF
     * Converts a ' to a \', " to a \", etc.
     */
    str(str) {
        return utils.escape(str);
    }

    // ***************************************
    //  Mocks
    // ***************************************

    /**
     * Injects sinon library (sinonjs.org) into the browser, if it's not already defined there
     * Sinon will be available inside the browser at the global js var 'sinon'
     */
    async injectSinon() {
        let sinonExists = await this.executeScript(function() {
            return typeof sinon != undefined;
        });

        if(!sinonExists) {
            let sinonCode = await request.get('https://cdnjs.cloudflare.com/ajax/libs/sinon.js/7.3.2/sinon.min.js');
            await this.executeScript(sinonCode);
        }
    }

    /**
     * Mock's the current page's Date object to simulate the given time. Time will run forward normally.
     * See https://sinonjs.org/releases/latest/fake-timers/ for more details
     * @param {Date} time - The time to set the browser to
     */
    async mockTime(time) {
        await this.mockTimeStop(); // stop any existing time mocks
        await this.injectSinon();
        await this.executeScript(function(timeStr) {
            var smashtestSinonClock = sinon.useFakeTimers({
                now: new Date(timeStr),
                shouldAdvanceTime: true
            });
        }, time.toString());
    }

    /**
     * Mock's the current page's XHR. Sends back the given response for any http requests to the given method/url from the current page.
     * You can use multiple calls to this function to set up multiple routes. If a request doesn't match a route, it will get a 404 response.
     * See https://sinonjs.org/releases/latest/fake-xhr-and-server/ for more details
     * @param {String} method - The HTTP method ('GET', 'POST', etc.)
     * @param {String or RegExp} url - A url or a regex that matches urls
     * @param response - A String representing the response body, or
     *                   An Object representing the response body (it will be converted to JSON), or
     *                   an array in the form [ <status code>, { header1: "value1", etc. }, <response body string or object> ], or
     *                   a function
     *                   See server.respondWith() from https://sinonjs.org/releases/latest/fake-xhr-and-server/#fake-server-options
     */
    async mockHttp(method, url, response) {
        // Validate and serialize url
        let typeofUrl = typeof url;
        if(typeofUrl == 'object' && url instanceof RegExp) {
            typeofUrl = 'regex';
            url = url.toString();
        }
        else if(typeofUrl == 'string') {
        }
        else {
            throw new Error('Invalid url type');
        }

        // Validate and serialize response
        let typeofResponse = typeof response;
        if(typeofResponse == 'function') {
            response = response.toString();
        }
        else if(typeofResponse == 'string') {
        }
        else if(typeofResponse == 'object') {
            if(response instanceof Array) {
                typeofResponse = 'array';
                if(typeof response[2] == 'object') {
                    response[2] = JSON.stringify(response[2]);
                }
            }

            response = JSON.stringify(response);
        }
        else {
            throw new Error('Invalid response type');
        }

        await this.injectSinon();
        await this.executeScript(function(method, url, response, typeofUrl, typeofResponse) {
            // Deserialize url
            if(typeofUrl == 'regex') {
                url = eval(url);
            }

            // Deserialize response
            if(typeofResponse == 'function') {
                response = eval(response);
            }
            else if(typeofResponse == 'array') {
                response = JSON.parse(response);
            }

            var smashtestSinonClock = smashtestSinonClock || sinon.createFakeServer({ respondImmediately: true });
            smashtestSinonClock.respondWith(method, url, response);
        }, method, url, response, typeofUrl, typeofResponse);
    }

    /**
     * Sets configs on the currently mocked XHR
     * @param {Object} The options to set (key value pairs)
     * See server.configure(config) in https://sinonjs.org/releases/latest/fake-xhr-and-server/#fake-server-options for details on what config options are available
     * Fails silently if no mock is currently active
     */
    async mockHttpConfigure(config) {
        await this.executeScript(function() {
            if(typeof smashtestSinonClock != 'undefined') {
                smashtestSinonClock.configure(config);
            }
        });
    }

    /**
     * Stops and reverts all time-related mocks
     */
    async mockTimeStop() {
        await this.executeScript(function() {
            if(typeof smashtestSinonClock != 'undefined') {
                smashtestSinonClock.restore();
                smashtestSinonClock = undefined;
            }
        });
    }

    /**
     * Stops and reverts all http-related mocks
     */
    async mockHttpStop() {
        await this.executeScript(function() {
            if(typeof smashtestSinonFakeServer != 'undefined') {
                smashtestSinonFakeServer.restore();
                smashtestSinonFakeServer = undefined;
            }
        });
    }

    /**
     * Stops and reverts all mocks (time and http)
     */
    async mockStop() {
        await this.mockTimeStop();
        await this.mockHttpStop();
    }
}
module.exports = BrowserInstance;