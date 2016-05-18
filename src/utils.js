var os = require('os'),
    fs = require('fs'),
    crypto = require('crypto'),
    mkdirp = require('mkdirp'),
    imageToAscii = require('image-to-ascii'),
    path = require('path');

module.exports = class Utils {

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
     * Return a Promise resolved with the ASCII art of
     * the given URL of an image.
     * The ASCII Art is cached in the cached data folder
     *
     * @param  {String} url  The URL/URI of the image
     * @return {Promise}
     */
    static urlToAscii(url) {
        const hash = crypto.createHash('sha256');
        var cols = process.stdout.columns - 8,
            rows = process.stdout.rows - 10;

        // Generate a hash from the given URL
        var h = hash.update(url).digest('hex') + '.ascii',
            cacheFolder = Utils.getCacheFolder();

        // The path of the cached file
        var cachedFile = path.join(cacheFolder, '/', h);

        return new Promise((resolve, reject) => {
            // If no URL given, then resolve with empty text
            if (!url) return resolve('');

            // Try to read the cached file
            fs.readFile(cachedFile, (err, ascii) => {
                if (!err) return resolve(ascii.toString());
                if (err && err.code !== 'ENOENT') return reject(err);

                // Convert image to ASCII
                imageToAscii(url, {
                    // size: {
                    //     height: '70%'
                    // },
                    size_options: {
                        px_size: {
                            width: 1,
                            height: 0.5
                        },
                        screen_size: {
                            width: cols,
                            height: rows / 2
                        }
                    }
                }, (err, ascii) => {
                    // If error, resolve with part of it...
                    if (err) resolve(`Couldn't load image @ ${url} (${err.toString().slice(0, 50)})`);

                    fs.writeFile(cachedFile, ascii, (err) => {
                        if (err) return reject(err);

                        // Resolve with the ASCII Art
                        resolve(ascii);
                    });
                });
            });
        });
    }
}
