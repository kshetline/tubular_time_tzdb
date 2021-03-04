import { calendar, ClockType } from './tz-util';
import { IanaZonesAndRulesParser } from './iana-zones-and-rules-parser';
import { makeTime, TzTransitionList } from './tz-transition-list';
import { last } from '@tubular/util';
import ttime, { DateTime, parseTimeOffset, Timezone } from '@tubular/time';
import { TzTransition } from './tz-transition';
import { max, min, sign } from '@tubular/math';
import { TzRule } from './tz-rule';
import LAST = ttime.LAST;

export interface ZoneProcessingContext
{
  zoneId: string;
  lastUtcOffset: number;
  lastUntil: number;
  lastUntilType: ClockType;
  utcOffset: number;
  until: number;
  untilType: ClockType;
  format: string;
}

export class TzCompiler {
  constructor(private parser: IanaZonesAndRulesParser) {}

  compileAll(minYear: number, maxYear: number): Map<string, TzTransitionList>  {
    const compiledZones = new Map<string, TzTransitionList>();

    for (const zoneId of this.parser.getZoneIds())
      compiledZones.set(zoneId, this.compile(zoneId, minYear, maxYear));

    return compiledZones;
  }

  compile(zoneId: string, minYear: number, maxYear: number): TzTransitionList  {
    const transitions = new TzTransitionList(zoneId);
    const zpc = {} as ZoneProcessingContext;
    const zone = this.parser.getZone(zoneId);

    transitions.aliasFor = this.parser.getAliasFor(zoneId);

    zpc.zoneId = zoneId;
    zpc.lastUtcOffset = 0;
    zpc.lastUntil = Number.MIN_SAFE_INTEGER;
    zpc.lastUntilType = ClockType.CLOCK_TYPE_UTC;
    zpc.format = null;

    transitions.setLastZoneRec(last(zone));

    for (const zoneRec of zone) {
      let dstOffset = 0;

      if (zoneRec.rules != null && zoneRec.rules.indexOf(':') >= 0)
        dstOffset = parseTimeOffset(zoneRec.rules, true);

      zpc.utcOffset = zoneRec.utcOffset;
      zpc.until = zoneRec.until;
      zpc.untilType = zoneRec.untilType;
      zpc.format = zoneRec.format;

      if (zoneRec.rules == null || zoneRec.rules.indexOf(':') >= 0) {
        const name = TzCompiler.createDisplayName(zoneRec.format, '?', dstOffset !== 0);

        transitions.push(new TzTransition(zpc.lastUntil, zoneRec.utcOffset + dstOffset, dstOffset, name));

        if (zoneRec.untilType === ClockType.CLOCK_TYPE_WALL)
          zpc.until -= dstOffset;
      }
      else
        this.applyRules(zoneRec.rules, transitions, zpc, minYear, maxYear);

      zpc.lastUtcOffset = zpc.utcOffset;
      zpc.lastUntil = zpc.until;
      zpc.lastUntilType = zpc.untilType;

      if (zpc.until < Number.MAX_SAFE_INTEGER / 2) {
        const ldt = makeTime(zpc.until, zpc.utcOffset);

        if (ldt.wallTime.y > maxYear)
          break;
      }
    }

    transitions.removeDuplicateTransitions();
    transitions.trim(minYear, maxYear);

    return transitions;
  }

