import { IanaZonesAndRulesParser, TzMode } from './iana-zones-and-rules-parser';
import { appendPopulationAndCountries, getPopulation, getPopulationAndCountries } from './population-and-country-data';
import { abs, min } from '@tubular/math';
import ttime, { DateTime } from '@tubular/time';
import { compareStrings, toNumber } from '@tubular/util';
import { TzCompiler } from './tz-compiler';
import { Rollbacks, TzTransitionList } from './tz-transition-list';
import { Writable } from 'stream';
import { writeZoneInfoFile } from './tz-binary';
import { DEFAULT_MAX_YEAR, DEFAULT_MIN_YEAR } from './tz-util';
import { MAIN_REGIONS } from './read-tzdb';

export enum TzFormat { BINARY, JSON, JAVASCRIPT, TYPESCRIPT, TEXT }
export enum TzPresets { NONE, SMALL, LARGE, LARGE_ALT }
export enum TzPhase { DOWNLOAD, EXTRACT, PARSE, COMPILE, VALIDATE, REENCODE, OUTPUT_OF_RESULTS, DONE }
export enum TzMessageLevel { INFO, LOG, WARN, ERROR }

export type TzCallback = (
  phase?: TzPhase,
  level?: TzMessageLevel,
  message?: string,
  step?: number,
  stepCount?: number
) => void;

export interface TzOptions {
  callback?: TzCallback,
  filtered?: boolean;
  fixRollbacks?: boolean;
  format?: TzFormat
  maxYear?: number;
  minYear?: number;
  mode?: TzMode;
  noBackward?: boolean;
  packrat?: boolean;
  preset?: TzPresets;
  roundToMinutes?: boolean;
  singleRegionOrZone?: string;
  systemV?: boolean;
  urlOrVersion?: string;
  zoneInfoDir?: string;
}

export interface TzOutputOptions extends TzOptions {
  bloat?: boolean;
  directory?: string;
  fileStream?: NodeJS.WriteStream,
  includeLeaps?: boolean,
}

const skippedZones = /America\/Indianapolis|America\/Knox_IN|Asia\/Riyadh\d\d/;
const extendedRegions = /(America\/Argentina|America\/Indiana)\/(.+)/;
const skippedRegions = /Etc|GB|GB-Eire|GMT0|NZ|NZ-CHAT|SystemV|W-SU|Zulu|Mideast|[A-Z]{3}(\d[A-Z]{3})?/;
const miscUnique = /CST6CDT|EET|EST5EDT|MST7MDT|PST8PDT|SystemV\/(AST4ADT|CST6CDT|EST5EDT|MST7MDT|PST8PDT|YST9YDT)|WET/;

export async function getTzData(options: TzOptions = {}, asString = false): Promise<any> {
  const stream = new Writable();
  const output: string[] = [];

  if (options.format !== TzFormat.JSON)
    asString = true;

  stream.write = (chunk: any): boolean => {
    output.push(chunk.toString());
    return true;
  };

  await writeTimezones(Object.assign(
    { fileStream: stream, format: TzFormat.JSON } as TzOutputOptions, options));

  return asString ? output.join('') : JSON.parse(output.join(''));
}

