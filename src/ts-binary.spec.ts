import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import fc from 'filecompare';
import { writeZoneInfoFile } from './tz-binary';
import { IanaZonesAndRulesParser, TzMode } from './iana-zones-and-rules-parser';
import { TzCompiler } from './tz-compiler';

chai.use(chaiAsPromised);

describe('Writing binary zoneinfo files', () => {
  it('should match America/New_York sample', async function () {
    this.timeout(1500000);
    this.slow(7500);

    const parser = new IanaZonesAndRulesParser();
    await parser.parseFromOnline('2021a', true);
    const compiler = new TzCompiler(parser);
    const tz = await compiler.compile('America/New_York', 1800, 2040);
    await writeZoneInfoFile('zoneinfo', tz, parser.getLeapSeconds());
    await expect(new Promise<boolean>(resolve => {
      fc('./zoneinfo/America/New_York', './test-data/New_York', result => resolve(result));
    })).to.eventually.be.true;
  });

  it('should match Australia/Lord_Howe sample', async function () {
    this.timeout(1500000);
    this.slow(7500);

    const parser = new IanaZonesAndRulesParser();
    await parser.parseFromOnline('2021a', true);
    const compiler = new TzCompiler(parser);
    const tz = await compiler.compile('Australia/Lord_Howe', 1800, 2040);
    await writeZoneInfoFile('zoneinfo', tz);
    await expect(new Promise<boolean>(resolve => {
      fc('./zoneinfo/Australia/Lord_Howe', './test-data/Lord_Howe', result => resolve(result));
    })).to.eventually.be.true;
  });

  it('should match Europe/Dublin sample', async function () {
    this.timeout(1500000);
    this.slow(7500);

    const parser = new IanaZonesAndRulesParser(false, TzMode.REARGUARD);
    await parser.parseFromOnline('2021a', true);
    const compiler = new TzCompiler(parser);
    const tz = await compiler.compile('Europe/Dublin', 1800, 2040, false, true);
    await writeZoneInfoFile('zoneinfo', tz);
    await expect(new Promise<boolean>(resolve => {
      fc('./zoneinfo/Europe/Dublin', './test-data/Dublin', result => resolve(result));
    })).to.eventually.be.true;
  });
});
