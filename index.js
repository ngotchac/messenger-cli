var vorpal = require('vorpal')(),
    path = require('path'),
    chalk = require('chalk');

var facebook = require('./src/facebook'),
    facebookVorpal = require('./src/facebook-vorpal');

var Utils = require('./src/utils');

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
            .catch(e => { setTimeout(() => { throw e; callback(); }); });
    });

vorpal
    .command('threads [search]', 'Display threads/conversations')
    .alias('t')
    .option('-N <number>', 'Number of messages to load')
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
        var N = args.options.N;

        // Prompt for a thread and print it!
        FacebookVorpal
            .promptThread(search)
            .then(thread => FacebookVorpal.printThread(thread, N))
            .then(callback)
            .catch(e => { setTimeout(() => { throw e; callback(); }); });
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
            .catch(e => { setTimeout(() => { throw e; callback(); }); });
    });

vorpal
    .command('clean', 'Clean the current window')
    .alias('clear')
    .action(function(args, cb) {
        process.stdout.write('\u001B[2J\u001B[0;0f');
        cb();
    });

vorpal
    .command('vim', 'Open VIM')
    .alias('v')
    .action(function(args, cb) {
        Utils
            .vimInput()
            .then(data => {
                this.log(data);
                cb();
            })
            .catch(e => {
                this.log(e);
                cb();
            });
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
            .catch(e => { setTimeout(() => { throw e; callback(); }); });
    });

vorpal
    .delimiter('m $>')
    .show();

/**
 * Bind CTRL + L to clear the window terminal
 */
process.stdin.on('keypress', function(letter, key) {
    if (key.ctrl === true && ['l', 'L'].indexOf(key.name) > -1) {
        vorpal.exec('clean');
    }
});

process.on('uncaughtException', function(err) {
    // handle the error safely
    console.log(err)
});
