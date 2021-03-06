'use strict';

const log = require('npmlog');
const moment = require('moment');
const spdx = require('spdx');
const spdxCorrect = require('spdx-correct');
const deepCompact = require('deep-compact');
const get = require('lodash/get');
const find = require('lodash/find');
const pointsToRanges = require('./util/pointsToRanges');

const logPrefix = 'collect/metadata';

/**
 * Extracts the module releases frequency.
 *
 * @param {object} data The module data
 *
 * @return {array} An array of ranges with the release count for each entry
 */
function extractReleasesFrequency(data) {
    // Aggregate the releases into ranges
    const time = data.time;

    if (!time) {
        return [];
    }

    const points = Object.keys(time).map((version) => { return { date: moment.utc(time[version]), version }; });
    const ranges = pointsToRanges(points, pointsToRanges.bucketsFromBreakpoints([30, 90, 180, 365, 730]));

    // Build the releases frequency array based on the releases ranges
    return ranges.map((range) => {
        return { from: range.from, to: range.to, count: range.points.length };
    });
}

/**
 * Normalizes a single license value to a SPDX identifier.
 *
 * @param {string}        name    The module name
 * @param {string|object} license The license value, which can be a string or an object (deprecated)
 *
 * @return {string} The normalized license, which is a SPDX identifier
 */
function normalizeLicense(name, license) {
    // Handle { type: 'MIT', url: 'http://..' }
    if (license && license.type) {
        license = license.type;
    }

    // Ensure that the license is a non-empty string
    if (typeof license !== 'string' || !license) {
        log.silly(logPrefix, `Invalid license for module ${name} was found`, { license });
        return null;
    }

    // Try to correct licenses that are not valid SPDX identifiers
    if (!spdx.valid(license)) {
        const correctedLicense = spdxCorrect(license);

        if (correctedLicense) {
            log.verbose(logPrefix, `Module ${name} license was corrected from ${license} to ${correctedLicense}`);
            license = correctedLicense;
        } else {
            log.verbose(logPrefix, `License for module ${name} is not a valid SPDX indentifier`, { license });
            license = null;
        }
    }

    return license;
}

/**
 * Extracts the license from the module data.
 * Attempts to normalize any license to valid SPDX identifiers.
 *
 * @param {object} packageJson The latest package.json object (normalized)
 *
 * @return {string} The license.
 */
function extractLicense(packageJson) {
    const originalLicense = packageJson.license || packageJson.licenses;
    let license = originalLicense;

    // Short-circuit for modules without a license
    if (license == null) {
        log.silly(logPrefix, `No license for module ${packageJson.name} is set`);
        return null;
    }

    // Some old modules used objects or an array of objects to specify licenses
    // We do some effort to normalize them into SPDX license expressions
    if (Array.isArray(license)) {
        license = license
        .map((license) => normalizeLicense(packageJson.name, license))
        .reduce((str, license) => str + (str ? ' OR ' : '') + license, '');
    } else {
        license = normalizeLicense(packageJson.name, license);
    }

    return license;
}

/**
 * Extracts the person who published the module.
 * For older modules, it might be unavailable so a best-effort to guess it is made.
 *
 * @param {object} packageJson The latest package.json object (normalized)
 * @param {array}  maintainers The module maintainers
 *
 * @return {object} The publisher (username + email)
 */
function extractPublisher(packageJson, maintainers) {
    let npmUser;

    // Assume the _npmUser if exists
    npmUser = packageJson._npmUser;

    // Fallback to find the author within the maintainers
    // If it doesn't exist, fallback to the first maintainer
    if (!npmUser && maintainers) {
        npmUser = packageJson.author && find(maintainers, (maintainer) => maintainer.email === packageJson.author.email);
        npmUser = npmUser || maintainers[0];
    }

    return npmUser ? { username: npmUser.name, email: npmUser.email } : null;
}

/**
 * Extracts the module maintainers.
 *
 * This solves various issues with data consistency:
 * - Some packages have the maintainers in the data, others in the package.json.
 * - The package.json maintainers were empty but the top-level ones were correct, e.g.: `ldl_rev_path`.
 * - The maintainers was not an array but a string e.g.: `connect-composer-stats.`
 *
 * @param {object} data        The module data
 * @param {object} packageJson The latest package.json data (normalized)
 *
 * @return {array} The maintainers or null if unable to extract them
 */
function extractMaintainers(data, packageJson) {
    if (Array.isArray(data.maintainers) && data.maintainers.length) {
        return data.maintainers;
    }

    if (Array.isArray(packageJson.maintainers) && packageJson.maintainers.length) {
        return packageJson.maintainers;
    }

    log.warn(logPrefix, `Failed to extract maintainers of ${packageJson.name}`, {
        packageJsonMaintainers: packageJson.maintainers || null,
        dataMaintainers: data.maintainers || null,
    });

    return null;
}

// ----------------------------------------------------------------------------

/**
 * Runs the metadata analyzer.
 *
 * @param {object} data        The module data
 * @param {object} packageJson The latest package.json data (normalized)
 *
 * @return {Promise} The promise that fulfills when done
 */
function metadata(data, packageJson) {
    return Promise.try(() => {
        const versions = Object.keys(data.versions || {});
        const maintainers = extractMaintainers(data, packageJson);

        return deepCompact({
            name: packageJson.name,
            version: packageJson.version,
            description: packageJson.description,
            keywords: packageJson.keywords,

            // Need to use typeof because there's some old modules in which the README is an object, e.g.: `flatsite`
            readme: (typeof data.readme === 'string' && data.readme.indexOf('No README data') === -1) ?
                data.readme : null,

            publisher: extractPublisher(packageJson, maintainers),
            maintainers: maintainers && maintainers.map((maintainer) => {
                return { username: maintainer.name, email: maintainer.email };
            }),

            author: packageJson.author,
            contributors: packageJson.contributors,

            repository: packageJson.repository,
            homepage: packageJson.homepage,
            license: extractLicense(packageJson),

            dependencies: packageJson.dependencies,
            devDependencies: packageJson.devDependencies,
            peerDependencies: packageJson.peerDependencies,
            bundledDependencies: packageJson.bundledDependencies || packageJson.bundleDependencies,
            optionalDependencies: packageJson.optionalDependencies,

            releases: {
                latest: {
                    version: versions[versions.length - 1] || '0.0.1',
                    date: data.time && data.time.modified,
                },
                first: {
                    version: versions[0] || '0.0.1',
                    date: data.time && data.time.created,
                },
                frequency: extractReleasesFrequency(data),
            },

            deprecated: packageJson.deprecated,
            hasTestScript: get(packageJson, 'scripts.test', '').indexOf('no test specified') === -1,
        });
    })
    .tap(() => log.verbose(logPrefix, `The metadata collector for ${packageJson.name} completed successfully`));
}

module.exports = metadata;
