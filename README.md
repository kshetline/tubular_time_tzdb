# @tubular/time-tzdb

**@tubular/time-tzdb** is an IANA timezone compiler, specifically for generating timezone data compatible with **[@tubular/time](https://www.npmjs.com/package/@tubular/time)**.

It can compile timezone source files directly from <https://www.iana.org/time-zones/>, using the latest release or any particular requested version, or from a local `.tar.gz` file specified via file URL.

Options are available for limiting the span of years covered, adjusting and filtering timezones, and choosing different output formats.

- [@tubular/time-tzdb](#tubulartime-tzdb)
  - [Installation](#installation)
    - [As command line tool](#as-command-line-tool)
    - [As a library](#as-a-library)
  - [CLI interface](#cli-interface)

## Installation

### As command line tool

`npm install -g @tubular/time-tzdb`

### As a library

`npm install @tubular/time-tzdb`

`import { getByUrlOrVersion, TzData, writeTimezones`...`} from '@tubular/time_tzdb';`

## CLI interface

`npm install -g @tubular/time-tzdb`

```text
Usage: tzc [options] [output_file_name_or_directory]

Downloads and compiles IANA timezone data, converting to text, zoneinfo binary
files, or @tubular/time-compatible data.

Options:
  -v, --version       output the version number
  -5, --systemv       Include the SystemV timezones from the systemv file by
                      uncommenting the commented-out zone descriptions.
  -b, --binary        Output binary files to directory, one file per timezone
  -f                  Filter out Etc/GMTxxx and other timezones that are either
                      redundant or covered by options for creating fixed-offset
                      timezones.
  -i                  Include leap seconds in binary files.
  -j, --javascript    Output JavaScript instead of JSON.
  --large             Apply presets for "large" timezone definitions.
  --large-alt         Apply presets for "large-alt" timezone definitions.
  --list              List available tz database versions.
  -m                  Round all UTC offsets to whole minutes.
  -o                  Overwrite existing file/directory.
  -q                  Display no progress messages, fewer warning messages.
  -R, --rearguard     Rearguard mode (skip vanguard features like negative DST).
  -r                  Remove 'calendar rollbacks' from time zone transitions --
                      that is modify time zone data to prevent situations
                      where the calendar date goes backwards as well as the
                      hour and/or minute of the day.
  -s <zone-id>        Zone ID for a single time zone to be rendered.
  --small             Apply presets for "small" timezone definitions.
  -t, --typescript    Output TypeScript instead of JSON.
  --text              Output (somewhat) human-readable text
  -u, --url <url>     URL or version number, such as '2018c', to parse and
                      compile.
                      Default: https://www.iana.org/time-zones/repository/tzdata-latest.tar.gz
  -y <year-span>      <min_year,max_year> Year range for explicit time zone
                      
  transitions.
                      Default: 1900,2050
  -z <zone-info-dir>  Validate this tool's output against output from the
                      standard zic tool stored in the given directory.
                      (Validation is done before applying the -r option.)
  -h, --help          display help for command
  -,                  Use dash by itself to output to stdout.
```
