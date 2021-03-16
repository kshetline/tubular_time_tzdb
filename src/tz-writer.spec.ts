import { expect } from 'chai';
import { getAvailableVersions } from './read-tzdb';
import { getTzData, TzOptions, TzPresets } from './tz-writer';

// No bad versions I can't currently manage to read, although a few require workarounds.
const badVersions = [];

describe('TzWriter', () => {
  // VERY slow test. Not for routine use!
  xit('should be able to download, compile, and compress all timezone releases', async function () {
    this.timeout(18000000);

    const versions = await getAvailableVersions();

    expect(versions.length).to.be.greaterThan(220);

    for (const version of versions) {
      if (badVersions.includes(version))
        continue;

      for (const preset of [TzPresets.SMALL, TzPresets.LARGE, TzPresets.LARGE_ALT]) {
        console.log(version, TzPresets[preset]);

        const options: TzOptions = { preset, callback: null, urlOrVersion: version };
        const data = await getTzData(options);

        expect(data.version).to.equal(version);
      }
    }
  });
});
