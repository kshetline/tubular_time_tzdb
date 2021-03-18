import { IanaZone, IanaZoneRecord } from './iana-zone-record';
import { TzRule, TzRuleSet } from './tz-rule';
import { asLines, isBoolean, isString } from '@tubular/util';
import { getByUrlOrVersion, getLatest, TzData } from './read-tzdb';
import { TzCallback, TzMessageLevel, TzPhase } from './tz-writer';

export class IanaParserError extends Error {
  constructor(public lineNo: number, public sourceName: string, message: string) {
    super(message);
  }
}

export class IanaZonesAndRulesParser {
  private readonly zoneMap = new Map<string, IanaZone>();
  private readonly zoneAliases = new Map<string, string>();
  private readonly ruleSetMap = new Map<string, TzRuleSet>();

  private leapSeconds: string;
  private lineNo = 0;

  constructor(private roundToMinutes = false, private progress?: TzCallback) {};

  async parseFromOnline(includeSystemV: boolean): Promise<string>;
  async parseFromOnline(urlOrVersion: string): Promise<string>;
  async parseFromOnline(urlOrVersion: string, includeSystemV: boolean): Promise<string>;
  async parseFromOnline(urlOrVersionOrIsv: string | boolean, includeSystemV = false): Promise<string> {
    const urlOrVersion = isString(urlOrVersionOrIsv) ? urlOrVersionOrIsv : null;

    includeSystemV = isBoolean(urlOrVersionOrIsv) ? urlOrVersionOrIsv : includeSystemV;

    let tzData: TzData;

    if (urlOrVersion)
      tzData = await getByUrlOrVersion(urlOrVersion, this.progress);
    else
      tzData = await getLatest(this.progress);

    return this.parseTzData(tzData, includeSystemV);
  }

  parseTzData(tzData: TzData, includeSystemV = false): string {
    if (this.progress)
      this.progress(TzPhase.PARSE, TzMessageLevel.INFO, 'Parsing tz database sources');

    if (!includeSystemV)
      delete tzData.sources.systemv;
    else if (tzData.sources.systemv)
      // Uncomment the commented-out rules and timezones in the systemv file
      tzData.sources.systemv = tzData.sources.systemv.replace(/## (Rule\s+SystemV|Zone)/g, '$1');

    this.leapSeconds = tzData.leapSeconds;
    this.parseSources(tzData);

    // Add aliases if needed for legacy time zones. Not all substitutes exactly duplicate their originals.
    if (includeSystemV && !tzData.sources.systemv) {
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
    for (const sourceName of Object.keys(tzData.sources))
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
    const lines = asLines(source);
    let line: string;

    while ((line = this.readLine(lines)) != null) {
      zoneRec = null;

      if (line.startsWith('Rule')) {
        const rule = TzRule.parseRule(line);
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
          throw new IanaParserError(this.lineNo, sourceName, `Zone ${zoneId} was not properly terminated`);

        [zoneRec, zoneId] = IanaZoneRecord.parseZoneRecord(line, this.roundToMinutes);

        zone = new IanaZone(zoneId);
      }
      else if (zone != null)
        [zoneRec] = IanaZoneRecord.parseZoneRecord(line, this.roundToMinutes);

      if (zoneRec != null) {
        zone!.push(zoneRec);

        if (zoneRec.until === Number.MAX_SAFE_INTEGER) {
          this.zoneMap.set(zoneId, zone);
          zone = null;
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
      } while (line != null && (line.startsWith('#') || line.length === 0));

      if (line != null) {
        const pos = line.indexOf('#');

        if (pos > 0)
          line = line.substring(0, pos);

        line = line.trimEnd();
      }
    } while (line != null && line.length === 0);

    return line;
  }
}
