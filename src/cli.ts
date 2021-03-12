/*
  Copyright © 2018-2021 Kerry Shetline, kerry@shetline.com

  MIT license: https://opensource.org/licenses/MIT

  Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated
  documentation files (the 'Software'), to deal in the Software without restriction, including without limitation the
  rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit
  persons to whom the Software is furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all copies or substantial portions of the
  Software.

  THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
  WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
  COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
  OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

import { Command } from 'commander';
import { DEFAULT_URL } from './read-tzdb';
import { compareStrings, toInt } from '@tubular/util';
import { IanaZonesAndRulesParser } from './iana-zones-and-rules-parser';
import { TzCompiler } from './tz-compiler';
import ttime from '@tubular/time';
import { appendPopulationAndCountries, getPopulation, getPopulationAndCountries } from './population-and-country-data';

const DEFAULT_MIN_YEAR = 1900;
const DEFAULT_MAX_YEAR = 2050;

const skippedZones = /America\/Indianapolis|America\/Knox_IN|Asia\/Riyadh\d\d/;
const extendedRegions = /(America\/Argentina|America\/Indiana)\/(.+)/;
const skippedRegions = /Etc|GB|GB-Eire|GMT0|NZ|NZ-CHAT|SystemV|W-SU|Zulu|Mideast|[A-Z]{3}(\d[A-Z]{3})?/;
const miscUnique = /CST6CDT|EET|EST5EDT|MST7MDT|PST8PDT|SystemV\/AST4ADT|SystemV\/CST6CDT|SystemV\/EST5EDT|SystemV\/MST7MDT|SystemV\/PST8PDT|SystemV\/YST9YDT|WET/;

const program = new Command();
const nl = '\n' + ' '.repeat(18);
const options = program
  .option('-5, --systemv', `Include the SystemV timezones from the systemv file by${nl}\
uncommenting the commented-out zone descriptions.`)
  .option('-f', `Filter out Etc/GMTxxxx and other timezones that are either${nl}\
redundant or covered by options for creating fixed-offset timezones.`)
  .option('-j, --javascript', 'Output JavaScript instead of JSON.')
  .option('--large', 'Apply presets for "large" timezone definitions.')
  .option('--large-alt', 'Apply presets for "large-alt" timezone definitions.')
  .option('-m', 'Round all UTC offsets to whole minutes.')
  .option('-q', 'Display fewer warning messages.')
  .option('-r', `Remove 'calendar rollbacks' from time zone transitions -- that is${nl}\
modify time zone data to prevent situations where the calendar date${nl}\
goes backwards as well as the hour and/or minute of the day.`)
  .option('-s <zone-id>', 'Zone ID for a single time zone to be rendered.')
  .option('--small', 'Apply presets for "small" timezone definitions.')
  .option('-t, --typescript', 'Output TypeScript instead of JSON.')
  .option('--text', 'Output (somewhat) human-readable text')
  .option('-u, --url', `URL or version number, such as '2018c', to parse and compile.${nl}Default: ${DEFAULT_URL}`)
  .option('-v, --version', 'Display the version of this tool.')
  .option('-y <year-span>', `<min_year,max_year> Year range for explicit time zone transitions.${nl}\
Default: ${DEFAULT_MIN_YEAR},${DEFAULT_MAX_YEAR}`)
  .parse(process.argv).opts();

console.log(options);

let minYear = DEFAULT_MIN_YEAR;
let maxYear = DEFAULT_MAX_YEAR;
const currentYear = ttime().wallTime.y - 1;
const qt = (options.javascript || options.typescript) ? "'" : '"';

if (options.Y) {
  const parts = options.Y.split(',');

  if (parts.length === 1)
    minYear = maxYear = toInt(parts[0]);
  else if (parts.length === 2) {
    minYear = toInt(parts[0], DEFAULT_MIN_YEAR);
    maxYear = toInt(parts[1], DEFAULT_MAX_YEAR);
  }
}

if (options.small) {
  minYear = currentYear - 5;
  maxYear = currentYear + 5;
  options.F = false;
  options.M = false;
  options.R = false;
  options.systemv = false;
}
else if (options.large) {
  minYear = 1800;
  maxYear = currentYear + 66;
  options.F = false;
  options.M = false;
  options.R = false;
  options.systemv = true;
}
else if (options.largeAlt) {
  minYear = 1800;
  maxYear = currentYear + 66;
  options.F = true;
  options.M = true;
  options.R = true;
  options.systemv = true;
}

(async (): Promise<void> => {
  const parser = new IanaZonesAndRulesParser(options.M, true);
  let version: string;

  try {
    version = await parser.parseFromOnline(options.systemv);
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

  zoneList = zoneList.sort((a, b) => compareStrings(sortKey(a), sortKey(b))).filter(z => !shouldFilter(z));

  // Purge duplicates
  for (let i = 0; i < zoneList.length; ++i) {
    const zoneId = zoneList[i];
    const zone = zoneMap.get(zoneId);

    if (zone.aliasFor)
      continue;

    const ctt = zone.createCompactTransitionTable(options.R);

    if (zonesByCTT.has(ctt)) {
      duplicatesFound = true;

      const prevId = zonesByCTT.get(ctt);

      // Keep the zoneId with the higher population
      if (getPopulation(prevId) >= getPopulation(zoneId))
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
})();

function shouldFilter(zoneId: string): boolean {
  if ((options.F && skippedZones.test(zoneId)) || (options.S && zoneId !== options.S))
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

  return (options.F && (locale == null || skippedRegions.test(region)) && !miscUnique.test(zoneId));
}
