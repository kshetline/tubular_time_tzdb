import { IanaZonesAndRulesParser } from './iana-zones-and-rules-parser';
import { appendPopulationAndCountries, getPopulation, getPopulationAndCountries } from './population-and-country-data';
import ttime from '@tubular/time';
import { compareStrings } from '@tubular/util';
import { TzCompiler } from './tz-compiler';
import { Rollbacks, TzTransitionList } from './tz-transition-list';
import { Writable } from 'stream';

export const DEFAULT_MIN_YEAR = 1900;
export const DEFAULT_MAX_YEAR = 2050;

export enum TzFormat { JSON, JAVASCRIPT, TYPESCRIPT, TEXT }
export enum TzPresets { NONE, SMALL, LARGE, LARGE_ALT }
export enum TzPhase { DOWNLOAD, EXTRACT, PARSE, COMPILE, VALIDATE, COMPRESS }
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
  minYear?: number;
  maxYear?: number;
  preset?: TzPresets;
  roundToMinutes?: boolean;
  singleZone?: string;
  systemV?: boolean;
  urlOrVersion?: string;
  zoneInfoDir?: string;
}

export interface TzOutputOptions extends TzOptions {
  fileStream?: NodeJS.WriteStream,
  format?: TzFormat
}

const skippedZones = /America\/Indianapolis|America\/Knox_IN|Asia\/Riyadh\d\d/;
const extendedRegions = /(America\/Argentina|America\/Indiana)\/(.+)/;
const skippedRegions = /Etc|GB|GB-Eire|GMT0|NZ|NZ-CHAT|SystemV|W-SU|Zulu|Mideast|[A-Z]{3}(\d[A-Z]{3})?/;
const miscUnique = /CST6CDT|EET|EST5EDT|MST7MDT|PST8PDT|SystemV\/AST4ADT|SystemV\/CST6CDT|SystemV\/EST5EDT|SystemV\/MST7MDT|SystemV\/PST8PDT|SystemV\/YST9YDT|WET/;

export async function getTzData(options: TzOptions = {}): Promise<any> {
  const stream = new Writable();
  const output: string[] = [];

  stream.write = (chunk: any): boolean => {
    output.push(chunk.toString());
    return true;
  };

  await writeTimezones(Object.assign(
    { fileStream: stream, format: TzFormat.JSON } as TzOutputOptions, options));

  return JSON.parse(output.join(''));
}

