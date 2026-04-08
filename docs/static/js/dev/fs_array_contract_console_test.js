/*
  KCPP FS Array Contract Console Test

  Usage from browser console:

    await window.runKcppFsArrayContractTests()

  Optional:

    await window.runKcppFsArrayContractTests({
      baseDir: '/__fs_test_custom',
      keepArtifacts: false,
      includeRegexTest: false,
      verbose: true
    })
*/

(function () {
  'use strict';

  const nowIso = () => new Date().toISOString();

  const normalizeError = (err) => {
    if (!err) return { message: 'Unknown error' };
    if (typeof err === 'string') return { message: err };
    return {
      name: err.name || 'Error',
      message: err.message || String(err),
      stack: err.stack || ''
    };
  };

  const safeJson = async (resp) => {
    const text = await resp.text();
    try {
      return { text, json: JSON.parse(text) };
    } catch {
      return { text, json: null };
    }
  };

  const assert = (condition, message) => {
    if (!condition) {
      throw new Error(message);
    }
  };

  async function runKcppFsArrayContractTests(options = {}) {
    const startedAt = nowIso();
    const startedMs = performance.now();

    const cfg = {
      baseDir: options.baseDir || `/__kcpp_fs_array_test_${Date.now()}`,
      keepArtifacts: !!options.keepArtifacts,
      includeRegexTest: options.includeRegexTest !== false,
      verbose: options.verbose !== false
    };

    const fsClient = window.fsClient;
    if (!fsClient) {
      throw new Error('window.fsClient is not available. Open the app page that initializes fs.js first.');
    }

    const results = [];
    const context = {
      startedAt,
      baseDir: cfg.baseDir,
      userAgent: navigator.userAgent,
      location: window.location.href,
      fsMode: 'unknown',
      fsEnabled: null
    };

    async function step(name, fn, stepOptions = {}) {
      const t0 = performance.now();
      try {
        const data = await fn();
        const entry = {
          name,
          status: stepOptions.expectFailure ? 'unexpected-pass' : 'pass',
          durationMs: Math.round((performance.now() - t0) * 100) / 100,
          expectFailure: !!stepOptions.expectFailure,
          data
        };
        results.push(entry);
        if (cfg.verbose) {
          console.log(`[FS TEST PASS] ${name}`, entry);
        }
        return entry;
      } catch (err) {
        const errObj = normalizeError(err);
        const entry = {
          name,
          status: stepOptions.expectFailure ? 'expected-failure' : 'fail',
          durationMs: Math.round((performance.now() - t0) * 100) / 100,
          expectFailure: !!stepOptions.expectFailure,
          error: errObj
        };
        results.push(entry);
        if (cfg.verbose) {
          const label = stepOptions.expectFailure ? '[FS TEST EXPECTED-FAIL]' : '[FS TEST FAIL]';
          console.error(`${label} ${name}`, entry);
        }
        if (!stepOptions.expectFailure) {
          throw err;
        }
        return entry;
      }
    }

    async function postRaw(path, body) {
      const resp = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', charset: 'utf-8' },
        body: JSON.stringify(body)
      });
      const parsed = await safeJson(resp);
      return {
        ok: resp.ok,
        status: resp.status,
        statusText: resp.statusText,
        body,
        responseText: parsed.text,
        responseJson: parsed.json
      };
    }

    const pSrc = `${cfg.baseDir}/src`;
    const pDocs = `${cfg.baseDir}/docs`;
    const pTests = `${cfg.baseDir}/tests`;
    const pA = `${pSrc}/a.txt`;
    const pB = `${pSrc}/b.txt`;
    const pMovedA = `${pSrc}/a_moved.txt`;
    const pCopyA = `${pSrc}/a_copy.txt`;

    let finalError = null;

    try {
      await step('Probe FS mode', async () => {
        const modeInfo = await fsClient.mode();
        context.fsMode = `${modeInfo?.mode || 'unknown'}`;
        context.fsEnabled = !!modeInfo?.enabled;
        return modeInfo;
      });

      await step('Pre-clean test dir', async () => {
        try {
          return await fsClient.rmdir([{ path: cfg.baseDir }]);
        } catch (e) {
          return { note: 'Pre-clean skipped', error: normalizeError(e) };
        }
      });

      await step('Client strict check: mkdir rejects string', async () => {
        await fsClient.mkdir(cfg.baseDir);
      }, { expectFailure: true });

      await step('Client strict check: metadata rejects string', async () => {
        await fsClient.metadata(pA);
      }, { expectFailure: true });

      await step('Server strict check: mkdir rejects string payload', async () => {
        const raw = await postRaw('/api/extra/fs/mkdir', { path: cfg.baseDir });
        assert(!raw.ok, `Expected non-2xx for string path, got ${raw.status}`);
        return raw;
      });

      await step('Create directories (array path)', async () => {
        return await fsClient.mkdir([{ path: pSrc }, { path: pDocs }, { path: pTests }]);
      });

      await step('Write two files (array path + array content)', async () => {
        return await fsClient.write([
          { path: pA, content: 'alpha\\nline2' },
          { path: pB, content: 'bravo\\nline2' }
        ]);
      });

      await step('Read content (single via 1-item array)', async () => {
        return await fsClient.content([{ path: pA, start: 1, end: 10 }]);
      });

      await step('Read content (multi via array)', async () => {
        return await fsClient.content([
          { path: pA, start: 1, end: 10 },
          { path: pB, start: 1, end: 10 }
        ]);
      });

      await step('Read content with per-path ranges', async () => {
        return await fsClient.content([
          { path: pA, start: 2, end: 2 },
          { path: pB, start: 1, end: 1 }
        ]);
      });

      await step('Get metadata (multi via array)', async () => {
        return await fsClient.metadata([{ path: pA }, { path: pB }]);
      });

      await step('Get URL (multi via array)', async () => {
        return await fsClient.url([{ path: pA }, { path: pB }]);
      });

      await step('Write lines with per-path params', async () => {
        const writeResult = await fsClient.write_lines([
          { path: pA, lines: ['inserted-a-1', 'inserted-a-2'], start_line: 2, append: false },
          { path: pB, lines: ['inserted-b-1'], start_line: 1, append: false }
        ]);
        const verifyResult = await fsClient.content([
          { path: pA, start: 1, end: 10 },
          { path: pB, start: 1, end: 10 }
        ]);
        const fileA = Array.isArray(verifyResult?.results) ? verifyResult.results[0] : null;
        const fileB = Array.isArray(verifyResult?.results) ? verifyResult.results[1] : null;
        const fileAText = Array.isArray(fileA?.lines) ? fileA.lines.map((line) => `${line?.content || line?.text || ''}`).join('\n') : '';
        const fileBText = Array.isArray(fileB?.lines) ? fileB.lines.map((line) => `${line?.content || line?.text || ''}`).join('\n') : '';
        assert(fileAText.includes('inserted-a-1'), `Expected file A write_lines content not found: ${fileAText}`);
        assert(fileBText.startsWith('inserted-b-1'), `Expected file B write_lines content not found: ${fileBText}`);
        return { writeResult, verifyResult };
      });

      await step('Move files with operations array', async () => {
        return await fsClient.move([
          { source: pA, destination: pMovedA }
        ]);
      });

      await step('Copy files with operations array', async () => {
        return await fsClient.copy([
          { source: pMovedA, destination: pCopyA }
        ]);
      });

      await step('Delete files with array path', async () => {
        return await fsClient.delete([{ path: pB }, { path: pCopyA }, { path: pMovedA }]);
      });

      if (cfg.includeRegexTest) {
        await step('Regex replace (optional)', async () => {
          await fsClient.write([{ path: `${pDocs}/temp.txt`, content: 'alpha alpha' }]);
          const replaceResult = await fsClient.replace_regex([
            { path: `${pDocs}/temp.txt`, pattern: 'a', replacement: 'b' }
          ]);
          const contentResult = await fsClient.content([{ path: `${pDocs}/temp.txt`, start: 1, end: 20 }]);
          const firstLine = Array.isArray(contentResult?.lines) && contentResult.lines.length > 0
            ? `${contentResult.lines[0]?.content || contentResult.lines[0]?.text || ''}`
            : '';
          assert(firstLine.includes('blphb'), `Regex replacement did not apply as expected: ${JSON.stringify(contentResult)}`);
          return { replaceResult, contentResult };
        });

        await step('Regex search (optional)', async () => {
          await fsClient.write([{ path: `${pDocs}/search.txt`, content: 'alpha 123\nBETA 456\ngamma 789' }]);
          const matchLower = await fsClient.search_regex('^[a-z]+\\s+\\d+$', `${pDocs}/*`, 10, false);
          const matchInsensitive = await fsClient.search_regex('beta', `${pDocs}/*`, 10, true);
          assert(Array.isArray(matchLower) && matchLower.some(item => `${item?.snippet || ''}`.includes('alpha 123')), `Regex search expected lowercase match missing: ${JSON.stringify(matchLower)}`);
          assert(Array.isArray(matchInsensitive) && matchInsensitive.some(item => `${item?.snippet || ''}`.includes('BETA 456')), `Regex search expected case-insensitive match missing: ${JSON.stringify(matchInsensitive)}`);
          return { matchLower, matchInsensitive };
        });

        await step('Regex search rejects invalid pattern (optional)', async () => {
          await fsClient.search_regex('[bad', `${pDocs}/*`, 10, false);
        }, { expectFailure: true });
      }

      await step('Delete dirs with array path', async () => {
        return await fsClient.rmdir([{ path: pSrc }, { path: pDocs }, { path: pTests }]);
      });

      if (!cfg.keepArtifacts) {
        await step('Delete root test dir', async () => {
          const resp = await fsClient.rmdir([{ path: cfg.baseDir }]);
          const item = Array.isArray(resp?.results) ? resp.results[0] : null;
          const alreadyMissing = !!item && item.success === false && typeof item.error === 'string' && item.error.toLowerCase().includes('not found');
          const deleted = !!item && item.success === true;
          assert(deleted || alreadyMissing, `Unexpected root dir cleanup result: ${JSON.stringify(resp)}`);
          return {
            ...resp,
            toleratedNotFound: alreadyMissing
          };
        });
      }
    } catch (e) {
      finalError = normalizeError(e);
    }

    const finishedAt = nowIso();
    const durationMs = Math.round((performance.now() - startedMs) * 100) / 100;
    const passCount = results.filter((r) => r.status === 'pass').length;
    const failCount = results.filter((r) => r.status === 'fail' || r.status === 'unexpected-pass').length;
    const expectedFailureCount = results.filter((r) => r.status === 'expected-failure').length;

    const report = {
      summary: {
        startedAt,
        finishedAt,
        durationMs,
        passCount,
        failCount,
        expectedFailureCount,
        fatalError: finalError
      },
      context,
      results
    };

    if (failCount > 0 || finalError) {
      console.error('FS ARRAY CONTRACT TEST REPORT', report);
    } else {
      console.log('FS ARRAY CONTRACT TEST REPORT', report);
    }

    window.__kcppFsArrayContractLastReport = report;
    return report;
  }

  window.runKcppFsArrayContractTests = runKcppFsArrayContractTests;
  console.log('Loaded runKcppFsArrayContractTests().');
})();
