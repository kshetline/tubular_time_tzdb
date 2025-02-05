import { IanaZone, IanaZoneRecord } from './iana-zone-record';
import { TzRule, TzRuleSet } from './tz-rule';
import { asLines, compareStrings } from '@tubular/util';
import { getByUrlOrVersion, getLatest, MAIN_REGIONS, TZ_REGION_FILES, TzData } from './read-tzdb';
import { TzCallback, TzMessageLevel, TzPhase } from './tz-writer';
import { hasCommand, monitorProcess, spawn } from './tz-util';

export enum TzMode { REARGUARD, MAIN, VANGUARD }
enum TzModeInternal { MAIN_EXPLICIT = 3 }

export interface ParseOptions {
  mode?: TzMode;
  noBackward?: boolean;
  packrat?: boolean;
  progress?: TzCallback;
  roundToMinutes?: boolean;
  singleRegion?: string;
  systemV?: boolean;
  urlOrVersion?: string;
}

export class IanaParserError extends Error {
  constructor(public lineNo: number, public sourceName: string, message: string) {
    super(lineNo && sourceName ? `${sourceName}, line ${lineNo}: ${message}` : message);
  }
}

export class IanaZonesAndRulesParser {
  private readonly zoneMap = new Map<string, IanaZone>();
  private readonly zoneAliases = new Map<string, string>();
  private readonly ruleSetMap = new Map<string, TzRuleSet>();

  private currentSource: string;
  private deltaTs: string;
  private currentMode: TzMode | TzModeInternal  = TzMode.MAIN;
  private leapSeconds: string;
  private lineNo = 0;
  private mode = TzMode.MAIN;
  private noBackward = false;
  private packrat = false;
  private preAwked = false;
  private progress: TzCallback;
  private roundToMinutes = false;
  private ruleIndex = 0;
  private singleRegion: string;
  private systemV = false;

  async parseFromOnline(options?: ParseOptions): Promise<string> {
    this.parseOptions(options);

    let tzData: TzData;

    if (options.urlOrVersion)
      tzData = await getByUrlOrVersion(options.urlOrVersion, this.progress);
    else
      tzData = await getLatest(this.progress);

    return this.parseTzData(tzData, options);
  }

  private parseOptions(options: ParseOptions): void {
    options = Object.assign({}, options ?? {});
    this.mode = options.mode ?? TzMode.MAIN;
    this.noBackward = options.noBackward ?? false;
    this.packrat = options.packrat ?? false;
    this.progress = options.progress;
    this.roundToMinutes = options.roundToMinutes ?? false;
    this.singleRegion = options.singleRegion;
    this.systemV = options.systemV ?? false;
  }

