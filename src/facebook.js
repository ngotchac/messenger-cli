/**
 * This is the Facebook module, containing all the logic for login,
 * sending messages, displaying threads, etc...
 */
var fb = require('facebook-chat-api'),
    fs = require('fs'),
    path = require('path'),
    chalk = require('chalk'),
    inquirer = require('inquirer'),
    imageToAscii = require('image-to-ascii');

var Utils = require('./utils'),
    FacebookVorpal = require('./facebook-vorpal');

module.exports = class Facebook {

    /**
     * Class constructor, initializing empty threads and friends
     */
    constructor() {
        this.api = undefined;
        this.listener = undefined;
        this.currentUserID = undefined;

        this.threads = [];
        this.friends = [];

        this.loggedin = false;
    }

    /**
     * Initialize this Facebook Module:
     *     - Login
     *     - Retrieve threads
     *     - Retrieve friends
     *
     * @return {Promise}
     */
    init() {
        return this
            .getState()
            .then(state => {
                // If no state available, prompt the user to login
                if (!state) return this.promptLogin();

                // Else, login from the stored state
                return this.loginFromState(state);
            })
            .then(() => {
                this.currentUserID = this.api.getCurrentUserID();
                // Load the threads and the friends list
                return Promise.all([
                        this.loadThreads(),
                        this.loadFriends()
                    ]);
            })
            .then(() => {
                // Run the message listener
                this.attachIncomingMessages();
                this.loggedin = true;
            })
            .then(() => this.linkThreadsToFriends());
    }

    attachIncomingMessages() {
        // If already set, call it to stop listening
        if (this.listener) this.listener();

        this.listener = this.api.listen((err, message) => {
            if(err) return console.error(err);

            var threadID = message.threadID,
                thread;

            // Add the message to the right thread
            this.threads.forEach(t => {
                if (t.threadID === threadID) {
                    t.data.push(message);
                    thread = t;
                }
            });

            console.log('New message!', message.body, FacebookVorpal.getThreadName(thread));
        });
    }

    /**
     * Send a message to the given thread (ID).
     *
     * @param  {String} body    The message to send
     * @param  {Number} threadID   The thread to send the message to
     * @return {Promise}
     */
    sendMessage(body, threadID) {
        var api = this.api;

        return new Promise((resolve, reject) => {
            // Construct the message
            var message = { body: body };

            // Send the message on Facebook
            api.sendMessage(message, threadID, err => {
                if (err) return reject(err);
                return resolve();
            });
        });
    }

    /**
     * Retrieves the Thread history from Facebook,
     * and store it.
     *
     * @param  {Number} threadID   The Thread ID
     * @param  {Number} max        The number of messages to
     *                             retrieve (Default: 50)
     * @return {Promise}
     */
    getThread(threadID, max) {
        var self = this;

        var api = this.api,
            thread;

        // Default to 50 messages
        max = max || 50;

        return new Promise((resolve, reject) => {
            // Get the Thread History
            api.getThreadHistory(threadID, 0, max, null, (err, data) => {
                if (err) return reject(err);

                // Save the data in the thread
                self.threads.forEach(t => {
                    if (t.threadID === threadID) {
                        // Get the thread
                        thread = t;

                        // Store the data
                        t.data = data;
                    }
                });

                resolve(thread);
            });
        });
    }

    /**
     * Add the corresponding friends to the
     * Threads list.
     */
    linkThreadsToFriends() {
        var threads = this.threads,
            friends = this.friends;

        // For each thread
        this.threads = threads.map(thread => {
            // Add the friends list from the participants list
            thread.friends = thread.participants
                // Filter the friends from their id
                .map(id => friends.filter(f => f.userID === id)[0])
                // Remove friends not found
                .filter(e => e);

            if ((!threads.friends || threads.friends.length === 0)
                    && thread.participants.length === 1
                    && thread.participants[0] === this.currentUserID
                ) {
                thread.me = true;
            }

            return thread;
        });
    }

    /**
     * Load the Friends list
     *
     * @return {Promise}
     */
    loadFriends() {
        var self = this;
        var api = this.api;

        return new Promise((resolve, reject) => {
            api.getFriendsList((err, friends) => {
                if(err) return reject(err);

                // Store the friends list
                self.friends = friends;

                resolve();
            });
        });
    }

    /**
     * Loads the threads from Facebook, store them.
     *
     * @param  {Number} max   The maximum number of threads to load
     *                        (Default to 50)
     * @return {Promise}
     */
    loadThreads(max) {
        var self = this;
        var api = this.api;
        if (!max) max = 50;

        return new Promise((resolve, reject) => {
            // Get the Threads list
            api.getThreadList(0, max, (err, threads) => {
                if (err) return reject(err);

                // Save the threads
                self.threads = threads;
                resolve();
            });
        });
    }

    /**
     * Prompts the login credentials to the user.
     *
     * @return {Promise} The promise is fulfilled when the user has logged in
     */
    promptLogin() {
        // The login and password questions to ask the user
        var questions = [
                {
                    type: 'input',
                    name: 'login',
                    message: 'Enter your login: ',
                    validate: function(input) {
                        return input.length > 0;
                    }
                },
                {
                    type: 'password',
                    name: 'password',
                    message: 'Enter your password: ',
                    validate: function(input) {
                        return input.length > 0;
                    }
                }
            ];

        // Prompt the questions to the user
        return inquirer
            .prompt(questions)
            .then(answers => {
                var username = answers.login,
                    password = answers.password;

                // Try to login with the given credentials
                return this.loginFromCredentials(username, password);
            });
    }

    /**
     * Login to Facebook with the given credentials
     * 
     * @param  {String} username    The given username/email
     * @param  {String} password    The given password
     * @return {Promise}
     */
    loginFromCredentials(username, password) {
        return new Promise((resolve, reject) => {
            // Login to Facebook
            fb({ email: username, password: password }, { logLevel: 'silent' }, (err, api) => {
                if(err) return reject(err);

                // Save the API Object state
                this.api = api;

                return resolve();
            });
        })
        // Write the state to file
        .then(() => this.storeState());
    }

    /**
     * Login from the given state (cookies)
     *
     * @param  {Object} state   The API State Object
     * @return {Promise}
     */
    loginFromState(state) {
        var self = this;

        return new Promise((resolve, reject) => {
            // Login to Facebook
            fb({ appState: state }, { logLevel: 'silent' }, (err, api) => {
                if(err) return reject(err);

                // Save the API Object state
                self.api = api;

                resolve();
            });
        });
    }

    /**
     * Store the current state of the Facebook API
     * (JSON file with the cookies basically...)
     *
     * @return {Promise} The Promise is fullfilled when the state has
     *                   been sucessfully written
     */
    storeState() {
        return new Promise((resolve, reject) => {
            // The API Object needs to be initialized
            if (!this.api) return reject('A Facebook Instance needs to be created first.');

            // Get the state and the file path
            var state = this.api.getAppState(),
                filepath = Facebook.getStateFilepath();

            // Write to the file the state
            fs.writeFile(filepath, JSON.stringify(state), err => {
                if (err) return reject(err);
                resolve();
            });
        });
    }

    /**
     * Get the state from the stored file, if it exists.
     * If not, resolves with an empty response.
     *
     * @return {Promise}
     */
    getState() {
        return new Promise((resolve, reject) => {
            // Get the file path
            var filepath = Facebook.getStateFilepath();

            // Read the file
            fs.readFile(filepath, (err, data) => {
                // If the file doesn't exists, return empty response
                if (err && err.code === 'ENOENT') return resolve();
                else if (err) return reject(err);

                // Parse the JSON
                var state = JSON.parse(data);
                resolve(state);
            });
        });
    }

    /**
     * Returns the filepath of the Facebook state file
     *
     * @return {String}
     */
    static getStateFilepath() {
        return path.join(Utils.getDataFolder(), 'appstate.json');
    }

}
