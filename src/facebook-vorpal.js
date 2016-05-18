var chalk = require('chalk');

var Utils = require('./utils');

module.exports = class FacebookVorpal {

    /**
     * The FacebookVorpal constructor, with the
     * print function to use to print stuff...
     *
     * @param  {Function} print      The print function
     * @param  {Function} prompt     The prompt function
     * @param  {Facebook} Facebook   An instance of the Facebook class
     */
    constructor(print, prompt, Facebook) {
        this.print = print;
        this.prompt = prompt;
        this.Facebook = Facebook;
        this.currentThread = undefined;
    }

    /**
     * Get the attachment from a Thread to print
     * (print the image as ASCII Art).
     *
     * @param  {Object} att   The Facebook Thread attachment
     * @return {Promise}
     */
    getAttachmentText(att) {
        var url = att.previewUrl || att.url || att.image,
            description = att.description || att.facebookUrl;

        var pretext = description ? `    ${description}\n\n` : '\n';

        return Utils
            .urlToAscii(url)
            .then(ascii => {
                // Print the ASCII Art formatted in order
                // to begin with 4 spaces
                var formattedAscii = ascii
                        .toString()
                        .split('\n')
                        .map(t => `    ${t}`)
                        .join('\n');

                // Return the pretext and the image
                return pretext + formattedAscii;
            });
    }

    /**
     * Print the given message from a Facebook Thread
     *
     * @param  {Object} message  The message Object:
     *                               senderName: String,
     *                               attachments: [Object],
     *                               body: String,
     *                               timestampDatetime: String
     * @return {Promise}
     */
    printMessage(message) {
        var date = message.timestampDatetime,
            sender = message.senderName,
            body = message.body || '',
            attachments = message.attachments;

        date = chalk.green(date);
        sender = chalk.bold(sender);

        var status = `${sender} (${date})`;

        // Nothing has been given, sadly...
        if (!body && attachments.length === 0) {
            return Promise.resolve().then(() => {
                this.print(`${status} (Unknown message...)\n`);
            });
        }

        var attP = Promise.resolve();

        // If only attachments, print them
        if (attachments.length > 0) {
            // Get all the attachments texts
            attP = Promise.all(attachments.map(a => this.getAttachmentText(a)));
        }

        return attP
            .then(asciiAttachments => {
                // Print the status
                this.print(status);

                if (body) {
                    // Split a long body, and add 4 spaces at the
                    // beginning of each line
                    body = body
                        .split('\n')
                        .map(t => Utils.splitLongText(t).join('\n    '))
                        .join('\n    ');


                    // Print the message body
                    this.print(`  > ${body}\n`);
                }

                if (asciiAttachments) {
                    // Print the attachments
                    asciiAttachments.forEach(d => this.print(d)); 
                }
            });
    }

    /**
     * Print the given thread
     * @param  {Object} thread   The thread to print
     * @return {Promise}
     */
    printThread(thread) {
        var pI;

        // If no messages, load them
        if (!thread.data) {
            pI = this.Facebook
                .getThread(thread.threadID);
        } else {
            // Create an empty Promise
            pI = Promise.resolve(thread);
        }

        return pI.then(t => {
            var p = Promise.resolve();

            // Construct the promises in the right order
            t.data.forEach(m => p = p.then(() => this.printMessage(m)));

            return p;
        });
    }

    /**
     * Prompt the user to choose a thread.
     * An option to search for a person/name is available.
     *
     * @param  {String} search  Optional - The search term
     * @return {Promise}
     */
    promptThread(search) {
        // Get the available threads
        var threads = this.Facebook.threads;

        // Filter if search term
        if (search) {
            // Construct the RegExp
            var regex = new RegExp('.*' + search + '.*', 'gi');

            // Test each thread
            threads = threads.filter(t => {
                // Test the name of the Thread
                var inName = regex.test(t.name);

                // Test the friends/participants full name
                var inFriends = t.friends.filter(f => regex.test(f.fullName)).length > 0;

                return inName || inFriends;
            });
        }

        // Construct the choices
        var choices = threads
                .map(thread => {
                    // Get the thread's name
                    var threadName = FacebookVorpal.getThreadName(thread);

                    // Snippet
                    var snippet = thread.snippet.split('\n').filter(t => t.length).join(' ');

                    // If the snippet is too long, shorten it
                    if (snippet.length > 50) {
                        snippet = snippet.slice(0, 47) + '...';
                    }

                    // Add the little snippet
                    var name = chalk.bold(threadName) + `: ${snippet}`;

                    return {
                        value: thread.threadID,
                        name: name,
                        short: threadName
                    };
                });

        return this
            .prompt({
                message: 'Choose a conversation:',
                name: 'thread',
                type: 'list',
                choices: choices
            }).then(answer => {
                var threadID = answer.thread;
                this.currentThread = threads.filter(t => t.threadID === threadID)[0];
                return this.currentThread;
            });
    }

    /**
     * Returns the name of the thread.
     *
     * @param  {Object} thread  The thread from Facebook
     * @return {String}
     */
    static getThreadName(thread) {
        // If it's my thread
        if (thread.me) return 'Me';

        // If there is a set name, returns it
        if (thread.name) return thread.name;

        // Else construct the name from the friends list
        var friends = thread.friends
            .map(f => f.fullName)
            .join(', ');

        // If the name is longer than 50 chars,
        // split it and add dots
        if (friends.length > 50) {
            friends = friends.slice(0, 47) + '...';
        }

        return friends;
    }
}