  async parseTzData(tzData: TzData, options?: ParseOptions): Promise<string> {
    this.parseOptions(options);

    if (this.progress)
      this.progress(TzPhase.PARSE, TzMessageLevel.INFO, 'Parsing tz database sources');

    const awkFile = this.mode !== TzMode.MAIN && (await hasCommand('awk')) && tzData.sources['ziguard.awk'];

    delete tzData.sources['ziguard.awk'];

    if (this.noBackward)
      delete tzData.sources.backward;

    if (!this.packrat)
      delete tzData.sources.backzone;

    const dataForm = TzMode[this.mode].toLowerCase();
    const sourceName = dataForm + '.zi';

    if (this.singleRegion) {
      Object.keys(tzData.sources).forEach(key => {
        if (MAIN_REGIONS.has(key) && key !== this.singleRegion)
          delete tzData.sources[key];
      });
    }
    else if (tzData.sources[sourceName]) {
      this.mode = TzMode.MAIN;
      this.preAwked = true;

      Object.keys(tzData.sources).forEach(name => {
        if (name !== sourceName && !/^(backward|leap-seconds\.list|systemv|version)$/.test(name))
          delete tzData.sources[name];
      });
    }

    if (awkFile) {
      this.mode = TzMode.MAIN;

      for (const name of Object.keys(tzData.sources)) {
        if (TZ_REGION_FILES.has(name))
          tzData.sources[name] = await monitorProcess(spawn('awk', ['-v', 'DATAFORM=' + dataForm, awkFile],
            { inputText: tzData.sources[name] }));
      }
    }

    if (!this.systemV)
      delete tzData.sources.systemv;
    else if (tzData.sources.systemv)
      // Uncomment the commented-out rules and timezones in the systemv file
      tzData.sources.systemv = tzData.sources.systemv.replace(/## (Rule\s+SystemV|Zone)/g, '$1');
    else
      tzData.sources.systemv = `
Rule\tSystemV\tmin\t1973\t-\tApr\tlastSun\t2:00\t1:00\tD
Rule\tSystemV\tmin\t1973\t-\tOct\tlastSun\t2:00\t0\tS
Rule\tSystemV\t1974\tonly\t-\tJan\t6\t2:00\t1:00\tD
Rule\tSystemV\t1974\tonly\t-\tNov\tlastSun\t2:00\t0\tS
Rule\tSystemV\t1975\tonly\t-\tFeb\t23\t2:00\t1:00\tD
Rule\tSystemV\t1975\tonly\t-\tOct\tlastSun\t2:00\t0\tS
Rule\tSystemV\t1976\tmax\t-\tApr\tlastSun\t2:00\t1:00\tD
Rule\tSystemV\t1976\tmax\t-\tOct\tlastSun\t2:00\t0\tS

Zone\tSystemV/AST4ADT\t-4:00\tSystemV\t\tA%sT
Zone\tSystemV/EST5EDT\t-5:00\tSystemV\t\tE%sT
Zone\tSystemV/CST6CDT\t-6:00\tSystemV\t\tC%sT
Zone\tSystemV/MST7MDT\t-7:00\tSystemV\t\tM%sT
Zone\tSystemV/PST8PDT\t-8:00\tSystemV\t\tP%sT
Zone\tSystemV/YST9YDT\t-9:00\tSystemV\t\tY%sT
Zone\tSystemV/AST4\t-4:00\t-\t\tAST
Zone\tSystemV/EST5\t-5:00\t-\t\tEST
Zone\tSystemV/CST6\t-6:00\t-\t\tCST
Zone\tSystemV/MST7\t-7:00\t-\t\tMST
Zone\tSystemV/PST8\t-8:00\t-\t\tPST
Zone\tSystemV/YST9\t-9:00\t-\t\tYST
Zone\tSystemV/HST10\t-10:00\t-\t\tHST
`;

    this.deltaTs = tzData.deltaTs;
    this.leapSeconds = tzData.leapSeconds;
    this.parseSources(tzData);

    if (!tzData.sources.pacificnew)
      this.addAlias('US/Pacific-New', 'America/Los_Angeles');

    return tzData.version;
  }

  getZoneIds(): string[] {
    let zoneIds: string[] = Array.from(this.zoneMap.keys()).map(zone => '*' + zone);

    zoneIds.push(...Array.from(this.zoneAliases.keys()));
    zoneIds = zoneIds.sort();
    zoneIds = zoneIds.map(zone => zone.replace('*', ''));

    return zoneIds;
  }

  getAliasFor(zoneId: string): string {
    return this.zoneAliases.get(zoneId);
  }

  getZone(zoneId: string): IanaZone {
    if (this.zoneAliases.has(zoneId))
      zoneId = this.zoneAliases.get(zoneId);

    return this.zoneMap.get(zoneId);
  }

  getRuleSet(rulesName: string): TzRuleSet {
    return this.ruleSetMap.get(rulesName);
  }

  getDeltaTs(): string {
    return this.deltaTs;
  }

  getLeapSeconds(): string {
    return this.leapSeconds;
  }

  private addAlias(alias: string, original: string): void {
    const rootZone = this.getRootZone(original);

    if (rootZone)
      this.zoneAliases.set(alias, rootZone);
  }

  private getRootZone(zoneId: string): string {
    while (this.zoneAliases.has(zoneId))
      zoneId = this.zoneAliases.get(zoneId);

    return zoneId;
  }

  private parseSources(tzData: TzData): void {
    const sourceNames = Object.keys(tzData.sources);
    const sortKey = (key: string): string => key === 'backward' ? 'zzz' : key === 'backzone' ? 'zzzzzz' : key;

    // Sort backward and backzone to the end
    sourceNames.sort((a, b) => compareStrings(sortKey(a), sortKey(b)));

    for (const sourceName of sourceNames)
      this.parseSource(sourceName, tzData.sources[sourceName]);

    // Remove aliases for anything that actually has its own defined zone.
    for (const zoneId of this.zoneMap.keys()) {
      if (this.zoneAliases.has(zoneId))
        this.zoneAliases.delete(zoneId);
    }

    // Make sure remaining aliases point to a defined zone.
    for (const zoneId of this.zoneAliases.keys()) {
      let original = zoneId;

      do { // Earlier version of the database has indirect links.
        original = this.zoneAliases.get(original);
      } while (this.zoneAliases.has(original));

      if (!this.zoneMap.has(original)) {
        if (this.singleRegion)
          delete this.zoneAliases[original];
        else
          throw new IanaParserError(0, null, `${zoneId} is mapped to unknown time zone ${original}`);
      }
    }
  }

  private parseSource(sourceName: string, source: string): void {
    let zone: IanaZone = null;
    let zoneId: string;
    let zoneRec: IanaZoneRecord;
    let zoneIndex = 0;
    const lines = asLines(source);
    let line: string;

    this.currentMode = TzMode.MAIN;
    this.lineNo = 0;
    this.currentSource = sourceName;

    while ((line = this.readLine(lines)) != null) {
      zoneRec = null;

      if (line.startsWith('Rule')) {
        const rule = TzRule.parseRule(line, ++this.ruleIndex);
        const ruleName = rule.name;
        let ruleSet = this.ruleSetMap.get(ruleName);

        if (ruleSet == null) {
          ruleSet = new TzRuleSet(ruleName);
          this.ruleSetMap.set(ruleName, ruleSet);
        }

        ruleSet.push(rule);
      }
      else if (line.startsWith('Link')) {
        const parts = line.split(/\s+/);

        this.zoneAliases.set(parts[2], parts[1]);
      }
      else if (line.startsWith('Zone')) {
        if (zone != null)
          throw new IanaParserError(this.lineNo, this.currentSource, `Zone ${zoneId} was not properly terminated`);

        [zoneRec, zoneId] = IanaZoneRecord.parseZoneRecord(line, this.roundToMinutes);

        zone = new IanaZone(zoneId);
      }
      else if (zone != null)
        [zoneRec] = IanaZoneRecord.parseZoneRecord(line, this.roundToMinutes);

      if (zoneRec != null) {
        zoneRec.zoneIndex = zoneIndex++;
        zone!.push(zoneRec);

        if (zoneRec.until === Number.MAX_SAFE_INTEGER) {
          this.zoneMap.set(zoneId, zone);
          zone = null;
          zoneIndex = 0;
        }
      }
    }
  }

  private readLine(lines: string[]): string {
    let line: string;

    do {
      do {
        line = lines[0];
        ++this.lineNo;
        lines.splice(0, 1);
      } while (line != null && line.length === 0);

      if (line != null) {
        if (this.preAwked && this.noBackward && line === '# tzdb links for backward compatibility')
          return undefined;

        const pos = line.indexOf('#');
        const commented = (pos === 0);

        if (commented && this.mode === TzMode.MAIN) {
          line = '';
          continue;
        }
        else if (commented) {
          if (this.currentMode !== TzMode.MAIN && !/^# \S/.test(line))
            line = line.substr(1);
          else {
            if (/^# Vanguard section\b/i.test(line))
              this.currentMode = TzMode.VANGUARD;
            else if (/^# Main section\b/i.test(line))
              this.currentMode = TzModeInternal.MAIN_EXPLICIT;
            else if (/^# Rearguard section\b/i.test(line))
              this.currentMode = TzMode.REARGUARD;
            else if (/^# End of (main|rearguard|vanguard) section\b/i.test(line))
              this.currentMode = TzMode.MAIN;

            line = '';
          }
        }
        else if (pos > 0)
          line = line.substring(0, pos);

        line = line.trimEnd();

        if (line.length > 0 && this.currentMode !== TzMode.MAIN && this.currentMode !== this.mode)
          line = '';
      }
    } while (line != null && line.length === 0);

    return line;
  }
}
