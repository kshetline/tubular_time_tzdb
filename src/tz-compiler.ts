import { ClockType, DEFAULT_MAX_YEAR, DEFAULT_MIN_YEAR, makeTime } from './tz-util';
import { IanaZonesAndRulesParser } from './iana-zones-and-rules-parser';
import { TzTransitionList } from './tz-transition-list';
import { isBoolean, isFunction, last, processMillis } from '@tubular/util';
import { parseTimeOffset } from '@tubular/time';
import { TzTransition } from './tz-transition';
import { min, sign } from '@tubular/math';
import { TzRule } from './tz-rule';
import { TzCallback, TzMessageLevel, TzPhase } from './tz-writer';

export class CompilerError extends Error {}

export interface ZoneProcessingContext
{
  zoneId: string;
  zoneIndex: number;
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

  async compileAll(minYear?: number, maxYear?: number, progress?: TzCallback): Promise<Map<string, TzTransitionList>>;
  // noinspection JSUnusedGlobalSymbols
  async compileAll(minYear: number, maxYear: number, progress?: TzCallback): Promise<Map<string, TzTransitionList>>;
  // noinspection JSUnusedGlobalSymbols
  async compileAll(minYear?: number, maxYear?: number, strictDuplicateRemoval?: boolean,
    progress?: TzCallback): Promise<Map<string, TzTransitionList>>;

  async compileAll(minYear = DEFAULT_MIN_YEAR, maxYear = DEFAULT_MAX_YEAR, progressOrSdr?: TzCallback | boolean,
                   progress?: TzCallback): Promise<Map<string, TzTransitionList>>  {
    const strictDuplicateRemoval = isBoolean(progressOrSdr) ? progressOrSdr : false;
    const compiledZones = new Map<string, TzTransitionList>();
    const zoneIds = this.parser.getZoneIds();
    const deferred: string[] = [];

    progress = isFunction(progressOrSdr) ? progressOrSdr : progress;

    for (const zoneId of zoneIds) {
      const transitions = await this.compile(zoneId, minYear, maxYear, strictDuplicateRemoval, true);

      if (transitions)
        compiledZones.set(zoneId, transitions);
      else
        deferred.push(zoneId);

      if (progress)
        progress(TzPhase.COMPILE, TzMessageLevel.INFO, zoneId + ': \x1B[50G%s of %s', compiledZones.size, zoneIds.length);
    }

    for (const zoneId of deferred) {
      const alias = this.parser.getAliasFor(zoneId);

      if (alias && compiledZones.get(alias))
        compiledZones.set(zoneId, compiledZones.get(alias).clone(zoneId, alias));
    }

    return compiledZones;
  }

  async compile(zoneId: string, minYear = DEFAULT_MIN_YEAR, maxYear = DEFAULT_MAX_YEAR,
                strictDuplicateRemoval = false, canDefer = false): Promise<TzTransitionList>  {
    const transitions = new TzTransitionList(zoneId);
    const zpc = {} as ZoneProcessingContext;
    const zone = this.parser.getZone(zoneId);
    let index = 0;

    transitions.aliasFor = this.parser.getAliasFor(zoneId);

    if (canDefer && transitions.aliasFor)
      return null;

    zpc.zoneId = zoneId;
    zpc.lastUtcOffset = 0;
    zpc.lastUntil = Number.MIN_SAFE_INTEGER;
    zpc.lastUntilType = ClockType.CLOCK_TYPE_WALL;
    zpc.format = null;

    transitions.setLastZoneRec(last(zone));

    while (index < zone.length) {
      const startTime = processMillis();

      await new Promise<void>(resolve => {
        do {
          const zoneRec = zone[index];
          let dstOffset = 0;

          if (zoneRec.rules != null && zoneRec.rules.indexOf(':') >= 0)
            dstOffset = parseTimeOffset(zoneRec.rules, true);

          zpc.zoneIndex = zoneRec.zoneIndex;
          zpc.utcOffset = zoneRec.utcOffset;
          zpc.until = zoneRec.until;
          zpc.untilType = zoneRec.untilType;
          zpc.format = zoneRec.format;

          if (zoneRec.rules == null || zoneRec.rules.indexOf(':') >= 0) {
            const name = TzCompiler.createDisplayName(zoneRec.format, '?', dstOffset !== 0);

            transitions.push(new TzTransition(zpc.lastUntil, zoneRec.utcOffset + dstOffset, dstOffset, name,
              zoneRec.zoneIndex, zpc.lastUntilType));

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

          ++index;
        } while (index < zone.length && processMillis() < startTime + 100);

        resolve();
      });
    }

    transitions.removeDuplicateTransitions(strictDuplicateRemoval);
    transitions.trim(minYear, maxYear);

    return transitions;
  }

  private applyRules(rulesName: string, transitions: TzTransitionList, zpc: ZoneProcessingContext, minYear: number, maxYear: number): void {
    const ruleSet = this.parser.getRuleSet(rulesName);

    if (!ruleSet)
      throw new CompilerError(`Unknown rule set "${rulesName}" for timezone ${zpc.zoneId}`);

    const minTime = zpc.lastUntil;
    let firstStdLetters = '?';
    let fallbackStdLetters = '?';

    const zoneOffset = zpc.utcOffset;
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
        const ruleTransitions = rule.getTransitions(min(maxYear, highYear), zpc, lastDst);

        newTransitions.push(...ruleTransitions);
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

      newTransitions.splice(0, 0, new TzTransition(minTime, zpc.utcOffset + dstOffset, dstOffset, name,
        zpc.zoneIndex, zpc.lastUntilType, rule));
    }

    transitions.push(...newTransitions);

    if (zpc.untilType === ClockType.CLOCK_TYPE_WALL && transitions.length > 0) {
      const tzt = last(transitions);

      if (tzt.rule != null && zpc.until !== Number.MAX_SAFE_INTEGER)
        zpc.until -= tzt.rule.save;
    }
  }

  static createDisplayName(format: string, letters: string, isDst: boolean): string {
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
