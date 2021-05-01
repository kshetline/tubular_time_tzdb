// import { expect } from 'chai';
import { TzRule } from './tz-rule';

describe('Utility functions', () => {
  it('should format zone rules in POSIX format', () => {
    const dstRule = TzRule.parseRule('Rule\tUS\t2007\tmax\t-\tMar\tSun>=8\t2:00\t1:00\tD');
    const stdRule = TzRule.parseRule('Rule\tUS\t2007\tmax\t-\tNov\tSun>=1\t2:00\t0\tS');
    console.log(stdRule.toPosixRule(-18000, 'EST', dstRule, 'EDT'));
  });
});
