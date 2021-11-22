import chai, { expect } from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { getAvailableVersions, getByUrlOrVersion, getLatest, getRemoteDeltaTs } from './read-tzdb';

chai.use(chaiAsPromised);
chai.should();

describe('Reading HTTP timezone data', () => {
  it('should fetch latest tzdb', async function () {
    this.timeout(60000);
    return getLatest().should.eventually.be.fulfilled;
  });

  it('should fetch by version', async function () {
    this.timeout(60000);
    return getByUrlOrVersion('1997d').should.eventually.be.fulfilled;
  });

  it('should fail with bad version', async function () {
    this.timeout(60000);
    return getByUrlOrVersion('foo').should.eventually.be.rejected;
  });

  it('should list all versions', async function () {
    this.timeout(60000);

    let versions = await getAvailableVersions();

    expect(versions.includes('1998i')).to.be.true;
    expect(versions.includes('2021a')).to.be.true;
    expect(versions.includes('1884q')).to.be.false;
    expect(versions.includes('1994c')).to.be.false;

    versions = await getAvailableVersions(true);

    expect(versions.includes('1994c')).to.be.true;
    expect(versions.includes('1993b')).to.be.true;
  });

  it('should get remote ΔT values', async function () {
    this.timeout(60000);

    const values = await getRemoteDeltaTs();

    expect(values.length).to.be.gte(3);
    expect(!values.find(n => n < 68)).to.be.true;
  });
});