export async function writeTimezones(options: TzOutputOptions = {}): Promise<void> {
  options.format = options.format ?? TzFormat.JSON;
  options.preset = options.preset ?? TzPresets.NONE;

  let minYear = options.minYear ?? DEFAULT_MIN_YEAR;
  let maxYear = options.maxYear ?? DEFAULT_MAX_YEAR;
  let variableName = 'tzData';
  const currentYear = ttime().wallTime.y;
  const cutoffYear = currentYear + 67;
  const qt = (options.format > TzFormat.JSON) ? "'" : '"';
  const iqt = (options.format > TzFormat.JSON) ? '' : '"';
  const stream = options.fileStream ?? process.stdout;
  const progress = options.callback;
  let trimMarkers = false;

  const report = (phase?: TzPhase, level?: TzMessageLevel, message?: string, n?: number, m?: number): void => {
    if (progress)
      progress(phase, level, message, n, m);
  };

  const write = (s = ''): void => {
    stream.write(s + '\n');
  };

  switch (options.preset) {
    case TzPresets.SMALL:
      variableName = 'timezoneSmall';
      minYear = options.minYear ?? currentYear - 5;
      maxYear = options.maxYear ?? currentYear + 5;
      options.filtered = options.filtered ?? false;
      options.roundToMinutes = options.roundToMinutes ?? false;
      options.fixRollbacks = options.fixRollbacks ?? false;
      options.systemV = true;
      trimMarkers = true;
      break;

    case TzPresets.LARGE:
      variableName = 'timezoneLarge';
      minYear = options.minYear ?? 1800;
      maxYear = options.maxYear ?? cutoffYear;
      options.filtered = options.filtered ?? false;
      options.roundToMinutes = options.roundToMinutes ?? false;
      options.fixRollbacks = options.fixRollbacks ?? false;
      options.systemV = true;
      trimMarkers = true;
      break;

    case TzPresets.LARGE_ALT:
      variableName = 'timezoneLargeAlt';
      minYear = options.minYear ?? 1800;
      maxYear = options.maxYear ?? cutoffYear;
      options.filtered = true;
      options.roundToMinutes = true;
      options.fixRollbacks = true;
      options.systemV = true;
      trimMarkers = true;
  }

  const parser = new IanaZonesAndRulesParser();
  const singleZone = options.singleRegionOrZone && !MAIN_REGIONS.has(options.singleRegionOrZone) &&
    options.singleRegionOrZone;
  const singleRegion = !singleZone && options.singleRegionOrZone?.toLowerCase();
  const version = await parser.parseFromOnline({
    mode: options.mode,
    noBackward: options.noBackward,
    roundToMinutes: options.roundToMinutes,
    packrat: options.packrat,
    progress,
    singleRegion,
    systemV: options.systemV,
    urlOrVersion: options.urlOrVersion
  });

  if (!singleZone)
    report(TzPhase.PARSE, TzMessageLevel.INFO, version);

  let comment = `tz database version: ${version}, years ${minYear}-${maxYear}`;

  if (options.mode === TzMode.REARGUARD)
    comment += ', rearguard';
  else if (options.mode === TzMode.VANGUARD)
    comment += ', vanguard';

  if (options.roundToMinutes)
    comment += ', rounded to nearest minute';

  if (options.filtered)
    comment += ', filtered';

  if (options.fixRollbacks)
    comment += ', calendar rollbacks eliminated';

  const compiler = new TzCompiler(parser);
  let zoneMap: Map<string, TzTransitionList>;

  if (singleZone)
    zoneMap = new Map().set(singleZone, await compiler.compile(singleZone, minYear, maxYear));
  else
    zoneMap = await compiler.compileAll(minYear, maxYear, progress);

  let zoneList = Array.from(zoneMap.keys());
  const sortKey = (zoneId: string): string => zoneMap.get(zoneId).aliasFor ? zoneId : '*' + zoneId;
  const zonesByCTT = new Map<string, string>();
  const cttsByZone = new Map<string, string>();
  let duplicatesFound = false;
  const notOriginallyAliased = new Set(Array.from(zoneMap.values()).filter(z => !z.aliasFor).map(z => z.zoneId));

  zoneList = zoneList.sort((a, b) =>
    compareStrings(sortKey(a), sortKey(b))).filter(z => !shouldFilter(z, options, singleZone));

  // Purge duplicates
  for (let i = 0; i < zoneList.length; ++i) {
    const zoneId = zoneList[i];
    const zone = zoneMap.get(zoneId);

    if (zone.aliasFor && !singleZone)
      continue;
    else if (options.zoneInfoDir) {
      const tzInfo = TzTransitionList.getZoneTransitionsFromZoneinfo(options.zoneInfoDir, zoneId,
        options.roundToMinutes);

      if (tzInfo)
        zone.transitionsMatch(tzInfo, false, options.roundToMinutes, progress);
      else
        progress(TzPhase.VALIDATE, TzMessageLevel.ERROR,
          `*** ${zoneId}: matching zoneinfo file unavailable for validation`);
    }

    if (options.fixRollbacks &&
        zone.findCalendarRollbacks(true, progress) === Rollbacks.ROLLBACKS_REMAIN)
      report(TzPhase.REENCODE, TzMessageLevel.ERROR, `*** Failed to fix calendar rollbacks in ${zoneId}`);

    report(TzPhase.REENCODE, TzMessageLevel.INFO, `Compressing ${zoneId} \x1B[50G%s of %s`, i + 1, zoneList.length);

    const ctt = zone.createCompactTransitionTable(options.fixRollbacks);

    if (zonesByCTT.has(ctt)) {
      duplicatesFound = true;

      const prevId = zonesByCTT.get(ctt);

      // Keep the zoneId with the higher population
      if (getPopulation(prevId) > getPopulation(zoneId))
        zone.aliasFor = prevId;
      else {
        zone.aliasFor = undefined;
        zonesByCTT.set(ctt, zoneId);
        cttsByZone.set(zoneId, ctt);
        zoneMap.get(prevId).aliasFor = zoneId;
      }
    }
    else {
      zonesByCTT.set(ctt, zoneId);
      cttsByZone.set(zoneId, ctt);
    }
  }

  for (const zoneId of zoneList) {
    const zone = zoneMap.get(zoneId);

    if (zone.aliasFor) {
      let parent: TzTransitionList;

      while ((parent = zoneMap.get(zone.aliasFor))?.aliasFor)
        zone.aliasFor = parent.aliasFor;
    }
  }

  if (duplicatesFound)
    zoneList.sort((a, b) => compareStrings(sortKey(a), sortKey(b)));

  report(TzPhase.OUTPUT_OF_RESULTS);

  if (options.format === TzFormat.JSON)
    write('{');
  else if (options.format === TzFormat.JAVASCRIPT || options.format === TzFormat.TYPESCRIPT) {
    write('/* eslint-disable quote-props */');
    write('/* cspell:disable */ // noinspection SpellCheckingInspection');
    write(`const ${variableName} = ${trimMarkers ? '/* trim-file-start */' : ''}{ // ${comment}`);
  }
  else if (options.format === TzFormat.TEXT) {
    write(comment);
    write('-'.repeat(comment.length));
    write();
  }

  const deltaTs = parser.getDeltaTs()?.trim();
  const leaps = parser.getLeapSeconds()?.trim();

  if (options.format !== TzFormat.BINARY && options.format !== TzFormat.TEXT) {
    write(`  ${iqt}version${iqt}: ${qt}${version}${qt},`);
    write(`  ${iqt}years${iqt}: ${qt}${minYear}-${maxYear}${qt},`);

    if (deltaTs)
      write(`  ${iqt}deltaTs${iqt}: ${qt}${deltaTs}${qt},`);

    if (leaps)
      write(`  ${iqt}leapSeconds${iqt}: ${qt}${leaps}${qt},`);
  }
  else if (options.format === TzFormat.TEXT && !singleZone) {
    if (deltaTs) {
      write('----------- Delta T -----------');

      let lines = '';

      deltaTs.split(/\s+/).forEach((dt, i, dts) => {
        if (i % 10 === 0)
          lines += (2020 + i).toString() +
            (i === dts.length - 1 ? '     ' : '-' + (2020 + i + min(dts.length - i - 1, 9))) + ':';

        lines += ' ' + dt + (i < dts.length - 1 ? ',' : '');
        lines += (i === dts.length - 1 || (i + 1) % 10 === 0 ? '\n' : '');
      });

      write(lines);
    }

    if (leaps) {
      write('----------- Leap seconds -----------');

      let deltaTAI = 10;

      leaps.split(/\s+/).map(day => toNumber(day)).forEach(day => {
        deltaTAI += (day > 0 ? 1 : -1);
        write(new DateTime(abs(day) * 86400000 - 1000, 'UTC').format('MMM DD, Y HH:mm:ss')
          .replace(/:59$/, day > 0 ? ':60' : ':58') + ` TAI = UTC + ${deltaTAI}`
          + (day < 0 ? ' (negative leap second)' : ''));
      });

      write();
    }
  }

  for (let i = 0; i < zoneList.length; ++i) {
    await new Promise<void>(resolve => {
      const zoneId = zoneList[i];
      const zone = zoneMap.get(zoneId);

      if (options.format === TzFormat.TEXT) {
        zone.dump(stream, options.roundToMinutes);

        if (i < zoneList.length)
          write();

        resolve();
        return;
      }
      else if (options.format === TzFormat.BINARY) {
        writeZoneInfoFile(options.directory, zone, options.bloat,
          options.includeLeaps ? leaps : null).then(() => resolve());
        return;
      }

      const delim = (i < zoneList.length - 1 ? ',' : '');

      if (zone.aliasFor && zoneList.includes(zone.aliasFor)) {
        let aliasFor = zone.aliasFor;
        const popAndC = getPopulationAndCountries(zoneId);
        const aliasPopAndC = getPopulationAndCountries(aliasFor);

        if (popAndC !== aliasPopAndC) {
          if (!popAndC)
            aliasFor = '!' + aliasFor;
          else
            aliasFor = `!${popAndC.replace(/;/g, ',')},${aliasFor}`;
        }
        else if (notOriginallyAliased.has(zoneId))
          aliasFor = '!' + aliasFor;

        write(`  ${qt}${zoneId}${qt}: ${qt}${aliasFor}${qt}${delim}`);
      }
      else {
        let ctt = cttsByZone.get(zoneId);

        if (!ctt)
          ctt = zone.createCompactTransitionTable(options.fixRollbacks);

        write(`  ${qt}${zoneId}${qt}: ${qt}${appendPopulationAndCountries(ctt, zoneId)}${qt}${delim}`);
      }

      resolve();
    });
  }

  if (options.format !== TzFormat.TEXT && options.format !== TzFormat.BINARY) {
    write('}' + (options.format !== TzFormat.JSON && trimMarkers ? '/* trim-file-end */;' :
      options.format === TzFormat.JSON ? '' : ';'));

    if (options.format !== TzFormat.JSON) {
      write();
      write(`Object.freeze(${variableName});`);

      if (options.format === TzFormat.JAVASCRIPT)
        write(`module.exports = ${variableName};`);
      else if (options.format === TzFormat.TYPESCRIPT)
        write(`export default ${variableName};`);
    }
  }

  report(TzPhase.DONE);
}

function shouldFilter(zoneId: string, options: TzOutputOptions, singleZone: string): boolean {
  if ((options.filtered && skippedZones.test(zoneId)) || (singleZone && zoneId !== singleZone))
    return true;

  let region: string;
  let locale: string;
  const $ = extendedRegions.exec(zoneId);

  if ($) {
    region = $[1];
    locale = $[2];
  }
  else {
    const pos = zoneId.indexOf('/');

    region = (pos < 0 ? zoneId : zoneId.substr(0, pos));
    locale = (pos < 0 ? null : zoneId.substr(pos + 1));
  }

  if (options.systemV && region === 'SystemV')
    region = 'xxx';

  return (options.filtered && (locale == null || skippedRegions.test(region)) && !miscUnique.test(zoneId));
}
