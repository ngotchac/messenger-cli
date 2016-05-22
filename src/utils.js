var os = require('os'),
    fs = require('fs'),
    pictureTube = require('picture-tube'),
    lwip = require('lwip'),
    request = require('request'),
    crypto = require('crypto'),
    mkdirp = require('mkdirp'),
    uid = require('uid-safe'),
    spawn = require('child_process').spawn,
    path = require('path');

module.exports = class Utils {

    /**
     * Returns an Object with a function to start displaying
     * the loading wheel (with custom message), and to stop.
     *
     * @param  {Object} vorpal    The Vorpal Instance
     * @param  {String} message   Message to show during loading
     * @return {Object}           The start and stop functions
     */
    static loading(vorpal, message) {
        const frames = ['-', '\\', '|', '/'];
        var intervalId;

        return {
            start: () => {
                let i = 0;

                intervalId = setInterval(() => {
                    const frame = frames[i = ++i % frames.length];

                    vorpal.ui.redraw(
                        `    ${frame} ${message} ${frame}`
                    );
                }, 80);
            },
            stop: () => {
                clearInterval(intervalId);
                vorpal.ui.redraw.clear();
                vorpal.ui.redraw.done();
            }
        }
    }

    /**
     * Returns the data folder for this project
     *
     * @return {String}
     */
    static getDataFolder() {
        var p = path.join(os.homedir(), '/.messenger-cli/');
        mkdirp.sync(p);
        return p;
    }

    /**
     * Returns the cache folder for this project
     *
     * @return {String}
     */
    static getCacheFolder() {
        var p = path.join(Utils.getDataFolder(), '/data/');
        mkdirp.sync(p);
        return p;
    }

    /**
     * Split a long text into an Array of String,
     * each of about N characters long
     *
     * @param  {String} text    The input text
     * @param  {Number} N       The goal number of characters
     *                          per splitted String (Default: 70)
     * @return {[String]}
     */
    static splitLongText(text, N) {
        // Set the default N to 70 characters
        N = N || 70;

        // Initialize the lines, current line, and counter
        var lines = [],
            line = '',
            c = 0;

        // Look through the all String
        for (let i = 0; i < text.length; i++) {
            // The current letter
            let letter = text[i];

            // Split only if it's a space (don't cut sentences)
            if (c < N || !/\s/gi.test(letter)) {
                line += letter;
                c++;
            } else {
                // Add this new line, reinitialize everything
                lines.push(line);
                line = '';
                c = 0;
            }
        }

        // If we stopped in the middle of a line, add it to the results
        if (c > 0) lines.push(line);

        return lines;
    }
    
    /**
     * Convert file to a printable string, but only works
     * with PNG.
     *
     * @param  {String} filepath   The file to display
     * @return {Promise}
     */
    static fileToAscii(filepath, size) {
        return new Promise((resolve, reject) => {
            var w = size.width;

            var options = (w < 100) ? { cols: w / 5} : {};

            var tube = pictureTube(options),
                data = '';

            fs.createReadStream(filepath)
                .pipe(tube)
                .on('data', d => data += d.toString())
                .on('end', () => resolve(data))
                .on('error', e => reject(e));
        });
    }

    /**
     * Return a Promise resolved with the ASCII art of
     * the given URL of an image.
     * The ASCII Art is cached in the cached data folder
     *
     * @param  {String} url  The URL/URI of the image
     * @return {Promise}
     */
    static urlToAscii(url) {
        // If no URL given, then resolve with empty text
        if (!url) return Promise.resolve('');

        const hash = crypto.createHash('sha256');

        // Generate a hash from the given URL
        var h = hash.update(url).digest('hex'),
            cacheFolder = Utils.getCacheFolder();

        // The path of the cached file
        var cachedFileBase = path.join(cacheFolder, '/', h);

        var cachedFilePNG = cachedFileBase + '.png';

        return new Promise((resolve, reject) => {
            // Try to read the cached file
            lwip.open(cachedFilePNG, (err, image) => {
                // If there is an error, reject
                if (err && err.code !== 'ENOENT') return reject(err);

                // If it doesn't exist, download the file
                if (err && err.code === 'ENOENT') {
                    var promise = Utils
                        .downloadFile(url, cachedFileBase)
                        .then(f => Utils.convertToPng(f, cachedFileBase));
                } else {
                    // Create empty Promise with the image size
                    var width = image.width(),
                        height = image.height();

                    var promise = Promise.resolve({ width: width, height: height });
                }

                promise
                    // Convert it to ASCII code
                    .then(size => Utils.fileToAscii(cachedFilePNG, size))
                    .then(ascii => resolve(`${url}\n\n${ascii}`))
                    .catch(e => {
                        // If there is an error, don't print anything,
                        // but log
                        console.log({ error: e, url: url });
                        resolve('');
                    });
            });
        });
    }

    /**
     * Convert the given file to png, with the given base
     * path.
     *
     * @param  {String} filepath       The path of the input file
     * @param  {String} filepathBase   The base of the output file
     * @return {Promise}
     */
    static convertToPng(filepath, filepathBase) {
        return new Promise((resolve, reject) => {
            lwip.open(filepath, function(err, image) {
                if (err) return reject(err);

                var width = image.width(),
                    height = image.height();

                // If it is already a PNG, then don't convert it
                if (filepath.split('.').pop() === 'png') {
                    return Promise.resolve({ width: width, height: height });
                }

                image.writeFile(filepathBase + '.png', 'png', err => {
                    if (err) return reject(err);

                    // Remove to first file
                    fs.unlink(filepath, err => {
                        if (err) return reject(err);
                        resolve({ width: width, height: height });
                    });
                });
            });
        });
    }

    /**
     * Download a file from the given URL
     *
     * @param  {String} url            The URL where the file lives
     * @param  {String} filepathBase   The local path for the download
     * @return {Promise}
     */
    static downloadFile(url, filepathBase) {
        var filepath;

        return new Promise((resolve, reject) => {
            // Download the file
            request(url)
                .on('response', res => {
                    // Save it to its real extension
                    var ext = res.headers['content-type'].split('/')[1];
                    filepath = filepathBase + '.' + ext;
                    // Write it to filepath
                    res
                        .pipe(fs.createWriteStream(filepath));
                })
                .on('end', () => resolve(filepath))
                .on('error', e => reject(e));
        });
    }

    /**
     * Spawn a new VIM process for the user to input some
     * text.
     *
     * @return {Promise} Resolves with the user input
     */
    static vimInput() {
        var filename = uid.sync(18) + '.tmp';
        var filepath = path.join(os.tmpdir(), filename);

        return new Promise((resolve, reject) => {
            // Spawn a new VIM process
            var vim = spawn('vim', [ filepath ], { stdio: 'inherit' });

            vim.on('err', err => reject(err));

            vim.on('exit', code => {
                // Get the file content
                fs.readFile(filepath, (err, data) => {
                    if (err) return reject(err);

                    var content = data.toString();

                    // Remove the temporary file
                    fs.unlink(filepath, err => {
                        if (err) return reject(err);

                        // Resolve with the content
                        return resolve(content);
                    });
                });
            });
        });
    }

}
