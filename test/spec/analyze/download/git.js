'use strict';

const fs = require('fs');
const cp = require('child_process');
const loadJsonFile = require('load-json-file');
const expect = require('chai').expect;
const betray = require('betray');
const git = require(`${process.cwd()}/lib/analyze/download/git`);

const tmpDir = `${process.cwd()}/test/tmp`;

function mock(mocks) {
    mocks = Object.assign({ clone: () => {}, checkout: () => {} }, mocks);

    return betray(cp, 'exec', [
        {
            match: (command) => command.indexOf('clone') !== -1,
            handle: (command, options, callback) => {
                try {
                    mocks.clone && mocks.clone();
                } catch (err) {
                    return callback(err, err.stdout || '', err.stderr || '');
                }

                cp.execSync(`mkdir -p ${tmpDir}/.git`);
                callback(null, '', '');
            },
        },
        {
            match: (command) => command.indexOf('checkout') !== -1,
            handle: (command, options, callback) => {
                try {
                    mocks.checkout && mocks.checkout();
                } catch (err) {
                    return callback(err, err.stdout || '', err.stderr || '');
                }

                callback(null, '', '');
            },
        },
        {
            match: (command) => command.indexOf('rm -rf') !== -1,
            handle: (command, options, callback) => {
                cp.execSync(command, options);
                callback(null, '', '');
            },
        },
        {
            match: () => true,
            handle: () => { throw new Error('Not mocked'); },
        },
    ]);
}

