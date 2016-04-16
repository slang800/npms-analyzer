'use strict';

const path = require('path');
const log = require('npmlog');
const unlink = Promise.promisify(require('fs').unlink);
const exec = require('../../util/exec');

const logPrefix = 'util/untar';

/**
 * Small utility to untar a file.
 * Malformed tar errors are ignored.
 *
 * @param {string} file The file path
 *
 * @return {Promise} A promise that fulfills when done
 */
function untar(file) {
    const destDir = path.dirname(file);

    // Ignore stderr because `tar` reports a lot of warnings for some tarballs (on Linux), e.g.: pickles2-contents-editor
    // e.g.: http://registry.npmjs.org/pickles2-contents-editor/-/pickles2-contents-editor-2.0.0-alpha.1.tgz
    return exec(`tar -xf ${file} -C ${destDir} --strip-components=1 2>/dev/null`)
    // Ignore invalid tar files.. sometimes services respond with JSON
    // e.g.: http://registry.npmjs.org/n-pubsub/-/n-pubsub-1.0.0.tgz
    .catch((err) => { console.log(err, err.stderr); throw err; })
    .catch((err) => /unrecognized archive format/i.test(err.message), (err) => {
        log.warn(logPrefix, 'Malformed archive file, ignoring..', { file, err });
    })
    .then(() => unlink(file))
    .then(() => exec(`chmod -R 0777 ${destDir}`));
}

module.exports = untar;
