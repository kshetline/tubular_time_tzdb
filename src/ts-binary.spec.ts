import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { writeZoneInfoFile } from './tz-binary';
import { IanaZonesAndRulesParser } from './iana-zones-and-rules-parser';
import { TzCompiler } from './tz-compiler';

chai.use(chaiAsPromised);
chai.should();

describe('Writing binary zoneinfo files', () => {
  it('should write something', async function () {
    this.timeout(10000);

    const parser = new IanaZonesAndRulesParser(false);
    await parser.parseFromOnline(true);
    const compiler = new TzCompiler(parser);
    const tz = await compiler.compile('America/New_York', 1800, 2088);
    await writeZoneInfoFile('zoneinfo', tz);
    expect(true).to.be.true;
  });
});
