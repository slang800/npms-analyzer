'use strict';

const assert = require('assert');
const config = require('config');
const log = require('npmlog');
const bootstrap = require('../util/bootstrap');
const stats = require('../util/stats');

const blacklisted = config.get('blacklist');
const logPrefix = '';

/**
 * Fetches modules of a view.
 *
 * @param {string} view    The view in the form of design-doc/view-name
 * @param {Nano}   npmNano The npm nano instance
 *
 * @return {Promise} The promise that fulfills when done
 */
function fetchView(view, npmNano) {
    const split = view.split('/');

    return npmNano.viewAsync(split[0], split[1])
    .then((response) => {
        return response.rows
        .map((row) => row.key.replace(/^module!/, ''))
        .filter((id) => !blacklisted[id]);
    });
}

// --------------------------------------------------

module.exports.builder = (yargs) => {
    return yargs
    .strict()
    .usage('Usage: ./$0 tasks enqueue-view <design-doc/view-name> [options]\n\n\
Enqueues all modules contained in the npms database view.\n\nNOTE: The view must be in the npms database and the key must be the module \
name (may be prefixed with `module!`)')
    .demand(3, 3)
    .example('./$0 tasks enqueue-view npms-analyzer/docs-to-be-fixed')

    .option('dry-run', {
        alias: 'dr',
        type: 'boolean',
        default: false,
        describe: 'Enables dry-run',
    })

    .check((argv) => {
        assert(/^[a-z0-9_\-]+\/[a-z0-9_\-]+$/.test(argv._[2]), 'The view argument must match the following format: <design-doc/view-name>');
        return true;
    });
};

module.exports.handler = (argv) => {
    process.title = 'npms-analyzer-enqueue-view';
    log.level = argv.logLevel || 'info';

    const view = argv._[2];

    // Bootstrap dependencies on external services
    bootstrap(['couchdbNpm', 'couchdbNpms', 'queue'], { wait: false })
    .spread((npmNano, npmsNano, queue) => {
        // Stats
        stats.process();

        log.info(logPrefix, `Fetching view ${view}`);

        // Load modules in memory.. we can do this because the total modules is around ~250k which fit well in memory
        // and is much faster than doing manual iteration
        return fetchView(view, npmsNano)
        .then((viewModules) => {
            log.info(logPrefix, `There's a total of ${viewModules.length} modules in the view`);
            viewModules.forEach((name) => log.verbose(logPrefix, name));

            if (!viewModules.length || argv.dryRun) {
                log.info(logPrefix, 'Exiting..');
                return;
            }

            return Promise.map(viewModules, (name, index) => {
                index && index % 5000 === 0 && log.info(logPrefix, `Enqueued ${index} modules`);
                return queue.push(name);
            }, { concurrency: 15 })
            .then(() => log.info(logPrefix, 'View modules were enqueued!'));
        })
        .then(() => process.exit());  // Need to force exit because of queue
    })
    .done();
};
