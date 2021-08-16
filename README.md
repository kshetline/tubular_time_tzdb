# @tubular/time-tzdb

**@tubular/time-tzdb** is an IANA timezone compiler, specifically for generating timezone data compatible with **[@tubular/time](https://www.npmjs.com/package/@tubular/time)**, but also capable of generating standard zoneinfo/`zic`-style binaries.

It can compile timezone source files directly from <https://www.iana.org/time-zones/>, using the latest release or any particular requested version, or from a local `.tar.gz` file specified via file URL.

Options are available for limiting the span of years covered, adjusting and filtering timezones, and choosing different output formats.

<!-- cspell:disable -->
- [@tubular/time-tzdb](#tubulartime-tzdb)
  - [Requirements](#requirements)
  - [Installation](#installation)
    - [As a command line tool](#as-a-command-line-tool)
    - [As a library](#as-a-library)
  - [CLI interface](#cli-interface)
  - [JavaScript/TypeScript API](#javascripttypescript-api)
    - [`getTzData`](#gettzdata)
    - [`writeTimezones`](#writetimezones)
  - [Listing available tz database releases](#listing-available-tz-database-releases)
  - [`@tubular/time` data format](#tubulartime-data-format)
    - [Timezone descriptions](#timezone-descriptions)
      - [Base-60 numbers](#base-60-numbers)
      - [Not-entirely-formal Extended BNF for timezone description syntax](#not-entirely-formal-extended-bnf-for-timezone-description-syntax)
      - [Simple timezone alias](#simple-timezone-alias)
      - [Pseudo-alias](#pseudo-alias)
      - [Modified pseudo-alias](#modified-pseudo-alias)
<!-- cspell:enable -->

## Requirements

Your system should have a command line `awk` tool installed for full functionality. Without it, the “vanguard” and “rearguard” options are not fully supported.

## Installation

### As a command line tool

`npm install -g @tubular/time-tzdb`

### As a library

`npm install @tubular/time-tzdb`

`const { getAvailableVersions, getTzData, writeTimezones`...`} = require('@tubular/time_tzdb');`

`import { getAvailableVersions, getTzData, writeTimezones`...`} from '@tubular/time_tzdb';`

## CLI interface

```text
Usage: tzc [options] [output_file_name_or_directory]

Downloads and compiles IANA timezone data, converting to text, zoneinfo binary
files, or @tubular/time-compatible data.

Options:
  -v, --version       output the version number
  -5, --systemv       Include the SystemV timezones from the systemv file by
                      uncommenting the commented-out zone descriptions.
  -b, --binary        Output binary files to a directory, one file per timezone
  -B, --bloat         Equivalent to the zic "--bloat fat" option.
  -f                  Filter out Etc/GMTxxx and other timezones that are either
                      redundant or covered by options for creating fixed-offset
                      timezones.
  -i                  Include leap seconds in binary files.
  -j, --javascript    Output JavaScript instead of JSON.
  --large             Apply presets for "large" timezone definitions.
  --large-alt         Apply presets for "large-alt" timezone definitions.
  --list              List available tz database versions.
  -m                  Round all UTC offsets to whole minutes.
  -n, --no-backward   Skip the additional aliases in the backward file.
  -o                  Overwrite existing file/directory.
  -q                  Display no progress messages, fewer warning messages.
  -R, --rearguard     Rearguard mode (skip vanguard features like negative DST).
  -r                  Remove 'calendar rollbacks' from time zone transitions --
                      that is modify time zone data to prevent situations
                      where the calendar date goes backwards as well as the
                      hour and/or minute of the day.
  -p, --packrat       Add additional timezones from the backzone file.
  -s <zone-id>        ID/name for a single timezone/region to be rendered.
  --small             Apply presets for "small" timezone definitions.
  -t, --typescript    Output TypeScript instead of JSON.
  --text              Output (somewhat) human-readable text
  -u, --url <url>     URL or version number, such as '2018c', to parse and
                      compile.
                      Default: https://www.iana.org/time-zones/repository/tzdata-latest.tar.gz
  -V, --vanguard      Vanguard mode (use vanguard features like negative DST).
  -y <year-span>      <min_year,max_year> Year range for explicit time zone
                      transitions.
                      Default: 1850,2050
  -z <zone-info-dir>  Validate this tool's output against output from the
                      standard zic tool stored in the given directory.
                      (Validation is done before applying the -r option.)
  -h, --help          display help for command
  -,                  Use dash by itself to output to stdout.
```

The default output filename, if not specified, is `timezones.`_ext_, where _ext_ is one of `json`, `js`, `ts`, or `txt` depending on the selected output format.

If you specify your own output filename using one of the extensions `json`, `js`, `ts`, or `txt` a matching format will automatically be selected. If you specify no extension, an appropriate extension will be appended.

If you use any of the options `--small`, `--large`, or `--large-alt`, the default root of the output filename for text formats becomes `timezone-small`, `timezone-large`, or `timezone-large-alt` respectively.

For binary output, the default directory is `zoneinfo` in the current working directory. The `-` option for output to stdout does not apply to binary files.

Please read the API description for a more complete understanding of all of the CLI options.

## JavaScript/TypeScript API

### `getTzData`

`async function getTzData(options: TzOptions = {}): Promise<any>`

This function returns an object (or string — only `TzFormat.JSON` format can be returned as an object) containing encoded timezone information for a set of timezones, and other timezone set metadata. This data is in a format meant to be consumed by the `@tubular/time` package.

Here is a truncated sample of this data:

<!-- cspell:disable -->
```json5
{
  "version": "2021a",
  "years": "1800-2088",
  "deltaTs": "69.36 69.36 69.45",
  "leapSeconds": "912 1096 1461 1826 2191 2557 2922 3287 3652 4199 4564 4929 5660 6574 7305 7670 8217 8582 8947 9496 10043 10592 13149 14245 15522 16617 17167",
  "Africa/Abidjan": "-001608 +0000 0;-g.8/0/LMT 0/0/GMT;1;-2ldXH.Q;;48e5;BFCIGMGNMLMRSHSLSNTG",
  "Africa/Accra": "-000052 +0000 0;-0.Q/0/LMT 0/0/GMT k/k u/0 u/u;1212121212121212121212121212121212121212121212131414141414141;-2bRzX.8 9RbX.8 fdE 1BAk MLE 1Bck MLE 1Bck MLE 1Bck MLE 1BAk MLE 1Bck MLE 1Bck MLE 1Bck MLE 1BAk MLE 1Bck MLE 1Bck MLE 1Bck MLE 1BAk MLE 1Bck MLE 1Bck MLE 1Bck MLE 1BAk MLE 1Bck MLE 1Bck MLE 1Bck MLE Mok 1BXE M0k 1BXE fak 9vbu bjCu MLu 1Bcu MLu 1BAu MLu 1Bcu MLu 1Bcu MLu 1Bcu MLu;;41e5;GH",
  "Africa/Algiers": "+001212 +0100 0;c.c/0/LMT 9.l/0/PMT 0/0/WET 10/10/WEST 10/0/CET 20/10/CEST;1232323232323232454542423234542324;-3bQ0c.c MDA2.P cNb9.l HA0 19A0 1iM0 11c0 1oo0 Wo0 1rc0 QM0 1EM0 UM0 DA0 Imo0 rd0 De0 9Xz0 1fb0 1ap0 16K0 2yo0 mEp0 hwL0 jxA0 11A0 dDd0 17b0 11B0 1cN0 2Dy0 1cN0 1fB0 1cL0;;26e5;DZ",
  "Africa/Bissau": "-010220 +0000 0;-12.k/0/LMT -10/0 0/0/GMT;12;-2ldX0 2xoo0;;39e4;GW",
  "Africa/Cairo": "+020509 +0200 0;25.9/0/LMT 20/0/EET 30/10/EEST;1212121212121212121212121212121212121212121212121212121212121212121212121212121212121212121212121212121212121212121212121212121;-2MBC5.9 1AQM5.9 vb0 1ip0 11z0 1iN0 1nz0 12p0 1pz0 10N0 1pz0 16p0 1jz0 s3d0 Vz0 1oN0 11b0 1oO0 10N0 1pz0 10N0 1pb0 10N0 1pb0 10N0 1pb0 10N0 1pz0 10N0 1pb0 10N0 1pb0 11d0 1oL0 11d0 1pb0 11d0 1oL0 11d0 1oL0 11d0 1oL0 11d0 1pb0 11d0 1oL0 11d0 1oL0 11d0 1oL0 11d0 1pb0 11d0 1oL0 11d0 1oL0 11d0 1oL0 11d0 1pb0 11d0 1oL0 11d0 1WL0 rd0 1Rz0 wp0 1pb0 11d0 1oL0 11d0 1oL0 11d0 1oL0 11d0 1pb0 11d0 1qL0 Xd0 1oL0 11d0 1oL0 11d0 1pb0 11d0 1oL0 11d0 1oL0 11d0 1ny0 11z0 1o10 11z0 1o10 11z0 1o10 11z0 1qN0 11z0 1o10 11z0 1o10 11z0 1o10 11z0 1o10 11z0 1qN0 11z0 1o10 11z0 1o10 WL0 1qN0 Rb0 1wp0 On0 1zd0 Lz0 1EN0 Fb0 c10 8n0 8Nd0 gL0 e10 mn0;;15e6;EG",

  // ...

  "US/Samoa": "Pacific/Pago_Pago",
  "UTC": "Etc/UTC",
  "Universal": "Etc/UTC",
  "W-SU": "Europe/Moscow",
  "Zulu": "Etc/UTC"
}
```
<!-- cspell:enable -->

A detailed explanation of this format can be found [at the end of this document](#tubulartime-data-format).

The following options can be specified to tailor the output for your specific needs:

```typescript
enum TzFormat { BINARY, JSON, JAVASCRIPT, TYPESCRIPT, TEXT }
enum TzPresets { NONE, SMALL, LARGE, LARGE_ALT }
enum TzPhase { DOWNLOAD, EXTRACT, PARSE, COMPILE, VALIDATE, REENCODE, OUTPUT_OF_RESULTS, DONE }
enum TzMessageLevel { INFO, LOG, WARN, ERROR }

type TzCallback = (
  phase?: TzPhase,
  level?: TzMessageLevel,
  message?: string,
  step?: number,
  stepCount?: number
) => void;

interface TzOptions {
  callback?: TzCallback,
  filtered?: boolean;
  fixRollbacks?: boolean;
  format?: TzFormat
  includeLeaps?: boolean,
  maxYear?: number;
  minYear?: number;
  mode?: TzMode;
  noBackward?: boolean;
  packrat?: boolean;
  preset?: TzPresets;
  roundToMinutes?: boolean;
  singleZone?: string;
  systemV?: boolean;
  urlOrVersion?: string;
  zoneInfoDir?: string;
}
```

• `callback`: This is an optional callback, used to provide information on the progress of parsing, compiling, and processing timezone data.

• `filtered`: When `true`, various obsolete timezones are omitted, such as `America/Knox_IN`, and the various `Etc` timezones.

`fixRollbacks`: It can be challenging enough when handling Daylight Saving Time (DST) that wall clock time can go backward during the course of a day. There are a few shifts in UTC offsets for some timezones, however, where even the calendar date goes backward, such as a case where the date/time is the 19th of the month, then it’s the 18th, and then it’s the 19th again, as happens with the unmodified America/Juneau timezone during October 1867.

The `fixRollbacks` option adjusts such transitions so that they delayed just enough to avoid backtracking of local calendar dates.

• `minYear` and `maxYear`: This is the range of years covered by the generated data, and it defaults to 1850-2050. Reducing the range can reduce generated data size, particularly when the lower limit is raised closer to current times, as many differently-named timezones share common descriptions when earlier historical transitions are omitted.

When the generated data is used by `@tubular/time`, a reduced range does not necessarily eliminate this utility of the output outside of that range. It simply makes early times dependent on JavaScript `Intl` support (when available), and future times reliant on rules-based descriptions of Daylight Saving Time transitions.

For a few timezones rules-based descriptions are not possible for covering future times, as these timezones are reliant on rules which that cannot be expressed in the `tz database` short of explicitly providing specific DST transition dates and times for each future year. This is the case, for example, when transitions are based on Islamic calendar dates. In such cases DST transitions are reliable only up to `maxYear`.

• `mode`: One of three values, `TzMode.REARGUARD`, `TzMode.MAIN`, `TzMode.VANGUARD`, with `TzMode.MAIN` being the default. As of release 2021a, `VANGUARD` and `REARGUARD` are the same, providing negative DST support and DST rules with hours greater than 24. Selecting `TzMode.REARGUARD` will build timezone data without these features.

The future of these separate modes is uncertain, and they are likely to be phased out. It is at least possible, however, that sometime in the future `VANGUARD` mode might enable access to features not supported in `MAIN`.

• `noBackward`: If `true`, timezones aliases defined in the `backward` file are omitted.

• `packrat`: If `true`, extra timezone information defined in the `backzone` file is included.

• `preset`: One of four values, `TzPresets.NONE`, `TzPresets.SMALL`, `TzPresets.LARGE`, `TzPresets.LARGE_ALT`, with `TzPresets.NONE` being the defaults.

- `TzPresets.NONE`: No default options are changed.<br><br>
- `TzPresets.SMALL`: This covers explicitly-defined timezone information for the current year +/- five years, supplemented by rules-based extensions (i.e. knowing that for a particular timezone, say, “DST starts on the last Sunday of March and ends on the last Sunday of October”), and further supplemented by information extracted from `Intl`, when available. In JSON, JavaScript, or TypeScript form, this option currently generates about 40K of data. As option values, this is equivalent to:<br>
`{ minYear: currentYear - 5, maxYear: currentYear + 5, options.systemV: true }`<br><br>
- `TzPresets.LARGE`: Default option are set to cover full IANA timezone database up to 67 years beyond the current year. Using this will generate about 280K of data. As option values, this is equivalent to:<br>
`{ minYear: 1800, maxYear: currentYear + 67, options.systemV: true }`<br><br>
- `TzPresets.LARGE_ALT`: The same as `TzPresets.LARGE`, except with `filtered`, `fixRollbacks`, and `roundToMinutes` set to `true`. Using this will also generate about 280K of data.

• `roundToMinutes`: If `true`, UTC offsets which are not in whole minutes are rounded to the nearest minute.

• `singleRegionOrZone`: Normally all timezones are processed at once. You can, however, generate data for just a single timezone by specifying the name of that timezone with this option, or you can specify a region such as `'africa'` or `'southamerica'` to get all of the timezones for just that region.

• `systemV`: If `true`, timezones defined in the `systemv` file are included.

• `urlOrVersion`: If left undefined or null, the latest tz database will be downloaded automatically from <https://www.iana.org/time-zones/repository/tzdata-latest.tar.gz>. Otherwise a particular tz database version can be specified, such as `'2021a'`, or a URL (including file URLs) can be used to specify a particular `.tar.gz` source file.

• `zoneInfoDir`: This option is for validating this tool’s parsing and compilation against zoneinfo/`zic` binaries located at the given directory path.

### `writeTimezones`

`async function writeTimezones(options: TzOutputOptions = {}): Promise<void>`

This function writes out timezone data in one of various text formats, or as zoneinfo/`zic` binaries. It includes all of the options available for `getTzData()`, plus the following options:

```typescript
interface TzOutputOptions extends TzOptions {
  bloat?: boolean;
  directory?: string;
  fileStream?: NodeJS.WriteStream,
  includeLeaps?: boolean,
}
```

• `bloat`: For binary output only, this option is equivalent to the `zic` option `--bloat fat` when `true`, the default being `false`, equivalent to `--bloat slim`.

• `directory`: For binary output only, this option specifies the path to the root directory where binaries will be stored, using a directory tree structure based on timezone names. The default is `zoneinfo` in the current working directory. Separate files are created for each timezone, in a structure like this:

```text
├── zoneinfo
│   ├── Africa
│   │   ├── Abidjan
│   │   ├── Accra
│   │   ├── Addis_Ababa
│   │   ├── Algiers
 •••
│   ├── America
│   │   ├── Adak
│   │   ├── Anchorage
│   │   ├── Anguilla
│   │   ├── Antigua
│   │   ├── Araguaina
│   │   ├── Argentina
│   │   │   ├── Buenos_Aires
│   │   │   ├── Catamarca
│   │   │   ├── ComodRivadavia
│   │   │   ├── Cordoba
 •••
│   ├── Cuba
│   ├── EET
│   ├── EST
│   ├── EST5EDT
│   ├── Egypt
│   ├── Eire
│   ├── Etc
│   │   ├── GMT
│   │   ├── GMT+0
│   │   ├── GMT+1
│   │   ├── GMT+10
 •••
│   ├── UTC
│   ├── Universal
│   ├── W-SU
│   ├── WET
│   └── Zulu
```

• `fileStream`: For textual output only, this option specifies the output stream. If not specified, output is sent to `stdout`.

• `format`: One of `TzFormat.BINARY`, `TzFormat.JSON`, `TzFormat.JAVASCRIPT`, `TzFormat.TYPESCRIPT`, or `TzFormat.TEXT`, with the default being `TzFormat.JSON`.

JSON output is as shown in the previous example. JavaScript output is essentially the same, but declared as a module, with single-quoting for strings and some explanatory comments added. TypeScript output is in turn much like JavaScript, but uses `export` module syntax.

`TzFormat.TEXT` produces a somewhat human-readable list of transition times, possibly augmented with DST rules and meta info. Each transition is described with a before-and-after date, wall clock time for the transition, UTC offset, and DST offset. For example:

```text
-------- America/New_York --------
  ____-__-__ __:__:__ ±______ ±______ --> ____-__-__ __:__:__ -045602 +000000 LMT
  1883-11-18 12:03:57 -045602 +000000 --> 1883-11-18 12:00:00 -050000 +000000 EST
  1918-03-31 01:59:59 -050000 +000000 --> 1918-03-31 03:00:00 -040000 +010000 EDT*
  1918-10-27 01:59:59 -040000 +010000 --> 1918-10-27 01:00:00 -050000 +000000 EST
  1919-03-30 01:59:59 -050000 +000000 --> 1919-03-30 03:00:00 -040000 +010000 EDT*
  1919-10-26 01:59:59 -040000 +010000 --> 1919-10-26 01:00:00 -050000 +000000 EST
  1920-03-28 01:59:59 -050000 +000000 --> 1920-03-28 03:00:00 -040000 +010000 EDT*
      •••
  2049-11-07 01:59:59 -040000 +010000 --> 2049-11-07 01:00:00 -050000 +000000 EST
  2050-03-13 01:59:59 -050000 +000000 --> 2050-03-13 03:00:00 -040000 +010000 EDT*
  2050-11-06 01:59:59 -040000 +010000 --> 2050-11-06 01:00:00 -050000 +000000 EST
  Final Standard Time rule: US: 2007 to +inf, first Sun on/after Nov 1, at 2:00 wall time begin std time, S
  Final Daylight Saving Time rule: US: 2007 to +inf, first Sun on/after Mar 8, at 2:00 wall time save 60 mins, D
  Population: 21000000
  Countries: US
```

A trailing asterisk `*` indicates a transition into Daylight Saving Time.

• `includeLeaps`: This option adds leap second information to binary output files. Leap seconds are always included in the JSON, JavaScript, and TypeScript formats regardless of this option.

## Listing available tz database releases

`async function getAvailableVersions(): Promise<string[]>`

This function returns a sorted list of tz database release versions, the last of which will be the latest release available from <https://www.iana.org/time-zones/>.

## `@tubular/time` data format

This variety of timezone data takes the form of an object with string keys and string values, where each key is either the name of a piece of metadata describing the collection of timezones, or the name of an IANA timezone.

Each timezone name is a key to a full timezone description, a simple alias to another timezone, or an alias to another timezone with some variant metadata.

To repeat the sample data from earlier in this document:

<!-- cspell:disable -->
```json5
{
  "version": "2021a",
  "years": "1800-2088",
  "deltaTs": "69.36 69.36 69.45",
  "leapSeconds": "912 1096 1461 1826 2191 2557 2922 3287 3652 4199 4564 4929 5660 6574 7305 7670 8217 8582 8947 9496 10043 10592 13149 14245 15522 16617 17167",
  "Africa/Abidjan": "-001608 +0000 0;-g.8/0/LMT 0/0/GMT;1;-2ldXH.Q;;48e5;BFCIGMGNMLMRSHSLSNTG",
  "Africa/Accra": "-000052 +0000 0;-0.Q/0/LMT 0/0/GMT k/k u/0 u/u;1212121212121212121212121212121212121212121212131414141414141;-2bRzX.8 9RbX.8 fdE 1BAk MLE 1Bck MLE 1Bck MLE 1Bck MLE 1BAk MLE 1Bck MLE 1Bck MLE 1Bck MLE 1BAk MLE 1Bck MLE 1Bck MLE 1Bck MLE 1BAk MLE 1Bck MLE 1Bck MLE 1Bck MLE 1BAk MLE 1Bck MLE 1Bck MLE 1Bck MLE Mok 1BXE M0k 1BXE fak 9vbu bjCu MLu 1Bcu MLu 1BAu MLu 1Bcu MLu 1Bcu MLu 1Bcu MLu;;41e5;GH",
  "Africa/Algiers": "+001212 +0100 0;c.c/0/LMT 9.l/0/PMT 0/0/WET 10/10/WEST 10/0/CET 20/10/CEST;1232323232323232454542423234542324;-3bQ0c.c MDA2.P cNb9.l HA0 19A0 1iM0 11c0 1oo0 Wo0 1rc0 QM0 1EM0 UM0 DA0 Imo0 rd0 De0 9Xz0 1fb0 1ap0 16K0 2yo0 mEp0 hwL0 jxA0 11A0 dDd0 17b0 11B0 1cN0 2Dy0 1cN0 1fB0 1cL0;;26e5;DZ",
  "Africa/Bissau": "-010220 +0000 0;-12.k/0/LMT -10/0 0/0/GMT;12;-2ldX0 2xoo0;;39e4;GW",
  "Africa/Cairo": "+020509 +0200 0;25.9/0/LMT 20/0/EET 30/10/EEST;1212121212121212121212121212121212121212121212121212121212121212121212121212121212121212121212121212121212121212121212121212121;-2MBC5.9 1AQM5.9 vb0 1ip0 11z0 1iN0 1nz0 12p0 1pz0 10N0 1pz0 16p0 1jz0 s3d0 Vz0 1oN0 11b0 1oO0 10N0 1pz0 10N0 1pb0 10N0 1pb0 10N0 1pb0 10N0 1pz0 10N0 1pb0 10N0 1pb0 11d0 1oL0 11d0 1pb0 11d0 1oL0 11d0 1oL0 11d0 1oL0 11d0 1pb0 11d0 1oL0 11d0 1oL0 11d0 1oL0 11d0 1pb0 11d0 1oL0 11d0 1oL0 11d0 1oL0 11d0 1pb0 11d0 1oL0 11d0 1WL0 rd0 1Rz0 wp0 1pb0 11d0 1oL0 11d0 1oL0 11d0 1oL0 11d0 1pb0 11d0 1qL0 Xd0 1oL0 11d0 1oL0 11d0 1pb0 11d0 1oL0 11d0 1oL0 11d0 1ny0 11z0 1o10 11z0 1o10 11z0 1o10 11z0 1qN0 11z0 1o10 11z0 1o10 11z0 1o10 11z0 1o10 11z0 1qN0 11z0 1o10 11z0 1o10 WL0 1qN0 Rb0 1wp0 On0 1zd0 Lz0 1EN0 Fb0 c10 8n0 8Nd0 gL0 e10 mn0;;15e6;EG",

  // ...

  "US/Samoa": "Pacific/Pago_Pago",
  "UTC": "Etc/UTC",
  "Universal": "Etc/UTC",
  "W-SU": "Europe/Moscow",
  "Zulu": "Etc/UTC"
}
```
<!-- cspell:enable -->

The only current metadata keys are `deltaTs`, `leapSeconds`, `version`, and `years`. If any new metadata keys are ever added they will be prefixed with an underscore (`_`). Every other key is the name of an IANA timezone.

• `version`: The tz database release version.<br>
• `years`: The range of years covered by explicit UTC offset transition times.<br>
• `deltaTs`: Starting at the year 2020, with one entry per year, the value of “delta T” at the start of each year. Delta T is the difference between UT1 and TDT (Terrestrial Dynamic Time), also the same as the difference between UT1 and TAI (International Atomic Time) plus 32.184 seconds.<br>
• `leapSeconds`: This is a list of days, specified as a number of days after January 1, 1970, for which a leap seconds has been added in the second just before the start of the specified day. If a number is negative, the absolute value of that number is the number of days after January 1, 1970 when a negative leap second has just occurred.<br>

### Timezone descriptions

#### Base-60 numbers

For compactness, many of the values in `@tubular/time` timezone descriptions are represented in base 60. The digit values used are as follows:

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`0`-`9`: 0-9<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`a`-`z`: 10-35<br>
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;`A`-`X`: 36-59<br>

These numbers can be negative, and they can also be fractional with the use of a ”decimal” point. For all of the values expressed at present, whole numbers are minutes, and the first digit after the ”decimal” point is seconds. For example, `-g.8` means negative 16 minutes, 8 seconds.

#### Not-entirely-formal Extended BNF for timezone description syntax

<pre>
&lt;time_zone> = &lt;basics> ";" &lt;local_time_type> { space &lt;local_time_type> }
              [ ";" { &lt;ltt_index_60> }
                [ ";" { &lt;transition_delta> }
                  [ ";" [ &lt;dst_rules> ]
                    [ ";" [ &lt;population> ]
                      [ ";" [ &lt;country_list> ] ] ] ] ] ]

&lt;basics> = &lt;initial_utc_offset> space &lt;current_std_utc_offset> space &lt;current_dst_offset>

&lt;initial_utc_offset> = ( "+" | "-" ) ( hhmm | hhmmss )
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<i>(i.e. decimal hours, minutes, and possibly seconds)</i>

&lt;current_std_utc_offset> = ( "+" | "-" ) ( hhmm | hhmmss )

&lt;current_dst_offset> = [ "-" ] minutes <i>(0 if DST is not currently observed)</i>

&lt;local_time_type> = &lt;utc_offset_60> "/" &lt;dst_offset_60> [ "/" &lt;abbreviation> ]

&lt;utc_offset_60> = <i>Signed base-60 UTC offset, generally positive for east longitude,
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;negative for west longitude.</i>

&lt;utc_offset_60> = <i>Signed base-60 DTS offset, 0 when DST is not in effect.</i>

&lt;abbreviation> = <i>Abbreviation, such as “GMT” or “EDT”, for the local time type.</i>

&lt;ltt_index_60> = <i>1-based base-60 index into local time types for each corresponding transition.</i>

&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;The first index indicates the initial state of the timezone.
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;The second index corresponds to the first listed &lt;transition_delta>.
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;The third index corresponds to the second listed &lt;transition_delta>, etc.</i>

&lt;transition_delta> = <i>The first &lt;transition_delta> is a delta from 0, making it an
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;absolute time value (in seconds from the 1970-01-01 UTC epoch) when the first
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;timezone transition takes place. Each subsequent value is the number of seconds
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;after the previous transition when the next transition takes place.</i>

&lt;dst_rules> = <i>See the function</i> <code>toCompactTailRule()</code> <i>in the file</i> <code>tz-rule.ts</code> <i>for more on
&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;this format.</i>

&lt;population> = <i>Approximate population of area covered by this timezone.</i>

&lt;country_list> = <i>List of ISO Alpha-2 country codes for countries covered by this timezone.</i>
</pre>

#### Simple timezone alias

Example:  `'America/Cayman': 'America/Panama',`

Here `America/Cayman` is the alias, and `America/Panama` is the original.

#### Pseudo-alias

Example: `'America/Indianapolis': '!America/New_York',`

`America/Indianapolis` is not a true alias of `America/New_York`, but in this particular instance, `America/Indianapolis` has an identical timezone description which can be shared.

#### Modified pseudo-alias

Example: `'Atlantic/South_Georgia': '!30,GS,America/Noronha'`,

Here `Atlantic/South_Georgia` shares a timezone description with `America/Noronha`, but with modified metadata for population and country list.
