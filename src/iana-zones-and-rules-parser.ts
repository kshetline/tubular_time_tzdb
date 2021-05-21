import { IanaZone, IanaZoneRecord } from './iana-zone-record';
import { TzRule, TzRuleSet } from './tz-rule';
import { asLines, compareStrings } from '@tubular/util';
import { getByUrlOrVersion, getLatest, TZ_REGION_FILES, TzData } from './read-tzdb';
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
  systemV?: boolean;
  urlOrVersion?: string;
}

export class IanaParserError extends Error {
  constructor(public lineNo: number, public sourceName: string, message: string) {
    super(message);
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

    if (tzData.sources[sourceName]) {
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

    this.deltaTs = tzData.deltaTs;
    this.leapSeconds = tzData.leapSeconds;
    this.parseSources(tzData);

    // Add aliases if needed for legacy time zones. Not all substitutes exactly duplicate their originals.
    if (this.systemV && !tzData.sources.systemv) {
      this.addAlias('SystemV/AST4', 'America/Anguilla');
      this.addAlias('SystemV/AST4ADT', 'America/Goose_Bay');
      this.addAlias('SystemV/CST6', 'America/Belize');
      this.addAlias('SystemV/CST6CDT', 'America/Chicago');
      this.addAlias('SystemV/EST5', 'America/Atikokan');
      this.addAlias('SystemV/EST5EDT', 'America/New_York');
      this.addAlias('SystemV/HST10', 'HST');
      this.addAlias('SystemV/MST7', 'America/Creston');
      this.addAlias('SystemV/MST7MDT', 'America/Boise');
      this.addAlias('SystemV/PST8', 'Etc/GMT+8');
      this.addAlias('SystemV/PST8PDT', 'America/Los_Angeles');
      this.addAlias('SystemV/YST9', 'Etc/GMT+8');
      this.addAlias('SystemV/YST9YDT', 'America/Anchorage');
    }

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

      do { // Earlier version of the database have indirect links.
        original = this.zoneAliases.get(original);
      } while (this.zoneAliases.has(original));

      if (!this.zoneMap.has(original))
        throw new IanaParserError(0, null, `${zoneId} is mapped to unknown time zone ${original}`);
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
    let line;

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
