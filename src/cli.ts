import fs from 'fs';
import { Command } from 'commander';
import { DEFAULT_URL } from './read-tzdb';
import { toInt } from '@tubular/util';
import { DEFAULT_MAX_YEAR, DEFAULT_MIN_YEAR, TzFormat, TzOutputOptions, TzPresets, writeTimezones } from './tz-writer';

const program = new Command();
const nl = '\n' + ' '.repeat(18);
const options = program
  .name('tzc')
  .usage('[options] [output_file_name]')
  .option('-5, --systemv', `Include the SystemV timezones from the systemv file by${nl}\
uncommenting the commented-out zone descriptions.`)
  .option('-f', `Filter out Etc/GMTxxxx and other timezones that are either${nl}\
redundant or covered by options for creating fixed-offset timezones.`)
  .option('-j, --javascript', 'Output JavaScript instead of JSON.')
  .option('--large', 'Apply presets for "large" timezone definitions.')
  .option('--large-alt', 'Apply presets for "large-alt" timezone definitions.')
  .option('-m', 'Round all UTC offsets to whole minutes.')
  .option('-q', 'Display no progress messages, fewer warning messages.')
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
  .arguments('[outfile]')
  .parse(process.argv).opts();

const tzOptions: TzOutputOptions = {
  filtered: options.F,
  fixRollbacks: options.R,
  roundToMinutes: options.M,
  singleZone: options.S,
  systemV: options.systemv,
  urlOrVersion: options.url,
  quiet: options.Q
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
    tzOptions.minYear = toInt(parts[0], DEFAULT_MIN_YEAR);
    tzOptions.maxYear = toInt(parts[1], DEFAULT_MAX_YEAR);
  }
}

if (options.small)
  tzOptions.preset = TzPresets.SMALL;
else if (options.large)
  tzOptions.preset = TzPresets.LARGE;
else if (options.largeAlt)
  tzOptions.preset = TzPresets.LARGE_ALT;

writeTimezones(tzOptions).catch(err => {
  console.error(err);
  process.exit(1);
});
