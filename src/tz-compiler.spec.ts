import { expect } from 'chai';
import { getLatest } from './read-tzdb';
import { TzCompiler } from './tz-compiler';
import { IanaZonesAndRulesParser } from './iana-zones-and-rules-parser';
import ttime, { DateTime, Timezone, Transition } from '@tubular/time';

ttime.initTimezoneLarge();

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

    for (const [zoneId, zone] of zones) {
      const tZone = Timezone.from(zoneId);
      const tTransitions: Transition[] = (tZone as any).transitions ?? [];

      if (tTransitions.length > 1 && tTransitions[0].transitionTime === tTransitions[1].transitionTime)
        tTransitions.splice(1, 1);

      if (zone.length === 1) {
        expect(zone[0].utcOffset === tZone.utcOffset);
        continue;
      }

      expect(zone.length).to.be.lte(tTransitions.length, `Transition count mismatch for ${zoneId}`);

      for (let i = 0; i < zone.length; ++i) {
        const trans = zone[i];
        const tTrans = tTransitions[i];
        const msec = (trans.time === Number.MIN_SAFE_INTEGER ? trans.time : trans.time * 1000);
        const err = `Mismatch for ${zoneId} at ${new DateTime(msec, 'UTC').toIsoString(19)}`;

        if (trans.rule && trans.rule.atHour > 24)
          continue;

        expect(msec).to.equal(tTrans.transitionTime, err);
      }
    }
  });
});
