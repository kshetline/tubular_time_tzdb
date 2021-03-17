#!/usr/bin/env node
import fs from 'fs';
import { Command } from 'commander';
import { DEFAULT_URL, getAvailableVersions } from './read-tzdb';
import { toInt } from '@tubular/util';
import { DEFAULT_MAX_YEAR, DEFAULT_MIN_YEAR, TzFormat, TzMessageLevel, TzOutputOptions, TzPhase, TzPresets, writeTimezones } from './tz-writer';
const { version } = require('../package.json');

const program = new Command();
const nl = '\n' + ' '.repeat(20);
const options = program
  .name('tzc')
  .usage('[options] [output_file_name]')
  .version(version, '-v, --version')
  .option('-5, --systemv', `Include the SystemV timezones from the systemv file by${nl}\
uncommenting the commented-out zone descriptions.`)
  .option('-f', `Filter out Etc/GMTxxxx and other timezones that are either${nl}\
redundant or covered by options for creating fixed-offset timezones.`)
  .option('-j, --javascript', 'Output JavaScript instead of JSON.')
  .option('--large', 'Apply presets for "large" timezone definitions.')
  .option('--large-alt', 'Apply presets for "large-alt" timezone definitions.')
  .option('--list', 'List available tz database versions.')
  .option('-m', 'Round all UTC offsets to whole minutes.')
  .option('-q', 'Display no progress messages, fewer warning messages.')
  .option('-r', `Remove 'calendar rollbacks' from time zone transitions -- that is${nl}\
modify time zone data to prevent situations where the calendar date${nl}\
goes backwards as well as the hour and/or minute of the day.`)
  .option('-s <zone-id>', 'Zone ID for a single time zone to be rendered.')
  .option('--small', 'Apply presets for "small" timezone definitions.')
  .option('-t, --typescript', 'Output TypeScript instead of JSON.')
  .option('--text', 'Output (somewhat) human-readable text')
  .option('-u, --url <url>', `URL or version number, such as '2018c', to parse and compile.${nl}Default: ${DEFAULT_URL}`)
  .option('-y <year-span>', `<min_year,max_year> Year range for explicit time zone transitions.${nl}\
Default: ${DEFAULT_MIN_YEAR},${DEFAULT_MAX_YEAR}`)
  .option('-z <zone-info-dir>', `Validate this tool's output against output from the standard${nl}\
zic tool stored in the given directory.${nl}\
(Validation is done before applying the -r option.)`)
  .arguments('[outfile]')
  .parse(process.argv).opts();

if (options.list) {
  (async function (): Promise<void> {
    const list = await getAvailableVersions();

    list.forEach(v => console.log(v));
    process.exit(0);
  })();
}

let lastWasInfo = false;

function progress(_phase?: TzPhase, level?: TzMessageLevel, message?: string, step?: number, stepCount?: number): void {
  const args: (string | number)[] = [message];

  if (step) {
    args.push(step);

    if (stepCount)
      args.push(stepCount);
  }

  if (lastWasInfo)
    process.stdout.write('\x1B[A\x1B[K');

  if (level === TzMessageLevel.INFO && !options.Q)
    console.info(...args);
  else if (level === TzMessageLevel.LOG && !options.Q)
    console.log(...args);
  else if (level === TzMessageLevel.WARN)
    console.warn(...args);
  else if (level === TzMessageLevel.ERROR)
    console.error(...args);

  lastWasInfo = level === TzMessageLevel.INFO;
}

const tzOptions: TzOutputOptions = {
  callback: progress,
  filtered: options.F,
  fixRollbacks: options.R,
  roundToMinutes: options.M,
  singleZone: options.S,
  systemV: options.systemv,
  urlOrVersion: options.url,
  zoneInfoDir: options.Z
};

let file = '';

if (program.args.length > 0) {
  file = program.args[0];
  tzOptions.fileStream = fs.createWriteStream(file, 'utf8') as unknown as NodeJS.WriteStream;
}

if (options.javascript || (!options.typescript && !options.text && file.endsWith('.js')))
  tzOptions.format = TzFormat.JAVASCRIPT;
else if (options.typescript || (!options.text && file.endsWith('.ts')))
  tzOptions.format = TzFormat.TYPESCRIPT;
else if (options.text || file.endsWith('.txt'))
  tzOptions.format = TzFormat.TEXT;

if (options.Y) {
  const parts = options.Y.split(',');

  if (parts.length === 1)
    tzOptions.minYear = tzOptions.maxYear = toInt(parts[0]);
  else if (parts.length === 2) {
    tzOptions.minYear = parts[0] ? toInt(parts[0], DEFAULT_MIN_YEAR) : undefined;
    tzOptions.maxYear = parts[1] ? toInt(parts[1], DEFAULT_MAX_YEAR) : undefined;
  }
}

if (options.small)
  tzOptions.preset = TzPresets.SMALL;
else if (options.large)
  tzOptions.preset = TzPresets.LARGE;
else if (options.largeAlt)
  tzOptions.preset = TzPresets.LARGE_ALT;

if (!options.list) {
  writeTimezones(tzOptions).catch(err => {
    console.error(err);
    process.exit(1);
  });
}
