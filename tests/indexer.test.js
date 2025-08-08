const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { findSubfolders } = require('../indexer');

describe('findSubfolders', () => {
  let baseDir;

  beforeEach(async () => {
    baseDir = await fs.mkdtemp(path.join(os.tmpdir(), 'findSubfolders-'));
    await fs.mkdir(path.join(baseDir, 'a', 'a1'), { recursive: true });
    await fs.mkdir(path.join(baseDir, 'a', 'a2'), { recursive: true });
    await fs.mkdir(path.join(baseDir, 'b', 'b1', 'b1a'), { recursive: true });
    await fs.mkdir(path.join(baseDir, 'c', 'c1'), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(baseDir, { recursive: true, force: true });
  });

  test('returns directories up to specified depth', async () => {
    const subfolders = [];
    await findSubfolders(baseDir, subfolders, 0, 2);
    const relative = subfolders.map(p => path.relative(baseDir, p));
    expect(new Set(relative)).toEqual(new Set([
      'a',
      'b',
      'c',
      path.join('a', 'a1'),
      path.join('a', 'a2'),
      path.join('b', 'b1'),
      path.join('c', 'c1')
    ]));
  });

  test('handles inaccessible folder gracefully', async () => {
    const subfolders = [];
    const originalReaddir = fs.readdir;
    const inaccessible = path.join(baseDir, 'c');
    const readdirSpy = jest.spyOn(fs, 'readdir').mockImplementation(async (p, opts) => {
      if (p === inaccessible) {
        const err = new Error('EACCES');
        err.code = 'EACCES';
        throw err;
      }
      return originalReaddir.call(fs, p, opts);
    });

    await findSubfolders(baseDir, subfolders, 0, 2);
    readdirSpy.mockRestore();
    const relative = subfolders.map(p => path.relative(baseDir, p));
    expect(relative).toContain('c');
    expect(relative).not.toContain(path.join('c', 'c1'));
  });
});