describe('git', () => {
    beforeEach(() => cp.execSync(`mkdir -p ${tmpDir}`));
    afterEach(() => cp.execSync(`rm -rf ${tmpDir}`));

    it('should detect GitHub, GitLab and BitBucket endpoints', () => {
        let download;

        download = git({ repository: { type: 'git', url: 'git://github.com/IndigoUnited/node-cross-spawn.git' } });
        expect(download).to.be.a('function');

        download = git({ repository: { type: 'git', url: 'git@github.com:IndigoUnited/node-cross-spawn.git' } });
        expect(download).to.be.a('function');

        download = git({ repository: { type: 'git', url: 'https://github.com/IndigoUnited/node-cross-spawn.git' } });
        expect(download).to.be.a('function');

        download = git({ repository: { type: 'git', url: 'git@bitbucket.org:fvdm/node-xml2json.git' } });
        expect(download).to.be.a('function');

        download = git({ repository: { type: 'git', url: 'https://bitbucket.org/fvdm/node-xml2json.git' } });
        expect(download).to.be.a('function');

        download = git({ repository: { type: 'git', url: 'git@gitlab.com:codium/angular-ui-select.git' } });
        expect(download).to.be.a('function');

        download = git({ repository: { type: 'git', url: 'https://gitlab.com/codium/angular-ui-select.git' } });
        expect(download).to.be.a('function');

        download = git({ repository: { type: 'git', url: 'https://foo.com/IndigoUnited/node-cross-spawn.git' } });
        expect(download).to.equal(null);
    });

    it('should clone a GitHub repository and checkout a specific ref', () => {
        const betrayed = mock({
            checkout: () => fs.writeFileSync(`${tmpDir}/package.json`, JSON.stringify({ version: '0.1.0' })),
        });

        return Promise.each([
            'git://github.com/IndigoUnited/node-cross-spawn.git',
            'git@github.com:IndigoUnited/node-cross-spawn.git',
            'https://github.com/IndigoUnited/node-cross-spawn.git',
        ], (url) => {
            const download = git({
                name: 'cross-spawn',
                repository: { type: 'git', url },
                gitHead: '5fb20ce2f44d9947fcf59e8809fe6cb1d767433b',
            });

            return download(tmpDir)
            .then(() => loadJsonFile.sync(`${tmpDir}/package.json`))
            .then((packageJson) => {
                expect(betrayed.invoked).to.be.greaterThan(1);
                expect(packageJson.version).to.equal('0.1.0');

                cp.execSync(`rm -rf ${tmpDir}`);
                cp.execSync(`mkdir -p ${tmpDir}`);
            });
        })
        .finally(() => betrayed.restore());
    });

    it('should clone a Bitbucket repository and checkout a specific ref', () => {
        const betrayed = mock({
            checkout: () => fs.writeFileSync(`${tmpDir}/package.json`, JSON.stringify({ version: '0.2.2' })),
        });

        return Promise.each([
            'git@bitbucket.org:fvdm/node-xml2json.git',
            'https://bitbucket.org/fvdm/node-xml2json.git',
        ], (url) => {
            const download = git({
                name: 'xml2json',
                repository: { type: 'git', url },
                gitHead: '4c8dc5c636f7bbb746ed519a39bb1b183a27064d',
            });

            return download(tmpDir)
            .then(() => loadJsonFile.sync(`${tmpDir}/package.json`))
            .then((packageJson) => {
                expect(betrayed.invoked).to.be.greaterThan(1);
                expect(packageJson.version).to.equal('0.2.2');

                cp.execSync(`rm -rf ${tmpDir}`);
                cp.execSync(`mkdir -p ${tmpDir}`);
            });
        })
        .finally(() => betrayed.restore())
        .then(() => expect(betrayed.invoked).to.be.greaterThan(1));
    });

    it('should clone a GitLab repository and checkout a specific ref', () => {
        const betrayed = mock({
            checkout: () => fs.writeFileSync(`${tmpDir}/bower.json`, JSON.stringify({ version: '0.2.0' })),
        });

        return Promise.each([
            'git@gitlab.com:codium/angular-ui-select.git',
            'https://gitlab.com/codium/angular-ui-select.git',
        ], (url) => {
            const download = git({
                name: 'angular-ui-select',
                repository: { type: 'git', url },
                gitHead: '560042cc9005e5f2c2889a3c7e64ea3ea0b80c88',
            });

            return download(tmpDir)
            .then(() => loadJsonFile.sync(`${tmpDir}/bower.json`))
            .then((packageJson) => {
                expect(betrayed.invoked).to.be.greaterThan(1);
                expect(packageJson.version).to.equal('0.2.0');

                cp.execSync(`rm -rf ${tmpDir}`);
                cp.execSync(`mkdir -p ${tmpDir}`);
            });
        })
        .finally(() => betrayed.restore())
        .then(() => expect(betrayed.invoked).to.be.greaterThan(1));
    });

    it('should not fail if the ref does not exist (commit hash)', () => {
        const betrayed = mock({
            clone: () => {
                fs.writeFileSync(`${tmpDir}/packageJson.json`, JSON.stringify({}));
                fs.writeFileSync(`${tmpDir}/appveyor.yml`, '');
            },
            checkout: () => {
                throw Object.assign(new Error('foo'),
                    { stderr: 'fatal: reference is not a tree: somecommithashthatwillneverexist00000000' });
            },
        });

        const download = git({
            name: 'cross-spawn',
            repository: { type: 'git', url: 'git://github.com/IndigoUnited/node-cross-spawn.git' },
            gitHead: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        });

        return download(tmpDir)
        .then(() => {
            expect(betrayed.invoked).to.be.greaterThan(1);
            expect(() => fs.accessSync(`${tmpDir}/package.json`)).to.not.throw();
            expect(() => fs.accessSync(`${tmpDir}/appveyor.yml`)).to.not.throw();
        })
        .finally(() => betrayed.restore());
    });

    it('should not fail if the ref does not exist (branch)', () => {
        const betrayed = mock({
            clone: () => {
                fs.writeFileSync(`${tmpDir}/packageJson.json`, JSON.stringify({}));
                fs.writeFileSync(`${tmpDir}/appveyor.yml`, '');
            },
            checkout: () => {
                throw Object.assign(new Error('foo'),
                    { stderr: 'error: pathspec \'foo\' did not match any file(s) known to git.' });
            },
        });

        const download = git({
            name: 'cross-spawn',
            repository: { type: 'git', url: 'git://github.com/IndigoUnited/node-cross-spawn.git' },
        });

        return download(tmpDir, { refOverrides: { 'cross-spawn': 'foo' } })
        .then(() => {
            expect(betrayed.invoked).to.be.greaterThan(1);
            expect(() => fs.accessSync(`${tmpDir}/package.json`)).to.not.throw();
            expect(() => fs.accessSync(`${tmpDir}/appveyor.yml`)).to.not.throw();
        })
        .finally(() => betrayed.restore());
    });

    it('should deal with non-existent repositories', () => {
        const betrayed = mock({
            clone: () => {
                throw Object.assign(new Error('foo'),
                    { stderr: '\nline\nERROR: Repository not found.\nline\nline' });
            },
        });

        const download = git({
            name: 'cool-module',
            repository: { type: 'git', url: 'git://github.com/some-org/repo-404.git' },
        });

        return download(tmpDir)
        .then(() => {
            expect(betrayed.invoked).to.be.greaterThan(1);
            expect(fs.readdirSync(tmpDir)).to.eql(['package.json']);
        })
        .finally(() => betrayed.restore());
    });

    it('should deal with permission errors', () => {
        const betrayed = mock({
            clone: () => {
                throw Object.assign(new Error('foo'),
                    { stderr: '\nline\nfatal: Authentication failed for `url`.\nline\nline' });
            },
        });

        const download = git({
            name: 'cool-module',
            repository: { type: 'git', url: 'git://github.com/some-org/repo-private.git' },
        });

        return download(tmpDir)
        .then(() => {
            expect(betrayed.invoked).to.be.greaterThan(1);
            expect(fs.readdirSync(tmpDir)).to.eql(['package.json']);
        })
        .finally(() => betrayed.restore());
    });

    it('should deal with invalid repositories', () => {
        const betrayed = mock({
            clone: () => {
                throw Object.assign(new Error('foo'),
                    { stderr: '\nline\nfatal: unable to access url: The requested URL returned error: `code`' });
            },
        });

        const download = git({
            name: 'cool-module',
            repository: { type: 'git', url: 'git://github.com/some-org/foo%25bar.git' },
        });

        return download(tmpDir)
        .then(() => {
            expect(betrayed.invoked).to.be.greaterThan(1);
            expect(fs.readdirSync(tmpDir)).to.eql(['package.json']);
        })
        .finally(() => betrayed.restore());
    });

    it('should delete the .git folder', () => {
        const betrayed = mock();

        const download = git({
            name: 'cross-spawn',
            repository: { type: 'git', url: 'git://github.com/IndigoUnited/node-cross-spawn.git' },
        });

        return download(tmpDir)
        .then(() => {
            expect(betrayed.invoked).to.be.greaterThan(1);
            expect(() => fs.accessSync(`${tmpDir}/.git`)).to.throw(/ENOENT/);

            cp.execSync(`rm -rf ${tmpDir}`);
            cp.execSync(`mkdir -p ${tmpDir}`);
        })
        .finally(() => betrayed.restore());
    });

    it('should merge package.json', () => {
        const betrayed = mock({
            checkout: () => fs.writeFileSync(`${tmpDir}/package.json`, JSON.stringify({
                name: 'cross-spawn',
                version: '1.0.0',
                description: 'Cross platform child_process#spawn and child_process#spawnSync',
            })),
        });

        const npmPackageJson = {
            name: 'cool-module',
            version: '0.1.0',
            repository: { type: 'git', url: 'git://github.com/IndigoUnited/node-cross-spawn.git' },
            gitHead: '5fb20ce2f44d9947fcf59e8809fe6cb1d767433b', // This is the ref for 1.0.0
        };

        const download = git(npmPackageJson);

        return download(tmpDir)
        .then(() => loadJsonFile(`${tmpDir}/package.json`))
        .then((packageJson) => {
            expect(betrayed.invoked).to.be.greaterThan(1);

            expect(packageJson.name).to.equal('cool-module');
            expect(packageJson.version).to.equal('0.1.0');
            expect(packageJson.description).to.equal('Cross platform child_process#spawn and child_process#spawnSync');

            // Test if properties were merged back
            expect(npmPackageJson.name).to.equal('cool-module');
            expect(npmPackageJson.version).to.equal('0.1.0');
            expect(npmPackageJson.description).to.equal('Cross platform child_process#spawn and child_process#spawnSync');
        })
        .finally(() => betrayed.restore());
    });
});
