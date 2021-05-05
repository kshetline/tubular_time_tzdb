import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import fc from 'filecompare';
import { writeZoneInfoFile } from './tz-binary';
import { IanaZonesAndRulesParser } from './iana-zones-and-rules-parser';
import { TzCompiler } from './tz-compiler';

chai.use(chaiAsPromised);

describe('Writing binary zoneinfo files', () => {
  it('should match America/New_York sample', async function () {
    this.timeout(1500000);
    this.slow(7500);

    const parser = new IanaZonesAndRulesParser(false);
    await parser.parseFromOnline('2021a', true);
    const compiler = new TzCompiler(parser);
    const tz = await compiler.compile('America/New_York', 1800, 2040);
    await writeZoneInfoFile('zoneinfo', tz, parser.getLeapSeconds(), ['LMT', 'EDT', 'EST', 'EWT', 'EPT']);
    await expect(new Promise<boolean>(resolve => {
      fc('./zoneinfo/America/New_York', './test-data/New_York', result => resolve(result));
    })).to.eventually.be.true;
  });

  it('should match Australia/Lord_Howe sample', async function () {
    this.timeout(1500000);
    this.slow(7500);

    const parser = new IanaZonesAndRulesParser(false);
    await parser.parseFromOnline('2021a', true);
    const compiler = new TzCompiler(parser);
    const tz = await compiler.compile('Australia/Lord_Howe', 1800, 2040);
    await writeZoneInfoFile('zoneinfo', tz, null, ['LMT', 'AEST', '+1130', '+1030', '+11']);
    await expect(new Promise<boolean>(resolve => {
      fc('./zoneinfo/Australia/Lord_Howe', './test-data/Lord_Howe', result => resolve(result));
    })).to.eventually.be.true;
  });
});
