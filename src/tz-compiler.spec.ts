import { expect } from 'chai';
import { getLatest } from './read-tzdb';
import { TzCompiler } from './tz-compiler';
import { IanaZonesAndRulesParser } from './iana-zones-and-rules-parser';

describe('TzCompiler', () => {
  it('should compile', async function () {
    this.timeout(60000);
    const data = await getLatest(true);
    const parser = new IanaZonesAndRulesParser(false, true);
    parser.parseTzData(data, true);
    const compiler = new TzCompiler(parser);
    let count = 0;
    const zones = await compiler.compileAll(1800, 2087, () => ++count);
    expect(zones.size).to.equal(count);
  });
});