  private applyRules(rulesName: string, transitions: TzTransitionList, zpc: ZoneProcessingContext, minYear: number, maxYear: number): void {
    const ruleSet = this.parser.getRuleSet(rulesName);
    const minTime = zpc.lastUntil;
    let firstStdLetters = '?';
    let fallbackStdLetters = '?';

    const zoneOffset = zpc.utcOffset;
    const lastZoneOffset = zpc.lastUtcOffset;
    let lastDst = 0;
    let highYear: number;

    if (transitions.length > 0)
      lastDst = last(transitions).dstOffset;

    if (zpc.until >= Number.MAX_SAFE_INTEGER)
      highYear = 9999;
    else
      highYear = makeTime(zpc.until, zoneOffset).wallTime.y;

    const newTransitions = new TzTransitionList();

    for (const rule of ruleSet) {
      if (rule.startYear <= min(highYear, rule.endYear)) {
        for (let year = max(rule.startYear, 1800); year <= min(highYear, rule.endYear) && year <= maxYear; ++year) {
          let ldtDate: number;
          let ldtMonth = rule.month;
          let ldtYear = year;

          if (rule.dayOfWeek >= 0 && rule.dayOfMonth > 0) {
            ldtDate = calendar.getDayOnOrAfter(year, ldtMonth, rule.dayOfWeek, rule.dayOfMonth);

            if (ldtDate <= 0) {
              const ymd = calendar.getDateFromDayNumber(calendar.getDayNumber(ldtYear, ldtMonth, rule.dayOfMonth - ldtDate));

              ldtYear = ymd[0];
              ldtMonth = ymd[1];
              ldtDate = ymd[2];
            }
          }
          else if (rule.dayOfWeek >= 0 && rule.dayOfMonth < 0) {
            ldtDate = calendar.getDayOnOrBefore(year, ldtMonth, rule.dayOfWeek, -rule.dayOfMonth);

            if (ldtDate <= 0) {
              const ymd = calendar.getDateFromDayNumber(calendar.getDayNumber(ldtYear, ldtMonth, rule.dayOfMonth + ldtDate));

              ldtYear = ymd[0];
              ldtMonth = ymd[1];
              ldtDate = ymd[2];
            }
          }
          else if (rule.dayOfWeek >= 0)
            ldtDate = calendar.getDateOfNthWeekdayOfMonth(year, ldtMonth, rule.dayOfWeek, LAST);
          else
            ldtDate = rule.dayOfMonth;

          const ldt = new DateTime([ldtYear, ldtMonth, ldtDate, rule.atHour, rule.atMinute], Timezone.UT_ZONE);
          let epochSecond = ldt.utcTimeSeconds + (rule.atType === ClockType.CLOCK_TYPE_UTC ? 0 : zoneOffset);
          const altEpochSecond = ldt.utcTimeSeconds + (rule.atType === ClockType.CLOCK_TYPE_UTC ? 0 : lastZoneOffset) -
                  (rule.atType === ClockType.CLOCK_TYPE_WALL ? lastDst : 0);

          if (altEpochSecond === minTime)
            epochSecond = minTime;

          const name = TzCompiler.createDisplayName(zpc.format, rule.letters, rule.save !== 0);
          const tzt = new TzTransition(epochSecond, zpc.utcOffset + rule.save, rule.save, name, rule);

          newTransitions.push(tzt);
        }
      }
    }

    // Transition times aren't exact yet (not adjusted for DST), but are accurate enough for sorting.
    newTransitions.sort((t1, t2) => sign(t1.time - t2.time));

    let lastTransitionBeforeMinTime: TzTransition = null;
    let addLeadingTransition = true;

    // Adjust wall time for DST where needed.
    for (let i = 1; i < newTransitions.length; ++i) {
      const prev = newTransitions[i - 1];
      const curr = newTransitions[i];

      if (curr.rule.atType === ClockType.CLOCK_TYPE_WALL)
        curr.time -= prev.rule.save;
    }

    for (let i = 0; i < newTransitions.length; ++i) {
      const tzt = newTransitions[i];
      const lastRule = (i < 1 ? null : newTransitions[i - 1].rule);
      const maxTime = zpc.until - (lastRule != null && zpc.untilType === ClockType.CLOCK_TYPE_WALL ? lastRule.save : 0);
      const year = makeTime(tzt.time, 0).wallTime.y;

      if (minTime <= tzt.time && tzt.time < maxTime && minYear <= year && year <= maxYear) {
        if (firstStdLetters === '?' && tzt.dstOffset === 0)
          firstStdLetters = tzt.rule.letters;

        if (tzt.time === minTime)
          addLeadingTransition = false;
      }
      else {
        newTransitions.splice(i--, 1);

        // Find the last rule that was in effect before or at the time these rules were invoked.
        if (tzt.time < minTime && (lastTransitionBeforeMinTime == null || lastTransitionBeforeMinTime.time < tzt.time))
          lastTransitionBeforeMinTime = tzt;

        if ((tzt.time < minTime || fallbackStdLetters === '?') && tzt.dstOffset === 0)
          fallbackStdLetters = tzt.rule.letters;
      }
    }

    if (addLeadingTransition) {
      let name: string;
      let dstOffset = 0;
      let rule: TzRule;

      if (lastTransitionBeforeMinTime != null) {
        rule = lastTransitionBeforeMinTime.rule;
        dstOffset = rule.save;
        name = TzCompiler.createDisplayName(zpc.format, lastTransitionBeforeMinTime.rule.letters, dstOffset !== 0);
      }
      else {
        const letters = (firstStdLetters === '?' ? fallbackStdLetters : firstStdLetters);

        name = TzCompiler.createDisplayName(zpc.format, letters, false);
      }

      newTransitions.splice(0, 0, new TzTransition(minTime, zpc.utcOffset + dstOffset, dstOffset, name, rule));
    }

    transitions.push(...newTransitions);

    if (zpc.untilType === ClockType.CLOCK_TYPE_WALL && transitions.length > 0) {
      const tzt = last(transitions);

      if (tzt.rule != null && zpc.until !== Number.MAX_SAFE_INTEGER)
        zpc.until -= tzt.rule.save;
    }
  }

  private static createDisplayName(format: string, letters: string, isDst: boolean): string {
    let name: string;
    let pos = format.indexOf('%s');

    if (pos >= 0) {
      if (letters === '?')
        console.error('*** Error: unresolved time zone name ' + format + (isDst ? ', DST' : ''));

      name = format.substring(0, pos) + letters + format.substring(pos + 2);
    }
    else {
      pos = format.indexOf('/');

      if (pos >= 0)
        name = (isDst ? format.substring(pos + 1) : format.substring(0, pos));
      else
        name = format;
    }

    if (name.startsWith('+') || name.startsWith('-'))
      return null;
    else
      return name;
  }
}
