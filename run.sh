#!/usr/bin/env node

var vorpal = require('vorpal')(),
    chalk = require('chalk');

var facebook = require('./src/facebook'),
    facebookVorpal = require('./src/facebook-vorpal');

var Facebook = new facebook(vorpal);
var FacebookVorpal = new facebookVorpal(Facebook);

vorpal
    .command('init', 'Initialize Facebook (login, etc...)')
    .action(function(args, callback) {
        // const frames = ['-', '\\', '|', '/'];
        // let i = 0;

        // var a = setInterval(() => {
        //     const frame = frames[i = ++i % frames.length];

        //     vorpal.ui.redraw(
        //         `    ${frame} Logging into Facebook ${frame}`
        //     );
        // }, 80);

        Facebook
            .init()
            .then(() => {
                // clearInterval(a);
                // vorpal.ui.redraw.clear();
                // vorpal.ui.redraw.done();
            })
            .then(callback)
            .catch(e => { setTimeout(() => { throw e; }); });
    });

vorpal
    .command('threads [search]', 'Display threads/conversations')
    .alias('t')
    .action(function(args, callback) {
        // Verify that the user is logged in
        if (!Facebook.loggedin) {
            this.log(chalk.bold.red('You must login before continuing.'));
            this.log('Type', chalk.bold('init'), 'to login.\n');
            return callback();
        }

        // Bind the log and prompt functions
        FacebookVorpal.prompt = this.prompt.bind(this);
        FacebookVorpal.print = this.log.bind(this);

        // Get the search term (if any...)
        var search = args.search;

        // Prompt for a thread and print it!
        FacebookVorpal
            .promptThread(search)
            .then(thread => FacebookVorpal.printThread(thread))
            .then(callback)
            .catch(e => { setTimeout(() => { throw e; }); });
    });


vorpal
    .command('send', 'Send a message')
    .action(function(args, callback) {
        // Verify that the user is logged in
        if (!Facebook.loggedin) {
            this.log(chalk.bold.red('You must login before continuing.'));
            this.log('Type', chalk.bold('init'), 'to login.\n');
            return callback();
        }

        // Bind the log and prompt functions
        FacebookVorpal.prompt = this.prompt.bind(this);
        FacebookVorpal.print = this.log.bind(this);

        FacebookVorpal
            .promptMessage()
            .then(callback)
            .catch(e => { setTimeout(() => { throw e; }); });
    });

vorpal
    .command('messages', 'Debug messages')
    .action(function(args, callback) {
        // Bind the log and prompt functions
        FacebookVorpal.prompt = this.prompt.bind(this);
        FacebookVorpal.print = this.log.bind(this);

        FacebookVorpal
            .promptThread()
            .then(thread => { this.log(JSON.stringify(thread, null, 4)); })
            .then(callback)
            .catch(e => { setTimeout(() => { throw e; }); });
    });

vorpal
    .delimiter('fb $>')
    .show();

process.on('uncaughtException', function(err) {
    // handle the error safely
    console.log(err)
});
