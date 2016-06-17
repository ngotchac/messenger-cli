var chalk = require('chalk'),
    Gauge = require('gauge');

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
    constructor(Facebook) {
        this.print = () => {};
        this.prompt = () => {};
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
    static getAttachmentText(att) {
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

    promptMessage() {
        var thread = this.currentThread,
            promise;

        if (thread) {
            var threadName = FacebookVorpal.getThreadName(thread);

            promise = this
                .prompt({
                    message: `Send a message to ${chalk.blue(threadName)}:`,
                    name: 'sendToCurrentThread',
                    type: 'confirm',
                    default: true
                })
                .then(answer => {
                    if (answer.sendToCurrentThread) return thread;
                    return this.promptThread();
                });
        } else {
            promise = this.promptThread();
        }
        
        return promise
            .then(thread => {
                return Utils
                    .vimInput()
                    .then(m => this.Facebook.sendMessage(m, thread.threadID));
                    
            });
    }

    /**
     * Transform a message into a printable string.
     *
     * @param  {Object} message   The Message Object
     * @param  {String} myID      The logged user ID (to match if
     *                            from me or not)
     * @return {Promise}          Resolves with the string to print
     */
    static messageToString(message, myID) {
        var senderID = /^(fbid:)?(\d+)$/.exec(message.senderID)[2];

        var date = message.timestampDatetime,
            sender = message.senderName,
            body = message.body || '',
            attachments = message.attachments,
            toPrint = '',
            fromMe = (myID === senderID);

        if (!date) {
            date = (new Date(parseInt(message.timestamp))).toLocaleTimeString();
        }

        date = chalk.green(date);
        sender = chalk.bold(sender);
        
        if (fromMe) sender = chalk.blue.bold('Me');

        var status = `${sender} (${date})\n`;

        // Nothing has been given, sadly...
        // Could be a status message...
        if (!body && attachments.length === 0) {
            return Promise.resolve();;
        }

        var attP = Promise.resolve();

        // If only attachments, print them
        if (attachments.length > 0) {
            // Get all the attachments texts
            attP = Promise
                .all(attachments
                    .map(a => FacebookVorpal.getAttachmentText(a))
                );
        }

        return attP
            .then(asciiAttachments => {
                // Print the status
                toPrint += status;

                if (body) {
                    // Split a long body, and add 4 spaces at the
                    // beginning of each line
                    body = body
                        .split('\n')
                        .map(t => Utils.splitLongText(t).join('\n    '))
                        .join('\n    ');


                    // Print the message body
                    toPrint += `  > ${body}\n`;
                }

                if (asciiAttachments) {
                    // Print the attachments
                    asciiAttachments.forEach(d => toPrint += `${d}\n`); 
                }

                return toPrint;
            });
    }

    /**
     * Print the given thread
     * @param  {Object} thread   The thread to print
     * @return {Promise}
     */
    printThread(thread, N) {
        var myID = this.Facebook.currentUserID.toString();
        var promise = Promise.resolve(thread);
        var gauge = new Gauge();

        // If no messages, load them
        if (!thread.data || (N && thread.data.length < N)) {
            promise = this.Facebook.getThread(thread.threadID, N);
        }

        return promise.then(t => {
            var p = Promise.resolve([]),
                N = t.data.length;

            // Construct the promises in the right order
            t.data.forEach(m => {
                p = p
                    .then(messages => {
                        return FacebookVorpal
                            .messageToString(m, myID)
                            .then(str => {
                                messages.push(str);
                                gauge.show('Fetching messages', messages.length / N);
                                gauge.pulse(`${messages.length}/${N}`);
                                return messages;
                            });
                    });
            });

            return p.then(messages => {
                gauge.hide();
                messages.forEach(m => this.print(m));
            });
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
                .map((thread, idx) => {
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
                        name: `${idx+1}. ${name}`,
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