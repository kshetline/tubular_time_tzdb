import ttime from '@tubular/time';
import { compareStrings } from '@tubular/util';
import { IanaZonesAndRulesParser } from './iana-zones-and-rules-parser';
import { TzCompiler } from './tz-compiler';
import { appendPopulationAndCountries, getPopulation, getPopulationAndCountries } from './population-and-country-data';
import { TzTransitionList } from './tz-transition-list';

export const DEFAULT_MIN_YEAR = 1900;
export const DEFAULT_MAX_YEAR = 2050;

export enum TzFormat { JSON, JAVASCRIPT, TYPESCRIPT, TEXT }
export enum TzPresets { SMALL, LARGE, LARGE_ALT }

export interface TzOutputOptions {
  filtered?: boolean;
  fixRollbacks?: boolean;
  format?: TzFormat
  minYear?: number;
  maxYear?: number;
  preset?: TzPresets;
  roundToMinutes?: boolean;
  singleZone?: string;
  systemV?: boolean;
  urlOrVersion?: string;
  quiet?: boolean;
}

const skippedZones = /America\/Indianapolis|America\/Knox_IN|Asia\/Riyadh\d\d/;
const extendedRegions = /(America\/Argentina|America\/Indiana)\/(.+)/;
const skippedRegions = /Etc|GB|GB-Eire|GMT0|NZ|NZ-CHAT|SystemV|W-SU|Zulu|Mideast|[A-Z]{3}(\d[A-Z]{3})?/;
const miscUnique = /CST6CDT|EET|EST5EDT|MST7MDT|PST8PDT|SystemV\/AST4ADT|SystemV\/CST6CDT|SystemV\/EST5EDT|SystemV\/MST7MDT|SystemV\/PST8PDT|SystemV\/YST9YDT|WET/;

export async function writeTimezones(options: TzOutputOptions = {}): Promise<void> {
  let minYear = options.minYear ?? DEFAULT_MIN_YEAR;
  let maxYear = options.maxYear ?? DEFAULT_MAX_YEAR;
  const currentYear = ttime().wallTime.y - 1;
  const qt = (options.format > TzFormat.JSON) ? "'" : '"';

  switch (options.preset) {
    case TzPresets.SMALL:
      minYear = currentYear - 5;
      maxYear = currentYear + 5;
      options.filtered = false;
      options.roundToMinutes = false;
      options.fixRollbacks = false;
      options.systemV = false;
      break;

    case TzPresets.LARGE:
      minYear = 1800;
      maxYear = currentYear + 66;
      options.filtered = false;
      options.roundToMinutes = false;
      options.fixRollbacks = false;
      options.systemV = true;
      break;

    case TzPresets.LARGE_ALT:
      minYear = 1800;
      maxYear = currentYear + 66;
      options.filtered = true;
      options.roundToMinutes = true;
      options.fixRollbacks = true;
      options.systemV = true;
  }

  const parser = new IanaZonesAndRulesParser(options.roundToMinutes, true);
  let version: string;

  try {
    version = await parser.parseFromOnline(options.urlOrVersion, options.systemV);
    console.log(version);
  }
  catch (err) {
    console.log(err);
    process.exit(1);
  }

  const compiler = new TzCompiler(parser);
  const zoneMap = await compiler.compileAll(minYear, maxYear, () => process.stdout.write('.'));
  console.log();
  let zoneList = Array.from(zoneMap.keys());
  const sortKey = (zoneId: string): string => zoneMap.get(zoneId).aliasFor ? zoneId : '*' + zoneId;
  const zonesByCTT = new Map<string, string>();
  const cttsByZone = new Map<string, string>();
  let duplicatesFound = false;

  zoneList = zoneList.sort((a, b) =>
    compareStrings(sortKey(a), sortKey(b))).filter(z => !shouldFilter(z, options));

  // Purge duplicates
  for (let i = 0; i < zoneList.length; ++i) {
    const zoneId = zoneList[i];
    const zone = zoneMap.get(zoneId);

    if (zone.aliasFor)
      continue;

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

      while ((parent = zoneMap.get(zone.aliasFor)).aliasFor)
        zone.aliasFor = parent.aliasFor;
    }
  }

  if (duplicatesFound)
    zoneList.sort((a, b) => compareStrings(sortKey(a), sortKey(b)));

  for (let i = 0; i < zoneList.length; ++i) {
    const zoneId = zoneList[i];
    const zone = zoneMap.get(zoneId);
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

      console.log(`${qt}${zoneId}${qt}: ${qt}${aliasFor}${qt}${delim}`);
    }
    else
      console.log(`${qt}${zoneId}${qt}: ${qt}${appendPopulationAndCountries(cttsByZone.get(zoneId), zoneId)}${qt}${delim}`);
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
