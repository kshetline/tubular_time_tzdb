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
    await parser.parseFromOnline({ systemV: true, urlOrVersion: '2021a' });
    const compiler = new TzCompiler(parser);
    const tz = await compiler.compile('America/New_York');
    await writeZoneInfoFile('zoneinfo', tz, true, parser.getLeapSeconds());
    await expect(new Promise<boolean>(resolve => {
      fc('./zoneinfo/America/New_York', './test-data/New_York', result => resolve(result));
    })).to.eventually.be.true;
  });

  it('should match Australia/Lord_Howe sample', async function () {
    this.timeout(1500000);
    this.slow(7500);

    const parser = new IanaZonesAndRulesParser();
    await parser.parseFromOnline({ systemV: true, urlOrVersion: '2021a' });
    const compiler = new TzCompiler(parser);
    const tz = await compiler.compile('Australia/Lord_Howe');
    await writeZoneInfoFile('zoneinfo', tz, true);
    await expect(new Promise<boolean>(resolve => {
      fc('./zoneinfo/Australia/Lord_Howe', './test-data/Lord_Howe', result => resolve(result));
    })).to.eventually.be.true;
  });

  it('should match Europe/Dublin sample', async function () {
    this.timeout(1500000);
    this.slow(7500);

    const parser = new IanaZonesAndRulesParser();
    await parser.parseFromOnline({ mode: TzMode.REARGUARD, urlOrVersion: '2021a' });
    const compiler = new TzCompiler(parser);
    const tz = await compiler.compile('Europe/Dublin', undefined, undefined, true);
    await writeZoneInfoFile('zoneinfo', tz, true);
    await expect(new Promise<boolean>(resolve => {
      fc('./zoneinfo/Europe/Dublin', './test-data/Dublin', result => resolve(result));
    })).to.eventually.be.true;
  });

  it('should match Asia/Ulan_Bator sample', async function () {
    this.timeout(1500000);
    this.slow(7500);

    const parser = new IanaZonesAndRulesParser();
    await parser.parseFromOnline({ mode: TzMode.REARGUARD, urlOrVersion: '2021a' });
    const compiler = new TzCompiler(parser);
    const tz = await compiler.compile('Asia/Ulan_Bator');
    await writeZoneInfoFile('zoneinfo', tz);
    await expect(new Promise<boolean>(resolve => {
      fc('./zoneinfo/Asia/Ulan_Bator', './test-data/Ulan_Bator', result => resolve(result));
    })).to.eventually.be.true;
  });
});
