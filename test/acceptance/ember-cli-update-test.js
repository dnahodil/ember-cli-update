'use strict';

const fs = require('fs-extra');
const path = require('path');
const { expect } = require('chai');
const {
  processBin,
  fixtureCompare: _fixtureCompare
} = require('git-fixtures');
const buildTmp = require('../helpers/build-tmp');
const {
  assertNormalUpdate,
  assertNoUnstaged,
  assertCodemodRan
} = require('../helpers/assertions');
const semver = require('semver');
const denodeify = require('denodeify');
const tmpDir = denodeify(require('tmp').dir);
const cpr = denodeify(require('cpr'));

const commitMessage = 'add files';

const shouldSkipCodemods = process.platform === 'linux' && semver.satisfies(semver.valid(process.version), '6');

describe('Acceptance - ember-cli-update', function() {
  this.timeout(30 * 1000);

  let tmpPath;

  function merge({
    fixturesPath,
    runCodemods,
    subDir = ''
  }) {
    tmpPath = buildTmp({
      fixturesPath,
      commitMessage,
      subDir
    });

    let args = [
      '--to',
      '3.2.0-beta.1',
      '--resolve-conflicts'
    ];
    if (runCodemods) {
      args = [
        '--run-codemods'
      ];
    }

    return processBin({
      binFile: 'ember-cli-update',
      args,
      cwd: tmpPath,
      commitMessage,
      expect
    });
  }

  function fixtureCompare({
    mergeFixtures
  }) {
    return Promise.resolve().then(() => {
      return tmpDir();
    }).then(expected => {
      return Promise.resolve().then(() => {
        return cpr(mergeFixtures, expected);
      }).then(() => {
        return fs.ensureFile(path.join(expected, '.env'));
      }).then(() => {
        let actual = tmpPath;

        _fixtureCompare({
          expect,
          actual,
          expected
        });
      });
    });
  }

  it.only('updates app', function() {
    return merge({
      fixturesPath: 'test/fixtures/local/my-app'
    }).promise.then(({
      status
    }) => {
      return fixtureCompare({
        mergeFixtures: 'test/fixtures/merge/my-app'
      }).then(() => {
        assertNormalUpdate(status);
        assertNoUnstaged(status);
      });
    });
  });

  it('updates addon', function() {
    return merge({
      fixturesPath: 'test/fixtures/local/my-addon'
    }).promise.then(({
      status
    }) => {
      fixtureCompare({
        mergeFixtures: 'test/fixtures/merge/my-addon'
      });

      assertNormalUpdate(status);
      assertNoUnstaged(status);
    });
  });

  (shouldSkipCodemods ? it.skip : it)('runs codemods', function() {
    this.timeout(5 * 60 * 1000);

    let {
      ps,
      promise
    } = merge({
      fixturesPath: 'test/fixtures/merge/my-app',
      runCodemods: true
    });

    ps.stdout.on('data', data => {
      let str = data.toString();
      if (str.includes('These codemods apply to your project.')) {
        ps.stdin.write('a\n');
      }
    });

    return promise.then(({
      status
    }) => {
      // file is indeterminent between OS's, so ignore
      fs.removeSync(path.join(tmpPath, 'MODULE_REPORT.md'));

      let mergeFixtures = 'test/fixtures/codemod/latest-node/my-app';
      if (process.env.NODE_LTS) {
        mergeFixtures = 'test/fixtures/codemod/min-node/my-app';
      }

      fixtureCompare({
        mergeFixtures
      });

      assertNoUnstaged(status);
      assertCodemodRan(status);
    });
  });

  it('scopes to sub dir if run from there', function() {
    return merge({
      fixturesPath: 'test/fixtures/local/my-app',
      subDir: 'foo/bar'
    }).promise.then(({
      status
    }) => {
      fixtureCompare({
        mergeFixtures: 'test/fixtures/merge/my-app'
      });

      assertNormalUpdate(status);
      assertNoUnstaged(status);
    });
  });
});