export async function writeTimezones(options: TzOutputOptions = {}): Promise<void> {
  options.format = options.format ?? TzFormat.JSON;
  options.preset = options.preset ?? TzPresets.NONE;

  let minYear = options.minYear ?? DEFAULT_MIN_YEAR;
  let maxYear = options.maxYear ?? DEFAULT_MAX_YEAR;
  let variableName = 'tzData';
  const currentYear = ttime().wallTime.y;
  const qt = (options.format > TzFormat.JSON) ? "'" : '"';
  const iqt = (options.format > TzFormat.JSON) ? '' : '"';
  const stream = options.fileStream ?? process.stdout;
  const progress = options.callback;

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
      break;

    case TzPresets.LARGE:
      variableName = 'timezoneLarge';
      minYear = options.minYear ?? 1800;
      maxYear = options.maxYear ?? currentYear + 67;
      options.filtered = options.filtered ?? false;
      options.roundToMinutes = options.roundToMinutes ?? false;
      options.fixRollbacks = options.fixRollbacks ?? false;
      options.systemV = true;
      break;

    case TzPresets.LARGE_ALT:
      variableName = 'timezoneLargeAlt';
      minYear = options.minYear ?? 1800;
      maxYear = options.maxYear ?? currentYear + 67;
      options.filtered = true;
      options.roundToMinutes = true;
      options.fixRollbacks = true;
      options.systemV = true;
  }

  const parser = new IanaZonesAndRulesParser(options.roundToMinutes, progress);
  let version: string;

  try {
    version = await parser.parseFromOnline(options.urlOrVersion, options.systemV);

    if (!options.singleZone)
      report(TzPhase.PARSE, TzMessageLevel.INFO, version);
  }
  catch (err) {
    console.error(err);
    process.exit(1);
  }

  let comment = `tz database version: ${version}, years ${minYear}-${maxYear}`;

  if (options.roundToMinutes)
    comment += ', rounded to nearest minute';

  if (options.filtered)
    comment += ', filtered';

  if (options.fixRollbacks)
    comment += ', calendar rollbacks eliminated';

  const compiler = new TzCompiler(parser);
  let zoneMap: Map<string, TzTransitionList>;

  if (options.singleZone)
    zoneMap = new Map().set(options.singleZone, await compiler.compile(options.singleZone, minYear, maxYear));
  else {
    zoneMap = await compiler.compileAll(minYear, maxYear, progress);
    report(TzPhase.COMPILE, TzMessageLevel.LOG, '');
  }

  let zoneList = Array.from(zoneMap.keys());
  const sortKey = (zoneId: string): string => zoneMap.get(zoneId).aliasFor ? zoneId : '*' + zoneId;
  const zonesByCTT = new Map<string, string>();
  const cttsByZone = new Map<string, string>();
  let duplicatesFound = false;
  const notOriginallyAliased = new Set(Array.from(zoneMap.values()).filter(z => !z.aliasFor).map(z => z.zoneId));

  zoneList = zoneList.sort((a, b) =>
    compareStrings(sortKey(a), sortKey(b))).filter(z => !shouldFilter(z, options));

  // Purge duplicates
  for (let i = 0; i < zoneList.length; ++i) {
    const zoneId = zoneList[i];
    const zone = zoneMap.get(zoneId);

    if (zone.aliasFor && !options.singleZone)
      continue;
    else if (options.zoneInfoDir) {
      const tzInfo = TzTransitionList.getZoneTransitionsFromZoneinfo(options.zoneInfoDir, zoneId,
        options.roundToMinutes);

      if (tzInfo)
        zone.transitionsMatch(tzInfo, false, options.roundToMinutes, progress);
      else
        progress(TzPhase.VALIDATE, TzMessageLevel.ERROR, `*** ${zoneId}: matching zoneinfo file unavailable for validation`);
    }

    if ((progress || options.fixRollbacks) &&
        zone.findCalendarRollbacks(options.fixRollbacks, progress) === Rollbacks.ROLLBACKS_REMAIN)
      report(TzPhase.COMPRESS, TzMessageLevel.ERROR, `*** Failed to fix calendar rollbacks in ${zoneId}`);

    report(TzPhase.COMPRESS, TzMessageLevel.INFO, `Compressing ${zoneId} \x1B[40G%s of %s`, i + 1, zoneList.length);

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

  if (options.format === TzFormat.JSON)
    write('{');
  else if (options.format !== TzFormat.TEXT) {
    write('/* eslint-disable quote-props */');
    write('// noinspection SpellCheckingInspection');
    write(`const ${variableName} = /* trim-file-start */{ // ${comment}`);
  }
  else {
    write(comment);
    write('-'.repeat(comment.length));
    write();
  }

  if (options.format !== TzFormat.TEXT) {
    write(`  ${iqt}version${iqt}: ${qt}${version}${qt},`);
    write(`  ${iqt}years${iqt}: ${qt}${minYear}-${maxYear}${qt},`);
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

  if (options.format !== TzFormat.TEXT) {
    write('}' + (options.format !== TzFormat.JSON ? '/* trim-file-end */;' : ''));

    if (options.format !== TzFormat.JSON) {
      write();
      write(`Object.freeze(${variableName});`);

      if (options.format === TzFormat.TYPESCRIPT)
        write(`export default ${variableName};`);
    }
  }
}

function shouldFilter(zoneId: string, options: TzOutputOptions): boolean {
  if ((options.filtered && skippedZones.test(zoneId)) || (options.singleZone && zoneId !== options.singleZone))
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

  return (options.filtered && (locale == null || skippedRegions.test(region)) && !miscUnique.test(zoneId));
}
